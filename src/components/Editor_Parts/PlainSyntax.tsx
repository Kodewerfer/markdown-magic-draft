import React, {useEffect, useLayoutEffect, useRef, useState} from "react";
import {TDaemonReturn} from "../../hooks/useEditorHTMLDaemon";
import {
    GetCaretContext,
    GetChildNodesTextContent, MoveCaretToNode,
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
                });
            }
        }
        setIsEditing(state);
        return {
            enter: EnterKeyHandler
        };
    }
    
    function ObserverHandler(mutationList: MutationRecord[]) {
        mutationList.forEach((Record) => {
            
            if (!Record.removedNodes.length) return;
            
            Record.removedNodes.forEach((Node) => {
                if (Node === SyntaxElementRefFront.current || Node === SyntaxElementRefRear.current) {
                    
                    daemonHandle.AddToOperations({
                        type: "REPLACE",
                        targetNode: WholeElementRef.current!,
                        newNode: () => {
                            return document.createTextNode(GetChildNodesTextContent(WholeElementRef.current?.childNodes))
                        }
                    });
                    MoveCaretToNode(WholeElementRef.current);
                    daemonHandle.SyncNow();
                }
            })
        })
    }
    
    function EnterKeyHandler(ev: Event) {
        ev.preventDefault();
        
        const TextContent = CompileAllTextNode();
        
        daemonHandle.SetFutureCaret("NextRealEditable");
        UpdateComponentAndSync(TextContent, WholeElementRef.current);
        
        return false;
    }
    
    // Called in meta state
    function CompileAllTextNode() {
        if (!WholeElementRef.current) return;
        let elementWalker = document.createTreeWalker(WholeElementRef.current, NodeFilter.SHOW_TEXT);
        
        let node;
        let textContent = '';
        while (node = elementWalker.nextNode()) {
            textContent += node.textContent;
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
    
    // Self cleanup if there is no content left
    useEffect(() => {
        if ((!children || String(children).trim() === '') && WholeElementRef.current) {
            daemonHandle.AddToOperations(
                {
                    type: "REMOVE",
                    targetNode: WholeElementRef.current,
                }
            );
            
            WholeElementRef.current = null;
            daemonHandle.SyncNow()
                .then(() => {
                    daemonHandle.DiscardHistory(1);
                });
            
        }
    });
    
    // Add all nodes to ignore, updating this component relies on activation function
    useLayoutEffect(() => {
        if (WholeElementRef.current && WholeElementRef.current.childNodes) {
            daemonHandle.AddToIgnore([...WholeElementRef.current.childNodes], "any", true);
        }
    });
    
    return React.createElement(tagName, {
        ...otherProps,
        ref: WholeElementRef,
    }, [
        React.createElement('span', {
            'data-is-generated': true, //!!IMPORTANT!! custom attr for the daemon's find xp function, so that this element won't count towards to the number of sibling of the same name
            key: 'SyntaxFront',
            ref: SyntaxElementRefFront,
            className: ` ${isEditing ? '' : 'Hide-It'}`
        }, propSyntaxData),
        
        ...(Array.isArray(children) ? children : [children]),
        
        propShouldWrap && React.createElement('span', {
            'data-is-generated': true, //!!IMPORTANT!! custom attr for the daemon's find xp function, so that this element won't count towards to the number of sibling of the same name
            key: 'SyntaxRear',
            ref: SyntaxElementRefRear,
            className: ` ${isEditing ? '' : 'Hide-It'}`
        }, propSyntaxData)
    ]);
}