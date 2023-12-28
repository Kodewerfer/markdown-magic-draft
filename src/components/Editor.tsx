import React, {createElement, Fragment, useEffect, useRef, useState} from "react";
import {HTML2React, MD2HTML} from "../Utils/Conversion";
import useEditorHTMLDaemon from "../hooks/useEditorHTMLDaemon";
import {Compatible} from "unified/lib";
import {renderToString} from "react-dom/server";

const MarkdownFakeDate = `
 # Welcome to @[aaa] Editor! @[bbb]

 Hi! I'm your first Markdown file in **Editor**.

 custom link **syntax**: @[ccc] AHHHHHHHHH
 
 Test with no sibling
`
export default function Editor() {

    const [sourceMD, setSourceMD] = useState(MarkdownFakeDate);

    const EditorHTMLSourceRef = useRef<Document | null>(null);

    const [EditorContent, setEditorContent] = useState(createElement(Fragment));

    //Has to set the type for typescript
    const EditorCurrentRef = useRef<HTMLElement | null>(null)


    useEffect(() => {
        ;(async () => {
            // convert MD to HTML
            const md2HTML = await MD2HTML(sourceMD);

            // Convert HTML to React
            const convertToComponents = await HTML2EditorCompos(md2HTML);

            // Save a copy of HTML
            const HTMLParser = new DOMParser()
            EditorHTMLSourceRef.current = HTMLParser.parseFromString(renderToString(convertToComponents.result), "text/html");

            // Set render
            setEditorContent(convertToComponents.result);

        })()

    }, [sourceMD])

    let ExtractMD = () => {

    }

    let ReloadEditorContent = async () => {
        if (!EditorHTMLSourceRef.current) return;
        const NewComponents = await HTML2EditorCompos(EditorHTMLSourceRef.current?.documentElement.innerHTML);

        setEditorContent(NewComponents.result);
    }

    useEditorHTMLDaemon(EditorCurrentRef, EditorHTMLSourceRef, ReloadEditorContent);

    return (
        <>
            <button className={"bg-amber-600"} onClick={ExtractMD}>Save</button>
            <section className="Editor">
                <main className={'Editor-Inner'} ref={EditorCurrentRef}>
                    {EditorContent}
                </main>
            </section>
        </>
    )
}

// Map all possible text-containing tags to TextContainer component and therefore manage them.
const TextNodesMappingConfig = ['a', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'ul', 'ol', 'li', 'code', 'pre', 'em', 'strong']
    .reduce((acc: Record<string, React.FunctionComponent<any>>, tagName: string) => {
        acc[tagName] = (props: any) => <TextContainer {...props} tagName={tagName}/>;
        return acc;
    }, {});

const HTML2EditorCompos = async (md2HTML: Compatible) => {
    const componentOptions = {
        ...TextNodesMappingConfig,
        "span": (props: any) => <SpecialLinkComponent {...props}/>
    }

    return await HTML2React(md2HTML, componentOptions);
}

function TextContainer(props: any) {

    const {children, tagName, ...otherProps} = props;

    const NewChildrenNodes = React.Children.map(children,
        (childNode) =>
            typeof childNode === 'string'
                ? <TextWrapper>{childNode}</TextWrapper>
                : childNode
    );

    return React.createElement(tagName, otherProps, NewChildrenNodes);
}

function SpecialLinkComponent(props: any) {
    const {children, ...otherProps} = props;
    return React.createElement('span', otherProps, children);
}

function TextWrapper(props: any) {
    const {children} = props;
    return (
        <span className={"Text-Wrapper"}>{children}</span>
    )
}
