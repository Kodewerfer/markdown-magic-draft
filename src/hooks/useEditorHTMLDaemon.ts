/**
 *  This hook handles the backend heavy lifting
 *
 *  At its core, it monitors the changes made in the first ref, rolls them back, and performs the same operation on the second ref.
 *  The reason for this convoluted logic is that, for the best UX, I made the main editing area as an editable HTML element that handles rendering of MD as well as user-editing.
 *  it allowed editing and rendering on the fly, but it also means that the virtual DOM and the actual DOM are now out of sync.
 *  If I've simply turned the actual DOM back to React compos again, React will crash because it may need to remove elements that are no longer there, etc.
 *  So, the original DOM needs to be kept as-is; the changes will be made on the other DOM ref instead, which will later be turned to React components so that React can do proper diffing and DOM manipulation.
 */


import React, {useEffect, useLayoutEffect, useRef, useState} from "react";
import _ from 'lodash';

type TDaemonState = {
    Observer: MutationObserver,
    MutationQueue: MutationRecord[]
}

export default function useEditorHTMLDaemon(
    WatchElementRef: { current: HTMLElement | undefined | null },
    ElementDocRef: { current: Document | undefined | null },
    FinalizeChanges: Function
) {

    // Persistent Variables
    // Easier set up type and init using state, but really acts like a ref.
    const DaemonState: TDaemonState = useState(() => {

        const state: TDaemonState = {
            Observer: null as any,
            MutationQueue: []
        }

        if (typeof MutationObserver) {
            state.Observer = new MutationObserver((mutationList: MutationRecord[], observer: any) => {
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

        const ObserverConfig: MutationObserverInit = {
            childList: true,
            subtree: true,
            characterData: true,
            characterDataOldValue: true,

        };

        return DaemonState.Observer.observe(WatchElementRef.current, ObserverConfig);
    };

    const FlushQueue = () => {

        // OB's callback is asynchronous
        // make sure no records are left behind
        DaemonState.MutationQueue.push(...DaemonState.Observer.takeRecords());

        if (!DaemonState.MutationQueue.length) return;

        toggleObserve(false);

        // start handing changed nodes before rolling back
        // TODO: there is an unfortunate "flash" between rolling back and parent re-rendering.
        let mutation: MutationRecord | void;
        while ((mutation = DaemonState.MutationQueue.pop())) {

            // rollback
            // mutation.target.textContent = mutation.oldValue;

            // Text Changed
            if (mutation.oldValue !== null) {
                const textContent = mutation.target.textContent;

                const xPath = GetXPath(mutation.target);

                UpdateDocRef.Text(xPath, textContent);

            }

            // Nodes removed
            for (let i = mutation.removedNodes.length - 1; i >= 0; i--) {

                // rollback
                mutation.target.insertBefore(
                    mutation.removedNodes[i],
                    mutation.nextSibling,
                );

                if (mutation.removedNodes[i].parentNode) {

                    const parentXPath = GetXPath(mutation.target);
                    const removedNodeXPath = GetXPath(mutation.removedNodes[i]);

                    UpdateDocRef.Remove(parentXPath, removedNodeXPath);
                }

            }

            // Nodes added
            for (let i = mutation.addedNodes.length - 1; i >= 0; i--) {

                // rollback
                if (mutation.addedNodes[i].parentNode)
                    mutation.target.removeChild(mutation.addedNodes[i]);


                const parentXPath = GetXPath(mutation.target);
                const addedNodeXPath = GetXPath(mutation.addedNodes[i]);

                let nextSiblingXPath: null | string = null;
                if (mutation.nextSibling)
                    nextSiblingXPath = GetXPath(mutation.nextSibling);

                UpdateDocRef.Add(parentXPath, addedNodeXPath, nextSiblingXPath);


            }
        }

        FinalizeChanges();

        // Start observing again.
        // TODO: this will not be needed once the changes are reported to the parent and therefore re-rendered
        return toggleObserve(true);
    }

    // TODO: performance
    const UpdateDocRef = {
        'Text': (XPath: string, Text: string | null) => {

            const NodeResult = ElementDocRef.current?.evaluate(XPath, ElementDocRef.current, null, XPathResult.FIRST_ORDERED_NODE_TYPE).singleNodeValue;
            if (!NodeResult) return;

            NodeResult.textContent = Text;
        },
        'Remove': (XPathParent: string, XPathSelf: string) => {
            const parentNode = ElementDocRef.current?.evaluate(XPathParent, ElementDocRef.current, null, XPathResult.FIRST_ORDERED_NODE_TYPE).singleNodeValue;
            if (!parentNode) return;

            const targetNode = ElementDocRef.current?.evaluate(XPathSelf, ElementDocRef.current, null, XPathResult.FIRST_ORDERED_NODE_TYPE).singleNodeValue;
            if (!targetNode) return;

            parentNode.removeChild(targetNode);
        },
        'Add': (XPathParent: string, XPathSelf: string, XPathSibling: string | null) => {

            const parentNode = ElementDocRef.current?.evaluate(XPathParent, ElementDocRef.current, null, XPathResult.FIRST_ORDERED_NODE_TYPE).singleNodeValue;
            if (!parentNode) return;

            const targetNode = ElementDocRef.current?.evaluate(XPathSelf, ElementDocRef.current, null, XPathResult.FIRST_ORDERED_NODE_TYPE).singleNodeValue;
            if (!targetNode) return;

            let SiblingNode = null
            if (XPathSibling) {
                SiblingNode = ElementDocRef.current?.evaluate(XPathSibling, ElementDocRef.current, null, XPathResult.FIRST_ORDERED_NODE_TYPE).singleNodeValue;
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

        if (!WatchElementRef.current) {
            return;
        }
        const WatchedElement = WatchElementRef.current;

        const contentEditableCached = WatchedElement.contentEditable;
        try {
            WatchedElement.contentEditable = 'plaintext-only';
        } catch (e) {
            WatchedElement.contentEditable = 'true';
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
