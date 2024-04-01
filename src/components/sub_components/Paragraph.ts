import React, {useEffect, useRef, useState} from "react";
import {TDaemonReturn} from "../../hooks/useEditorHTMLDaemon";
import {ExtraRealChild, GetChildNodesAsHTMLString} from '../Helpers'

export default function Paragraph({children, tagName, isHeader, headerSyntax, daemonHandle, ...otherProps}: {
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
    const SyntaxElementRef = useRef<HTMLElement>();  //filler element
    
    // Add filler element to ignore, add filler element's special handling operation
    useEffect(() => {
        if (isHeader && SyntaxElementRef.current) {
            daemonHandle.AddToIgnore(SyntaxElementRef.current, "any");
            if (MainElementRef.current) {
                
                daemonHandle.AddToBindOperations(SyntaxElementRef.current, "remove", {
                    type: "REPLACE",
                    targetNode: MainElementRef.current,
                    newNode: () => {
                        const ReplacementElement = document.createElement('p') as HTMLElement;
                        ReplacementElement.innerHTML = GetChildNodesAsHTMLString(MainElementRef.current?.childNodes);
                        return ReplacementElement;
                    }
                });
            }
        }
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