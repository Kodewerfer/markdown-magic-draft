import React, {createElement, Fragment, useEffect, useRef, useState} from "react";
import {HTML2React, MD2HTML, HTML2MD, HTML2ReactSnyc} from "../Utils/Conversion";
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
    
    const [EditorHTMLString, setEditorHTMLString] = useState('');
    
    
    useEffect(() => {
        ;(async () => {
            // convert MD to HTML
            const md2HTML = await MD2HTML(sourceMD);
            
            // Save a copy of HTML
            const HTMLParser = new DOMParser()
            EditorHTMLSourceRef.current = HTMLParser.parseFromString(String(md2HTML), "text/html");
            
            setEditorHTMLString(String(md2HTML));
        })()
        
    }, [sourceMD])
    
    let ExtractMD = async () => {
        const ConvertedMarkdown = await HTML2MD(EditorHTMLString);
        
        console.log(String(ConvertedMarkdown));
    }
    
    let ReloadEditorContent = async () => {
        if (!EditorHTMLSourceRef.current) return;
        const bodyElement: HTMLBodyElement | null = EditorHTMLSourceRef.current.documentElement.querySelector('body');
        if (bodyElement)
            setEditorHTMLString(String(bodyElement!.innerHTML))
    }
    
    useEditorHTMLDaemon(EditorCurrentRef, EditorHTMLSourceRef, ReloadEditorContent);
    
    return (
        <>
            <button className={"bg-amber-600"} onClick={ExtractMD}>Save</button>
            <section className="Editor">
                <main className={'Editor-Inner'} ref={EditorCurrentRef}>
                    {HTML2EditorCompos(EditorHTMLString).result}
                </main>
            </section>
        </>
    )
}

// Map all possible text-containing tags to TextContainer component and therefore manage them.
const TextNodesMappingConfig = ['span', 'a', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'ul', 'ol', 'li', 'code', 'pre', 'em', 'strong', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'br', 'img', 'del', 'input', 'hr']
    .reduce((acc: Record<string, React.FunctionComponent<any>>, tagName: string) => {
        acc[tagName] = (props: any) => <SyntaxRenderer {...props} tagName={tagName}/>;
        return acc;
    }, {});

const HTML2EditorCompos = (md2HTML: Compatible) => {
    const componentOptions = {
        ...TextNodesMappingConfig,
    }
    return HTML2ReactSnyc(md2HTML, componentOptions);
}

function SyntaxRenderer(props: any) {
    
    const {children, tagName, ...otherProps} = props;
    
    if (otherProps['data-link-to']) {
        return <SpecialLinkComponent {...props}/>
    }
    
    return React.createElement(tagName, otherProps, children);
}

function SpecialLinkComponent(props: any) {
    const {children, tagName, ...otherProps} = props;
    return React.createElement(tagName, otherProps, children);
}
