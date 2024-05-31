import React, {useEffect, useRef, useState} from "react";
import {TDaemonReturn} from "../../hooks/useEditorHTMLDaemon";
import {
    GetCaretContext,
    GetChildNodesAsHTMLString, GetLastTextNode, GetNextSiblings, MoveCaretIntoNode,
    MoveCaretToNode
} from "../Helpers";
import {TActivationReturn} from "../Editor_Types";

export function ListContainer({children, tagName, parentSetActivation, daemonHandle, ...otherProps}: {
    children?: React.ReactNode[] | React.ReactNode;
    tagName: string;
    parentSetActivation: (DOMNode: HTMLElement) => void;
    daemonHandle: TDaemonReturn;
    [key: string]: any; // for otherProps
}) {
    const ListContainerRef = useRef<HTMLElement | null>(null);
    
    return React.createElement(tagName, {
        ref: ListContainerRef,
        ...otherProps
    }, children);
}

export function ListItem({children, tagName, daemonHandle, ...otherProps}: {
    children?: React.ReactNode[] | React.ReactNode;
    tagName: string;
    isHeader: boolean;
    headerSyntax: string;
    daemonHandle: TDaemonReturn; // replace Function with a more specific function type if necessary
    [key: string]: any; // for otherProps
}) {
    const [SetActivation] = useState<(state: boolean) => TActivationReturn>(() => {
        return ComponentActivation;
    }); // the Meta state, called by parent via dom fiber
    const [isEditing, setIsEditing] = useState(false); //Not directly used, but VITAL
    
    const CurrentListItemRef = useRef<HTMLElement | null>(null);
    const ListSyntaxFiller = useRef<HTMLElement>();  //filler element
    
    const ElementOBRef = useRef<MutationObserver | null>(null);
    
    function ComponentActivation(state: boolean): TActivationReturn {
        
        if (!state) {
            ElementOBRef.current?.takeRecords();
            ElementOBRef.current?.disconnect();
            ElementOBRef.current = null;
        }
        if (state) {
            daemonHandle.SyncNow();
            
            if (typeof MutationObserver) {
                ElementOBRef.current = new MutationObserver(ObserverHandler);
                CurrentListItemRef.current && ElementOBRef.current?.observe(CurrentListItemRef.current, {
                    childList: true
                });
            }
        }
        
        setIsEditing(state);
        return {
            "enter": EnterKeyHandler,
            "delJoining": DelKeyHandler,
        }
    }
    
    function ObserverHandler(mutationList: MutationRecord[]) {
        mutationList.forEach((Record) => {
            
            if (!Record.removedNodes.length) return;
            
            Record.removedNodes.forEach((Node) => {
                if (Node === ListSyntaxFiller.current) {
                    daemonHandle.AddToOperations([
                        {
                            type: "REMOVE",
                            targetNode: CurrentListItemRef.current!,
                        },
                        {
                            type: "ADD",
                            newNode: () => {
                                const ReplacementElement = document.createElement('p') as HTMLElement;
                                ReplacementElement.innerHTML = GetChildNodesAsHTMLString(CurrentListItemRef.current?.childNodes);
                                return ReplacementElement;
                            },
                            parentXP: "//body",
                            siblingNode: CurrentListItemRef.current?.parentNode?.nextSibling
                        }]);
                    daemonHandle.SyncNow();
                }
            })
        })
    }
    
    function DelKeyHandler(ev: Event) {
        
        const {CurrentSelection, CurrentAnchorNode, RemainingText, PrecedingText} = GetCaretContext();
        
        if (!CurrentSelection || !CurrentAnchorNode) return;
        
        // caret lands on the leading syntax element or on the li itself, move it into the text node
        if (CurrentAnchorNode.nodeType !== Node.TEXT_NODE || (CurrentAnchorNode as HTMLElement).contentEditable === 'false') {
            if (!CurrentListItemRef.current || !CurrentListItemRef.current.childNodes.length) return;
            for (let ChildNode of CurrentListItemRef.current.childNodes) {
                if (ChildNode.nodeType === Node.TEXT_NODE)
                    MoveCaretToNode(ChildNode, 0);
            }
            return;
        }
        if (RemainingText.trim() !== '' || CurrentAnchorNode.nextSibling) return;
        
        if (!CurrentListItemRef.current) return;
        
        // Check for next element sibling, if last, check for parent level sibling
        let nextElementSibling = CurrentListItemRef.current?.nextElementSibling;
        if (!nextElementSibling && CurrentListItemRef.current.parentNode) {
            nextElementSibling = (CurrentListItemRef.current.parentNode as HTMLElement).nextElementSibling;
        }
        if (!nextElementSibling) return;
        
        // Not a li, move caret only
        if (nextElementSibling.tagName.toLowerCase() !== 'li') {
            MoveCaretIntoNode(nextElementSibling);
            return;
        }
        
        // End of line, join with the next list item
        let MergedListItem = CurrentListItemRef.current.cloneNode(true);
        
        nextElementSibling.childNodes.forEach((ChildNode) => {
            MergedListItem.appendChild(ChildNode.cloneNode(true));
        })
        
        
        daemonHandle.AddToOperations({
            type: "REMOVE",
            targetNode: nextElementSibling,
        });
        
        daemonHandle.AddToOperations({
            type: "REPLACE",
            targetNode: CurrentListItemRef.current,
            newNode: MergedListItem
        });
        
        daemonHandle.SyncNow();
        
    }
    
    function EnterKeyHandler(ev: Event) {
        
        ev.preventDefault();
        ev.stopPropagation();
        
        console.log("List Enter")
        
        const {CurrentSelection, CurrentAnchorNode, RemainingText, PrecedingText} = GetCaretContext();
        
        if (!CurrentSelection || !CurrentAnchorNode) return;
        
        if (!CurrentSelection.isCollapsed) return CurrentSelection.collapseToEnd();
        
        // caret lands on the leading syntax element or on the li itself, move it into the text node
        if (CurrentAnchorNode.nodeType !== Node.TEXT_NODE || (CurrentAnchorNode as HTMLElement).contentEditable === 'false') {
            if (!CurrentListItemRef.current || !CurrentListItemRef.current.childNodes.length) return;
            for (let ChildNode of CurrentListItemRef.current.childNodes) {
                if (ChildNode.nodeType === Node.TEXT_NODE)
                    MoveCaretToNode(ChildNode, 0);
            }
            return;
        }
        
        const currentRange = CurrentSelection.getRangeAt(0);
        
        const AnchorPrevSibling = (CurrentAnchorNode as HTMLElement).previousElementSibling;
        const bLeadingPosition = currentRange.startOffset === 0
            || (AnchorPrevSibling && (AnchorPrevSibling as HTMLElement).contentEditable === 'false');
        
        // Beginning of the line, Only add empty line before container if it's the first element of the first list item
        if (PrecedingText.trim() === '' && bLeadingPosition) {
            console.log("Breaking - List BOL");
            const ListContainer = CurrentListItemRef.current?.parentNode;
            
            if (ListContainer && ListContainer.firstElementChild === CurrentListItemRef.current) {
                // A new line with only a br
                const lineBreakElement: HTMLBRElement = document.createElement("br");
                const NewLine = document.createElement("p");  // The new line
                NewLine.appendChild(lineBreakElement);
                
                daemonHandle.AddToOperations({
                    type: "ADD",
                    newNode: NewLine,
                    siblingNode: ListContainer,
                    parentXP: "//body"
                });
                daemonHandle.SetFutureCaret("NextLine");
                daemonHandle.SyncNow();
                return;
            }
            
            let TargetNode = GetLastTextNode(CurrentListItemRef.current!);
            
            if (!TargetNode || !TargetNode.textContent) return;
            
            MoveCaretToNode(TargetNode, TargetNode.textContent.length);
            
            return;
        }
        
        const FollowingNodes = GetNextSiblings(CurrentAnchorNode);
        // End of the line, Only add empty line after the ul container if last element of the last item list
        // otherwise, move caret to the next line
        if (RemainingText.trim() === '' && !FollowingNodes.length) {
            console.log("Breaking - List EOL");
            const ListContainer = CurrentListItemRef.current?.parentNode;
            if (ListContainer && ListContainer.lastElementChild === CurrentListItemRef.current)
                return true;
            //move caret to the next line
            if (CurrentListItemRef.current?.nextElementSibling && CurrentListItemRef.current.nextElementSibling.childNodes.length) {
                let TargetNode: Node | null = null;
                for (let childNode of CurrentListItemRef.current.nextElementSibling.childNodes) {
                    if (childNode.nodeType === Node.TEXT_NODE) {
                        TargetNode = childNode;
                    }
                }
                
                if (!TargetNode || !TargetNode.textContent) return;
                
                MoveCaretToNode(TargetNode, 0);
                return;
            }
            
        }
        
        // mid-line enter key, move what is following the caret to the next line as new li
        if (!CurrentListItemRef.current) return;
        if (!CurrentListItemRef.current.childNodes || !CurrentListItemRef.current.childNodes.length) return;
        
        // No following element or text content
        if ((!RemainingText || RemainingText.trim() === '') && !FollowingNodes.length) {
            // Move caret to the end of the last text node.
            let TargetNode = GetLastTextNode(CurrentListItemRef.current);
            
            if (!TargetNode || !TargetNode.textContent) return;
            
            MoveCaretToNode(TargetNode, TargetNode.textContent.length);
            return;
        }
        
        // Normal logic
        console.log("Breaking - List Mid-Line");
        const NewLine = document.createElement("li");  // New list item
        
        let anchorNodeClone: Node = CurrentAnchorNode.cloneNode(true);
        if (anchorNodeClone.textContent !== null) anchorNodeClone.textContent = RemainingText;
        
        NewLine.appendChild(anchorNodeClone);
        if (FollowingNodes.length) {
            for (let Node of FollowingNodes) {
                
                NewLine.appendChild(Node.cloneNode(true));
                
                daemonHandle.AddToOperations({
                    type: "REMOVE",
                    targetNode: Node,
                });
            }
        }
        daemonHandle.AddToOperations({
            type: "TEXT",
            targetNode: CurrentAnchorNode,
            nodeText: PrecedingText
        });
        
        daemonHandle.AddToOperations({
            type: "ADD",
            newNode: NewLine,
            siblingNode: CurrentListItemRef.current?.nextSibling,
            parentNode: CurrentListItemRef.current?.parentNode!
        });
        
        daemonHandle.SetFutureCaret('NextElement');
        daemonHandle.SyncNow();
        
        return;
    }
    
    
    // Add filler element to ignore, add filler element's special handling operation
    useEffect(() => {
        if (ListSyntaxFiller.current) {
            daemonHandle.AddToIgnore(ListSyntaxFiller.current, "any");
        }
    });
    
    
    return React.createElement(tagName, {
        ...otherProps,
        ref: CurrentListItemRef,
    }, [
        React.createElement('span', {
            'data-is-generated': true, //!!IMPORTANT!! custom attr for the daemon's find xp function, so that this element won't count towards to the number of sibling of the same name
            key: 'HeaderSyntaxLead',
            ref: ListSyntaxFiller,
            contentEditable: false,
            className: ` ${isEditing ? '' : 'Hide-It'}`
        }, "- "),
        ...(Array.isArray(children) ? children : [children]),
    ]);
}