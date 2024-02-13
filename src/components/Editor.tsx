import React, {Profiler, useEffect, useLayoutEffect, useRef, useState} from "react";
import {HTML2MD, HTML2ReactSnyc, MD2HTML, MD2HTMLSync} from "../Utils/Conversion";
import useEditorHTMLDaemon from "../hooks/useEditorHTMLDaemon";
import {Compatible} from "unified/lib";
import "./Editor.css";
import _ from 'lodash';

type TSubElementsQueue = {
    [key: string]: HTMLElement | null;
};

type TEditorProps = {
    SourceData?: string | undefined
};

export default function Editor(
    {SourceData}: TEditorProps
) {
    const [sourceMD, setSourceMD] = useState<string>(() => {
        SourceData = SourceData || "";
        return SourceData;
    });
    const EditorSourceRef = useRef<Document | null>(null);
    const EditorCurrentRef = useRef<HTMLElement | null>(null);
    const EditorMaskRef = useRef<HTMLDivElement | null>(null);
    const [EditorHTMLString, setEditorHTMLString] = useState('');
    
    const [isEditingSubElement, setIsEditingSubElement] = useState(false);
    const EditingQueue: React.MutableRefObject<TSubElementsQueue> = useRef<TSubElementsQueue>({});
    
    useEffect(() => {
        ;(async () => {
            // convert MD to HTML
            const md2HTML = await MD2HTML(sourceMD);
            
            // Save a copy of HTML
            const HTMLParser = new DOMParser()
            EditorSourceRef.current = HTMLParser.parseFromString(String(md2HTML), "text/html");
            setEditorHTMLString(String(md2HTML));
        })()
        
    }, [sourceMD]);
    
    const toggleEditingSubElement = (bSubEditing: boolean, Identifier: string, ElementRef: HTMLElement, ChangeRecord?: MutationRecord) => {
        if (!Identifier) {
            console.warn('Editing Sub Element with invalid Identifier', ElementRef);
            return;
        }
        
        console.log("Sub triggered:", bSubEditing, " ID:", Identifier)
        
        if (EditingQueue.current === null || EditingQueue.current === undefined) {
            EditingQueue.current = {};
        }
        
        if (!bSubEditing) {
            if (typeof EditingQueue.current[Identifier] !== 'undefined') {
                let {[Identifier]: value, ...remaining} = EditingQueue.current;
                EditingQueue.current = remaining;
            }
            
            if (EditingQueue.current && Object.keys(EditingQueue.current).length === 0) {
                setIsEditingSubElement(false);
            }
            
            if (ChangeRecord) {
                DaemonHandle.AddToRecord(ChangeRecord);
            }
            
            return;
        }
        
        EditingQueue.current[Identifier] = ElementRef
        setIsEditingSubElement(true);
    }
    
    async function ExtractMD() {
        const ConvertedMarkdown = await HTML2MD(EditorHTMLString);
        console.log(String(ConvertedMarkdown));
    }
    
    function MaskEditingArea() {
        
        if (!EditorMaskRef.current || !EditorMaskRef.current.innerHTML) return;
        
        console.log("masking....");
        
        const editorInnerHTML = EditorCurrentRef.current?.innerHTML;
        if (editorInnerHTML) {
            EditorCurrentRef.current?.classList.add("No-Vis");
            EditorMaskRef.current!.innerHTML = editorInnerHTML;
            EditorMaskRef.current!.classList.remove("Hide-It");
        }
    }
    
    async function ReloadEditorContent() {
        if (!EditorSourceRef.current) return;
        const bodyElement: HTMLBodyElement | null = EditorSourceRef.current.documentElement.querySelector('body');
        if (bodyElement)
            setEditorHTMLString(String(bodyElement!.innerHTML));
    }
    
    function TextNodeHandler(textNode: Node) {
        if (textNode.textContent === null) return;
        const convertedHTML = String(MD2HTMLSync(textNode.textContent));
        
        let DOC = new DOMParser().parseFromString(convertedHTML, "text/html");
        
        const treeWalker: TreeWalker = DOC.createTreeWalker(DOC, NodeFilter.SHOW_TEXT);
        let newNodes: Node[] = [];
        let newTextNode;
        while (newTextNode = treeWalker.nextNode()) {
            
            if (!newTextNode.parentNode) continue;
            
            if (newTextNode.parentNode.nodeName.toLowerCase() === 'p'
                || newTextNode.parentNode.nodeName.toLowerCase() === 'body') {
                newNodes.push(newTextNode);
            } else {
                newNodes.push(newTextNode.parentNode);
            }
        }
        
        if (newNodes.length === 0) return null;
        
        return newNodes;
    }
    
    function HTML2EditorCompos(md2HTML: Compatible) {
        
        // Map all possible text-containing tags to TextContainer component and therefore manage them.
        const TextNodesMappingConfig: Record<string, React.FunctionComponent<any>> = ['span', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'ul', 'ol', 'li', 'code', 'pre', 'em', 'strong', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'br', 'img', 'del', 'input', 'hr']
            .reduce((acc: Record<string, React.FunctionComponent<any>>, tagName: string) => {
                acc[tagName] = (props: any) => {
                    if (props['data-md-syntax'] && props['data-md-container'] !== 'true') {
                        if (props['data-link-to']) {
                            return <SpecialLinkComponent {...props}
                                                         ParentAction={toggleEditingSubElement}
                                                         tagName={tagName}/>;
                        }
                        
                        return <PlainSyntax {...props}
                                            ParentAction={toggleEditingSubElement}
                                            tagName={tagName}/>;
                    }
                    
                    // Placeholder
                    return <CommonRenderer {...props}
                                           ParentAction={toggleEditingSubElement}
                                           tagName={tagName}/>;
                }
                return acc;
            }, {});
        
        const componentOptions = {
            ...TextNodesMappingConfig,
            'p': Paragraph
        }
        return HTML2ReactSnyc(md2HTML, componentOptions).result;
    }
    
    useLayoutEffect(() => {
        EditorCurrentRef.current?.classList.remove("No-Vis");
        if (EditorMaskRef.current) {
            EditorMaskRef.current?.classList.add('Hide-It');
        }
    });
    
    const DaemonHandle = useEditorHTMLDaemon(EditorCurrentRef, EditorSourceRef, ReloadEditorContent,
        {
            OnRollback: MaskEditingArea,
            TextNodeCallback: TextNodeHandler,
            IsEditable: !isEditingSubElement,
            ShouldObserve: !isEditingSubElement
        });
    
    return (
        <>
            <button className={"bg-amber-600"} onClick={ExtractMD}>Save</button>
            <section className="Editor">
                <main className={'Editor-Inner'} ref={EditorCurrentRef}>
                    {HTML2EditorCompos(EditorHTMLString).props.children}
                </main>
                <div className={'Editor-Mask'} ref={EditorMaskRef}>
                    MASK!
                </div>
            </section>
        </>
    )
}

