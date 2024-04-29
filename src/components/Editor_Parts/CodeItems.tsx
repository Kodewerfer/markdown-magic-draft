/**
 * These are preformatted block and its items, for in-line code, the editor simply reuse PlainSyntax component
 * for a code element to be a "CodeItem", it must be under a pre element and have the correct attrs
 */

import React, {useEffect, useLayoutEffect, useRef, useState} from "react";
import {TDaemonReturn} from "../../hooks/useEditorHTMLDaemon";
import {
    GetCaretContext,
    GetChildNodesAsHTMLString,
    MoveCaretToNode
} from "../Helpers";

export function Preblock({children, tagName, parentSetActivation, daemonHandle, ...otherProps}: {
    children?: React.ReactNode[] | React.ReactNode;
    tagName: string;
    parentSetActivation: (DOMNode: HTMLElement) => void;
    daemonHandle: TDaemonReturn;
    [key: string]: any; // for otherProps
}) {
    const ContainerRef = useRef<HTMLElement | null>(null);
    
    const [isBlockEmpty, setIsBlockEmpty] = useState(false);
    
    // Add a simple Br as filler element if no QuoteItemgit
    // No really needed because the current deletion functions will delete the block all-together
    useEffect(() => {
        if (!children || React.Children.count(children) === 1) {
            if (String(children).trim() === '' && ContainerRef.current) {
                setIsBlockEmpty(true);
                ContainerRef.current = null;
            }
        }
    });
    
    const FillerElement = (<br/>);
    
    return React.createElement(tagName, {
        ref: ContainerRef,
        ...otherProps
    }, isBlockEmpty ? [FillerElement] : children);
}

export function CodeItem({children, tagName, daemonHandle, ...otherProps}: {
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
        }, "> "),
        ...(Array.isArray(children) ? children : [children]),
    ]);
}