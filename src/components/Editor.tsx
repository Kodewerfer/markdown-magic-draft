import React, {useEffect, useLayoutEffect, useRef, useState} from "react";
import {HTML2MD, HTML2ReactSnyc, MD2HTML, MD2HTMLSync} from "../Utils/Conversion";
import useEditorHTMLDaemon from "../hooks/useEditorHTMLDaemon";
import {Compatible} from "unified/lib";
import "./Editor.css";
import _ from 'lodash';

const MarkdownFakeDate = `
# Welcome to :LinkTo[AAA, A1A]{aaa} Editor! :LinkTo[BBB]

Hi! I'm ~~your~~ Markdown file in **Editor**.

**custom** link **syntax**: :LinkTo[CCC] AHHHHHHHHH [123](google.com)

:br

:br

Test with no sibling

\`\`\`javascript
var s = "JavaScript syntax highlighting";
alert(s);
\`\`\`

:br

- list1
+ list2
+ list3

`

type TSubElementsQueue = {
    [key: string]: HTMLElement | null;
};
export default function Editor() {
    const [sourceMD, setSourceMD] = useState(MarkdownFakeDate);
    const EditorHTMLSourceRef = useRef<Document | null>(null);
    const EditorCurrentRef = useRef<HTMLElement | null>(null);
    const EditorHTMLString = useRef('');
    
    const [EditorContentCompo, setEditorContentCompo] = useState<React.ReactNode>(null);
    
    const [isEditingSubElement, setIsEditingSubElement] = useState(false);
    const EditingQueue: React.MutableRefObject<TSubElementsQueue> = useRef<TSubElementsQueue>({});
    
    const DaemonHandle = useEditorHTMLDaemon(EditorCurrentRef, EditorHTMLSourceRef, ReloadEditorContent,
        {
            TextNodeCallback: TextNodeHandler,
            IsEditable: !isEditingSubElement,
            ShouldObserve: !isEditingSubElement
        });
    
    const ExtractMD = async () => {
        const ConvertedMarkdown = await HTML2MD(EditorHTMLString.current);
        console.log(String(ConvertedMarkdown));
    }
    
    async function ReloadEditorContent() {
        if (!EditorHTMLSourceRef.current) return;
        const bodyElement: HTMLBodyElement | null = EditorHTMLSourceRef.current.documentElement.querySelector('body');
        if (bodyElement)
            EditorHTMLString.current = String(bodyElement!.innerHTML);
        
        // FIXME
        // console.log(EditorHTMLString.current);
        
        setEditorContentCompo((prev) => {
            return HTML2EditorCompos(EditorHTMLString.current)
        });
    }
    
    const toggleEditingSubElement = (bSubEditing: boolean, Identifier: string, ElementRef: HTMLElement, ChangeRecord?: MutationRecord) => {
        if (!Identifier) {
            console.warn('Editing Sub Element with invalid Identifier', ElementRef);
            return;
        }
        
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
        console.log(EditingQueue.current);
        setIsEditingSubElement(true);
    }
    
    function TextNodeHandler(textNode: Node) {
        if (textNode.textContent === null) return;
        const convertedHTML = String(MD2HTMLSync(textNode.textContent));
        
        let HTMLStringNoWrapper = new DOMParser().parseFromString(convertedHTML, "text/html");
        
        const treeWalker: TreeWalker = HTMLStringNoWrapper.createTreeWalker(HTMLStringNoWrapper, NodeFilter.SHOW_TEXT);
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
    
    
    const HTML2EditorCompos = (md2HTML: Compatible) => {
        
        // Map all possible text-containing tags to TextContainer component and therefore manage them.
        const TextNodesMappingConfig: Record<string, React.FunctionComponent<any>> = ['span', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'ul', 'ol', 'li', 'code', 'pre', 'em', 'strong', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'br', 'img', 'del', 'input', 'hr']
            .reduce((acc: Record<string, React.FunctionComponent<any>>, tagName: string) => {
                acc[tagName] = (props: any) => {
                    if (props['data-md-syntax'])
                        // console.log(props)
                    if (props['data-link-to']) {
                        return <SpecialLinkComponent {...props}
                                                     ParentAction={toggleEditingSubElement}
                                                     tagName={tagName}/>;
                    }
                    return <SyntaxRenderer {...props}
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
    };
    
    useEffect(() => {
        ;(async () => {
            // convert MD to HTML
            const md2HTML = await MD2HTML(sourceMD);
            
            // Save a copy of HTML
            const HTMLParser = new DOMParser()
            EditorHTMLSourceRef.current = HTMLParser.parseFromString(String(md2HTML), "text/html");
            EditorHTMLString.current = String(md2HTML);
            setEditorContentCompo((prev) => {
                return HTML2EditorCompos(EditorHTMLString.current)
            })
        })()
        
    }, [sourceMD])
    
    return (
        <>
            <button className={"bg-amber-600"} onClick={ExtractMD}>Save</button>
            <section className="Editor">
                <main className={'Editor-Inner'} ref={EditorCurrentRef}>
                    {EditorContentCompo}
                </main>
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

const SyntaxRenderer = (props: any) => {
    const {children, tagName, ParentAction, ...otherProps} = props;
    
    // if (otherProps['data-link-to']) {
    //     return <SpecialLinkComponent {...props}/>
    // }
    
    if (tagName === 'strong')
        return <TestCompo {...props}/>
    
    return React.createElement(tagName, otherProps, children);
};

function SpecialLinkComponent(props: any) {
    const {children, tagName, ParentAction, ...otherProps} = props;
    return React.createElement(tagName, otherProps, children);
}

function TestCompo(props: any) {
    const {tagName, ParentAction, ...otherProps} = props;
    let {children} = props;
    
    const ElementRef = useRef<HTMLElement | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const IdentifierRef = useRef<string | undefined>(undefined);
    
    useLayoutEffect(() => {
        const OnClick = (ev: Event) => {
            ev.stopPropagation();
            ElementRef.current?.focus();
            
            if (!isEditing)
                setIsEditing(true);
        };
        
        const OnFocus = (ev: HTMLElementEventMap['focusin']) => {
            ev.stopPropagation();
            
            const timestamp = new Date().valueOf();
            const generatedId: string = _.uniqueId("_" + ElementRef.current?.tagName.toLowerCase());
            IdentifierRef.current = timestamp + generatedId;
            
            ParentAction(true, IdentifierRef.current, ElementRef.current);
        };
        
        const OnFocusOut = (ev: Event) => {
            ev.stopPropagation();
            
            let mutation = {
                type: "characterData",
                oldValue: ' ',
                target: ElementRef.current?.firstChild!,
                newValue: ElementRef.current?.firstChild!.nodeValue
            };
            
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
    })
    
    return React.createElement(tagName, {
        tabIndex: -1,
        contentEditable: isEditing,
        suppressContentEditableWarning: true,
        ...otherProps,
        ref: ElementRef,
    }, children)
    
}