import React, {useEffect, useLayoutEffect, useRef, useState} from "react";
import {TDaemonReturn} from "../../hooks/useEditorHTMLDaemon";
import {GetChildNodesTextContent} from '../Helpers'

export default function PlainSyntax({children, tagName, daemonHandle, ...otherProps}: {
    children?: React.ReactNode[] | React.ReactNode;
    tagName: string;
    daemonHandle: TDaemonReturn;
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
        }
    }); // the Meta state, called by parent via dom fiber
    
    const [isEditing, setIsEditing] = useState(false); //Reactive state, toggled by the meta state
    
    const propSyntaxData: any = otherProps['data-md-syntax'];
    const propShouldWrap: any = otherProps['data-md-wrapped'];
    
    const SyntaxElementRefFront = useRef<HTMLElement | null>(null);
    const SyntaxElementRefRear = useRef<HTMLElement | null>(null);
    
    // the element tag
    const WholeElementRef = useRef<HTMLElement | null>(null);
    
    const ElementOBRef = useRef<MutationObserver | null>(null);
    
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
                    daemonHandle.SyncNow();
                }
            })
        })
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
    
    useLayoutEffect(() => {
        if (SyntaxElementRefFront.current)
            daemonHandle.AddToIgnore(SyntaxElementRefFront.current, "any");
        
        if (SyntaxElementRefRear.current)
            daemonHandle.AddToIgnore(SyntaxElementRefRear.current, "any");
        
    });
    
    return React.createElement(tagName, {
        ...otherProps,
        ref: WholeElementRef,
    }, [
        React.createElement('span', {
            'data-is-generated': true, //!!IMPORTANT!! custom attr for the daemon's find xp function, so that this element won't count towards to the number of sibling of the same name
            key: 'SyntaxFront',
            ref: SyntaxElementRefFront,
            contentEditable: false,
            className: ` ${isEditing ? '' : 'Hide-It'}`
        }, propSyntaxData),
        
        ...(Array.isArray(children) ? children : [children]),
        
        propShouldWrap && React.createElement('span', {
            'data-is-generated': true, //!!IMPORTANT!! custom attr for the daemon's find xp function, so that this element won't count towards to the number of sibling of the same name
            key: 'SyntaxRear',
            ref: SyntaxElementRefRear,
            contentEditable: false,
            className: ` ${isEditing ? '' : 'Hide-It'}`
        }, propSyntaxData)
    ]);
    
}