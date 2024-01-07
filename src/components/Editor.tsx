import React, {useEffect, useLayoutEffect, useRef, useState} from "react";
import {MD2HTML, HTML2MD, HTML2ReactSnyc, MD2HTMLSync} from "../Utils/Conversion";
import useEditorHTMLDaemon from "../hooks/useEditorHTMLDaemon";
import {Compatible} from "unified/lib";
import "./Editor.css";

const MarkdownFakeDate = `
 # Welcome to @[aaa] Editor! @[bbb]

 Hi! I'm ~~your~~ Markdown file in **Editor**.

 **custom** link **syntax**: @[ccc] AHHHHHHHHH [123](google.com)
 
 Test with no sibling
`
export default function Editor() {
    
    const [sourceMD, setSourceMD] = useState(MarkdownFakeDate);
    
    const EditorHTMLSourceRef = useRef<Document | null>(null);
    
    const EditorCurrentRef = useRef<HTMLElement | null>(null)
    
    const EditorHTMLString = useRef('');
    
    const [EditorContentCompo, setEditorContentCompo] = useState<React.ReactNode>(null)
    
    const DaemonHandle = useEditorHTMLDaemon(EditorCurrentRef, EditorHTMLSourceRef, ReloadEditorContent, {TextNodeCallback: TextNodeHandler});
    
    let ExtractMD = async () => {
        const ConvertedMarkdown = await HTML2MD(EditorHTMLString.current);
        
        console.log(String(ConvertedMarkdown));
    }
    
    async function ReloadEditorContent() {
        if (!EditorHTMLSourceRef.current) return;
        const bodyElement: HTMLBodyElement | null = EditorHTMLSourceRef.current.documentElement.querySelector('body');
        if (bodyElement)
            EditorHTMLString.current = String(bodyElement!.innerHTML);
        
        setEditorContentCompo((prev) => {
            return HTML2EditorCompos(EditorHTMLString.current)
        })
    }
    
    function TextNodeHandler(textNode: Node) {
        if (textNode.textContent === null) return;
        const convertedHTML = String(MD2HTMLSync(textNode.textContent));
        
        console.log(convertedHTML);
        
        return null;
    }
    
    // Map all possible text-containing tags to TextContainer component and therefore manage them.
    const TextNodesMappingConfig: Record<string, React.FunctionComponent<any>> = ['span', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'ul', 'ol', 'li', 'code', 'pre', 'em', 'strong', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'br', 'img', 'del', 'input', 'hr']
        .reduce((acc: Record<string, React.FunctionComponent<any>>, tagName: string) => {
            acc[tagName] = (props: any) => <SyntaxRenderer {...props} daemonHandle={DaemonHandle} tagName={tagName}/>;
            return acc;
        }, {});
    
    const HTML2EditorCompos = (md2HTML: Compatible) => {
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
}

const SyntaxRenderer = (props: any) => {
    
    const {children, tagName, daemonHandle, ...otherProps} = props;
    
    if (otherProps['data-link-to']) {
        return <SpecialLinkComponent {...props}/>
    }
    
    if (tagName === 'strong')
        return <TestCompo {...props}/>
    
    return React.createElement(tagName, otherProps, children);
};

function SpecialLinkComponent(props: any) {
    const {children, tagName, daemonHandle, ...otherProps} = props;
    return React.createElement(tagName, otherProps, children);
}

function TestCompo(props: any) {
    const {children, tagName, daemonHandle, ...otherProps} = props;
    const [isEditSyntax, setIsEditSyntax] = useState(false);
    const ElementRef = useRef<HTMLElement | null>(null);
    const isClickInside = useRef(false);
    const isCaretMovedInside = useRef(false);
    
    useEffect(() => {
        daemonHandle.toggleObserve(true);
    }, [isEditSyntax]);
    
    useEffect(() => {
        
        // if (isEditSyntax)
        //     ElementRef.current?.focus();
        
        const onRenderTagClick = (ev: any) => {
            ElementRef.current?.focus();
        }
        
        const Focusin = () => {
            if (!isEditSyntax) {
                daemonHandle.toggleObserve(false);
                setIsEditSyntax(true);
            }
        }
        
        const onMouseDown = () => {
            isClickInside.current = true;
        };
        
        const onMouseUp = () => {
            isClickInside.current = false;
        };
        
        const onTextBlur = (ev: HTMLElementEventMap['focusout']) => {
            if (isClickInside.current || isCaretMovedInside.current) {
                return;
            }
            console.log("AAAAAAA");
        }
        
        
        ElementRef.current?.addEventListener('click', onRenderTagClick);
        
        ElementRef.current?.addEventListener('mousedown', onMouseDown);
        ElementRef.current?.addEventListener('mouseup', onMouseUp);
        
        ElementRef.current?.addEventListener('focusin', Focusin);
        ElementRef.current?.addEventListener('focusout', onTextBlur);
        
        return () => {
            ElementRef.current?.removeEventListener('click', onRenderTagClick);
            
            ElementRef.current?.removeEventListener('mousedown', onMouseDown);
            ElementRef.current?.removeEventListener('mouseup', onMouseUp);
            
            ElementRef.current?.removeEventListener('focusin', Focusin);
            ElementRef.current?.removeEventListener('focusout', onTextBlur);
            
        }
    });
    
    // TODO: proper syntax wrapping
    let renderChildren = children;
    if (typeof children === 'string' && (!children.startsWith('***') || !children.endsWith('***'))) {
        // If children are text and not already wrapped with "***", wrap them.
        renderChildren = `***${children}***`;
    }
    
    
    return React.createElement(tagName, {
        ...otherProps,
        tabIndex: -1,
        ref: ElementRef
    }, isEditSyntax ? renderChildren : children)
}