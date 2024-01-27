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
    REMOVE = "REMOVE",
    REPLACE = "REPLACE"
}

// Instructions for DOM manipulations on the mirror document
type TOperationLog = {
    type: TOperationType,
    node?: Node,
    nodeXP: string,
    newNodes?: Node[] | HTMLElement[],
    oldNode?: Node | HTMLElement, //used in redo
    nodeText?: string | null,
    nodeTextOld?: string | null, //used in redo
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

type THookOptions = {
    TextNodeCallback?: (textNode: Node) => Node[] | null | undefined,
    ShouldObserve: boolean,
    IsEditable: boolean,
    ShouldFocus: boolean
}

// Hook's persistent variables
type TDaemonState = {
    Observer: MutationObserver, //Mutation Observer instance
    MutationQueue: MutationRecord[], // All records will be pushed to here
    OperationHistory: [TOperationLog[]] | null
    UndoStack: [TOperationLog[]] | null
    SelectionStatusCache: TSelectionStatus | null,
    SelectionStatusCachePreBlur: TSelectionStatus | null
}

export default function useEditorHTMLDaemon(
    WatchElementRef: { current: HTMLElement | undefined | null },
    MirrorDocumentRef: { current: Document | undefined | null },
    FinalizeChanges: Function,
    Options: Partial<THookOptions>
) {
    
    const HookOptions = {
        TextNodeCallback: undefined,
        ShouldObserve: true,
        IsEditable: true,
        ...Options
    };
    
    // Persistent Variables
    // Easier to set up type and to init using state, but really acts as a ref.
    const DaemonState: TDaemonState = useState(() => {
        
        const state: TDaemonState = {
            Observer: null as any,
            MutationQueue: [],
            OperationHistory: null,
            UndoStack: null,
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
                        if (mutationData.type === 'characterData' && mutationData.target === mutation?.target && mutationData.oldValue !== null) {
                            TextNodeOriginalValue = mutationData.oldValue;
                        } else {
                            return TextNodeOriginalValue;
                        }
                    })
                }
                
                
                const ParentNode = mutation.target.parentNode as HTMLElement;
                // TextNodeCallback present, use TextNodeCallback result.
                if (typeof HookOptions.TextNodeCallback === 'function' && ParentNode) {
                    
                    const OldTextNode = mutation.target;
                    
                    const callbackResult = HookOptions.TextNodeCallback(OldTextNode);
                    if (!callbackResult) {
                        console.error("Invalid text node handler return", callbackResult, " From ", OldTextNode);
                        continue;
                    }
                    
                    const ParentXPath = ParentNode ? GetXPathFromNode(ParentNode) : '';
                    const OldTextNodeXPath = GetXPathFromNode(OldTextNode);
                    /**
                     * ---Only one resulting node
                     *  replace the old node, this is so that undo can replace it back later
                     */
                    if (callbackResult.length === 1) {
                        
                        let whiteSpaceStart = OldTextNode.textContent!.match(/^\s*/) || [""];
                        let whiteSpaceEnd = OldTextNode.textContent!.match(/\s*$/) || [""];
                        
                        let restoredText = callbackResult[0].textContent;
                        if (restoredText !== null && restoredText.trim() !== '') {
                            restoredText = whiteSpaceStart[0] + callbackResult[0].textContent!.trim() + whiteSpaceEnd[0];
                            callbackResult[0].textContent = restoredText;
                        }
                        
                        const ReplaceTarget = ParentNode.tagName.toLowerCase() === 'p' || ParentNode.tagName.toLowerCase() === 'div' ? OldTextNodeXPath : ParentXPath;
                        const ReplaceNode = ParentNode.tagName.toLowerCase() === 'p' || ParentNode.tagName.toLowerCase() === 'div' ? OldTextNode : ParentNode;
                        
                        const Operation: TOperationLog = {
                            type: TOperationType.REPLACE,
                            nodeXP: ReplaceTarget,
                            newNodes: [callbackResult[0].cloneNode(true)],
                            oldNode: ReplaceNode.cloneNode(true),
                            // oldNodeXP:
                        }
                        OperationLogs.push(Operation);
                        
                    }
                    /**
                     * ---Multiple valid nodes
                     * add the new node, remove the old one, undo can just flip the actions
                     */
                    if (callbackResult.length > 1) {
                        
                        let whiteSpaceStart = OldTextNode.textContent!.match(/^\s*/) || [""];
                        let whiteSpaceEnd = OldTextNode.textContent!.match(/\s*$/) || [""];
                        
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
                            OperationLogs.push({
                                type: TOperationType.ADD,
                                node: node.cloneNode(true),
                                nodeXP: GetXPathNthChild(OldTextNode), //redo will remove at the position of the "replaced" text node
                                parentNode: ParentXPath,
                                siblingNode: OldTextNode.nextSibling ? GetXPathFromNode(OldTextNode.nextSibling) : null
                            });
                        })
                        
                        OperationLogs.push({
                            type: TOperationType.REMOVE,
                            node: OldTextNode.cloneNode(true),
                            nodeXP: OldTextNodeXPath,
                            parentNode: ParentXPath,
                            siblingNode: OldTextNode.nextSibling ? GetXPathFromNode(OldTextNode.nextSibling) : null
                        });
                    }
                    
                } else {
                    // Default handling, change text content only
                    const Operation: TOperationLog = {
                        type: TOperationType.TEXT,
                        nodeXP: GetXPathFromNode(mutation.target),
                        nodeText: mutation.target.textContent,
                        nodeTextOld: TextNodeOriginalValue
                    }
                    OperationLogs.push(Operation);
                }
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
                    
                    OperationLogs.push({
                        type: TOperationType.REMOVE,
                        node: mutation.removedNodes[i].cloneNode(true),
                        nodeXP: GetXPathFromNode(mutation.removedNodes[i]),
                        parentNode: GetXPathFromNode(mutation.target),
                        siblingNode: mutation.nextSibling ? GetXPathFromNode(mutation.nextSibling) : null
                    });
                    // Redo
                    // To acquire the correct xpath, the node must be added to the original tree first.
                    // if (typeof removedNode.hasAttribute === "function" && removedNode.hasAttribute('data-no-roll-back')) {
                    //     mutation.target.removeChild(mutation.removedNodes[i]);
                    // }
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
                    
                    // FIXME
                    OperationLogs.push({
                        type: TOperationType.ADD,
                        node: addedNode.cloneNode(true), //MUST be a deep clone, otherwise when breaking a new line, the text node content of a sub node will be lost.
                        nodeXP: addedNodeXP,
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
            
            // Cache the last
            lastMutation = mutation;
        }
        
        saveToHistory(OperationLogs);
        syncToMirror(OperationLogs);
        // Notify parent
        FinalizeChanges();
    }
    
    const saveToHistory = (Log: TOperationLog[]) => {
        if (DaemonState.OperationHistory === null)
            DaemonState.OperationHistory = [Log.slice()];
        else
            DaemonState.OperationHistory.push(Log.slice());
        
        if (DaemonState.OperationHistory.length > 5)
            DaemonState.OperationHistory.shift();
        
    }
    
    const undoAndSync = () => {
        console.log("UNDO!")
        if (!DaemonState.OperationHistory) return;
        
        const operationLogs = DaemonState.OperationHistory.pop();
        if (operationLogs === undefined) return;
        
        WatchElementRef.current!.contentEditable = 'false';
        
        let OperationLogs: TOperationLog[] = []
        let Log;
        while ((Log = operationLogs.pop())) {
            switch (Log.type) {
                case 'TEXT': {
                    const temp = Log.nodeText;
                    Log.nodeText = Log.nodeTextOld;
                    Log.nodeTextOld = temp;
                    break
                }
                case 'ADD': {
                    Log.type = TOperationType.REMOVE;
                    break
                }
                case 'REMOVE': {
                    Log.type = TOperationType.ADD;
                    break
                }
                case 'REPLACE': {
                    if (!Log.oldNode) break;
                    const temp = Log.newNodes;
                    Log.newNodes = [Log.oldNode];
                    Log.oldNode = temp ? temp[0] : undefined
                    break
                }
            }
            OperationLogs.push(Log);
        }
        
        syncToMirror(OperationLogs);
        
        // Save to the stack for redo
        if (!DaemonState.UndoStack)
            DaemonState.UndoStack = [OperationLogs.slice()];
        else
            DaemonState.UndoStack.push(OperationLogs.slice());
        
        // Notify parent
        FinalizeChanges();
    }
    
    const redoAndSync = () => {
        console.log("REDO!")
        if (!DaemonState.UndoStack) return;
        
        // const lastUndo = DaemonState.UndoStack.pop();
        // if (!lastUndo) return;
        //
        // WatchElementRef.current!.contentEditable = 'false';
        //
        // syncToMirror(lastUndo);
        //
        // // Notify parent
        // FinalizeChanges();
        //
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
        
        if (!Operations.length) return;
        
        let operation: TOperationLog | void;
        while ((operation = Operations.pop())) {
            const {type, node, nodeXP, newNodes, nodeText, parentNode, siblingNode} = operation;
            
            console.log(operation);
            
            try {
                if (type === TOperationType.TEXT) {
                    UpdateMirrorDocument.Text(nodeXP, nodeText!);
                }
                if (type === TOperationType.REMOVE) {
                    UpdateMirrorDocument.Remove(parentNode!, nodeXP);
                }
                if (type === TOperationType.ADD) {
                    UpdateMirrorDocument.Add(parentNode!, node!, siblingNode!);
                }
                if (type === TOperationType.REPLACE) {
                    UpdateMirrorDocument.Replace(nodeXP, newNodes!);
                }
            } catch (e) {
                
                console.error("Error When Syncing:", e);
            }
            
        }
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
            
            const targetNode = GetNodeFromXPath(MirrorDocumentRef.current!, XPathSelf);
            if (!targetNode) return;
            
            parentNode.removeChild(targetNode);
            
            if (targetNode.nodeType === Node.TEXT_NODE) {
                parentNode.normalize();
                FindNearestParagraph(parentNode)?.normalize()
            }
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
            
            if (targetNode.nodeType === Node.TEXT_NODE) {
                FindNearestParagraph(parentNode)?.normalize()
            }
        },
        'Replace': (NodeXpath: string, newNodes: Node[] | HTMLElement[]) => {
            if (!NodeXpath || !newNodes.length) {
                console.error("UpdateMirrorDocument.Replace: Invalid Parameter");
                return;
            }
            
            const selectedNode = GetNodeFromXPath(MirrorDocumentRef.current!, NodeXpath)
            if (!selectedNode || !(selectedNode as HTMLElement)) return;
            
            const parentContainer = selectedNode.parentNode;
            
            (selectedNode as HTMLElement).replaceWith(...newNodes);
            // This combines the (possible) multiple text nodes into one, otherwise there will be strange bugs when editing again.
            parentContainer?.normalize();
            FindNearestParagraph(selectedNode)?.normalize()
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
                if (AnchorNode.nodeType === Node.ELEMENT_NODE &&
                    (AnchorNode as HTMLElement).contentEditable !== 'false') {
                    bValidLandingNode = true;
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
                    && bValidLandingNode
                ) {
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
                
                throttledSelectionStatus();
                throttledRollbackAndSync();
                
                undoAndSync();
                return;
                
            }
            if ((ev.metaKey || ev.ctrlKey) && !ev.altKey && ev.code === 'KeyY') {
                ev.preventDefault();
                ev.stopPropagation();
                
                redoAndSync();
                return;
            }
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

function FindNearestParagraph(node: Node, targetTagName = 'p'): HTMLElement | null {
    while (node && node.nodeName !== targetTagName) {
        if (!node.parentNode) {
            return null;
        }
        node = node.parentNode;
    }
    return node as HTMLElement;
}

function GetNodeFromXPath(doc: Document, XPath: string) {
    if (!doc) {
        console.error("getNodeFromXPath: Invalid Doc");
        return;
    }
    return doc.evaluate(XPath, doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE).singleNodeValue;
}