import React, {useContext, useEffect, useLayoutEffect, useRef, useState} from "react";
import {TDaemonReturn} from "../hooks/useEditorDaemon";
import {TActivationReturn} from "../Editor_Types";
import {GetAllSurroundingText, GetCaretContext, TextNodeProcessor} from "../Utils/Helpers";
import {CompileAllTextNode, UpdateComponentAndSync} from "./Utils/CommonFunctions";
import {RecalibrateContainer} from "../context/ParentElementContext";

/**
 * A "Tag" link element is different in that it can be directly edited by the user once it is created.
 */
export default function TagLink({children, tagName, daemonHandle, ...otherProps}: {
    children?: React.ReactNode[] | React.ReactNode;
    tagName: string;
    daemonHandle: TDaemonReturn;
    [key: string]: any; // for otherProps
}) {
    // TODO: set up alias for this
    const [SetActivation] = useState<(state: boolean) => TActivationReturn>(() => {
        return ComponentActivation;
    }); // the Meta state, called by parent via dom fiber
    
    const [isEditing, setIsEditing] = useState(false); //Reactive state, toggled by the meta state
    
    const FileLinkTarget: any = otherProps['data-file-link']; //prop passed down by the config func
    const FileLinkDisplayText = getLastPartOfPath(String(FileLinkTarget));
    
    // the element tag
    const FileLinkElementRef = useRef<HTMLElement | null>(null);
    // the "fake" display, wont be extracted as part of the syntax
    const FileLinkDisplayTextRef = useRef<HTMLElement | null>(null);
    
    const ElementOBRef = useRef<MutationObserver | null>(null);
    
    const ParentAction = useContext(RecalibrateContainer);
    
    function ComponentActivation(state: boolean): TActivationReturn {
        
        const ComponentReturn = {
            "enter": HandleEnter,
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
        return daemonHandle.SyncNow();
    }
    
    // using common functions now, saving for reference
    // if TextNodeContent is null then delete, otherwise "refresh" the tag element
    // function UpdateComponentAndSync(TextNodeContent: string | null | undefined, ParentElement: HTMLElement | null) {
    //     if (!ParentElement) return;
    //
    //     if (!TextNodeContent) return DeleteTagAndSync();
    //
    //     const textNodeResult = TextNodeProcessor(TextNodeContent);
    //
    //     if (!textNodeResult) return DeleteTagAndSync();
    //
    //     // Effectively "refresh" the tag.
    //     let documentFragment = document.createDocumentFragment();
    //     textNodeResult?.forEach(item => documentFragment.appendChild(item));
    //
    //     daemonHandle.AddToOperations({
    //         type: "REPLACE",
    //         targetNode: ParentElement,
    //         newNode: documentFragment //first result node only
    //     });
    //     return daemonHandle.SyncNow();
    // }
    
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
    
    // Like other in-line components, the component's node are exempt from ob, all updates are handled via addops in ComponentActivation
    useLayoutEffect(() => {
        
        if (typeof children === 'string') children = children.trim();
        
        if (FileLinkElementRef.current && FileLinkElementRef.current?.firstChild)
            daemonHandle.AddToIgnore([...FileLinkElementRef.current.childNodes], "any", true);
    });
    
    
    return React.createElement(tagName, {
        ...otherProps,
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
    return pathParts[pathParts.length - 1];
}