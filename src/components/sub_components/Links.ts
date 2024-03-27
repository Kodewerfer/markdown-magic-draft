import React, {useLayoutEffect, useRef, useState} from "react";
import {TDaemonReturn} from "../../hooks/useEditorHTMLDaemon";
import {TextNodeProcessor} from "../Helpers";

export default function Links({children, tagName, daemonHandle, ...otherProps}: {
    children?: React.ReactNode[] | React.ReactNode;
    tagName: string;
    daemonHandle: TDaemonReturn;
    [key: string]: any; // for otherProps
}) {
    
    const [SetActivation] = useState<(state: boolean) => void>(() => {
        return (state: boolean) => {
            // send whatever within the text node before re-rendering to the processor
            if (!state) {
                if (LinkElementRef.current && LinkElementRef.current.firstChild) {
                    const textNodeResult = TextNodeProcessor(LinkElementRef.current.firstChild);
                    if (textNodeResult) {
                        daemonHandle.AddToOperations({
                            type: "REPLACE",
                            targetNode: LinkElementRef.current,
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
            
            return {
                "enter": (ev: Event) => {
                    //TODO
                }
            }
        }
    }); // the Meta state, called by parent via dom fiber
    
    const [isEditing, setIsEditing] = useState(false); //Reactive state, toggled by the meta state
    
    const LinkText: string = String(children);
    const LinkTarget: string = otherProps['href'] || '';
    
    // Show when actively editing
    const [EditingStateChild] = useState<String>(() => {
        return `[${LinkText}](${LinkTarget})`;
    });
    
    // the element tag
    const LinkElementRef = useRef<HTMLElement | null>(null);
    
    // The text node will be completely ignored, additional operation is passed to the Daemon in SetActivation
    useLayoutEffect(() => {
        if (LinkElementRef.current && LinkElementRef.current?.firstChild)
            daemonHandle.AddToIgnore(LinkElementRef.current?.firstChild, "any");
    });
    
    return React.createElement(tagName, {
        ...otherProps,
        ref: LinkElementRef,
    }, isEditing ? EditingStateChild : children);
    
}