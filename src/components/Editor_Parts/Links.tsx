import React, {useEffect, useLayoutEffect, useRef, useState} from "react";
import {TDaemonReturn} from "../../hooks/useEditorHTMLDaemon";
import {GetCaretContext, TextNodeProcessor} from "../Helpers";

export default function Links({children, tagName, daemonHandle, ...otherProps}: {
    children?: React.ReactNode[] | React.ReactNode;
    tagName: string;
    daemonHandle: TDaemonReturn;
    [key: string]: any; // for otherProps
}) {
    
    const [SetActivation] = useState<(state: boolean) => void>(() => {
        return ComponentActivation;
    }); // the Meta state, called by parent via dom fiber
    
    const [isEditing, setIsEditing] = useState(false); //Reactive state, toggled by the meta state
    
    // the element tag
    const LinkElementRef = useRef<HTMLElement | null>(null);
    
    function ComponentActivation(state: boolean) {
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
            "del": (ev: Event) => {
                //Del line merge
                return HandleLineJoining();
            },
            "backspace": (ev: Event) => {
                //Del line merge
                
                return HandleLineJoining();
            },
            "enter": (ev: Event) => {
                return HandleEnter();
            }
        }
    }
    
    // Show when actively editing
    const [GetEditingStateChild] = useState(() => {
        return () => {
            const textContent = LinkElementRef.current?.firstChild?.textContent;
            const LinkText: string = String(textContent ?? " ");
            const LinkTarget: string = otherProps['href'] || '';
            const EditingStateContent = `[${LinkText}](${LinkTarget})`;
            
            return textContent === EditingStateContent ? textContent : EditingStateContent;
        };
    });
    
    function HandleLineJoining() {
        // This is a somewhat band-aid solution aim to solve incorrect text content after joining line with del or backspace
        // TODO:
        if (!LinkElementRef.current || !LinkElementRef.current.firstChild) return false;
        if (typeof children !== 'string') return false;
        
        LinkElementRef.current.firstChild.textContent = children;
        
        return true;
    }
    
    function HandleEnter() {
        const {CurrentSelection, CurrentAnchorNode, RemainingText, PrecedingText} = GetCaretContext();
        if (!CurrentSelection || !CurrentAnchorNode) return;
        
        const range = CurrentSelection.getRangeAt(0);
        
        if (PrecedingText.trim() === '' && range.startOffset === 0) return true;
        if (RemainingText.trim() === '') return true;
        
        //TODO: Turn off activation state
    }
    
    // The text node will be completely ignored, additional operation is passed to the Daemon in SetActivation
    useLayoutEffect(() => {
        
        if (typeof children === 'string') children = children.trim();
        
        if (LinkElementRef.current && LinkElementRef.current?.firstChild)
            daemonHandle.AddToIgnore(LinkElementRef.current?.firstChild, "any");
    });
    
    return React.createElement(tagName, {
        ...otherProps,
        ref: LinkElementRef,
    }, isEditing ? GetEditingStateChild() : " " + children + " ");
    
}