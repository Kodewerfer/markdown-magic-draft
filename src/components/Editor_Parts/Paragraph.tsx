import React, {useEffect, useRef, useState} from "react";
import {TDaemonReturn} from "../../hooks/useEditorDaemon";
import {ExtraRealChild, GetChildNodesAsHTMLString, GetChildNodesTextContent} from '../Helpers'
import {TActivationReturn} from "../Editor_Types";

export default function Paragraph({children, tagName, isHeader, headerSyntax, daemonHandle, ...otherProps}: {
    children?: React.ReactNode[] | React.ReactNode;
    tagName: string;
    isHeader: boolean;
    headerSyntax: string;
    daemonHandle: TDaemonReturn; // replace Function with a more specific function type if necessary
    [key: string]: any; // for otherProps
}) {
    const [SetActivation] = useState<(state: boolean) => TActivationReturn>(() => {
        return ComponentActivation
    }); // the Meta state, called by parent via dom fiber
    const [isEditing, setIsEditing] = useState(false); //Not directly used, but VITAL
    
    const MainElementRef = useRef<HTMLElement | null>(null);
    
    const SyntaxElementRef = useRef<HTMLElement>();  //filler element
    
    const ElementOBRef = useRef<MutationObserver | null>(null);
    
    function ComponentActivation(state: boolean): TActivationReturn {
        
        if (!state) {
            ElementOBRef.current?.takeRecords();
            ElementOBRef.current?.disconnect();
            ElementOBRef.current = null;
        }
        if (state) {
            
            // FIXME:cause too much input interruption, need more testing.
            // daemonHandle.SyncNow();
            
            if (typeof MutationObserver) {
                ElementOBRef.current = new MutationObserver(ObserverHandler);
                MainElementRef.current && ElementOBRef.current?.observe(MainElementRef.current, {
                    childList: true
                });
            }
        }
        setIsEditing(state);
        
        // Paragraph no need for special handling for enter and dels
        return {}
    }
    
    function ObserverHandler(mutationList: MutationRecord[]) {
        mutationList.forEach((Record) => {
            
            if (!Record.removedNodes.length) return;
            
            Record.removedNodes.forEach((Node) => {
                if (Node === SyntaxElementRef.current) {
                    
                    daemonHandle.AddToOperations({
                        type: "REPLACE",
                        targetNode: MainElementRef.current!,
                        newNode: () => {
                            const ReplacementElement = document.createElement('p') as HTMLElement;
                            ReplacementElement.innerHTML = GetChildNodesAsHTMLString(MainElementRef.current?.childNodes);
                            return ReplacementElement;
                        }
                    });
                    daemonHandle.SyncNow();
                }
            })
        })
    }
    
    // // Self destruct if no child element
    // useEffect(() => {
    //     if (!children || React.Children.count(children) === 1) {
    //         if (String(children).trim() === '' && MainElementRef.current) {
    //
    //             daemonHandle.AddToOperations(
    //                 {
    //                     type: "REMOVE",
    //                     targetNode: MainElementRef.current,
    //                 }
    //             );
    //
    //             MainElementRef.current = null;
    //             daemonHandle.SyncNow();
    //             daemonHandle.DiscardHistory(1);
    //
    //         }
    //     }
    // });
    
    // Add filler element to ignore, add filler element's special handling operation
    useEffect(() => {
        if (isHeader && SyntaxElementRef.current)
            daemonHandle.AddToIgnore(SyntaxElementRef.current, "any");
        
    });
    
    return React.createElement(tagName, {
        ...otherProps,
        ref: MainElementRef,
    }, [
        isHeader && React.createElement('span', {
            'data-is-generated': true, //!!IMPORTANT!! custom attr for the daemon's find xp function, so that this element won't count towards to the number of sibling of the same name
            key: 'HeaderSyntaxLead',
            ref: SyntaxElementRef,
            contentEditable: false,
            className: ` ${isEditing ? '' : 'Hide-It'}`
        }, headerSyntax),
        ...(Array.isArray(children) ? children : [children]),
    ]);
};