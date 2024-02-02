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

//Type of actions to perform on the mirror document
enum TOperationType {
    TEXT = "TEXT",
    ADD = "ADD",
    REMOVE = "REMOVE"
}

// Instructions for DOM manipulations on the mirror document
type TOperationLog = {
    type: TOperationType,
    wasText?: boolean,  //indicate if it was a replacement node resulting from text node callback
    // noRedo?: boolean, // undo operation may end up creating additional logs, these logs are not suitable for redo
    node?: Node,
    nodeXP: string,
    nodeText?: string | null,
    nodeTextOld?: string | null, //used in redo
    parentXP?: string | null,
    siblingXP?: string | null
}

// For storing selection before parent re-rendering
type TSelectionStatus = {
    CaretPosition: number,
    SelectionExtent: number,
    AnchorNodeType: number,
    AnchorNodeXPath: string,
}

type THookOptions = {
    TextNodeCallback?: (textNode: Node) => Node[] | null | undefined
    ShouldObserve: boolean
    IsEditable: boolean
    ShouldFocus: boolean
    ParagraphTags: RegExp //
}

// Hook's persistent variables
type TDaemonState = {
    Observer: MutationObserver, //Mutation Observer instance
    MutationQueue: MutationRecord[], // All records will be pushed to here
    UndoStack: [Document] | null
    RedoStack: [Document] | null
    SelectionStatusCache: TSelectionStatus | null,
    SelectionStatusCachePreBlur: TSelectionStatus | null
}

