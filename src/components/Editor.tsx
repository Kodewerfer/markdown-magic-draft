import React, {useEffect, useRef, useState} from "react";
import {MD2HTML, HTML2MD, HTML2ReactSnyc} from "../Utils/Conversion";
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
    
    const [EditorContentCompo, setEditorContentCompo] = useState(HTML2EditorCompos(EditorHTMLString.current))
    
    
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
    
    let ExtractMD = async () => {
        const ConvertedMarkdown = await HTML2MD(EditorHTMLString.current);
        
        console.log(String(ConvertedMarkdown));
    }
    
    let ReloadEditorContent = async () => {
        if (!EditorHTMLSourceRef.current) return;
        const bodyElement: HTMLBodyElement | null = EditorHTMLSourceRef.current.documentElement.querySelector('body');
        if (bodyElement)
            EditorHTMLString.current = String(bodyElement!.innerHTML);
        
        setEditorContentCompo((prev) => {
            return HTML2EditorCompos(EditorHTMLString.current)
        })
    }
    
    useEditorHTMLDaemon(EditorCurrentRef, EditorHTMLSourceRef, ReloadEditorContent);
    
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

// Map all possible text-containing tags to TextContainer component and therefore manage them.
const TextNodesMappingConfig: Record<string, React.FunctionComponent<any>> = ['span', 'a', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'ul', 'ol', 'li', 'code', 'pre', 'em', 'strong', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'br', 'img', 'del', 'input', 'hr']
    .reduce((acc: Record<string, React.FunctionComponent<any>>, tagName: string) => {
        acc[tagName] = (props: any) => <SyntaxRenderer {...props} tagName={tagName}/>;
        return acc;
    }, {});


const HTML2EditorCompos = (md2HTML: Compatible) => {
    const componentOptions = {
        ...TextNodesMappingConfig,
    }
    return HTML2ReactSnyc(md2HTML, componentOptions).result;
}

const SyntaxRenderer = (props: any) => {
    
    const {children, tagName, ...otherProps} = props;
    
    if (otherProps['data-link-to']) {
        return <SpecialLinkComponent {...props}/>
    }
    
    return React.createElement(tagName, otherProps, children);
};

function SpecialLinkComponent(props: any) {
    const {children, tagName, ...otherProps} = props;
    return React.createElement(tagName, otherProps, children);
}
