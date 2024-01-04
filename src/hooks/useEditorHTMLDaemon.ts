/**
 *  This hook handles the backend heavy lifting
 *
 *  At its core, it monitors the changes made in the first ref(the watched ref), rolls them back, and performs the same operation on the second ref(the mirrored ref).
 *  The reason for this convoluted logic is that, for the best UX, I made the main editing area as an editable HTML element that handles rendering of MD as well as user-editing.
 *  it allowed editing and rendering on the fly, but it also means that the virtual DOM and the actual DOM are now out of sync.
 *  If I've simply turned the actual DOM back to React compos again, React will crash because it may need to remove elements that are no longer there, etc.
 *  So, the original DOM needs to be kept as-is; the changes will be made on the other DOM ref instead, which will later be turned to React components so that React can do proper diffing and DOM manipulation.
 */

import {useLayoutEffect, useState} from "react";
import _ from 'lodash';

// Hook's persistent variables
type TDaemonState = {
    Observer: MutationObserver, //Mutation Observer instance
    MutationQueue: MutationRecord[], // All records will be pushed to here
    SelectionStatusCache: TSelectionStatus | null
    RollbackHidden: HTMLElement[]
}

//Type of actions to perform on the mirror document
enum TOperationType {
    TEXT = "TEXT",
    ADD = "ADD",
    REMOVE = "REMOVE"
}

// Instructions for DOM manipulations on the mirror document
type TOperationLog = {
    type: TOperationType,
    node: string | Node,
    nodeText?: string | null,
    parentNode?: string | null,
    siblingNode?: string | null
}

// For storing selection before parent re-rendering
type TSelectionStatus = {
    CaretPosition: number,
    SelectionExtent: number,
    AnchorNodeType: number,
    AnchorNodeXPath: string,
}

