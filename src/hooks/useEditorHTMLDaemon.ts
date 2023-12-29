/**
 *  This hook handles the backend heavy lifting
 *
 *  At its core, it monitors the changes made in the first ref, rolls them back, and performs the same operation on the second ref.
 *  The reason for this convoluted logic is that, for the best UX, I made the main editing area as an editable HTML element that handles rendering of MD as well as user-editing.
 *  it allowed editing and rendering on the fly, but it also means that the virtual DOM and the actual DOM are now out of sync.
 *  If I've simply turned the actual DOM back to React compos again, React will crash because it may need to remove elements that are no longer there, etc.
 *  So, the original DOM needs to be kept as-is; the changes will be made on the other DOM ref instead, which will later be turned to React components so that React can do proper diffing and DOM manipulation.
 */


import {useLayoutEffect, useState} from "react";
import _ from 'lodash';

export default function useEditorHTMLDaemon(
    WatchElementRef: { current: HTMLElement | undefined | null },
    SourceDocRef: { current: Document | undefined | null },
    FinalizeChanges: Function,
    EditableElement = true
) {

    // Persistent Variables
    // Easier set up type and init using state, but really acts like a ref.
    const DaemonState: TDaemonState = useState(() => {

        const state: TDaemonState = {
            Observer: null as any,
            MutationQueue: []
        }

        if (typeof MutationObserver) {
            state.Observer = new MutationObserver((mutationList: MutationRecord[]) => {
                state.MutationQueue.push(...mutationList);
            });
        }

        return state;

    })[0];

    const toggleObserve = (bObserver: boolean) => {

        if (!bObserver) {
            return DaemonState.Observer.disconnect();
        }

        if (!WatchElementRef.current) {
            return;
        }

        return DaemonState.Observer.observe(WatchElementRef.current, {
            childList: true,
            subtree: true,
            characterData: true,
            characterDataOldValue: true,

        });
    };


    const FlushQueue = () => {

        // OB's callback is asynchronous
        // make sure no records are left behind
        DaemonState.MutationQueue.push(...DaemonState.Observer.takeRecords());

        if (!DaemonState.MutationQueue.length) return;

        toggleObserve(false);

        // Rollback Changes
        // TODO: there is an unfortunate "flash" between rolling back and parent re-rendering.
        let mutation: MutationRecord | void;
        let operationLogs: TOperationLog[] = []
        while ((mutation = DaemonState.MutationQueue.pop())) {

            // Text Changed
            if (mutation.oldValue !== null && mutation.type === "characterData") {

                // rollback
                // mutation.target.textContent = mutation.oldValue;

                const Operation: TOperationLog = {
                    type: TOperationType.TEXT,
                    node: getXPathFromNode(mutation.target),
                    nodeText: mutation.target.textContent
                }

                const latestOperationLog = operationLogs[operationLogs.length - 1];

                if (JSON.stringify(latestOperationLog) !== JSON.stringify(Operation))
                    operationLogs.push(Operation)
            }

            // Nodes removed
            for (let i = mutation.removedNodes.length - 1; i >= 0; i--) {

                // rollback
                mutation.target.insertBefore(
                    mutation.removedNodes[i],
                    mutation.nextSibling,
                );

                operationLogs.push({
                    type: TOperationType.REMOVE,
                    node: getXPathFromNode(mutation.removedNodes[i]),
                    parentNode: getXPathFromNode(mutation.target)
                })
            }

            // Nodes added
            for (let i = mutation.addedNodes.length - 1; i >= 0; i--) {

                // rollback
                if (mutation.addedNodes[i].parentNode)
                    mutation.target.removeChild(mutation.addedNodes[i]);

                operationLogs.push({
                    type: TOperationType.ADD,
                    node: mutation.addedNodes[i].cloneNode(),
                    parentNode: getXPathFromNode(mutation.target),
                    siblingNode: mutation.nextSibling ? getXPathFromNode(mutation.nextSibling) : null
                })
            }
        }

        SyncDOMs(operationLogs);

        FinalizeChanges();

        // Start observing again.
        // TODO: this will not be needed once the changes are reported to the parent and therefore re-rendered
        return toggleObserve(true);
    }

    function getXPathFromNode(node: Node): string {

        if (!WatchElementRef.current) return '';
        let parent = node.parentNode;

        // XPath upper limit: when reached an element with ID
        if ((node as HTMLElement).id && (node as HTMLElement).id !== '') {
            return '//*[@id="' + (node as HTMLElement).id + '"]';
        }

        // XPath upper limit: The Editor Inner.
        if ((node as HTMLElement).className === WatchElementRef.current.className && (node as HTMLElement).tagName === WatchElementRef.current.tagName) {
            return '//body';
        }

        // text nodes
        if (node.nodeType === Node.TEXT_NODE) {
            // For text nodes, count previous sibling text nodes for accurate XPath generation
            let textNodeIndex: number = 1;
            let sibling = node.previousSibling;

            // Counting preceding sibling Text nodes
            while (sibling) {
                if (sibling.nodeType === Node.TEXT_NODE) {
                    textNodeIndex++;
                }
                sibling = sibling.previousSibling;
            }

            if (parent) {
                return getXPathFromNode(parent) + '/text()' + `[${textNodeIndex}]`;
            } else {
                return 'text()' + `[${textNodeIndex}]`;
            }
        }

        if (!parent) return ''; // If no parent found, very unlikely scenario and possibly pointing at the HTML node

        // For Non-text nodes
        let nodeCount: number = 0;
        for (let i = 0; i < parent.childNodes.length; i++) {
            let sibling = parent.childNodes[i];

            if (sibling === node) {
                // Recurse on the parent node, then append this node's details to form an XPath string
                return getXPathFromNode(parent) + '/' + node.nodeName.toLowerCase() + '[' + (nodeCount + 1) + ']';
            }
            if (sibling.nodeType === 1 && sibling.nodeName === node.nodeName) {
                nodeCount++;
            }
        }

        return '';
    }

    const SyncDOMs = (Operations: TOperationLog[]) => {

        if (!Operations.length) return;

        let operation: TOperationLog | void;
        while ((operation = Operations.pop())) {
            const {type, node, nodeText, parentNode, siblingNode} = operation;
            console.log(operation);
            if (type === TOperationType.TEXT) {
                UpdateDocRef.Text((node as string), nodeText!);
            }
            if (type === TOperationType.REMOVE) {
                UpdateDocRef.Remove(parentNode!, (node as string));
            }
            if (type === TOperationType.ADD) {
                UpdateDocRef.Add(parentNode!, (node as Node), siblingNode!)
            }

        }

    }

    // TODO: performance
    const UpdateDocRef = {
        'Text': (XPath: string, Text: string | null) => {

            if (!XPath) {
                console.error("UpdateDocRef.Text: Invalid Parameter");
                return;
            }

            const NodeResult = getNodeFromXPath(SourceDocRef.current!, XPath);
            if (!NodeResult) return;

            if (!Text) Text = "";

            NodeResult.textContent = Text;
        },
        'Remove': (XPathParent: string, XPathSelf: string) => {

            if (!XPathParent || !XPathSelf) {
                console.error("UpdateDocRef.Remove: Invalid Parameter");
                return;
            }

            const parentNode = getNodeFromXPath(SourceDocRef.current!, XPathParent);
            if (!parentNode) return;

            const targetNode = getNodeFromXPath(SourceDocRef.current!, XPathSelf);
            if (!targetNode) return;

            parentNode.removeChild(targetNode);
        },
        'Add': (XPathParent: string, Node: Node, XPathSibling: string | null) => {

            if (!XPathParent || !Node) {
                console.error("UpdateDocRef.Add: Invalid Parameter");
                return;
            }

            const parentNode = getNodeFromXPath(SourceDocRef.current!, XPathParent);
            if (!parentNode) return;

            const targetNode = Node;
            if (!targetNode) return;

            let SiblingNode = null
            if (XPathSibling) {
                SiblingNode = getNodeFromXPath(SourceDocRef.current!, XPathSibling);
                if (SiblingNode === undefined)
                    SiblingNode = null;
            }

            parentNode.insertBefore(targetNode, SiblingNode);
        }
    }

    useLayoutEffect(() => {


        if (!WatchElementRef.current) {
            return;
        }

        toggleObserve(true);

        // clean up
        return () => {
            toggleObserve(false);
        }

    });


    useLayoutEffect(() => {

        if (!WatchElementRef.current || !SourceDocRef.current) {
            return;
        }
        const WatchedElement = WatchElementRef.current;
        const contentEditableCached = WatchedElement.contentEditable;

        if (EditableElement) {

            WatchedElement.contentEditable = 'true';

            // plaintext-only actually introduces unwanted behavior
            // try {
            //     WatchedElement.contentEditable = 'plaintext-only';
            // } catch (e) {
            //     // WatchedElement.contentEditable = 'true';
            //     throw e;
            // }
        }

        const flushQueueDebounced = _.debounce(FlushQueue, 500);

        // bind Events
        const InputHandler = (ev: Event) => {
            console.log("input")
            flushQueueDebounced();
        }
        WatchedElement.addEventListener("input", InputHandler);

        const PastHandler = (ev: ClipboardEvent) => {
            console.log("paste")
            flushQueueDebounced();
        }
        WatchedElement.addEventListener("paste", PastHandler);

        return () => {
            WatchedElement.contentEditable = contentEditableCached;
            WatchedElement.removeEventListener("input", InputHandler);
            WatchedElement.removeEventListener("paste", PastHandler);
        }


    }, [WatchElementRef.current!])
}


function getNodeFromXPath(doc: Document, XPath: string) {
    if (!doc) {
        console.error("getNodeFromXPath: Invalid Doc");
        return;
    }
    return doc.evaluate(XPath, doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE).singleNodeValue;
}

type TDaemonState = {
    Observer: MutationObserver,
    MutationQueue: MutationRecord[]
}

enum TOperationType {
    TEXT = "TEXT",
    ADD = "ADD",
    REMOVE = "REMOVE"
}

type TOperationLog = {
    type: TOperationType,
    node: string | Node,
    nodeText?: string | null,
    parentNode?: string | null,
    siblingNode?: string | null
}