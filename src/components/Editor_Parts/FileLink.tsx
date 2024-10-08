import React, {useContext, useLayoutEffect, useRef, useState} from "react";
import {TDaemonReturn} from "../hooks/useEditorDaemon";
import {TActivationReturn} from "../Editor_Types";
import {
    GetAllSurroundingText,
    GetCaretContext,
} from "../Utils/Helpers";
import {CompileAllTextNode, UpdateComponentAndSync} from "./Utils/CommonFunctions";
import {RecalibrateContainer} from "../context/ParentElementContext";
import classNames from "classnames/dedupe";

/**
 * A "Tag" link element is different in that it can be directly edited by the user once it is created.
 */
export default function FileLink({children, tagName, daemonHandle, initCallback, removeCallback, ...otherProps}: {
    children?: React.ReactNode[] | React.ReactNode;
    tagName: string;
    initCallback?: (linkTarget: string) => void | Promise<void>;
    removeCallback?: (linkTarget: string) => void | Promise<void>;
    daemonHandle: TDaemonReturn;
    [key: string]: any; // for otherProps
}) {
    const [SetActivation] = useState<(state: boolean) => TActivationReturn>(() => {
        return ComponentActivation;
    }); // the Meta state, called by parent via dom fiber
    
    const [isEditing, setIsEditing] = useState(false); //Reactive state, toggled by the meta state
    
    const FileLinkTarget: any = otherProps['data-file-link']; //prop passed down by the config func
    const FileLinkDisplayText = getLastPartOfPath(String(FileLinkTarget)).split('.')[0];
    
    // the element tag
    const FileLinkElementRef = useRef<HTMLElement | null>(null);
    // the "fake" display, wont be extracted as part of the syntax
    const FileLinkDisplayTextRef = useRef<HTMLElement | null>(null);
    
    const ElementOBRef = useRef<MutationObserver | null>(null);
    
    const ParentAction = useContext(RecalibrateContainer);
    
    function ComponentActivation(state: boolean): TActivationReturn {
        
        const ComponentReturn = {
            "enter": HandleEnter,
            "backspaceOverride": BackspaceHandler,
            "delOverride": DelKeyHandler,
            element: FileLinkElementRef.current
        }
        
        // send whatever within the text node before re-rendering to the processor
        if (!state) {
            
            ElementOBRef.current?.takeRecords();
            ElementOBRef.current?.disconnect();
            ElementOBRef.current = null;
            
            if (typeof ParentAction === "function")
                ParentAction();
            else if (FileLinkElementRef.current) {
                
                const TextContent = CompileAllTextNode(FileLinkElementRef.current);
                UpdateComponentAndSync(daemonHandle, TextContent, FileLinkElementRef.current);
                
            }
        }
        if (state) {
            daemonHandle.SyncNow();
            
            if (typeof MutationObserver) {
                ElementOBRef.current = new MutationObserver(ObserverHandler);
                FileLinkElementRef.current && ElementOBRef.current?.observe(FileLinkElementRef.current, {
                    childList: true,
                    subtree: true
                });
            }
        }
        setIsEditing(state);
        
        return ComponentReturn;
    }
    
    function ObserverHandler(mutationList: MutationRecord[]) {
        mutationList.forEach((Record) => {
            if (!Record.removedNodes.length) return;
            
            Record.removedNodes.forEach((Node) => {
                if (Node === FileLinkDisplayTextRef.current) {
                    DeleteTagAndSync();
                }
            })
        })
    }
    
    function DeleteTagAndSync() {
        if (!FileLinkElementRef.current) return;
        daemonHandle.AddToOperations({
            type: "REMOVE",
            targetNode: FileLinkElementRef.current,
        });
        
        if (typeof removeCallback === "function")
            removeCallback(FileLinkTarget);
        
        return daemonHandle.SyncNow();
    }
    
    function HandleEnter(ev: Event) {
        ev.preventDefault();
        
        const {CurrentSelection} = GetCaretContext();
        
        let bShouldBreakLine = true;
        
        const TextContent = CompileAllTextNode(FileLinkElementRef.current!);
        
        const {precedingText, followingText} = GetAllSurroundingText(CurrentSelection!, FileLinkElementRef.current!);
        
        if (precedingText.trim() === '')
            daemonHandle.SetFutureCaret("PrevElement");
        else if (followingText.trim() !== '')
            bShouldBreakLine = false;
        else
            daemonHandle.SetFutureCaret("NextElement");
        
        if (typeof ParentAction === "function")
            ParentAction();
        else
            UpdateComponentAndSync(daemonHandle, TextContent, FileLinkElementRef.current);
        
        return Promise.resolve(bShouldBreakLine);
    }
    
    // because of the simple nature of the file link, del and backspace will simply delete the element
    function BackspaceHandler(ev: Event) {
        ev.stopImmediatePropagation();
        ev.preventDefault();
        DeleteTagAndSync();
        
    }
    
    function DelKeyHandler(ev: Event) {
        ev.stopImmediatePropagation();
        ev.preventDefault();
        DeleteTagAndSync();
    }
    
    // run the init callback each time
    useLayoutEffect(() => {
        (async () => {
            if (typeof initCallback === "function")
                await initCallback(FileLinkTarget);
        })()
    }, []);
    
    // Like other in-line components, the component's node are exempt from ob, all updates are handled via addops in ComponentActivation
    useLayoutEffect(() => {
        
        if (typeof children === 'string') children = children.trim();
        
        if (FileLinkElementRef.current && FileLinkElementRef.current?.firstChild)
            daemonHandle.AddToIgnore([...FileLinkElementRef.current.childNodes], "any", true);
    });
    
    // Add component classed on top of classes that may be added to it
    const combinedClassnames = classNames(
        FileLinkElementRef?.current?.className,
        `file-link`,
        {"is-active": isEditing}
    )
    
    return React.createElement(tagName, {
        ...otherProps,
        className: combinedClassnames,
        ref: FileLinkElementRef,
    }, [
        <span key={"FrontSpacing"} data-is-generated={true}>{'\u00A0'}</span>,
        <span key={"HiddenSyntaxFront"} data-is-generated={true} className={'Hide-It'}>:Link[{FileLinkTarget}]</span>,
        (<span key={"TagDisplay"} ref={FileLinkDisplayTextRef} data-fake-text={true}
               contentEditable={false}>{FileLinkDisplayText}</span>), //!!important data-fake-text will not be extracted as part of the syntax
        <span key={"BackSpacing"} data-is-generated={true}>{'\u00A0'}</span>,
    ]);
}

// helper, get the "filename" of a file path (or dir)
export function getLastPartOfPath(fullPath: string) {
    let tempPath = fullPath.replace(/\\/g, '/');
    let pathParts = tempPath.split('/');
    return pathParts[pathParts.length - 1] || "";
}