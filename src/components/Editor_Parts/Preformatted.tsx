/**
 * These are preformatted block and its items, for in-line code, the editor simply reuse PlainSyntax component
 * for a code element to be a "CodeItem", it must be under a pre element and have the correct attrs
 */

import React, {useEffect, useRef, useState} from "react";
import {TDaemonReturn} from "../../hooks/useEditorHTMLDaemon";
import {GetChildNodesTextContent, TextNodeProcessor,} from "../Helpers";

export function Preblock({children, tagName, parentSetActivation, daemonHandle, ...otherProps}: {
    children?: React.ReactNode[] | React.ReactNode;
    tagName: string;
    parentSetActivation: (DOMNode: HTMLElement) => void;
    daemonHandle: TDaemonReturn;
    [key: string]: any; // for otherProps
}) {
    const ContainerRef = useRef<HTMLElement | null>(null);
    
    const [isBlockEmpty, setIsBlockEmpty] = useState(false);
    
    // Add a simple Br as filler element if no preformatted item
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

// Only handle code blocks, inline codes are PlainSyntax component
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
            // Send whatever the text node's content to store
            if (!state) {
                ElementOBRef.current?.takeRecords();
                ElementOBRef.current?.disconnect();
                ElementOBRef.current = null;
                
                if (CodeElementRef.current && CodeElementRef.current.textContent) {
                    const textNodeResult = TextNodeProcessor(CodeElementRef.current.textContent);
                    if (textNodeResult) {
                        daemonHandle.AddToOperations({
                            type: "REPLACE",
                            targetNode: CodeElementRef.current.parentNode!,
                            newNode: textNodeResult[0] //first result node only
                        });
                        daemonHandle.SyncNow();
                    }
                }
            }
            if (state) {
                daemonHandle.SyncNow();
                
                if (typeof MutationObserver) {
                    ElementOBRef.current = new MutationObserver(ObserverHandler);
                    CodeElementRef.current && ElementOBRef.current?.observe(CodeElementRef.current, {
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
    const [isEditing, setIsEditing] = useState(false);
    
    const CodeElementRef = useRef<HTMLElement | null>(null);
    
    const SyntaxElementRefFront = useRef<HTMLElement | null>(null);
    const SyntaxElementRefRear = useRef<HTMLElement | null>(null);
    
    const ElementOBRef = useRef<MutationObserver | null>(null);
    
    // if frontal or rear element deleted by user, convert into textnode
    function ObserverHandler(mutationList: MutationRecord[]) {
        
        let ReplacementTarget = CodeElementRef.current!;
        if (ReplacementTarget.parentNode?.nodeName.toLowerCase() === 'pre')
            ReplacementTarget = ReplacementTarget.parentNode as HTMLElement;
        
        mutationList.forEach((Record) => {
            
            if (!Record.removedNodes.length) return;
            
            Record.removedNodes.forEach((Node) => {
                if (Node === SyntaxElementRefFront.current || Node === SyntaxElementRefRear.current) {
                    
                    daemonHandle.AddToOperations({
                        type: "REPLACE",
                        targetNode: ReplacementTarget!,
                        newNode: () => {
                            const NewLine = document.createElement("p")
                            NewLine.appendChild(document.createTextNode(GetChildNodesTextContent(CodeElementRef.current?.childNodes)));
                            return NewLine;
                        }
                    });
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
        ev.stopPropagation();
        return false;
    }
    
    // change contentEditable type to plaintext-only
    useEffect(() => {
        // add code element itself to ignore
        if (CodeElementRef.current) {
            CodeElementRef.current.contentEditable = "plaintext-only";
            daemonHandle.AddToIgnore(CodeElementRef.current, "any");
        }
        // Add all child element to ignore
        if (CodeElementRef.current?.childNodes) {
            CodeElementRef.current.childNodes.forEach(node => {
                daemonHandle.AddToIgnore(node, "any");
            })
        }
    });
    
    return React.createElement(tagName, {
        ...otherProps,
        ref: CodeElementRef,
    }, [
        React.createElement('span', {
            'data-is-generated': true, //!!IMPORTANT!! custom attr for the daemon's find xp function, so that this element won't count towards to the number of sibling of the same name
            key: 'CodeSyntaxLead',
            ref: SyntaxElementRefFront,
            contentEditable: false,
            className: ` ${isEditing ? '' : 'Hide-It'}`
        }, "```\n"),
        
        ...(Array.isArray(children) ? children : [children]),
        
        React.createElement('span', {
            'data-is-generated': true, //!!IMPORTANT!! custom attr for the daemon's find xp function, so that this element won't count towards to the number of sibling of the same name
            key: 'CodeSyntaxRear',
            ref: SyntaxElementRefRear,
            contentEditable: false,
            className: ` ${isEditing ? '' : 'Hide-It'}`
        }, " ```"),
    ]);
}