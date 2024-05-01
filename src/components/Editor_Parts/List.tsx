import React, {useEffect, Children, useRef, useState, useLayoutEffect} from "react";
import {TDaemonReturn, TSyncOperation} from "../../hooks/useEditorHTMLDaemon";
import {
    GetCaretContext,
    GetChildNodesAsHTMLString, GetNextSiblings,
    MoveCaretToNode
} from "../Helpers";

export function ListContainer({children, tagName, parentSetActivation, daemonHandle, ...otherProps}: {
    children?: React.ReactNode[] | React.ReactNode;
    tagName: string;
    parentSetActivation: (DOMNode: HTMLElement) => void;
    daemonHandle: TDaemonReturn;
    [key: string]: any; // for otherProps
}) {
    const ListContainerRef = useRef<HTMLElement | null>(null);
    const bCheckedForMerge = useRef(false);
    
    // Self destruct if no child element
    useEffect(() => {
        if (!children || React.Children.count(children) === 1) {
            if (String(children).trim() === '' && ListContainerRef.current) {
                
                daemonHandle.AddToOperations(
                    {
                        type: "REMOVE",
                        targetNode: ListContainerRef.current!,
                    }
                );
                
                ListContainerRef.current = null;
                daemonHandle.SyncNow()
                    .then(() => {
                        console.log("calling dis")
                        daemonHandle.DiscardHistory(1);
                    });
                
            }
        }
    });
    
    // Merge to the prev or next ul if applicable, also manipulate history stack
    useLayoutEffect(() => {
        
        if (!ListContainerRef.current) return;
        if (!ListContainerRef.current!.children.length) return;
        if (ListContainerRef.current?.hasAttribute("data-being-merged")) return;
        
        const ListPrevSibling = ListContainerRef.current?.previousElementSibling;
        const bPreviousSiblingIsUL = ListPrevSibling?.tagName.toLowerCase() === 'ul';
        
        // Add to last ul element if there is no space in-between, higher priority
        if (bPreviousSiblingIsUL && ListPrevSibling.hasAttribute("data-list-merge-valid")) {
            
            for (let ChildLi of ListContainerRef.current.children) {
                daemonHandle.AddToOperations({
                    type: "ADD",
                    parentNode: ListPrevSibling,
                    newNode: ChildLi.cloneNode(true)
                })
            }
            daemonHandle.AddToOperations({
                type: "REMOVE",
                targetNode: ListContainerRef.current,
            });
            
            ListContainerRef.current = null;
            daemonHandle.SyncNow();
            daemonHandle.DiscardHistory(1);
        }
        
        // Add to the next ul element if there is no space in-between
        const ListNextSibling = ListContainerRef.current?.nextElementSibling;
        const bNextSiblingIsUL = ListNextSibling?.tagName.toLowerCase() === 'ul';
        
        if (!bPreviousSiblingIsUL && bNextSiblingIsUL && ListContainerRef.current && ListNextSibling.hasAttribute("data-list-merge-valid")) {
            
            for (let ChildLi of ListContainerRef.current.children) {
                daemonHandle.AddToOperations({
                    type: "ADD",
                    parentNode: ListNextSibling,
                    newNode: ChildLi.cloneNode(true),
                    siblingNode: ListNextSibling.firstElementChild
                })
            }
            
            daemonHandle.AddToOperations(
                {
                    type: "REMOVE",
                    targetNode: ListContainerRef.current!,
                }
            );
            
            ListContainerRef.current = null;
            daemonHandle.SyncNow().then(() => {
                daemonHandle.DiscardHistory(1);
            });
            
        }
        
        // No surrounding Ul element
        // Add data-list-merge-valid attr to indicate this is an "OG" ul that can be merged
        if (!bPreviousSiblingIsUL && !bNextSiblingIsUL && !bCheckedForMerge.current) {
            
            bCheckedForMerge.current = true;
            
            if (!ListContainerRef.current?.hasAttribute('data-list-merge-valid')) {
                daemonHandle.AddToOperations({
                    type: "ATTR",
                    targetNode: ListContainerRef.current!,
                    attribute: {name: "data-list-merge-valid", value: "true"}
                });
                daemonHandle.SyncNow();
                daemonHandle.DiscardHistory(1);
            }
        }
        
    });
    
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
    const [SetActivation] = useState<(state: boolean) => void>(() => {
        return (state: boolean) => {
            
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
                "del": DelKeyHandler,
            }
        }
    }); // the Meta state, called by parent via dom fiber
    const [isEditing, setIsEditing] = useState(false); //Not directly used, but VITAL
    
    const CurrentListItemRef = useRef<HTMLElement | null>(null);
    const QuoteSyntaxFiller = useRef<HTMLElement>();  //filler element
    
    const ElementOBRef = useRef<MutationObserver | null>(null);
    
    function ObserverHandler(mutationList: MutationRecord[]) {
        mutationList.forEach((Record) => {
            
            if (!Record.removedNodes.length) return;
            
            Record.removedNodes.forEach((Node) => {
                if (Node === QuoteSyntaxFiller.current) {
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
        
        // Not having one more list item following it
        const nextElementSibling = CurrentListItemRef.current?.nextElementSibling;
        if (nextElementSibling?.tagName.toLowerCase() !== 'li') return;
        
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
        
        const range = CurrentSelection.getRangeAt(0);
        
        const AnchorPrevSibling = (CurrentAnchorNode as HTMLElement).previousElementSibling;
        const bLeadingPosition = range.startOffset === 0
            || (AnchorPrevSibling && (AnchorPrevSibling as HTMLElement).contentEditable === 'false');
        
        // Beginning of the line, Only add empty line before container if it's the first element of the first list item
        if (PrecedingText.trim() === '' && bLeadingPosition) {
            
            const ListContainer = CurrentListItemRef.current?.parentNode;
            
            if (ListContainer && ListContainer.firstElementChild === CurrentListItemRef.current) {
                return true;
            }
            
            let TargetNode = GetLastTextNode();
            
            if (!TargetNode || !TargetNode.textContent) return;
            
            MoveCaretToNode(TargetNode, TargetNode.textContent.length);
            
            return;
        }
        // End of the line, Only add empty line after container if first element of the first item list
        // otherwise, move caret to the next line
        if (RemainingText.trim() === '') {
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
        
        const FollowingNodes = GetNextSiblings(CurrentAnchorNode);
        // No following element or text content
        if ((!RemainingText || RemainingText.trim() === '') && !FollowingNodes.length) {
            // Move caret to the end of the last text node.
            let TargetNode = GetLastTextNode();
            
            if (!TargetNode || !TargetNode.textContent) return;
            
            MoveCaretToNode(TargetNode, TargetNode.textContent.length);
            return;
        }
        
        // Normal logic
        console.log("List mid line");
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
        
        daemonHandle.SetFutureCaret('ElementNextSibling');
        daemonHandle.SyncNow();
        
        return;
    }
    
    // Helper
    function GetLastTextNode() {
        let lastTextNode: Node | null = null;
        
        if (CurrentListItemRef.current) {
            for (let i = CurrentListItemRef.current.childNodes.length - 1; i >= 0; i--) {
                
                const childNode = CurrentListItemRef.current.childNodes[i];
                
                if (childNode.nodeType === Node.TEXT_NODE) {
                    lastTextNode = childNode;
                    break;
                }
                
            }
        }
        
        return lastTextNode;
    }
    
    // Add filler element to ignore, add filler element's special handling operation
    useEffect(() => {
        if (QuoteSyntaxFiller.current) {
            daemonHandle.AddToIgnore(QuoteSyntaxFiller.current, "any");
        }
    });
    
    
    return React.createElement(tagName, {
        ...otherProps,
        ref: CurrentListItemRef,
    }, [
        React.createElement('span', {
            'data-is-generated': true, //!!IMPORTANT!! custom attr for the daemon's find xp function, so that this element won't count towards to the number of sibling of the same name
            key: 'HeaderSyntaxLead',
            ref: QuoteSyntaxFiller,
            contentEditable: false,
            className: ` ${isEditing ? '' : 'Hide-It'}`
        }, "- "),
        ...(Array.isArray(children) ? children : [children]),
    ]);
}