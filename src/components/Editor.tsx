import React, {useState, useEffect, createElement, Fragment, useMemo, useRef, DOMElement, ReactNode} from "react";
import {unified} from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'
import * as reactJsxRuntime from 'react/jsx-runtime'
import rehypeReact from "rehype-react";
import rehypeParse from "rehype-parse";
import rehypeRemark from "rehype-remark";
import remarkStringify from "remark-stringify";

import SpecialLinkSyntax from "../ASTTransformer/SpecialLinkSyntax"

// @ts-expect-error: the react types are missing.
const jsxElementConfig = {Fragment: reactJsxRuntime.Fragment, jsx: reactJsxRuntime.jsx, jsxs: reactJsxRuntime.jsxs}

function EditableInner({DisplayValue, onChange}: { DisplayValue?: any, onChange?: Function }) {

    const EditableRef = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
        if (DisplayValue && EditableRef.current && EditableRef.current.textContent !== DisplayValue) {
            EditableRef.current.textContent = DisplayValue;
        }
    });

    return (
        <div
            contentEditable="true"
            ref={EditableRef}
            onInput={event => {
                if (onChange)
                    onChange((event.target as HTMLElement)?.innerHTML);
            }}
        />
    );
}

export default function Editor() {


    const MakrdownContent = `
 # Welcome to @[aaa] StackEdit! @[bbbb]

 Hi! I'm your first Markdown file in **StackEdit**.

custom link **syntax**: @[ccc] AHHHHHHHHH
    `

    const [CurrentContent, setCurrentContent] = useState(createElement(Fragment));
    //Has to set the type for typescript
    const EditorRef = useRef<HTMLDivElement | null>(null)


    useEffect(() => {
        ;(async () => {
            let htmlOutput = await unified()
                .use(remarkParse)
                .use(remarkGfm)
                .use(remarkRehype)
                .use(SpecialLinkSyntax)
                .use(rehypeStringify)
                .process(MakrdownContent);

            // console.log(String(htmlOutput))


            let ReactElementOutput = await unified()
                .use(rehypeParse, {fragment: true})
                .use(rehypeReact, {
                    ...jsxElementConfig
                })
                .process(htmlOutput);

            setCurrentContent(ReactElementOutput.result);
        })()

    }, [])


    // let SaveToFile = async () => {
    //
    //     let MDOutput = await unified()
    //         .use(rehypeParse)
    //         .use(rehypeRemark)
    //         .use(remarkStringify)
    //         .process(EditorRef.current?.innerHTML);
    //
    //     console.log(String(MDOutput));
    // }


    let OnInnerChange = (value: String) => {
        console.log(value);
    }

    //  <span data-editor="keep">###aaa</span>
    return (
        <>
            <button className={"bg-amber-600"}>Save</button>
            <div className="Editor" ref={EditorRef}>
                {CurrentContent}
            </div>
        </>
    )
}

