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

type TDaemonState = {
    Observer: MutationObserver,
    MutationQueue: MutationRecord[]
}

enum OperationType {
    TEXT = "TEXT",
    ADD = "ADD",
    REMOVE = "REMOVE"
}

type TargetNode = string | Node;

type OperationLog = {
    type: OperationType,
    node: TargetNode,
    nodeText?: string | null,
    parentNode?: string | null,
    siblingNode?: string | null
}

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
        let OperationLog: OperationLog[] = []
        while ((mutation = DaemonState.MutationQueue.pop())) {

            // Text Changed
            if (mutation.oldValue !== null && mutation.type === "characterData") {

                // rollback
                // mutation.target.textContent = mutation.oldValue;
                OperationLog.push({
                    type: OperationType.TEXT,
                    node: GetXPath(mutation.target),
                    nodeText: mutation.target.textContent
                })
            }

            // Nodes removed
            for (let i = mutation.removedNodes.length - 1; i >= 0; i--) {

                // rollback
                mutation.target.insertBefore(
                    mutation.removedNodes[i],
                    mutation.nextSibling,
                );

                OperationLog.push({
                    type: OperationType.REMOVE,
                    node: GetXPath(mutation.removedNodes[i]),
                    parentNode: GetXPath(mutation.target)
                })
            }

            // Nodes added
            for (let i = mutation.addedNodes.length - 1; i >= 0; i--) {

                // rollback
                if (mutation.addedNodes[i].parentNode)
                    mutation.target.removeChild(mutation.addedNodes[i]);

                OperationLog.push({
                    type: OperationType.ADD,
                    node: mutation.addedNodes[i].cloneNode(),
                    parentNode: GetXPath(mutation.target),
                    siblingNode: mutation.nextSibling ? GetXPath(mutation.nextSibling) : null
                })
            }
        }

        SyncDOMs(OperationLog);

        FinalizeChanges();

        // Start observing again.
        // TODO: this will not be needed once the changes are reported to the parent and therefore re-rendered
        return toggleObserve(true);
    }

    const SyncDOMs = (Operations: OperationLog[]) => {

        if (!Operations.length) return;

        let operation: OperationLog | void;
        while ((operation = Operations.pop())) {
            const {type, node, nodeText, parentNode, siblingNode} = operation;

            if (type === OperationType.TEXT) {
                UpdateDocRef.Text((node as string), nodeText!);
            }
            if (type === OperationType.REMOVE) {
                UpdateDocRef.Remove(parentNode!, (node as string));
            }
            if (type === OperationType.ADD) {
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

            const NodeResult = GetNode(SourceDocRef.current!, XPath);
            if (!NodeResult) return;

            if (!Text) Text = "";

            NodeResult.textContent = Text;
        },
        'Remove': (XPathParent: string, XPathSelf: string) => {

            if (!XPathParent || !XPathSelf) {
                console.error("UpdateDocRef.Remove: Invalid Parameter");
                return;
            }

            const parentNode = GetNode(SourceDocRef.current!, XPathParent);
            if (!parentNode) return;

            const targetNode = GetNode(SourceDocRef.current!, XPathSelf);
            if (!targetNode) return;

            parentNode.removeChild(targetNode);
        },
        'Add': (XPathParent: string, Node: Node, XPathSibling: string | null) => {

            if (!XPathParent || !Node) {
                console.error("UpdateDocRef.Add: Invalid Parameter");
                return;
            }

            const parentNode = GetNode(SourceDocRef.current!, XPathParent);
            if (!parentNode) return;

            const targetNode = Node;
            if (!targetNode) return;

            let SiblingNode = null
            if (XPathSibling) {
                SiblingNode = GetNode(SourceDocRef.current!, XPathSibling);
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

            // try {
            //     WatchedElement.contentEditable = 'plaintext-only';
            // } catch (e) {
            //     WatchedElement.contentEditable = 'true';
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

function GetXPath(node: Node): string {

    if ((node as HTMLElement).id && (node as HTMLElement).id !== '') {
        return '//*[@id="' + (node as HTMLElement).id + '"]';
    }

    if ((node as HTMLElement).className === "Editor-Inner" && (node as HTMLElement).tagName === "MAIN") {
        return '//body';
    }

    let nodeCount: number = 0;

    if (!node.parentNode) return ''; //no parent found, very unlikely unless reached HTML tag somehow

    for (let i = 0; i < node.parentNode.childNodes.length; i++) {
        let sibling = node.parentNode.childNodes[i];
        if (sibling === node) {

            if (node.nodeType === Node.TEXT_NODE) {
                return GetXPath(node.parentNode) + '/text()[' + (nodeCount + 1) + ']';
            }

            return GetXPath(node.parentNode) + '/' + node.nodeName.toLowerCase()
                + '[' + (nodeCount + 1) + ']';
        }
        if (sibling.nodeType === 1 && sibling.nodeName === node.nodeName) {
            nodeCount++;
        }
    }

    return '';
}

function GetNode(doc: Document, XPath: string) {
    if (!doc) return;
    return doc.evaluate(XPath, doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE).singleNodeValue;
}