import React, {useLayoutEffect, useRef, useState} from "react";
import {TDaemonReturn} from "../hooks/useEditorDaemon";
import {
    GetAllSurroundingText,
    GetCaretContext,
    GetChildNodesTextContent,
    TextNodeProcessor
} from '../Helpers'
import {TActivationReturn} from "../Editor_Types";

export default function PlainSyntax({children, tagName, daemonHandle, ...otherProps}: {
    children?: React.ReactNode[] | React.ReactNode;
    tagName: string;
    daemonHandle: TDaemonReturn;
    [key: string]: any; // for otherProps
}) {
    const [SetActivation] = useState<(state: boolean) => TActivationReturn>(() => {
        return ComponentActivation;
    }); // the Meta state, called by parent via dom fiber
    
    const [isEditing, setIsEditing] = useState(false); //Reactive state, toggled by the meta state
    
    const propSyntaxData: any = otherProps['data-md-syntax'];
    const propShouldWrap: any = otherProps['data-md-wrapped'];
    
    const SyntaxElementRefFront = useRef<HTMLElement | null>(null);
    const SyntaxElementRefRear = useRef<HTMLElement | null>(null);
    const TextContentMapRef = useRef(new Map<HTMLElement | Node, boolean>())
    
    // the element tag
    const WholeElementRef = useRef<HTMLElement | null>(null);
    
    const ElementOBRef = useRef<MutationObserver | null>(null);
    
    function ComponentActivation(state: boolean): TActivationReturn {
        if (!state) {
            ElementOBRef.current?.takeRecords();
            ElementOBRef.current?.disconnect();
            ElementOBRef.current = null;
            
            const TextContent = CompileAllTextNode();
            UpdateComponentAndSync(TextContent, WholeElementRef.current);
            
        }
        if (state) {
            daemonHandle.SyncNow();
            
            if (typeof MutationObserver) {
                ElementOBRef.current = new MutationObserver(ObserverHandler);
                WholeElementRef.current && ElementOBRef.current?.observe(WholeElementRef.current, {
                    childList: true,
                    subtree: true
                });
            }
        }
        setIsEditing(state);
        return {
            enter: EnterKeyHandler
        };
    }
    
    // The whole component is replaced if key component of it is removed
    function ObserverHandler(mutationList: MutationRecord[]) {
        mutationList.forEach((Record) => {
            if (!Record.removedNodes.length) return;
            
            Record.removedNodes.forEach((Node) => {
                if (Node === SyntaxElementRefFront.current || SyntaxElementRefRear.current || TextContentMapRef.current.get(Node)) {
                    
                    daemonHandle.AddToOperations({
                        type: "REPLACE",
                        targetNode: WholeElementRef.current!,
                        newNode: () => {
                            return document.createTextNode(GetChildNodesTextContent(WholeElementRef.current?.childNodes))
                        }
                    });
                    daemonHandle.SyncNow();
                }
            })
        })
    }
    
    function EnterKeyHandler(ev: Event) {
        ev.preventDefault();
        
        const {CurrentSelection} = GetCaretContext();
        
        let bShouldBreakLine = true;
        
        const TextContent = CompileAllTextNode();
        
        const {precedingText, followingText} = GetAllSurroundingText(CurrentSelection!, WholeElementRef.current!);
        
        if (precedingText.trim() === '' || precedingText.trim() === propSyntaxData)
            daemonHandle.SetFutureCaret("PrevElement");
        else if (followingText.trim() !== '')
            bShouldBreakLine = false;
        else
            daemonHandle.SetFutureCaret("NextElement");
        
        UpdateComponentAndSync(TextContent, WholeElementRef.current);
        
        return Promise.resolve(bShouldBreakLine);
    }
    
    // Called in meta state
    function CompileAllTextNode() {
        if (!WholeElementRef.current) return;
        let elementWalker = document.createTreeWalker(WholeElementRef.current, NodeFilter.SHOW_TEXT);
        
        let node;
        let textContent = '';
        while (node = elementWalker.nextNode()) {
            textContent += node.textContent === '\u00A0' ? "" : node.textContent;
        }
        
        return textContent;
    }
    
    // Called in meta state
    function UpdateComponentAndSync(TextNodeContent: string | null | undefined, ParentElement: HTMLElement | null) {
        if (!TextNodeContent || !ParentElement) return;
        const textNodeResult = TextNodeProcessor(TextNodeContent);
        
        if (!textNodeResult) return;
        
        let documentFragment = document.createDocumentFragment();
        textNodeResult?.forEach(item => documentFragment.appendChild(item));
        
        daemonHandle.AddToOperations({
            type: "REPLACE",
            targetNode: ParentElement,
            newNode: documentFragment //first result node only
        });
        return daemonHandle.SyncNow();
    }
    
    // Add all nodes to ignore, update the central textnode ref, updating this component relies on activation function
    useLayoutEffect(() => {
        if (WholeElementRef.current && WholeElementRef.current.childNodes) {
            daemonHandle.AddToIgnore([...WholeElementRef.current.childNodes], "any", true);
        }
    });
    
    useLayoutEffect(() => {
        if (WholeElementRef.current && WholeElementRef.current.childNodes.length) {
            Array.from(WholeElementRef.current.childNodes).some((child) => {
                if (child.nodeType === Node.ELEMENT_NODE && !(child as HTMLElement).hasAttribute("data-is-generated")) {
                    TextContentMapRef.current.set(child as HTMLElement, true);
                    return true;
                }
                
                if (child.nodeType === Node.TEXT_NODE) {
                    TextContentMapRef.current.set(child as HTMLElement, true);
                    return true;
                }
            })
        }
        return () => {
            TextContentMapRef.current.clear();
        }
    });
    
    return React.createElement(tagName, {
        ...otherProps,
        ref: WholeElementRef,
    }, [
        React.createElement('span', {
            'data-is-generated': true, //!!IMPORTANT!! custom attr for the daemon's find xp function, so that this element won't count towards to the number of sibling of the same name
            key: 'SyntaxFront',
            className: ` Text-Normal ${isEditing ? '' : 'Hide-It'}`
        }, ['\u00A0', (<span ref={SyntaxElementRefFront} key={'SyntaxFrontBlock'}
                             contentEditable={false}>{propSyntaxData}</span>)]),
        
        ...(Array.isArray(children) ? children : [children]),
        
        propShouldWrap && React.createElement('span', {
            'data-is-generated': true, //!!IMPORTANT!! custom attr for the daemon's find xp function, so that this element won't count towards to the number of sibling of the same name
            key: 'SyntaxRear',
            className: `Text-Normal ${isEditing ? '' : 'Hide-It'}`
        }, [
            propShouldWrap ? (<span ref={SyntaxElementRefRear} key={'SyntaxRearBlock'}
                                    contentEditable={false}>{propSyntaxData}</span>) : null, '\u00A0'])
    ]);
}