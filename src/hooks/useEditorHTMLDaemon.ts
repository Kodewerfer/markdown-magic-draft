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

export const ParagraphTest = /^(p|div|main|body|h1|h2|h3|h4|h5|h6|blockquote|pre|code|ul|li|section)$/i;
// Instructions for DOM manipulations on the mirror document
export type TSyncOperation = {
    type: 'TEXT' | 'ADD' | 'REMOVE' | 'REPLACE' | 'ATTR'
    fromTextHandler?: boolean  //indicate if it was a replacement node resulting from text node callback
    newNode?: Node | (() => Node)
    targetNode?: Node //Alternative to XP
    targetNodeXP?: string
    nodeText?: string | null
    nodeTextOld?: string | null //used in redo
    parentXP?: string | null
    parentNode?: Node //Alternative to XP, when adding
    siblingXP?: string | null
    siblingNode?: Node | undefined | null
    attribute?: { name: string; value: string }
}

// For storing selection before parent re-rendering
type TSelectionStatus = {
    CaretPosition: number
    SelectionExtent: number
    AnchorNodeType: number
    AnchorNodeXPath: string
}

type TDOMTrigger = 'add' | 'remove' | 'text' | 'any';

// Type for add to ignore map
export type TIgnoreMap = Map<Node, TDOMTrigger>;

export type TElementOperation = Map<Node, {
    Trigger: TDOMTrigger,
    Operations: TSyncOperation | TSyncOperation[]
}>;

// Hook's persistent variables
type TDaemonState = {
    Observer: MutationObserver //Mutation Observer instance
    MutationQueue: MutationRecord[] // All records will be pushed to here
    IgnoreMap: TIgnoreMap
    BindOperationMap: TElementOperation
    AdditionalOperation: TSyncOperation[]
    CaretOverrideToken: TCaretToken // for now, enter key logic only, move the caret to the beginning of the next line if need be.
    UndoStack: [Document] | null
    RedoStack: [Document] | null
    SelectionStatusCache: TSelectionStatus | null
    SelectionStatusCachePreBlur: TSelectionStatus | null
}

type THookOptions = {
    TextNodeCallback?: (textNode: Node) => Node[] | null | undefined
    OnRollback?: Function | undefined
    ShouldObserve: boolean
    ShouldLog: boolean
    IsEditable: boolean
    ShouldFocus: boolean
    ParagraphTags: RegExp //
    HistoryLength: number
    
}

type TCaretToken = 'zero' | 'NextLine' | 'ElementNextSibling' | null;

export type TDaemonReturn = {
    SyncNow: () => void;
    DiscardHistory: (DiscardCount: number) => void;
    SetFutureCaret: (token: TCaretToken) => void;
    AddToIgnore: (Element: Node, Type: TDOMTrigger) => void;
    AddToBindOperations: (Element: Node, Trigger: TDOMTrigger, Operation: TSyncOperation | TSyncOperation[]) => void; //DEPRECATED
    AddToOperations: (Operation: TSyncOperation | TSyncOperation[]) => void;
}

