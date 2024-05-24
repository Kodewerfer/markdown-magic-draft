import React, {useEffect, useRef, useState} from "react";
import {TDaemonReturn} from "../../hooks/useEditorHTMLDaemon";
import {
    GetCaretContext,
    GetChildNodesAsHTMLString, GetFirstTextNode, GetLastTextNode,
    MoveCaretToNode
} from "../Helpers";
import {TActivationReturn} from "../Editor_Types";

export function Blockquote({children, tagName, parentSetActivation, daemonHandle, ...otherProps}: {
    children?: React.ReactNode[] | React.ReactNode;
    tagName: string;
    parentSetActivation: (DOMNode: HTMLElement) => void;
    daemonHandle: TDaemonReturn;
    [key: string]: any; // for otherProps
}) {
    const ContainerRef = useRef<HTMLElement | null>(null);
    
    return React.createElement(tagName, {
        ref: ContainerRef,
        ...otherProps
    }, children);
}

export function QuoteItem({children, tagName, daemonHandle, ...otherProps}: {
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
    
    const WholeElementRef = useRef<HTMLElement | null>(null);
    const QuoteSyntaxFiller = useRef<HTMLElement>();  //filler element
    
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
                WholeElementRef.current && ElementOBRef.current?.observe(WholeElementRef.current, {
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
        
        ev.preventDefault();
        ev.stopPropagation();
        
        if (!WholeElementRef.current) return;
        
        const {CurrentSelection, CurrentAnchorNode, RemainingText, PrecedingText} = GetCaretContext();
        if (!CurrentSelection || !CurrentAnchorNode) return;
        
        if (CurrentAnchorNode.nodeType !== Node.TEXT_NODE) MoveCaretToNode(GetFirstTextNode(WholeElementRef.current), 0);
        
        // Add new line before the blockquote
        if (PrecedingText.trim() === '') {
            
            const BlockQuoteElement = WholeElementRef.current.parentNode;
            if (!BlockQuoteElement) return;
            
            // A new line with only a br
            const lineBreakElement: HTMLBRElement = document.createElement("br");
            const NewLine = document.createElement("p");  // The new line
            NewLine.appendChild(lineBreakElement);
            
            daemonHandle.AddToOperations({
                type: "ADD",
                newNode: NewLine,
                siblingNode: BlockQuoteElement,
                parentXP: "//body"
            });
            daemonHandle.SetFutureCaret("NextLine");
            daemonHandle.SyncNow();
            
            return;
        }
        // reuse editor default, this will add p tag after block quote
        if (RemainingText.trim() === '') return true;
        
        // mid-line enter key
        // only Move caret to the end of the last text node.
        if (!WholeElementRef.current.childNodes || !WholeElementRef.current.childNodes.length) return;
        
        let TargetNode: Node | null = GetLastTextNode(WholeElementRef.current);
        
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
            key: 'QuoteSyntaxLead',
            ref: QuoteSyntaxFiller,
            contentEditable: false,
            className: ` ${isEditing ? '' : 'Hide-It'}`
        }, "> "),
        ...(Array.isArray(children) ? children : [children]),
    ]);
}