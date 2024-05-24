/**
 * These are preformatted block and its items, for in-line code, the editor simply reuse PlainSyntax component
 * for a code element to be a "CodeItem", it must be under a pre element and have the correct attrs
 */

import React, {useEffect, useLayoutEffect, useRef, useState} from "react";
import {TDaemonReturn} from "../../hooks/useEditorHTMLDaemon";
import {GetCaretContext, GetChildNodesAsHTMLString, GetChildNodesTextContent, TextNodeProcessor,} from "../Helpers";
import dedent from "dedent";
import {TActivationReturn} from "../Editor_Types";

//
export function Preblock({children, tagName, parentSetActivation, daemonHandle, ...otherProps}: {
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

// Only handle code blocks, inline codes are PlainSyntax component
export function CodeItem({children, tagName, daemonHandle, ...otherProps}: {
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
    const [isEditing, setIsEditing] = useState(false);
    
    const CodeElementRef = useRef<HTMLElement | null>(null);
    const SyntaxFillerFront = useRef<HTMLElement | null>(null);
    const SyntaxFillerRear = useRef<HTMLElement | null>(null);
    
    const TextBlocksMapRef = useRef(new Map<HTMLElement | Node, boolean>()); // all possible text blocks under the code element
    const CodeLangTextRef = useRef(""); // the "language" that displayed after ```
    
    const ElementOBRef = useRef<MutationObserver | null>(null);
    
    // Added by the unified plugin
    const syntaxData = otherProps['data-md-syntax'] || '';
    
    function ComponentActivation(state: boolean): TActivationReturn {
        const componentHandlers = {
            "enter": EnterKeyHandler,
            "backspaceOverride": BackspaceHandler,
            "delOverride": DelKeyHandler,
        };
        
        if (!state) {
            ElementOBRef.current?.takeRecords();
            ElementOBRef.current?.disconnect();
            ElementOBRef.current = null;
            
            if (CodeElementRef.current && CodeElementRef.current.textContent
                && CodeElementRef.current.parentNode && CodeElementRef.current.parentNode.nodeName.toLowerCase() === 'pre') {
                
                const NewCodeContent = CompileAllTextNode()?.replace('\u00A0', '');
                if (!NewCodeContent) return componentHandlers;
                UpdateCodeElement(NewCodeContent);
            }
        }
        if (state) {
            daemonHandle.SyncNow();
            
            if (typeof MutationObserver) {
                ElementOBRef.current = new MutationObserver(ObserverHandler);
                CodeElementRef.current && ElementOBRef.current?.observe(CodeElementRef.current, {
                    childList: true,
                    subtree: true
                });
            }
        }
        
        setIsEditing(state);
        return componentHandlers
    }
    
    function ObserverHandler(mutationList: MutationRecord[]) {
        mutationList.forEach((Record) => {
            if (!Record.removedNodes.length) return;
            
            Record.removedNodes.forEach((Node) => {
                if (TextBlocksMapRef.current.get(Node) || Node === SyntaxFillerFront.current || Node === SyntaxFillerRear.current) {
                    
                    if (CodeElementRef.current && CodeElementRef.current.textContent
                        && CodeElementRef.current.parentNode && CodeElementRef.current.parentNode.nodeName.toLowerCase() === 'pre') {
                        
                        const NewCodeContent = CompileAllTextNode()?.replace('\u00A0', '');
                        if (NewCodeContent)
                            UpdateCodeElement(NewCodeContent);
                    }
                }
            })
        })
    }
    
    function CompileAllTextNode() {
        if (!CodeElementRef.current) return;
        let elementWalker = document.createTreeWalker(CodeElementRef.current, NodeFilter.SHOW_TEXT);
        
        let node;
        let textContent = '';
        while (node = elementWalker.nextNode()) {
            textContent += node.textContent;
        }
        
        return textContent.trim();
    }
    
    function UpdateCodeElement(NewCodeContent: string) {
        
        if (!CodeElementRef.current || !CodeElementRef.current.parentNode) return;
        
        let ReplacementNode = null;
        
        // NOTE: converter's quirk, element will still be converted even if the ending half of the syntax is missing
        // NOTE: due to the particularity of the pre element(can contain syntax that should be converted to element),
        // only send to convert if only the result will still be a pre
        if (NewCodeContent.startsWith(syntaxData) && NewCodeContent.endsWith(syntaxData)) {
            
            const textNodeResult = TextNodeProcessor(NewCodeContent);
            ReplacementNode = textNodeResult?.length ? textNodeResult[0] : null;
        } else {
            ReplacementNode = document.createElement('p') as HTMLElement;
            const textNode = document.createTextNode(GetChildNodesTextContent(CodeElementRef.current?.childNodes));
            ReplacementNode.appendChild(textNode);
        }
        
        
        if (ReplacementNode) {
            daemonHandle.AddToOperations({
                type: "REPLACE",
                targetNode: CodeElementRef.current.parentNode,
                newNode: ReplacementNode //first result node only
            });
            daemonHandle.SyncNow();
        }
    }
    
    function BackspaceHandler(ev: Event) {
        ev.stopImmediatePropagation();
    }
    
    function DelKeyHandler(ev: Event) {
        ev.stopImmediatePropagation();
    }
    
    function EnterKeyHandler(ev: Event) {
        
        ev.stopPropagation();
        
        let {
            TextAfterSelection,
            CurrentSelection,
            CurrentAnchorNode
        } = GetCaretContext();
        
        if (!CurrentAnchorNode || !CurrentSelection) return;
        
        // Add a new line after, use generic logic from editor
        if (TextAfterSelection?.trim() === "" || !TextAfterSelection)
            return false;
        
        
        return;
    }
    
    // keep track of code's language
    useLayoutEffect(() => {
        if (CodeElementRef.current) {
            const codeElementClassName = CodeElementRef.current.className;
            let CodeLang = null;
            if (codeElementClassName)
                CodeLang = codeElementClassName.split(' ').find(c => {
                    return codeElementClassName?.startsWith("language-");
                });
            
            if (!CodeLang) CodeLang = "";
            if (CodeLang && CodeLang.startsWith("language-")) CodeLang = CodeLang.split("language-")[1];
            
            CodeLangTextRef.current = CodeLang.trim();
        }
        
        return () => {
            CodeLangTextRef.current = '';
        }
    });
    
    // change contentEditable type to plaintext-only
    useEffect(() => {
        // GetEditingStateChild();
        // add code element itself to ignore
        if (CodeElementRef.current) {
            CodeElementRef.current.contentEditable = "plaintext-only";
            daemonHandle.AddToIgnore(CodeElementRef.current, "any");
        }
        // Add all child element to ignore, add all text nodes to TextBlocksMapRef
        if (CodeElementRef.current?.childNodes) {
            daemonHandle.AddToIgnore(Array.from(CodeElementRef.current.childNodes), "any", true);
            
            Array.from(CodeElementRef.current.childNodes).forEach((child) => {
                if (child.nodeType === Node.TEXT_NODE) {
                    TextBlocksMapRef.current.set(child as HTMLElement, true);
                }
            });
        }
        
        return () => {
            TextBlocksMapRef.current.clear();
        }
    });
    
    return React.createElement(tagName, {
        ...otherProps,
        ref: CodeElementRef,
    }, [
        <span className={`Text-Normal Whole-Line ${isEditing ? "" : 'Hide-It'}`}
              data-is-generated={true}
              key={'SyntaxFront'}>
            <span contentEditable={false} ref={SyntaxFillerFront}>{syntaxData}</span>
            {CodeLangTextRef.current === "" ? '\u00A0' : CodeLangTextRef.current}
            {'\n'}
        </span>,
        
        ...(Array.isArray(children) ? children : [children]),
        
        <span className={`Text-Normal Whole-Line ${isEditing ? "" : 'Hide-It'}`}
              data-is-generated={true}
              key={'SyntaxRear'}>
            <span contentEditable={false} ref={SyntaxFillerRear}>{syntaxData}</span>
        </span>,
    ]);
    
}