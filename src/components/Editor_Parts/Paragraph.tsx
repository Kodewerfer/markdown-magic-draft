import React, {useEffect, useRef, useState} from "react";
import {TDaemonReturn} from "../hooks/useEditorDaemon";
import {GetChildNodesAsHTMLString} from '../Utils/Helpers'
import {TActivationReturn} from "../Editor_Types";
import {RecalibrateContainer} from "../context/ParentElementContext";
import {CompileAllTextNode, UpdateContainerAndSync} from "./Utils/CommonFunctions";
import _ from "lodash";

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
            
            // FIXME:caused too much input interruption, need more testing.
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
        return {
            element: MainElementRef.current
        }
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
    
    // Add filler element to ignore, add filler element's special handling operation
    useEffect(() => {
        if (isHeader && SyntaxElementRef.current)
            daemonHandle.AddToIgnore(SyntaxElementRef.current, "any");
        
    });
    
    function ContainerUpdate() {
        console.log("Sub element changed, Paragraph update.")
        const compileAllTextNode = CompileAllTextNode(MainElementRef.current!);
        if (MainElementRef.current && MainElementRef.current.parentNode)
            UpdateContainerAndSync(daemonHandle, compileAllTextNode, MainElementRef.current, tagName);
    }
    
    return <RecalibrateContainer.Provider value={ContainerUpdate}>
        {React.createElement(tagName, {
            ...otherProps,
            ref: MainElementRef,
        }, [
            isHeader && React.createElement('span', {
                'data-is-generated': true,
                key: `HeaderSyntaxLead_${_.uniqueId()}`,
                ref: SyntaxElementRef,
                contentEditable: false,
                className: ` ${isEditing ? '' : 'Hide-It'}`
            }, headerSyntax),
            ...(Array.isArray(children) ? children : [children]),
        ])}
    </RecalibrateContainer.Provider>
};