export default function useEditorHTMLDaemon(
    WatchElementRef: { current: HTMLElement | undefined | null },
    MirrorDocumentRef: { current: Document | undefined | null },
    FinalizeChanges: Function,
    Options: Partial<THookOptions>
) {
    
    // Default options
    const HookOptions = {
        TextNodeCallback: undefined,
        ShouldObserve: true,
        IsEditable: true,
        ParagraphTags: /^(p|div|main|body|h1|h2|h3|h4|h5|h6|section)$/i,   // Determined whether to use "replacement" logic or just change the text node.
        ...Options
    };
    
    // Persistent Variables
    // Easier to set up type and to init using state, but really acts as a ref.
    const DaemonState: TDaemonState = useState(() => {
        
        const state: TDaemonState = {
            Observer: null as any,
            MutationQueue: [],
            UndoStack: null,
            RedoStack: null,
            SelectionStatusCache: null,
            SelectionStatusCachePreBlur: null
        }
        
        if (typeof MutationObserver) {
            state.Observer = new MutationObserver((mutationList: MutationRecord[]) => {
                state.MutationQueue.push(...mutationList);
            });
        } else {
            console.error("Critical Error: Mutation Observer cannot be initialized.");
        }
        
        return state;
    })[0];
    
    const toggleObserve = (bObserver: boolean) => {
        
        if (!bObserver) {
            DaemonState.Observer.disconnect();
            DaemonState.MutationQueue.push(...DaemonState.Observer.takeRecords());
            return;
        }
        
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
        DaemonState.MutationQueue.push(...DaemonState.Observer.takeRecords())
        // OB's callback is asynchronous
        // make sure no records are left behind
        if (!DaemonState.MutationQueue.length) return;
        
        toggleObserve(false);
        WatchElementRef.current!.contentEditable = 'false';
        // Rollback Changes
        let mutation: MutationRecord | void;
        let lastMutation: MutationRecord | null = null;
        let OperationLogs: TOperationLog[] = []
        
        while ((mutation = DaemonState.MutationQueue.pop())) {
            /**
             * Text Changed
             */
            if (mutation.type === "characterData" && mutation.oldValue !== null) {
                
                // only use the latest character data mutation.
                if (lastMutation && mutation.target === lastMutation.target) continue;
                
                // Get the original value for the text node. used in undo
                let TextNodeOriginalValue = mutation.oldValue;
                if (DaemonState.MutationQueue.length >= 1) {
                    DaemonState.MutationQueue.slice().reverse().some((mutationData, index) => {
                        if (mutationData.target === mutation?.target && mutationData.oldValue !== null) {
                            TextNodeOriginalValue = mutationData.oldValue;
                        } else {
                            return TextNodeOriginalValue;
                        }
                    })
                }
                
                // TextNodeCallback present, use TextNodeCallback result.
                if (typeof HookOptions.TextNodeCallback === 'function') {
                    const ParentNode = mutation.target.parentNode as HTMLElement;
                    const OldTextNode = mutation.target;
                    
                    const callbackResult = HookOptions.TextNodeCallback(OldTextNode);
                    
                    // FIXME
                    // console.log(callbackResult);
                    
                    if (!callbackResult) {
                        if (OldTextNode.textContent !== '')
                            console.warn("Invalid text node handler return", callbackResult, " From ", OldTextNode);
                        continue;
                    }
                    
                    const ParentXPath = ParentNode ? GetXPathFromNode(ParentNode) : '';
                    const ParentParentXPath = ParentNode.parentNode ? GetXPathFromNode(ParentNode.parentNode) : '';
                    
                    const ParentTagsTest = HookOptions.ParagraphTags
                    const LogParentXP = ParentTagsTest.test(ParentNode.tagName.toLowerCase()) ? ParentXPath : ParentParentXPath;
                    
                    let whiteSpaceStart = OldTextNode.textContent!.match(/^\s*/) || [""];
                    let whiteSpaceEnd = OldTextNode.textContent!.match(/\s*$/) || [""];
                    
                    /**
                     *  Result in only one text node
                     */
                    if (LogParentXP === ParentXPath && callbackResult.length === 1 && callbackResult[0].textContent !== null) {
                        
                        const RestoredText = whiteSpaceStart[0] + callbackResult[0].textContent.trim() + whiteSpaceEnd[0];
                        
                        const Operation: TOperationLog = {
                            type: TOperationType.TEXT,
                            nodeXP: GetXPathFromNode(mutation.target),
                            nodeText: RestoredText,
                            nodeTextOld: TextNodeOriginalValue
                        }
                        
                        OperationLogs.push(Operation);
                        
                        // Cache the last
                        lastMutation = mutation;
                        continue;
                    }
                    
                    /**
                     *  Result in multiple nodes
                     *  or only one node but no longer a text node.
                     */
                    
                    let oldNodeRemovalTarget = OldTextNode;
                    oldNodeRemovalTarget.textContent = TextNodeOriginalValue;// Restore the text node to old value
                    
                    let logNodeXP = GetXPathNthChild(OldTextNode);
                    let logSiblingXP = OldTextNode.nextSibling ? GetXPathFromNode(OldTextNode.nextSibling) : null;
                    // flags
                    let bParentPreSiblingTextNode: boolean | null = false;
                    let bParentNxtSiblingTextNode: boolean | null = false;
                    let logTextNodeAnchor: string | null = null;
                    
                    if (LogParentXP === ParentParentXPath) {
                        oldNodeRemovalTarget = ParentNode;
                        logNodeXP = GetXPathNthChild(ParentNode);
                        logSiblingXP = ParentNode.nextSibling ? GetXPathFromNode(ParentNode.nextSibling) : null;
                        // flag
                        bParentPreSiblingTextNode = ParentNode.previousSibling && ParentNode.previousSibling.nodeType === Node.TEXT_NODE;
                        bParentNxtSiblingTextNode = ParentNode.nextSibling && ParentNode.nextSibling.nodeType === Node.TEXT_NODE;
                        if (bParentPreSiblingTextNode)
                            logTextNodeAnchor = ParentNode.nextSibling ? GetXPathFromNode(ParentNode.nextSibling) : null;
                        if (bParentNxtSiblingTextNode)
                            logTextNodeAnchor = ParentNode.nextSibling && ParentNode.nextSibling.nextSibling ? GetXPathFromNode(ParentNode.nextSibling.nextSibling) : null;
                    }
                    
                    // Add the new node/nodes
                    // toReversed(), because the later operation uses pop()
                    callbackResult.toReversed().forEach((node, index, array) => {
                        if (index === 0) {
                            // the last element,because it is flipped,
                            if (node.textContent) {
                                node.textContent = node.textContent.trim() + whiteSpaceEnd[0];
                            }
                        }
                        if (index === array.length - 1) {
                            // the first element,because it is flipped,
                            if (node.textContent) {
                                node.textContent = whiteSpaceStart[0] + node.textContent.trim()
                            }
                        }
                        // if there is a non text node in between, add whitespace to surrounding textnodes.
                        if (node.textContent && node.textContent !== ' ') {
                            if (!node.textContent.endsWith(' ') && array[index - 1] && array[index - 1].nodeType !== Node.TEXT_NODE) {
                                node.textContent = node.textContent.trimEnd() + ' ';
                            }
                            if (!node.textContent.startsWith(' ') && array[index + 1] && array[index + 1].nodeType !== Node.TEXT_NODE) {
                                node.textContent = ' ' + node.textContent.trimStart();
                            }
                        }
                        
                        const operationLog: TOperationLog = {
                            type: TOperationType.ADD,
                            wasText: true,
                            node: node.cloneNode(true),
                            nodeXP: logNodeXP, //redo will remove at the position of the "replaced" text node
                            parentXP: LogParentXP,
                            siblingXP: logSiblingXP,
                        };
                        
                        OperationLogs.push(operationLog);
                    })
                    // remove the old node
                    OperationLogs.push({
                        type: TOperationType.REMOVE,
                        wasText: true,
                        node: oldNodeRemovalTarget.cloneNode(true),
                        nodeXP: logNodeXP,
                        parentXP: LogParentXP,
                        siblingXP: logSiblingXP
                    });
                    
                    // Cache the last
                    lastMutation = mutation;
                    continue
                }
                
                // Default handling, change text content only
                const Operation: TOperationLog = {
                    type: TOperationType.TEXT,
                    nodeXP: GetXPathFromNode(mutation.target),
                    nodeText: mutation.target.textContent,
                    nodeTextOld: TextNodeOriginalValue
                }
                OperationLogs.push(Operation);
            }
            /**
             * Removed
             */
            if (mutation.removedNodes && mutation.removedNodes.length) {
                for (let i = mutation.removedNodes.length - 1; i >= 0; i--) {
                    
                    let removedNode = mutation.removedNodes[i] as HTMLElement;
                    
                    // rollback
                    mutation.target.insertBefore(
                        removedNode,
                        mutation.nextSibling,
                    );
                    const operationLog = {
                        type: TOperationType.REMOVE,
                        node: mutation.removedNodes[i].cloneNode(true),
                        nodeXP: GetXPathFromNode(mutation.removedNodes[i]),
                        parentXP: GetXPathFromNode(mutation.target),
                        siblingXP: mutation.nextSibling ? GetXPathFromNode(mutation.nextSibling) : null
                    }
                    
                    OperationLogs.push(operationLog);
                }
            }
            /**
             * Added
             */
            if (mutation.addedNodes && mutation.addedNodes.length) {
                for (let i = mutation.addedNodes.length - 1; i >= 0; i--) {
                    // rollback
                    const addedNode: Node = mutation.addedNodes[i];
                    
                    const addedNodeXP = GetXPathFromNode(addedNode);
                    
                    if (addedNode.parentNode) {
                        mutation.target.removeChild(addedNode);
                    }
                    
                    const operationLog = {
                        type: TOperationType.ADD,
                        node: addedNode.cloneNode(true), //MUST be a deep clone, otherwise when breaking a new line, the text node content of a sub node will be lost.
                        nodeXP: addedNodeXP,
                        parentXP: GetXPathFromNode(mutation.target),
                        siblingXP: mutation.nextSibling ? GetXPathFromNode(mutation.nextSibling) : null
                    }
                    OperationLogs.push(operationLog);
                }
            }
            
            // Cache the last
            lastMutation = mutation;
        }
        
        SaveMirrorToHistory();
        
        if (!syncToMirror(OperationLogs)) {
            DaemonState.UndoStack?.pop();
        }
        
        // Notify parent
        FinalizeChanges();
    }
    
    const SaveMirrorToHistory = () => {
        if (!MirrorDocumentRef || !MirrorDocumentRef.current) {
            return;
        }
        
        const CurrentDoc = (MirrorDocumentRef.current.cloneNode(true)) as Document;
        
        if (DaemonState.UndoStack === null)
            DaemonState.UndoStack = [CurrentDoc];
        else
            DaemonState.UndoStack.push(CurrentDoc);
        // Save up to ten history logs
        if (DaemonState.UndoStack.length > 10)
            DaemonState.UndoStack.shift();
        
    }
    
    const undoAndSync = () => {
        // TODO: This clone doc method can be very expensive, but the reverse 'OperationLog' method brings too much problems.
        console.log("Undo, stack length:", DaemonState.UndoStack?.length);
        if (!DaemonState.UndoStack || !DaemonState.UndoStack.length || !MirrorDocumentRef.current) return;
        
        const previousDocument = DaemonState.UndoStack.pop();
        if (!previousDocument || !previousDocument.documentElement) {
            console.warn("History object is invalid: ", previousDocument);
            return;
        }
        
        const CurrentDoc = (MirrorDocumentRef.current.cloneNode(true)) as Document;
        
        // Save to redo
        if (DaemonState.RedoStack === null)
            DaemonState.RedoStack = [CurrentDoc];
        else
            DaemonState.RedoStack.push(CurrentDoc);
        
        if (DaemonState.RedoStack.length > 10)
            DaemonState.RedoStack.shift();
        
        MirrorDocumentRef.current = previousDocument;
        
        FinalizeChanges();
    }
    
    const redoAndSync = () => {
        console.log("Redo, stack length:", DaemonState.RedoStack?.length);
        
        DaemonState.MutationQueue = [];
        
        if (!DaemonState.RedoStack || !DaemonState.RedoStack.length || !MirrorDocumentRef.current) return;
        
        // save to history again
        SaveMirrorToHistory();
        
        MirrorDocumentRef.current = DaemonState.RedoStack.pop();
        
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
    
    // A slightly modified version of the above function, returns the node's xpath regardless of node type
    // This is the "approximate" location of the note, the undo function can then "delete on this location"
    // Mainly used in give Xpath to the would be added nodes
    function GetXPathNthChild(node: Node): string {
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
        
        if (!parent) return ''; // If no parent found, very unlikely
        
        // For all nodes we calculate their position regardless of their type
        let nodeCount: number = 0;
        for (let i = 0; i < parent.childNodes.length; i++) {
            let sibling = parent.childNodes[i];
            
            if (sibling === node) {
                // Recurse on the parent node, then append this node's details to form an XPath string
                return GetXPathNthChild(parent) + '/node()[' + (nodeCount + 1) + ']';
            }
            
            nodeCount++;
        }
        
        return '';
    }
    
    // Sync to the mirror document, middleman function
    const syncToMirror = (Operations: TOperationLog[]) => {
        
        if (!Operations.length) return false;
        let operation: TOperationLog | void;
        while ((operation = Operations.pop())) {
            const {type, node, nodeXP, nodeText, parentXP, siblingXP} = operation;
            
            console.log(operation);
            try {
                if (type === TOperationType.TEXT) {
                    UpdateMirrorDocument.Text(nodeXP, nodeText!);
                }
                if (type === TOperationType.REMOVE) {
                    UpdateMirrorDocument.Remove(parentXP!, nodeXP);
                }
                if (type === TOperationType.ADD) {
                    UpdateMirrorDocument.Add(parentXP!, node!, siblingXP!);
                }
            } catch (e) {
                console.error("Error When Syncing:", e);
                return false;
            }
        }
        MirrorDocumentRef.current?.normalize();
        return true;
    }
    
    // TODO: performance could be improved.
    const UpdateMirrorDocument = {
        'Text': (NodeXpath: string, Text: string | null) => {
            
            if (!NodeXpath) {
                console.error("UpdateMirrorDocument.Text: Invalid Parameter");
                return;
            }
            
            const NodeResult = GetNodeFromXPath(MirrorDocumentRef.current!, NodeXpath);
            if (!NodeResult || NodeResult.nodeType !== Node.TEXT_NODE) return;
            
            if (!Text) Text = "";
            
            NodeResult.nodeValue = Text;
        },
        'Remove': (XPathParent: string, XPathSelf: string) => {
            if (!XPathParent || !XPathSelf) {
                console.error("UpdateMirrorDocument.Remove: Invalid Parameter");
                return;
            }
            
            const parentNode = GetNodeFromXPath(MirrorDocumentRef.current!, XPathParent);
            if (!parentNode) return;
            //FIXME:Debug output
            const regexp = /\/node\(\)\[\d+\]$/;
            if (regexp.test(XPathParent))
                console.log("Fuzzy REMOVE node Parent:", parentNode);
            
            
            const targetNode = GetNodeFromXPath(MirrorDocumentRef.current!, XPathSelf);
            //FIXME:Debug output
            if (!targetNode) return;
            if (regexp.test(XPathSelf))
                console.log("Fuzzy REMOVE node target:", targetNode);
            
            
            parentNode.removeChild(targetNode);
        },
        'Add': (XPathParent: string, Node: Node, XPathSibling: string | null) => {
            
            if (!XPathParent || !Node) {
                console.error("UpdateMirrorDocument.Add: Invalid Parameter");
                return;
            }
            
            const parentNode = GetNodeFromXPath(MirrorDocumentRef.current!, XPathParent);
            if (!parentNode) return;
            //FIXME:Debug output
            const regexp = /\/node\(\)\[\d+\]$/;
            if (regexp.test(XPathParent))
                console.log("Fuzzy ADD node Parent:", parentNode)
            
            
            const targetNode = Node;
            if (!targetNode) return;
            
            let SiblingNode = null
            if (XPathSibling) {
                SiblingNode = GetNodeFromXPath(MirrorDocumentRef.current!, XPathSibling);
                if (!SiblingNode) {
                    SiblingNode = null;
                }
            }
            //FIXME:Debug output
            if (XPathSibling !== null && regexp.test(XPathSibling))
                console.log("Fuzzy ADD node Sibling:", SiblingNode);
            
            if (SiblingNode === null && XPathSibling)
                console.warn("Adding Operation: Sibling should not have been null, but got null result: ", XPathSibling)
            
            parentNode.insertBefore(targetNode, SiblingNode);
        }
    }
    
    function GetSelectionStatus(targetElement: Element = WatchElementRef.current as Element): TSelectionStatus | null {
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
                // Make sure that the caret lands on a node that is actually editable
                // otherwise the caret disappear
                let bValidLandingNode = undefined;
                if (AnchorNode.nodeType === Node.ELEMENT_NODE) {
                    bValidLandingNode = (AnchorNode as HTMLElement).contentEditable !== 'false';
                }
                if (AnchorNode.nodeType === Node.TEXT_NODE
                    && (AnchorNode.parentNode as HTMLElement).contentEditable !== 'false') {
                    bValidLandingNode = true;
                }
                // after breaking a new line, the CharsToCaretPosition for the end of the last line
                // and the beginning of the new line will still be the same,
                // So needed to check XPath to make sure the caret moved to the correct text node
                if (AnchorNode.nodeType === SavedState.AnchorNodeType
                    && GetXPathFromNode(AnchorNode) === SavedState.AnchorNodeXPath
                    && bValidLandingNode) {
                    break;
                }
                
                if (CharsToCaretPosition <= NodeOverflowBreakCharBreak && bValidLandingNode) {
                    break;
                }
            }
        }
        
        // Type narrowing
        if (!AnchorNode) return;
        
        // reconstruct the old CurrentSelection range
        const RangeCached = document.createRange();
        
        let StartingOffset = 0;
        if (AnchorNode.textContent) {
            StartingOffset = AnchorNode.textContent.length + CharsToCaretPosition
            if (StartingOffset < 0) StartingOffset = 0;
        }
        
        try {
            RangeCached.setStart(AnchorNode, StartingOffset);
            RangeCached.setEnd(AnchorNode, StartingOffset + SavedState.SelectionExtent);
            // Replace the current CurrentSelection.
            CurrentSelection.removeAllRanges();
            CurrentSelection.addRange(RangeCached);
        } catch (e) {
            // console.error(e);
            console.warn("AnchorNode:", AnchorNode, "Starting offset:", StartingOffset);
            console.warn("Saved State:", SavedState);
        }
    }
    
    const debounceSelectionStatus = _.debounce(() => {
        DaemonState.SelectionStatusCache = GetSelectionStatus();
    }, 450);
    const debounceRollbackAndSync = _.debounce(rollbackAndSync, 500);
    
    const throttledSelectionStatus = _.throttle(() => {
        DaemonState.SelectionStatusCache = GetSelectionStatus();
    }, 200);
    const throttledRollbackAndSync = _.throttle(rollbackAndSync, 200);
    
    // Primary entry point to supporting functionalities such as restoring selection.
    useLayoutEffect(() => {
        if (!WatchElementRef.current) {
            console.log("Invalid Watched Element");
            return;
        }
        
        const WatchedElement = WatchElementRef.current;
        const contentEditableCached = WatchedElement.contentEditable;
        
        if (HookOptions?.IsEditable) {
            // !!plaintext-only actually introduces unwanted behavior
            WatchedElement.contentEditable = 'true';
            WatchElementRef.current.focus();
        }
        
        if (DaemonState.SelectionStatusCachePreBlur && HookOptions.IsEditable) {
            // consume the saved status
            RestoreSelectionStatus(WatchElementRef.current, DaemonState.SelectionStatusCachePreBlur);
            DaemonState.SelectionStatusCachePreBlur = null;
        }
        
        if (DaemonState.SelectionStatusCache) {
            // consume the saved status
            RestoreSelectionStatus(WatchElementRef.current, DaemonState.SelectionStatusCache);
            DaemonState.SelectionStatusCache = null;
        }
        
        if (HookOptions.ShouldObserve) {
            toggleObserve(true);
        }
        
        // clean up
        return () => {
            WatchedElement.contentEditable = contentEditableCached;
            toggleObserve(false);
            
            if (DaemonState.SelectionStatusCache === null) {
                DaemonState.SelectionStatusCache = GetSelectionStatus(WatchedElement);
            }
        }
    });
    
    // Event handler entry point
    useLayoutEffect(() => {
        
        if (!WatchElementRef.current || !MirrorDocumentRef.current) {
            return;
        }
        const WatchedElement = WatchElementRef.current;
        
        // bind Events
        const KeyDownHandler = (ev: HTMLElementEventMap['keydown']) => {
            
            // if (ev.key === 'Enter') {
            //     if (DaemonState.MutationQueue.length >= 1) {
            //         ev.preventDefault();
            //         ev.stopPropagation();
            //         DaemonState.SelectionStatusCache = GetSelectionStatus((WatchElementRef.current as Element));
            //         rollbackAndSync();
            //     }
            // }
            
            if ((ev.metaKey || ev.ctrlKey) && !ev.altKey && ev.code === 'KeyZ') {
                ev.preventDefault();
                ev.stopPropagation();
                throttledRollbackAndSync();
                setTimeout(() => undoAndSync(), 0);
                return;
                
            }
            if ((ev.metaKey || ev.ctrlKey) && !ev.altKey && ev.code === 'KeyY') {
                ev.preventDefault();
                ev.stopPropagation();
                redoAndSync();
                return;
            }
            // if (ev.key === 'Enter') {}
        }
        
        const KeyUpHandler = () => {
            debounceSelectionStatus();
            if (DaemonState.MutationQueue.length >= 1) {
                debounceRollbackAndSync();
            }
        }
        
        const PastHandler = (ev: ClipboardEvent) => {
            ev.preventDefault();
            
            const text = ev.clipboardData!.getData('text/plain');
            
            // FIXME: Deprecated API, no alternative
            document.execCommand('insertText', false, text);
            
            debounceSelectionStatus();
            debounceRollbackAndSync();
        }
        
        const SelectionHandler = (ev: Event) => {
            DaemonState.SelectionStatusCache =
                window.getSelection()!.rangeCount && ev.target === WatchedElement
                    ? GetSelectionStatus(WatchedElement)
                    : null;
        }
        
        const BlurHandler = () => {
            DaemonState.SelectionStatusCachePreBlur = GetSelectionStatus((WatchElementRef.current as Element));
        }
        
        const DoNothing = (ev: Event) => {
            ev.preventDefault();
            ev.stopPropagation();
        }
        
        const MoveCaretToMouse = (event: MouseEvent) => {
            
            let range: Range | null = null;
            // FIXME: Deprecated API, but no real alternative
            if (typeof document.caretRangeFromPoint !== "undefined") {
                // Chromium
                range = document.caretRangeFromPoint(event.clientX, event.clientY);
            } else if (
                // @ts-expect-error: Firefox spec API
                typeof document.caretPositionFromPoint === "function"
            ) {
                // Firefox
                // @ts-expect-error: Firefox spec API
                const caretPos = document.caretPositionFromPoint(event.clientX, event.clientY);
                if (caretPos !== null) {
                    range = document.createRange();
                    range.setStart(caretPos.offsetNode, caretPos.offset);
                    range.collapse(true);
                }
            }
            
            const currentSelection = window.getSelection();
            if (currentSelection && currentSelection.isCollapsed && range) {
                currentSelection.removeAllRanges();
                currentSelection.addRange(range);
                
                DaemonState.SelectionStatusCache = GetSelectionStatus(WatchedElement);
            }
            
        }
        
        WatchedElement.addEventListener("keydown", KeyDownHandler);
        WatchedElement.addEventListener("keyup", KeyUpHandler);
        WatchedElement.addEventListener("paste", PastHandler);
        
        WatchedElement.addEventListener("selectstart", SelectionHandler);
        WatchedElement.addEventListener("dragstart", DoNothing);
        WatchedElement.addEventListener("focusout", BlurHandler);
        
        WatchedElement.addEventListener("mouseup", MoveCaretToMouse);
        
        return () => {
            // WatchedElement.style.whiteSpace = whiteSpaceCached;
            WatchedElement.removeEventListener("keydown", KeyDownHandler);
            WatchedElement.removeEventListener("keyup", KeyUpHandler);
            WatchedElement.removeEventListener("paste", PastHandler);
            
            WatchedElement.removeEventListener("selectstart", SelectionHandler);
            WatchedElement.removeEventListener("dragstart", DoNothing);
            WatchedElement.removeEventListener("focusout", BlurHandler);
            
            WatchedElement.removeEventListener("mouseup", MoveCaretToMouse);
        }
        
    }, [WatchElementRef.current!])
    
    return {
        'AddToRecord': (Record: MutationRecord) => {
            DaemonState.MutationQueue.push(Record);
            throttledSelectionStatus();
            throttledRollbackAndSync();
        }
    }
}

function GetNodeFromXPath(doc: Document, XPath: string) {
    if (!doc) {
        console.error("getNodeFromXPath: Invalid Doc");
        return;
    }
    return doc.evaluate(XPath, doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE).singleNodeValue;
}