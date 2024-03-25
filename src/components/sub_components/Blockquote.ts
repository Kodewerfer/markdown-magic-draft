import React, {useEffect, useLayoutEffect, useRef, useState} from "react";
import {TDaemonReturn} from "../../hooks/useEditorHTMLDaemon";
import {ExtraRealChild} from "../Helpers";

export function Blockquote({children, tagName, parentSetActivation, daemonHandle, ...otherProps}: {
    children?: React.ReactNode[] | React.ReactNode;
    tagName: string;
    parentSetActivation: (DOMNode: HTMLElement) => void;
    daemonHandle: TDaemonReturn;
    [key: string]: any; // for otherProps
}) {
    const [SetActivation] = useState<(state: boolean) => void>(() => {
        return (state: boolean) => {
            // setIsEditing((prev) => {
            //     return !prev;
            // });
            setIsEditing(state);
        }
    }); // the Meta state, called by parent via dom fiber
    const [isEditing, setIsEditing] = useState(false); //Not directly used, but VITAL
    const ContainerRef = useRef<HTMLElement | null>(null);
    
    // Delete the whole blockquote if there were no items left.
    useEffect(() => {
        if (!children || React.Children.count(children) === 1) {
            if (String(children).trim() === '' && ContainerRef.current) {
                
                daemonHandle.AddToOperations({
                    type: "REMOVE",
                    targetNode: ContainerRef.current
                });
                
                daemonHandle.SyncNow();
                // set it to null so the syncing won't run more than once(in strict mode especially)
                ContainerRef.current = null;
            }
        }
    });
    
    return React.createElement(tagName, {
        ref: ContainerRef,
        ...otherProps
    }, children);
}

export function QuoteItem({children, tagName, daemonHandle, ...otherProps}: {
    children?: React.ReactNode[] | React.ReactNode;
    tagName: string;
    isHeader: boolean;
    headerSyntax: string;
    daemonHandle: TDaemonReturn; // replace Function with a more specific function type if necessary
    [key: string]: any; // for otherProps
}) {
    const [SetActivation] = useState<(state: boolean) => void>(() => {
        return (state: boolean) => {
            setIsEditing(state);
        }
    }); // the Meta state, called by parent via dom fiber
    const [isEditing, setIsEditing] = useState(false); //Not directly used, but VITAL
    const MainElementRef = useRef<HTMLElement | null>(null);
    
    const QuoteSyntaxFiller = useRef<HTMLElement>();  //filler element
    
    // Add filler element to ignore, add filler element's special handling operation
    useEffect(() => {
        if (QuoteSyntaxFiller.current) {
            daemonHandle.AddToIgnore(QuoteSyntaxFiller.current, "any");
            if (MainElementRef.current) {
                
                const newParagraph = document.createElement('p') as HTMLElement;
                newParagraph.innerHTML = ExtraRealChild(children);
                
                daemonHandle.AddToBindOperations(QuoteSyntaxFiller.current, "remove", [
                    {
                        type: "REMOVE",
                        targetNode: MainElementRef.current,
                    },
                    {
                        type: "ADD",
                        newNode: newParagraph,
                        parentXP: "//body",
                        siblingNode: MainElementRef.current?.parentNode?.nextSibling
                    }]);
            }
        }
    });
    
    return React.createElement(tagName, {
        ...otherProps,
        ref: MainElementRef,
    }, [
        React.createElement('span', {
            'data-is-generated': true, //!!IMPORTANT!! custom attr for the daemon's find xp function, so that this element won't count towards to the number of sibling of the same name
            key: 'HeaderSyntaxLead',
            ref: QuoteSyntaxFiller,
            contentEditable: false,
            className: ` ${isEditing ? '' : 'Hide-It'}`
        }, "> "),
        ...(Array.isArray(children) ? children : [children]),
    ]);
}