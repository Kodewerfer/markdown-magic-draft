import React, {useLayoutEffect, useRef, useState} from "react";
import {TDaemonReturn} from "../../hooks/useEditorHTMLDaemon";
import {TextNodeProcessor} from '../Helpers'

export default function PlainSyntax({children, tagName, parentSetActivation, daemonHandle, ...otherProps}: {
    children?: React.ReactNode[] | React.ReactNode;
    tagName: string;
    parentSetActivation: (DOMNode: HTMLElement) => void;
    daemonHandle: TDaemonReturn;
    [key: string]: any; // for otherProps
}) {
    
    const [SetActivation] = useState<(state: boolean) => void>(() => {
        return (state: boolean) => {
            // send whatever within the text node before re-rendering to the processor
            if (!state) {
                if (WholeElementRef.current && WholeElementRef.current.firstChild) {
                    const textNodeResult = TextNodeProcessor(WholeElementRef.current.firstChild);
                    if (textNodeResult) {
                        daemonHandle.AddToOperations({
                            type: "REPLACE",
                            targetNode: WholeElementRef.current,
                            newNode: textNodeResult[0] //first result node only
                        });
                        daemonHandle.SyncNow();
                    }
                }
            }
            if (state) {
                daemonHandle.SyncNow();
            }
            setIsEditing(state);
            if (WholeElementRef.current)
                parentSetActivation(WholeElementRef.current);
        }
    }); // the Meta state, called by parent via dom fiber
    
    const [isEditing, setIsEditing] = useState(false); //Reactive state, toggled by the meta state
    
    const propSyntaxData: any = otherProps['data-md-syntax'];
    const propShouldWrap: any = otherProps['data-md-wrapped'];
    // Show when actively editing
    const [childrenWithSyntax] = useState<String>(() => {
        
        let result = String(children);
        
        if (propSyntaxData && !String(children).startsWith(propSyntaxData))
            result = propSyntaxData + String(children);
        
        if (propShouldWrap === 'true' && !String(children).endsWith(propShouldWrap))
            result += propSyntaxData;
        
        return result;
    });
    // the element tag
    const WholeElementRef = useRef<HTMLElement | null>(null);
    
    useLayoutEffect(() => {
        // The text node will be completely ignored, additional operation is passed to the Daemon in SetActivation
        if (WholeElementRef.current && WholeElementRef.current?.firstChild)
            daemonHandle.AddToIgnore(WholeElementRef.current?.firstChild, "any");
    });
    
    return React.createElement(tagName, {
        ...otherProps,
        ref: WholeElementRef,
    }, isEditing ? childrenWithSyntax : children);
    
}