export default function useEditorHTMLDaemon(
    WatchElementRef: { current: HTMLElement | undefined | null },
    MirrorDocumentRef: { current: Document | undefined | null },
    FinalizeChanges: Function,
    EditableElement = true
) {
    
    // Persistent Variables
    // Easier to set up type and to init using state, but really acts as a ref.
    const DaemonState: TDaemonState = useState(() => {
        
        const state: TDaemonState = {
            Observer: null as any,
            MutationQueue: [],
            SelectionStatusCache: null,
            RollbackHidden: []
        }
        
        if (typeof MutationObserver) {
            state.Observer = new MutationObserver((mutationList: MutationRecord[]) => {
                state.MutationQueue.push(...mutationList);
            });
        }
        
        return state;
    })[0];
    
    const toggleObserve = (bObserver: boolean) => {
        
        if (!bObserver)
            return DaemonState.Observer.disconnect();
        
        
        if (!WatchElementRef.current)
            return;
        
        return DaemonState.Observer.observe(WatchElementRef.current, {
            childList: true,
            subtree: true,
            characterData: true,
            characterDataOldValue: true,
        });
    };
    
    // Flush all changes in the MutationQueue
    const rollbackAndSync = () => {
        // OB's callback is asynchronous
        // make sure no records are left behind
        DaemonState.MutationQueue.push(...DaemonState.Observer.takeRecords());
        
        if (!DaemonState.MutationQueue.length) return;
        
        toggleObserve(false);
        WatchElementRef.current!.contentEditable = 'false';
        
        // Rollback Changes
        let mutation: MutationRecord | void;
        let OperationLogs: TOperationLog[] = []
        while ((mutation = DaemonState.MutationQueue.pop())) {
            // Text Changed
            if (mutation.oldValue !== null && mutation.type === "characterData") {
                
                const Operation: TOperationLog = {
                    type: TOperationType.TEXT,
                    node: GetXPathFromNode(mutation.target),
                    nodeText: mutation.target.textContent
                }
                
                const latestOperationLog = OperationLogs[OperationLogs.length - 1];
                
                if (JSON.stringify(latestOperationLog) !== JSON.stringify(Operation))
                    OperationLogs.push(Operation);
                
                // rollback
                // mutation.target.textContent = mutation.oldValue;
            }
            // Nodes removed
            for (let i = mutation.removedNodes.length - 1; i >= 0; i--) {
                
                let removedNode = mutation.removedNodes[i] as HTMLElement;
                
                if (removedNode.style) {
                    removedNode.style.display = 'none';
                    DaemonState.RollbackHidden.push(removedNode);
                }
                // rollback
                mutation.target.insertBefore(
                    removedNode,
                    mutation.nextSibling,
                );
                
                OperationLogs.push({
                    type: TOperationType.REMOVE,
                    node: GetXPathFromNode(mutation.removedNodes[i]),
                    parentNode: GetXPathFromNode(mutation.target)
                });
                
                // Redo
                // To acquire the correct xpath, the node must be added to the original tree first.
                if (typeof removedNode.hasAttribute === "function" && removedNode.hasAttribute('no-roll-back')) {
                    mutation.target.removeChild(mutation.removedNodes[i]);
                }
            }
            // Nodes added
            for (let i = mutation.addedNodes.length - 1; i >= 0; i--) {
                // rollback
                const addedNode: Node = mutation.addedNodes[i];
                
                if (addedNode.parentNode) {
                    
                    try {
                        if (!(addedNode as HTMLElement).hasAttribute('no-roll-back')
                            && !(addedNode.parentNode as HTMLElement).hasAttribute('no-roll-back')) {
                            mutation.target.removeChild(addedNode);
                        }
                    } catch (e) {
                        // addedNode is likely a text node.
                        mutation.target.removeChild(addedNode);
                    }
                }
                
                OperationLogs.push({
                    type: TOperationType.ADD,
                    node: addedNode.cloneNode(true), //MUST be a deep clone, otherwise when breaking a new line, the text node content of a sub node will be lost.
                    parentNode: GetXPathFromNode(mutation.target),
                    siblingNode: mutation.nextSibling ? GetXPathFromNode(mutation.nextSibling) : null
                });
                // redo
                // mutation.target!.insertBefore(
                //     mutation.addedNodes[i].cloneNode(true),
                //     mutation.nextSibling
                // );
            }
            
        }
        
        syncToMirror(OperationLogs);
        // Notify parent
        FinalizeChanges();
    }
    
    // Helper to get the precise location in the original DOM tree
    function GetXPathFromNode(node: Node): string {
        
        if (!WatchElementRef.current) return '';
        let parent = node.parentNode;
        
        // XPath upper limit: any element with an ID
        if ((node as HTMLElement).id && (node as HTMLElement).id !== '') {
            return '//*[@id="' + (node as HTMLElement).id + '"]';
        }
        
        // XPath upper limit: The watched element.
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
                return GetXPathFromNode(parent) + '/text()' + `[${textNodeIndex}]`;
            } else {
                return 'text()' + `[${textNodeIndex}]`;
            }
        }
        
        if (!parent) return ''; // If no parent found, very unlikely
        
        // For Non-text nodes
        let nodeCount: number = 0;
        for (let i = 0; i < parent.childNodes.length; i++) {
            let sibling = parent.childNodes[i];
            
            if (sibling === node) {
                // Recurse on the parent node, then append this node's details to form an XPath string
                return GetXPathFromNode(parent) + '/' + node.nodeName.toLowerCase() + '[' + (nodeCount + 1) + ']';
            }
            if (sibling.nodeType === 1 && sibling.nodeName === node.nodeName) {
                nodeCount++;
            }
        }
        
        return '';
    }
    
    // Sync to the mirror document, middleman function
    const syncToMirror = (Operations: TOperationLog[]) => {
        
        if (!Operations.length) return;
        
        let operation: TOperationLog | void;
        while ((operation = Operations.pop())) {
            const {type, node, nodeText, parentNode, siblingNode} = operation;
            
            // FIXME:
            console.log(operation);
            
            if (type === TOperationType.TEXT) {
                UpdateMirrorDocument.Text((node as string), nodeText!);
            }
            if (type === TOperationType.REMOVE) {
                UpdateMirrorDocument.Remove(parentNode!, (node as string));
            }
            if (type === TOperationType.ADD) {
                UpdateMirrorDocument.Add(parentNode!, (node as Node), siblingNode!)
            }
            
        }
        
        // FIXME
        console.log("Sync Complete")
    }
    
    // TODO: performance
    const UpdateMirrorDocument = {
        'Text': (XPath: string, Text: string | null) => {
            
            if (!XPath) {
                console.error("UpdateMirrorDocument.Text: Invalid Parameter");
                return;
            }
            
            const NodeResult = GetNodeFromXPath(MirrorDocumentRef.current!, XPath);
            if (!NodeResult) return;
            
            if (!Text) Text = "";
            
            NodeResult.textContent = Text;
        },
        'Remove': (XPathParent: string, XPathSelf: string) => {
            
            if (!XPathParent || !XPathSelf) {
                console.error("UpdateMirrorDocument.Remove: Invalid Parameter");
                return;
            }
            
            const parentNode = GetNodeFromXPath(MirrorDocumentRef.current!, XPathParent);
            if (!parentNode) return;
            
            const targetNode = GetNodeFromXPath(MirrorDocumentRef.current!, XPathSelf);
            if (!targetNode) return;
            
            parentNode.removeChild(targetNode);
        },
        'Add': (XPathParent: string, Node: Node, XPathSibling: string | null) => {
            
            if (!XPathParent || !Node) {
                console.error("UpdateMirrorDocument.Add: Invalid Parameter");
                return;
            }
            
            const parentNode = GetNodeFromXPath(MirrorDocumentRef.current!, XPathParent);
            if (!parentNode) return;
            
            const targetNode = Node;
            if (!targetNode) return;
            
            let SiblingNode = null
            if (XPathSibling) {
                SiblingNode = GetNodeFromXPath(MirrorDocumentRef.current!, XPathSibling);
                if (SiblingNode === undefined)
                    SiblingNode = null;
            }
            
            parentNode.insertBefore(targetNode, SiblingNode);
        }
    }
    
    function GetSelectionStatus(targetElement: Element): TSelectionStatus | null {
        const CurrentSelection = window.getSelection();
        
        if (!CurrentSelection || !CurrentSelection.anchorNode) {
            return null;
        }
        
        
        const AnchorNodeXPath: string = GetXPathFromNode(CurrentSelection.anchorNode);
        
        const SelectionExtent = CurrentSelection.isCollapsed ? CurrentSelection.toString().length : 0;
        
        const SelectedTextRange = CurrentSelection.getRangeAt(0);
        
        const FullRange = document.createRange();
        FullRange.setStart(targetElement, 0);
        FullRange.setEnd(SelectedTextRange.startContainer, SelectedTextRange.startOffset);
        
        const ContentUntilCaret = FullRange.toString();
        
        const CaretPosition = ContentUntilCaret.length;
        
        const AnchorNodeType = CurrentSelection.anchorNode.nodeType;
        
        return {CaretPosition, SelectionExtent, AnchorNodeType, AnchorNodeXPath,};
    }
    
    function RestoreSelectionStatus(SelectedElement: Element, SavedState: TSelectionStatus) {
        
        const CurrentSelection = window.getSelection();
        if (!CurrentSelection) return;
        
        // FIXME:
        // console.log(SavedState)
        
        // Type narrowing
        if (!SavedState || SavedState.CaretPosition === undefined || SavedState.SelectionExtent === undefined)
            return;
        
        
        // use treeWalker to traverse all nodes, only check text nodes because only text nodes can take up "position"/"offset"
        const Walker = document.createTreeWalker(
            SelectedElement,
            NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
            null
        );
        
        let AnchorNode;
        let CharsToCaretPosition = SavedState.CaretPosition;
        const NodeOverflowBreakCharBreak = -5;
        // check all text nodes
        while (AnchorNode = Walker.nextNode()) {
            
            if (AnchorNode.nodeType === Node.TEXT_NODE && AnchorNode!.textContent) {
                CharsToCaretPosition -= AnchorNode!.textContent.length;
            }
            // the anchor AnchorNode found.
            if (CharsToCaretPosition <= 0) {
                // after breaking a new line, the CharsToCaretPosition for the end of the last line
                // and the beginning of the new line will still be the same,
                // So needed to check XPath to make sure the caret moved to the correct text node
                if (AnchorNode.nodeType === SavedState.AnchorNodeType && GetXPathFromNode(AnchorNode) === SavedState.AnchorNodeXPath) {
                    break;
                }
                
                if (CharsToCaretPosition <= NodeOverflowBreakCharBreak) {
                    break;
                }
            }
            
            
        }
        
        // Type narrowing
        if (!AnchorNode) return;
        
        // reconstruct the old CurrentSelection range
        const RangeCached = document.createRange();
        
        try {
            RangeCached.setStart(AnchorNode, AnchorNode.textContent!.length + CharsToCaretPosition);
            RangeCached.setEnd(AnchorNode, AnchorNode.textContent!.length + CharsToCaretPosition + SavedState.SelectionExtent);
            // Replace the current CurrentSelection.
            CurrentSelection.removeAllRanges();
            CurrentSelection.addRange(RangeCached);
            
            
        } catch (e) {
            console.error(e);
            
            RangeCached.setStart(AnchorNode, 0);
            RangeCached.setEnd(AnchorNode, SavedState.SelectionExtent);
            // Replace the current CurrentSelection.
            CurrentSelection.removeAllRanges();
            CurrentSelection.addRange(RangeCached);
            
            
        }
        
    }
    
    useLayoutEffect(() => {
        
        if (!WatchElementRef.current) {
            console.log("Invalid Watched Element");
            return;
        }
        
        const WatchedElement = WatchElementRef.current;
        const contentEditableCached = WatchedElement.contentEditable;
        
        
        if (EditableElement) {
            // !!plaintext-only actually introduces unwanted behavior
            WatchedElement.contentEditable = 'true';
        }
        
        if (DaemonState.RollbackHidden.length) {
            DaemonState.RollbackHidden.forEach(node => {
                node.style.display = '';
            })
            DaemonState.RollbackHidden = [];
        }
        
        // FIXME
        WatchElementRef.current.focus();
        
        if (DaemonState.SelectionStatusCache)
            RestoreSelectionStatus(WatchElementRef.current, DaemonState.SelectionStatusCache);
        
        toggleObserve(true);
        
        // clean up
        return () => {
            WatchedElement.contentEditable = contentEditableCached;
            toggleObserve(false);
        }
        
    });
    
    useLayoutEffect(() => {
        
        if (!WatchElementRef.current || !MirrorDocumentRef.current) {
            return;
        }
        const WatchedElement = WatchElementRef.current;
        
        
        const rollbackAndSyncDebounced = _.debounce(rollbackAndSync, 500);
        const updateSelectionStatusDebounced = _.debounce(() => {
            DaemonState.SelectionStatusCache = GetSelectionStatus((WatchElementRef.current as Element));
        }, 450);
        
        // bind Events
        const KeyDownHandler = (ev: HTMLElementEventMap['keydown']) => {
            updateSelectionStatusDebounced();
            rollbackAndSyncDebounced();
        }
        
        const KeyUpHandler = (ev: HTMLElementEventMap['keyup']) => {
            // WatchedElement.focus();
            
        }
        
        const PastHandler = (ev: ClipboardEvent) => {
            ev.preventDefault();
            
            const text = ev.clipboardData!.getData('text/plain');
            
            // TODO: best to find a replacement for execCommand
            document.execCommand('insertText', false, text);
            
            updateSelectionStatusDebounced();
            rollbackAndSyncDebounced();
        }
        
        const SelectionHandler = (ev: Event) => {
            DaemonState.SelectionStatusCache =
                window.getSelection()!.rangeCount && ev.target === WatchedElement
                    ? GetSelectionStatus(WatchedElement)
                    : null;
        }
        
        const DragStartHandler = (ev: HTMLElementEventMap['dragstart']) => {
            // drag and drop text introduces too many potential problems
            ev.preventDefault();
        }
        
        WatchedElement.addEventListener("keydown", KeyDownHandler);
        WatchedElement.addEventListener("keyup", KeyUpHandler);
        WatchedElement.addEventListener("paste", PastHandler);
        WatchedElement.addEventListener("selectstart", SelectionHandler);
        WatchedElement.addEventListener("dragstart", DragStartHandler);
        
        return () => {
            WatchedElement.removeEventListener("keydown", KeyDownHandler);
            WatchedElement.removeEventListener("keyup", KeyUpHandler);
            WatchedElement.removeEventListener("paste", PastHandler);
            WatchedElement.removeEventListener("selectstart", SelectionHandler);
            WatchedElement.removeEventListener("dragstart", DragStartHandler);
            
        }
        
    }, [WatchElementRef.current!])
}

function GetNodeFromXPath(doc: Document, XPath: string) {
    if (!doc) {
        console.error("getNodeFromXPath: Invalid Doc");
        return;
    }
    return doc.evaluate(XPath, doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE).singleNodeValue;
}