const Paragraph = (props: any) => {
    const {children, ...otherProps} = props;
    return (
        <p {...otherProps}>{children}</p>
    )
};

const CommonRenderer = (props: any) => {
    const {children, tagName, ParentAction, ...otherProps} = props;
    
    return React.createElement(tagName, otherProps, children);
};

function SpecialLinkComponent(props: any) {
    const {children, tagName, ParentAction, ...otherProps} = props;
    return React.createElement(tagName, otherProps, children);
}

function PlainSyntax(props: any) {
    const {tagName, ParentAction, children, ...otherProps} = props;
    
    const propSyntaxData: any = otherProps['data-md-syntax'];
    const propShouldWrap: any = otherProps['data-md-wrapped'];
    const [childrenWithSyntax] = useState<String>(() => {
        let result;
        if (propSyntaxData) {
            result = propSyntaxData + children;
            if (propShouldWrap === 'true')
                result += propSyntaxData;
        }
        
        return result;
    });
    
    const ElementRef = useRef<HTMLElement | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const IdentifierRef = useRef<string | undefined>(undefined);
    
    useLayoutEffect(() => {
        const OnClick = (ev: Event) => {
            ev.stopPropagation();
            ElementRef.current?.focus();
        };
        
        const OnFocus = (ev: HTMLElementEventMap['focusin']) => {
            ev.stopPropagation();
            
            if (!isEditing)
                setIsEditing(true);
            
            const timestamp = new Date().valueOf();
            const generatedId: string = _.uniqueId("_" + ElementRef.current?.tagName.toLowerCase());
            IdentifierRef.current = timestamp + generatedId;
            
            
            ParentAction(true, IdentifierRef.current, ElementRef.current);
            
        };
        
        const OnFocusOut = (ev: Event) => {
            ev.stopPropagation();
            if (!ElementRef.current) return;
            
            let mutation;
            
            if (!ElementRef.current.firstChild || ElementRef.current.firstChild.textContent === '' || ElementRef.current.firstChild.textContent === null) {
                mutation = {
                    type: "childList",
                    target: ElementRef.current?.parentNode,
                    removedNodes: [ElementRef.current],
                }
            } else {
                mutation = {
                    type: "characterData",
                    oldValue: String(children),
                    target: ElementRef.current?.firstChild!,
                    newValue: ElementRef.current?.firstChild!.nodeValue
                }
            }
            
            ParentAction(false, IdentifierRef.current, ElementRef.current, mutation);
            setIsEditing(false);
        }
        
        const OnKeydown = (ev: HTMLElementEventMap['keydown']) => {
            if (ev.key === 'Enter') {
                ev.stopPropagation();
                ev.preventDefault();
                ElementRef.current?.blur();
            }
        }
        
        ElementRef.current?.addEventListener("mouseup", OnClick);
        ElementRef.current?.addEventListener("focusin", OnFocus);
        ElementRef.current?.addEventListener("focusout", OnFocusOut);
        // prevent enter breaking new line
        ElementRef.current?.addEventListener("keydown", OnKeydown);
        
        return () => {
            ElementRef.current?.removeEventListener("mouseup", OnClick);
            ElementRef.current?.removeEventListener("focusin", OnFocus);
            ElementRef.current?.removeEventListener("focusout", OnFocusOut);
            
            ElementRef.current?.removeEventListener("keydown", OnKeydown);
        }
    }, [ElementRef.current!])
    
    return React.createElement(tagName, {
        tabIndex: -1,
        contentEditable: isEditing,
        suppressContentEditableWarning: true,
        ...otherProps,
        ref: ElementRef,
    }, isEditing ? childrenWithSyntax : children);
    
}