export default function useEditorHTMLDaemon(
    WatchElementRef: { current: HTMLElement | undefined | null },
    MirrorDocumentRef: { current: Document | undefined | null },
    FinalizeChanges: Function,
    Options: Partial<THookOptions>
): TDaemonReturn {
    
    // Default options
    const DaemonOptions = {
        TextNodeCallback: undefined,
        OnRollback: undefined,
        ShouldObserve: true,
        ShouldLog: true,
        IsEditable: true,
        ParagraphTags: ParagraphTest,   // Determined whether to use "replacement" logic or just change the text node.
        HistoryLength: 10,
        ...Options
    };
    
    // Persistent Variables
    // Easier to set up type and to init using state, but really acts as a ref.
    const DaemonState: TDaemonState = useState(() => {
        
        const state: TDaemonState = {
            Observer: null as any,
            MutationQueue: [],
            IgnoreMap: new Map(),
            BindOperationMap: new Map(),
            AdditionalOperation: [],
            CaretOverrideToken: null,
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
        
        // OB's callback is asynchronous
        // make sure no records are left behind
        DaemonState.MutationQueue.push(...DaemonState.Observer.takeRecords())
        
        // console.log("Add:",...DaemonState.AdditionalOperation)
        // console.log("MQueue:",...DaemonState.MutationQueue)
        
        if (!DaemonState.MutationQueue.length && !DaemonState.AdditionalOperation.length) {
            if (DaemonOptions.ShouldLog)
                console.log("MutationQueue and AdditionalOperation empty, sync aborted.");
            return;
        }
        
        let onRollbackReturn: any; // the cleanup function, if present
        // Rollback mask
        if (typeof DaemonOptions.OnRollback === 'function')
            onRollbackReturn = DaemonOptions.OnRollback();
        
        toggleObserve(false);
        WatchElementRef.current!.contentEditable = 'false';
        
        // Rollback Changes
        let mutation: MutationRecord | void;
        let lastMutation: MutationRecord | null = null;
        let OperationLogs: TSyncOperation[] = [];
        let BindOperationLogs: TSyncOperation[] = [];
        
        // THE MAIN LOGIC BLOCK
        while ((mutation = DaemonState.MutationQueue.pop())) {
            
            /**
             * Text Changed
             */
            if (mutation.type === "characterData" && mutation.oldValue !== null) {
                
                // only use the latest character data mutation.
                if (lastMutation && mutation.target === lastMutation.target) continue;
                
                // Check for ignore
                if (DaemonState.IgnoreMap.get(mutation.target) === 'text' || DaemonState.IgnoreMap.get(mutation.target) === 'any') continue;
                
                // Get the original value for the text node. used in undo
                // Deprecated, but value still processed for now
                let TextNodeOriginalValue = mutation.oldValue;
                if (DaemonState.MutationQueue.length >= 1) {
                    DaemonState.MutationQueue.slice().reverse().some((mutationData) => {
                        if (mutationData.target === mutation?.target && mutationData.oldValue !== null) {
                            TextNodeOriginalValue = mutationData.oldValue;
                        } else {
                            return TextNodeOriginalValue;
                        }
                    })
                }
                
                /** TextNodeCallback present, use TextNodeCallback result */
                if (typeof DaemonOptions.TextNodeCallback === 'function') {
                    const ParentNode = mutation.target.parentNode as HTMLElement;
                    const OldTextNode = mutation.target;
                    
                    const callbackResult = DaemonOptions.TextNodeCallback(OldTextNode);
                    
                    if (!callbackResult || !callbackResult.length) {
                        console.log("Text Handler: Result is empty");
                        if (OldTextNode.textContent !== '')
                            console.warn("Invalid text node handler return", callbackResult, " From ", OldTextNode);
                        continue;
                    }
                    
                    if (DaemonOptions.ShouldLog)
                        console.log("Text Handler result:", callbackResult, "from text value:", OldTextNode);
                    
                    // The scope of operation
                    const ParentXPath = ParentNode ? GetXPathFromNode(ParentNode) : '';
                    const ParentParentXPath = ParentNode.parentNode ? GetXPathFromNode(ParentNode.parentNode) : '';
                    
                    // Determined if parent of the text is paragraph level (p/div etc.) then choose candidate, !! may be overwritten later.
                    const ParentTagsTest = DaemonOptions.ParagraphTags
                    let LogParentXP = ParentXPath;
                    
                    let whiteSpaceStart = OldTextNode.textContent!.match(/^\s*/) || [""];
                    let whiteSpaceEnd = OldTextNode.textContent!.match(/\s*$/) || [""];
                    
                    /**
                     *  Result in only one text node
                     */
                    if (callbackResult.length === 1 && callbackResult[0].nodeType === Node.TEXT_NODE && callbackResult[0].textContent !== null) {
                        const RestoredText = whiteSpaceStart[0] + callbackResult[0].textContent.trim() + whiteSpaceEnd[0];
                        
                        OperationLogs.push({
                            type: "TEXT",
                            fromTextHandler: true,
                            targetNodeXP: GetXPathFromNode(mutation.target),
                            nodeText: RestoredText,
                            nodeTextOld: TextNodeOriginalValue
                        });
                        
                        // Cache the last
                        lastMutation = mutation;
                        continue;
                    }
                    
                    /**
                     *  Result in multiple nodes or only one node but no longer a text node.
                     */
                    let LogNodeXP = GetXPathNthChild(OldTextNode);
                    let logSiblingXP = OldTextNode.nextSibling ? GetXPathFromNode(OldTextNode.nextSibling) : null;
                    // at this point, the text node can either be under a sub-level element(strong,del etc) or a paragraph-level tag
                    // if it was the former case, override; otherwise, leave the nodes where they're (unless they themselves have a paragraph-level tag)
                    LogParentXP = DaemonOptions.ParagraphTags.test(ParentNode.tagName.toLowerCase()) ? ParentXPath : ParentParentXPath;
                    
                    // Add the new node/nodes in a doc frag.It's "toReversed()", because the later operation uses pop()
                    // Also check if contains any paragraph level tags.
                    const NewFragment: DocumentFragment = document.createDocumentFragment();
                    let shouldOverrideParent: boolean = false; //flag, true if resulting nodes have at least one paragraph-level tag
                    callbackResult.toReversed().forEach((node, index, array) => {
                        // Check to set the flag
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const tagName = (node as HTMLElement).tagName.toLowerCase();
                            if (ParentTagsTest.test(tagName))
                                shouldOverrideParent = true;
                        }
                        
                        // Add trailing whitespace
                        if (index === 0) {
                            // the last element,because it is flipped,
                            if (node.textContent && node.nodeType === Node.TEXT_NODE) {
                                node.textContent = node.textContent.trim() + whiteSpaceEnd[0];
                            }
                        }
                        // Add starting whitespace
                        if (index === array.length - 1) {
                            // the first element,because it is flipped,
                            if (node.textContent && node.nodeType === Node.TEXT_NODE) {
                                node.textContent = whiteSpaceStart[0] + node.textContent.trim()
                            }
                        }
                        
                        // if there is a non text node in between, add whitespace to surrounding textnodes.
                        if (node.nodeType === Node.TEXT_NODE && node.textContent && node.textContent !== ' ') {
                            if (!node.textContent.endsWith(' ') && array[index - 1] && array[index - 1].nodeType !== Node.TEXT_NODE) {
                                node.textContent = node.textContent.trimEnd() + ' ';
                            }
                            if (!node.textContent.startsWith(' ') && array[index + 1] && array[index + 1].nodeType !== Node.TEXT_NODE) {
                                node.textContent = ' ' + node.textContent.trimStart();
                            }
                        }
                        
                        
                        // Frag to make sure elements are in correct order
                        NewFragment.prepend(node);
                    })
                    
                    // ! Scope override
                    if (shouldOverrideParent)
                        LogParentXP = ParentParentXPath;
                    
                    if (LogParentXP === ParentParentXPath) {
                        LogNodeXP = GetXPathNthChild(ParentNode);
                        logSiblingXP = ParentNode.nextSibling ? GetXPathNthChild(ParentNode.nextSibling) : null;
                    }
                    
                    // remove the old node, later operation uses pop(), so this happens last.
                    OperationLogs.push({
                        type: "REMOVE",
                        fromTextHandler: true,
                        targetNodeXP: LogNodeXP,
                        parentXP: LogParentXP,
                        siblingXP: logSiblingXP
                    });
                    
                    OperationLogs.push({
                        type: "ADD",
                        fromTextHandler: true,
                        newNode: NewFragment.cloneNode(true),
                        targetNodeXP: LogNodeXP, //redo will remove at the position of the "replaced" text node
                        parentXP: LogParentXP,
                        siblingXP: logSiblingXP,
                    });
                    
                    // Cache the last, early continue
                    lastMutation = mutation;
                    continue
                }
                
                /** Default handling, change text content only */
                const Operation: TSyncOperation = {
                    type: "TEXT",
                    targetNodeXP: GetXPathFromNode(mutation.target),
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
                    
                    // Check if the element had bind operations
                    HandleBindOperations(removedNode, 'remove', BindOperationLogs);
                    
                    // Check Ignore map
                    if (DaemonState.IgnoreMap.get(removedNode) === 'remove' || DaemonState.IgnoreMap.get(removedNode) === 'any')
                        continue;
                    
                    // rollback
                    mutation.target.insertBefore(
                        removedNode,
                        mutation.nextSibling,
                    );
                    
                    const operationLog: TSyncOperation = {
                        type: "REMOVE",
                        newNode: removedNode.cloneNode(true),
                        targetNodeXP: GetXPathFromNode(removedNode),
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
                    
                    const addedNode = mutation.addedNodes[i] as HTMLElement;
                    
                    // Check if the element had bind operations
                    HandleBindOperations(addedNode, 'add', BindOperationLogs);
                    
                    // Check Ignore map
                    if (DaemonState.IgnoreMap.get(addedNode) === 'add' || DaemonState.IgnoreMap.get(addedNode) === 'any')
                        continue;
                    
                    // rollback
                    if (addedNode.parentNode) {
                        mutation.target.removeChild(addedNode);
                    }
                    
                    const addedNodeXP = GetXPathFromNode(addedNode);
                    
                    const operationLog: TSyncOperation = {
                        type: "ADD",
                        newNode: addedNode.cloneNode(true), //MUST be a deep clone, otherwise when breaking a new line, the text node content of a sub node will be lost.
                        targetNodeXP: addedNodeXP,
                        parentXP: GetXPathFromNode(mutation.target),
                        siblingXP: mutation.nextSibling ? GetXPathFromNode(mutation.nextSibling) : null
                    }
                    OperationLogs.push(operationLog);
                }
            }
            
            // Cache the last
            lastMutation = mutation;
        }
        
        /**
         * The order of execution for the operations is:
         * 1. user initiated operations(on-page editing);
         * 2. "bind" operations, eg: those that are triggered by removing a syntax span
         * 3. "additional" operations, usually sent directly from a component
         */
        // Append Bind Ops
        OperationLogs.unshift(...BindOperationLogs); //DEPRECATED
        
        // Append Ops sent directly from components
        const newOperations: TSyncOperation[] = AppendAdditionalOperations(OperationLogs);
        DaemonState.AdditionalOperation = []
        
        // Revert back to editing state when no operations are queued.
        // This can happen when all elements in the MutationQueue are ignored.
        if (newOperations.length === 0) {
            if (DaemonOptions.ShouldLog)
                console.log("No Operation generated, abort.");
            
            toggleObserve(true);
            WatchElementRef.current!.contentEditable = 'true';
            
            if (typeof onRollbackReturn === "function")
                // Run the cleanup/revert function that is the return of the onRollbackReturn handler.
                // right now it's just unmasking.
                onRollbackReturn();
            
            RestoreSelectionStatus(WatchElementRef.current!, DaemonState.SelectionStatusCache!);
            return;
        }
        
        saveMirrorToHistory();
        
        if (!syncToMirror(newOperations)) {
            DaemonState.UndoStack?.pop();
        }
        
        // Reset ignore
        DaemonState.IgnoreMap.clear();
        
        // Notify parent
        FinalizeChanges();
    }
    
    //DEPRECATED
    const HandleBindOperations = (Node: HTMLElement | Node, BindTrigger: string, LogStack: TSyncOperation[]) => {
        const OperationItem = DaemonState.BindOperationMap.get(Node);
        
        if (OperationItem && (OperationItem.Trigger === BindTrigger || OperationItem.Trigger === 'any')) {
            const AdditionalOperations = BuildOperations(OperationItem.Operations);
            LogStack.push(...AdditionalOperations);
        }
        
    }
    
    const AppendAdditionalOperations = (OperationLogs: TSyncOperation[]) => {
        if (DaemonState.AdditionalOperation.length) {
            const syncOpsBuilt = BuildOperations(DaemonState.AdditionalOperation);
            OperationLogs.unshift(...syncOpsBuilt.reverse());
        }
        return OperationLogs;
    }
    
    const saveMirrorToHistory = () => {
        if (!MirrorDocumentRef || !MirrorDocumentRef.current) {
            return;
        }
        
        const HistoryLength = DaemonOptions.HistoryLength;
        
        const CurrentDoc = (MirrorDocumentRef.current.cloneNode(true)) as Document;
        
        if (DaemonState.UndoStack === null)
            DaemonState.UndoStack = [CurrentDoc];
        else
            DaemonState.UndoStack.push(CurrentDoc);
        // Save up to ten history logs
        if (DaemonState.UndoStack.length > HistoryLength)
            DaemonState.UndoStack.shift();
        
    }
    
    // Use content from Undo stack to override the page, save it to Redo Stack
    const undoAndSync = () => {
        // FIXME: expensive operation, but to revert the OpLogs brings too many problems
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
        saveMirrorToHistory();
        
        MirrorDocumentRef.current = DaemonState.RedoStack.pop();
        
        FinalizeChanges();
    }
    
    // Helper to get the precise location in the original DOM tree, ignore generated tags
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
                if (!(sibling as HTMLElement).hasAttribute('data-is-generated')) //custom attr, for the elements that are generated by react, and not in the original doc
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
            
            // FIXME: may be buggy, to be tested.
            if (sibling.nodeType === Node.TEXT_NODE) {
                nodeCount++;
            } else if (sibling.nodeType === Node.ELEMENT_NODE && !(sibling as HTMLElement).hasAttribute('data-is-generated')) {
                nodeCount++;
            }
        }
        
        return '';
    }
    
    function BuildOperations(Operations: TSyncOperation | TSyncOperation[]) {
        let OPStack: TSyncOperation[];
        if (Array.isArray(Operations)) {
            OPStack = [...Operations];
        } else {
            OPStack = [Operations]
        }
        
        for (const OPItem of OPStack) {
            if (!OPItem.targetNodeXP && OPItem.targetNode) {
                Object.assign(OPItem, {
                    targetNodeXP: GetXPathFromNode(OPItem.targetNode)
                })
            }
            // adding
            if (!OPItem.parentXP && OPItem.parentNode) {
                Object.assign(OPItem, {
                    parentXP: GetXPathFromNode(OPItem.parentNode)
                })
            }
            // remove,replace
            if (!OPItem.parentXP && OPItem.targetNode && OPItem.targetNode.parentNode) {
                Object.assign(OPItem, {
                    parentXP: GetXPathFromNode(OPItem.targetNode.parentNode)
                })
            }
            if (!OPItem.siblingXP && OPItem.siblingNode !== undefined) {
                Object.assign(OPItem, {
                    siblingXP: OPItem.siblingNode ? GetXPathFromNode(OPItem.siblingNode) : null // if not undefined, then there isn't a sibling node
                })
            } else if (!OPItem.siblingXP && OPItem.targetNode) {
                Object.assign(OPItem, {
                    siblingXP: OPItem.targetNode.nextSibling ? GetXPathFromNode(OPItem.targetNode.nextSibling) : null
                })
            }
        }
        
        return OPStack;
    }
    
    // Sync to the mirror document, middleman function
    const syncToMirror = (Operations: TSyncOperation[]) => {
        
        if (!Operations.length) return false;
        let operation: TSyncOperation | void;
        while ((operation = Operations.pop())) {
            const {
                type, newNode, targetNodeXP,
                nodeText, parentXP, siblingXP, attribute
            } = operation;
            
            if (DaemonOptions.ShouldLog)
                console.log("OP Log:", operation);
            
            try {
                // switch (type):
                if (type === "TEXT") {
                    UpdateMirrorDocument.Text(targetNodeXP!, nodeText!);
                }
                if (type === "REMOVE") {
                    UpdateMirrorDocument.Remove(parentXP!, targetNodeXP!);
                }
                if (type === "ADD") {
                    UpdateMirrorDocument.Add(parentXP!, newNode!, siblingXP!);
                }
                if (type === "REPLACE") {
                    UpdateMirrorDocument.Replace(targetNodeXP!, newNode!);
                }
                if (type === "ATTR") {
                    UpdateMirrorDocument.Attribute(targetNodeXP!, attribute!);
                }
            } catch (e) {
                console.error("Error When Syncing:", e);
                return false;
            }
        }
        MirrorDocumentRef.current?.normalize();
        return true;
    }
    
    const UpdateMirrorDocument = {
        'Text': (NodeXpath: string, Text: string | null) => {
            
            if (!NodeXpath) {
                console.warn("UpdateMirrorDocument.Text: Invalid Parameter");
                return;
            }
            
            const targetNode = GetNodeFromXPath(MirrorDocumentRef.current!, NodeXpath);
            
            if (!targetNode || targetNode.nodeType !== Node.TEXT_NODE) {
                console.warn("UpdateMirrorDocument.Text: invalid target text node");
                return
            }
            
            if (!Text) Text = "";
            
            targetNode.nodeValue = Text;
        },
        'Remove': (XPathParent: string, XPathSelf: string) => {
            if (!XPathParent || !XPathSelf) {
                console.warn("UpdateMirrorDocument.Remove: Invalid Parameter");
                return;
            }
            
            const parentNode = GetNodeFromXPath(MirrorDocumentRef.current!, XPathParent);
            if (!parentNode) {
                console.warn("UpdateMirrorDocument.Remove: No parentNode");
                return;
            }
            
            const regexp = /\/node\(\)\[\d+\]$/;
            if (regexp.test(XPathParent) && DaemonOptions.ShouldLog)
                console.log("Fuzzy REMOVE node Parent:", parentNode);
            
            
            const targetNode = GetNodeFromXPath(MirrorDocumentRef.current!, XPathSelf);
            if (!targetNode) {
                console.warn("UpdateMirrorDocument.Remove: Cannot find targetNode");
                return;
            }
            
            if (regexp.test(XPathSelf) && DaemonOptions.ShouldLog)
                console.log("Fuzzy REMOVE node target:", targetNode);
            
            
            parentNode.removeChild(targetNode);
        },
        'Add': (XPathParent: string, NewNode: Node | (() => Node), XPathSibling: string | null) => {
            
            if (!XPathParent || !NewNode) {
                console.warn("UpdateMirrorDocument.Add: Invalid Parameter");
                return;
            }
            
            const parentNode = GetNodeFromXPath(MirrorDocumentRef.current!, XPathParent);
            if (!parentNode) throw "UpdateMirrorDocument.Add: No parentNode";
            const regexp = /\/node\(\)\[\d+\]$/;
            if (regexp.test(XPathParent) && DaemonOptions.ShouldLog)
                console.log("Fuzzy ADD node Parent:", parentNode)
            
            
            let targetNode = (typeof NewNode === 'function') ? NewNode() : NewNode;
            
            if (!targetNode) {
                console.warn("UpdateMirrorDocument.Add: No targetNode");
                return;
            }
            
            let SiblingNode = null
            if (XPathSibling) {
                SiblingNode = GetNodeFromXPath(MirrorDocumentRef.current!, XPathSibling);
                if (!SiblingNode) {
                    SiblingNode = null;
                }
            }
            if (XPathSibling !== null && regexp.test(XPathSibling) && DaemonOptions.ShouldLog)
                console.log("Fuzzy ADD node Sibling:", SiblingNode);
            
            if (SiblingNode === null && XPathSibling)
                console.warn("Adding Operation: Sibling should not have been null, but got null result anyways: ", XPathSibling)
            
            parentNode.insertBefore(targetNode, SiblingNode);
        },
        'Replace': (NodeXpath: string, NewNode: Node | (() => Node)) => {
            
            if (!NodeXpath || !NewNode) {
                console.warn('UpdateMirrorDocument.Replace Invalid Parameter');
                return;
            }
            
            const targetNode = GetNodeFromXPath(MirrorDocumentRef.current!, NodeXpath);
            if (!targetNode) {
                console.warn('UpdateMirrorDocument.Replace No TargetNode');
                return;
            }
            
            const ReplacementNode = (typeof NewNode === 'function') ? NewNode() : NewNode;
            
            (targetNode as HTMLElement).replaceWith(ReplacementNode);
        },
        'Attribute': (NodeXpath: string, NewAttribute: { name: string; value: string }) => {
            
            if (!NodeXpath || !NewAttribute.name || !NewAttribute.value) {
                console.warn('UpdateMirrorDocument.Attribute Invalid Parameter');
                return;
            }
            
            const targetNode = GetNodeFromXPath(MirrorDocumentRef.current!, NodeXpath);
            if (!targetNode) {
                console.warn('UpdateMirrorDocument.Replace No TargetNode');
                return;
            }
            
            (targetNode as HTMLElement).setAttribute(NewAttribute.name, NewAttribute.value);
        },
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
        
        // use treeWalker to traverse all nodes
        const Walker = document.createTreeWalker(
            SelectedElement,
            NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
            null
        );
        
        let AnchorNode;
        let CharsToCaretPosition = SavedState.CaretPosition;
        const NodeOverflowBreakCharBreak = -5;
        const PastParagraphs: Node[] = []; //last being the lastest line.
        
        // check all text nodes
        while (AnchorNode = Walker.nextNode()) {
            
            if (AnchorNode.nodeType === Node.TEXT_NODE && AnchorNode!.textContent) {
                CharsToCaretPosition -= AnchorNode!.textContent.length;
            }
            
            if (DaemonOptions.ParagraphTags.test(AnchorNode.nodeName.toLowerCase()) && AnchorNode.childNodes.length) {
                PastParagraphs.push(AnchorNode);
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
        
        // reconstruct the old CurrentSelection range
        const RangeCached = document.createRange();
        
        let StartingOffset = 0;
        if (AnchorNode && AnchorNode.textContent) {
            StartingOffset = AnchorNode.textContent.length + CharsToCaretPosition
            if (StartingOffset < 0) StartingOffset = 0;
        }
        
        // Type narrowing
        if (!AnchorNode) return;
        
        ({
            AnchorNode,
            StartingOffset
        } = HandleSelectionToken(Walker, PastParagraphs, AnchorNode, StartingOffset));
        
        // console.log(AnchorNode, "at", StartingOffset);
        
        try {
            RangeCached.setStart(AnchorNode!, StartingOffset);
            RangeCached.setEnd(AnchorNode!, StartingOffset + SavedState.SelectionExtent);
            
            // Replace the current CurrentSelection.
            CurrentSelection.removeAllRanges();
            CurrentSelection.addRange(RangeCached);
            
        } catch (e) {
            console.warn("AnchorNode:", AnchorNode, "Starting offset:", StartingOffset);
            console.warn("Saved State:", SavedState);
        }
        
    }
    
    function HandleSelectionToken(Walker: TreeWalker, NodeContextArray: Node[], CurrentAnchorNode: Node, CurrentStartingOffset: number) {
        const OverrideToken = DaemonState.CaretOverrideToken;
        if (!OverrideToken) return {AnchorNode: CurrentAnchorNode, StartingOffset: CurrentStartingOffset};
        
        let AnchorNode: Node | null = CurrentAnchorNode;
        let StartingOffset = 0;
        
        const Token = OverrideToken;
        switch (Token) {
            case 'zero':
                StartingOffset = 0;
                break;
            case 'NextLine':
                while (AnchorNode = Walker.nextNode()) {
                    if (AnchorNode.parentNode && AnchorNode.parentNode === WatchElementRef.current && (AnchorNode.parentNode as HTMLElement).contentEditable !== 'false')
                        break;
                }
                break;
            case 'ElementNextSibling':
                if (AnchorNode.nodeType === Node.TEXT_NODE) {
                    AnchorNode = AnchorNode.parentNode;
                }
                AnchorNode = (AnchorNode as HTMLElement).nextElementSibling
                StartingOffset = 0;
                break;
        }
        
        if (!AnchorNode) {
            AnchorNode = Walker.previousNode();
            StartingOffset = 0;
        }
        
        return {AnchorNode, StartingOffset};
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
        
        if (DaemonOptions?.IsEditable) {
            // !!plaintext-only actually introduces unwanted behavior
            WatchedElement.contentEditable = 'true';
            WatchElementRef.current.focus();
        }
        
        if (DaemonState.SelectionStatusCachePreBlur && DaemonOptions.IsEditable) {
            // consume the saved status
            RestoreSelectionStatus(WatchElementRef.current, DaemonState.SelectionStatusCachePreBlur);
            DaemonState.SelectionStatusCachePreBlur = null;
        }
        
        if (DaemonState.SelectionStatusCache) {
            // consume the saved status
            RestoreSelectionStatus(WatchElementRef.current, DaemonState.SelectionStatusCache);
            DaemonState.SelectionStatusCache = null;
            DaemonState.CaretOverrideToken = null;
        }
        
        if (DaemonOptions.ShouldObserve) {
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
        }
        
        const KeyUpHandler = () => {
            debounceSelectionStatus();
            debounceRollbackAndSync();
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
    
    // Hook's public interface
    // Used by the already existing components in the editor
    return {
        DiscardHistory(DiscardCount: number): void {
            if (DiscardCount === 0) return;
            if (!DaemonState.UndoStack) return;
            if (DiscardCount > DaemonState.UndoStack.length) {
                DiscardCount = DaemonState.UndoStack.length
            }
            while (DiscardCount) {
                DaemonState.UndoStack.pop();
                DiscardCount -= 1;
            }
            if (DaemonOptions.ShouldLog)
                console.log("DiscardHistory: ", DiscardCount, " Removed")
        },
        SyncNow: () => {
            throttledSelectionStatus();
            throttledRollbackAndSync();
        },
        SetFutureCaret: (token: TCaretToken) => {
            DaemonState.CaretOverrideToken = token;
        },
        AddToIgnore: (Element: Node, Type: TDOMTrigger) => {
            DaemonState.IgnoreMap.set(Element, Type);
        },
        AddToBindOperations: (Element: Node, Trigger: TDOMTrigger, Operation: TSyncOperation | TSyncOperation[]) => {
            //TODO: DEPRECATED
            DaemonState.BindOperationMap.set(Element, {
                Trigger: Trigger,
                Operations: Operation
            })
        },
        AddToOperations: (Operation: TSyncOperation | TSyncOperation[]) => {
            if (!Array.isArray(Operation))
                Operation = [Operation];
            DaemonState.AdditionalOperation.push(...Operation);
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