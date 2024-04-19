import React, {useEffect, Children, useRef, useState, useLayoutEffect} from "react";
import {TDaemonReturn, TSyncOperation} from "../../hooks/useEditorHTMLDaemon";
import {
    GetCaretContext,
    GetChildNodesAsHTMLString,
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
            daemonHandle.SyncNow();
            daemonHandle.DiscardHistory(1);
        }
        
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
                    WholeElementRef.current && ElementOBRef.current?.observe(WholeElementRef.current, {
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
    
    const WholeElementRef = useRef<HTMLElement | null>(null);
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
                            targetNode: WholeElementRef.current!,
                        },
                        {
                            type: "ADD",
                            newNode: () => {
                                const ReplacementElement = document.createElement('p') as HTMLElement;
                                ReplacementElement.innerHTML = GetChildNodesAsHTMLString(WholeElementRef.current?.childNodes);
                                return ReplacementElement;
                            },
                            parentXP: "//body",
                            siblingNode: WholeElementRef.current?.parentNode?.nextSibling
                        }]);
                    daemonHandle.SyncNow();
                }
            })
        })
    }
    
    function DelKeyHandler(ev: Event) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
    }
    
    function EnterKeyHandler(ev: Event) {
        const {CurrentSelection, CurrentAnchorNode, RemainingText, PrecedingText} = GetCaretContext();
        if (!CurrentSelection || !CurrentAnchorNode) return;
        
        const range = CurrentSelection.getRangeAt(0);
        
        if (PrecedingText.trim() === '' && range.startOffset === 0) return true;
        if (RemainingText.trim() === '') return true;
        
        // mid-line enter key
        if (!WholeElementRef.current) return;
        if (!WholeElementRef.current.childNodes || !WholeElementRef.current.childNodes.length) return;
        
        // Move caret to the end of the last text node.
        let TargetNode: Node | null = null;
        for (let childNode of WholeElementRef.current.childNodes) {
            if (childNode.nodeType === Node.TEXT_NODE) {
                TargetNode = childNode;
            }
        }
        
        if (!TargetNode || !TargetNode.textContent) return;
        
        MoveCaretToNode(TargetNode, TargetNode.textContent.length);
        
        return;
    }
    
    // Add filler element to ignore, add filler element's special handling operation
    useEffect(() => {
        if (QuoteSyntaxFiller.current) {
            daemonHandle.AddToIgnore(QuoteSyntaxFiller.current, "any");
        }
    });
    
    
    return React.createElement(tagName, {
        ...otherProps,
        ref: WholeElementRef,
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