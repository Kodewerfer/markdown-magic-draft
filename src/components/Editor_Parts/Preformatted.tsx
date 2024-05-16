/**
 * These are preformatted block and its items, for in-line code, the editor simply reuse PlainSyntax component
 * for a code element to be a "CodeItem", it must be under a pre element and have the correct attrs
 */

import React, {useEffect, useRef, useState} from "react";
import {TDaemonReturn} from "../../hooks/useEditorHTMLDaemon";
import {GetCaretContext, GetChildNodesAsHTMLString, TextNodeProcessor,} from "../Helpers";
import dedent from "dedent";

//
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
            
            if (!state) {
                ElementOBRef.current?.takeRecords();
                ElementOBRef.current?.disconnect();
                ElementOBRef.current = null;
                
                if (CodeElementRef.current && CodeElementRef.current.textContent
                    && CodeElementRef.current.parentNode && CodeElementRef.current.parentNode.nodeName.toLowerCase() === 'pre') {
                    
                    // Added by the unified plugin
                    const syntaxData = otherProps['data-md-syntax'];
                    
                    let ReplacementNode = null;
                    
                    // NOTE: converter's quirk, element will still be converted even if the ending half of the syntax is missing
                    // NOTE: due to the particularity of the pre element(can contain syntax that should be converted to element),
                    // only send to convert if only the result will still be a pre
                    if (syntaxData
                        && CodeElementRef.current.textContent.startsWith(syntaxData)
                        && CodeElementRef.current.textContent.endsWith(syntaxData)) {
                        
                        const textNodeResult = TextNodeProcessor(CodeElementRef.current.textContent);
                        ReplacementNode = textNodeResult?.length ? textNodeResult[0] : null;
                    } else {
                        ReplacementNode = document.createElement('p') as HTMLElement;
                        ReplacementNode.innerHTML = GetChildNodesAsHTMLString(CodeElementRef.current?.childNodes);
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
            }
            if (state) {
                daemonHandle.SyncNow();
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
    
    const ElementOBRef = useRef<MutationObserver | null>(null);
    
    // Show when actively editing
    const [GetEditingStateChild] = useState(() => {
        return () => {
            const textContent = CodeElementRef.current?.firstChild?.textContent?.trim();
            
            let codeElementClassName = CodeElementRef.current?.className;
            let CodeLang = null;
            if (codeElementClassName) {
                
                CodeLang = codeElementClassName.split(' ').find(c => {
                    return codeElementClassName?.startsWith("language-");
                });
                
            }
            
            if (!CodeLang) CodeLang = "";
            
            if (CodeLang && CodeLang.startsWith("language-")) CodeLang = CodeLang.split("language-")[1];
            
            return dedent`\`\`\` ${CodeLang}
                    ${textContent}
                    \`\`\``;
        };
    });
    
    function DelKeyHandler(ev: Event) {
        ev.preventDefault();
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
            return true;
        
        
        return;
    }
    
    // change contentEditable type to plaintext-only
    useEffect(() => {
        GetEditingStateChild();
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
    }, isEditing ? GetEditingStateChild() : children);
}