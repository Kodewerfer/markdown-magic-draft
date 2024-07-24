import React, {useEffect, useLayoutEffect, useRef, useState} from "react";
import {TDaemonReturn} from "../hooks/useEditorDaemon";
import {TActivationReturn} from "../Editor_Types";
import {GetAllSurroundingText, GetCaretContext, TextNodeProcessor} from "../Utils/Helpers";
import {CompileAllTextNode, UpdateComponentAndSync} from "./Utils/CommonFunctions";

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
    
    const TagLinkTarget: any = otherProps['data-tag-link']; //prop passed down by the config func
    const TagDisplayText = getLastPartOfPath(String(TagLinkTarget));
    
    // the element tag
    const TagElementRef = useRef<HTMLElement | null>(null);
    // the "fake" display, wont be extracted as part of the syntax
    const TagDisplayTextRef = useRef<HTMLElement | null>(null);
    
    const ElementOBRef = useRef<MutationObserver | null>(null);
    
    function ComponentActivation(state: boolean): TActivationReturn {
        
        const ComponentReturn = {
            "enter": HandleEnter
        }
        
        // send whatever within the text node before re-rendering to the processor
        if (!state) {
            ElementOBRef.current?.takeRecords();
            ElementOBRef.current?.disconnect();
            ElementOBRef.current = null;
            
            if (TagElementRef.current) {
                
                const TextContent = CompileAllTextNode(TagElementRef.current);
                UpdateComponentAndSync(daemonHandle, TextContent, TagElementRef.current);
                
            }
        }
        if (state) {
            daemonHandle.SyncNow();
            
            if (typeof MutationObserver) {
                ElementOBRef.current = new MutationObserver(ObserverHandler);
                TagElementRef.current && ElementOBRef.current?.observe(TagElementRef.current, {
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
                if (Node === TagDisplayTextRef.current) {
                    DeleteTagAndSync();
                }
            })
        })
    }
    
    function DeleteTagAndSync() {
        if (!TagElementRef.current) return;
        daemonHandle.AddToOperations({
            type: "REMOVE",
            targetNode: TagElementRef.current,
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
        
        const TextContent = CompileAllTextNode(TagElementRef.current!);
        
        const {precedingText, followingText} = GetAllSurroundingText(CurrentSelection!, TagElementRef.current!);
        
        if (precedingText.trim() === '')
            daemonHandle.SetFutureCaret("PrevElement");
        else if (followingText.trim() !== '')
            bShouldBreakLine = false;
        else
            daemonHandle.SetFutureCaret("NextElement");
        
        UpdateComponentAndSync(daemonHandle, TextContent, TagElementRef.current);
        
        return Promise.resolve(bShouldBreakLine);
    }
    
    // Like other in-line components, the component's node are exempt from ob, all updates are handled via addops in ComponentActivation
    useLayoutEffect(() => {
        
        if (typeof children === 'string') children = children.trim();
        
        if (TagElementRef.current && TagElementRef.current?.firstChild)
            daemonHandle.AddToIgnore([...TagElementRef.current.childNodes], "any", true);
    });
    
    
    return React.createElement(tagName, {
        ...otherProps,
        ref: TagElementRef,
    }, [
        <span key={"FrontSpacing"} data-is-generated={true}>{'\u00A0'}</span>,
        <span key={"HiddenSyntaxFront"} data-is-generated={true} className={'Hide-It'}>:Tag[{TagLinkTarget}]</span>,
        (<span key={"TagDisplay"} ref={TagDisplayTextRef} data-fake-text={true}
               contentEditable={false}>{TagDisplayText}</span>), //!!important data-fake-text will not be extracted as part of the syntax
        <span key={"BackSpacing"} data-is-generated={true}>{'\u00A0'}</span>,
    ]);
}

// helper, get the "filename" of a file path (or dir)
export function getLastPartOfPath(fullPath: string) {
    let tempPath = fullPath.replace(/\\/g, '/');
    let pathParts = tempPath.split('/');
    return pathParts[pathParts.length - 1];
}