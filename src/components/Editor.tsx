import React, {useEffect, useLayoutEffect, useRef, useState} from "react";
import {MD2HTML, HTML2MD, HTML2ReactSnyc, MD2HTMLSync} from "../Utils/Conversion";
import useEditorHTMLDaemon from "../hooks/useEditorHTMLDaemon";
import {Compatible} from "unified/lib";
import "./Editor.css";
import {computed, effect, signal} from "@preact/signals-react";
import {useSignals} from "@preact/signals-react/runtime";

const MarkdownFakeDate = `
 # Welcome to @[aaa] Editor! @[bbb]

 Hi! I'm ~~your~~ Markdown file in **Editor**.

 **custom** link **syntax**: @[ccc] AHHHHHHHHH [123](google.com)
 
 Test with no sibling
`

const ActiveElementSignal = signal<HTMLElement | null>(null);
export default function Editor() {
    const [sourceMD, setSourceMD] = useState(MarkdownFakeDate);
    const EditorHTMLSourceRef = useRef<Document | null>(null);
    const EditorCurrentRef = useRef<HTMLElement | null>(null);
    const EditorHTMLString = useRef('');
    const [EditorContentCompo, setEditorContentCompo] = useState<React.ReactNode>(null);
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
        });
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
    
    // Map all possible text-containing tags to TextContainer component and therefore manage them.
    const TextNodesMappingConfig: Record<string, React.FunctionComponent<any>> = ['span', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'ul', 'ol', 'li', 'code', 'pre', 'em', 'strong', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'br', 'img', 'del', 'input', 'hr']
        .reduce((acc: Record<string, React.FunctionComponent<any>>, tagName: string) => {
            acc[tagName] = (props: any) => <SyntaxRenderer {...props} DaemonHandle={DaemonHandle} tagName={tagName}/>;
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
    
    useLayoutEffect(() => {
        const EditableClick = (ev: HTMLElementEventMap['click']) => {
            ActiveElementSignal.value = (ev.target as HTMLElement);
        };
        
        EditorCurrentRef.current?.addEventListener('click', EditableClick);
        
        return () => {
            EditorCurrentRef.current?.removeEventListener('click', EditableClick);
        }
        
    }, [EditorCurrentRef.current!])
    
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
    const {children, tagName, DaemonHandle, ...otherProps} = props;
    
    if (otherProps['data-link-to']) {
        return <SpecialLinkComponent {...props}/>
    }
    
    if (tagName === 'strong')
        return <TestCompo {...props}/>
    
    return React.createElement(tagName, otherProps, children);
};

function SpecialLinkComponent(props: any) {
    const {children, tagName, DaemonHandle, ...otherProps} = props;
    return React.createElement(tagName, otherProps, children);
}

function TestCompo(props: any) {
    useSignals(); // turn the component to signal reactive
    const {tagName, DaemonHandle, ...otherProps} = props;
    let {children} = props;
    const ElementRef = useRef<HTMLElement | null>(null);
    const LastEditingSignal = useRef<boolean | undefined>(undefined);
    
    const IsEditingSignal = computed(() => {
        return (ElementRef.current !== null
            && ActiveElementSignal.value !== null
            && ActiveElementSignal.value === ElementRef.current);
    })
    
    const RenderedContent = computed(() => {
        if (IsEditingSignal.value && typeof children === 'string') {
            ElementRef.current?.setAttribute('data-to-be-replaced', '');
            return `**${children}**`;
        }
        
        ElementRef.current?.removeAttribute('data-to-be-replaced');
        return children;
    })
    
    
    return React.createElement(tagName, {
        ...otherProps,
        ref: ElementRef,
    }, RenderedContent)
    
}