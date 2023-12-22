import React, {
    useState,
    useEffect,
    createElement,
    Fragment,
    useRef
} from "react";
import {renderToString} from "react-dom/server";
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

import {MDSpecialLinks, HTMLSpecialLinks} from "../UnifiedPlugins/SpecialLinksSyntax"
import useEditMonitor from "../hooks/useEditMonitor";

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

// Map all relevant tags to TextContainer
const TextNodes = ['a', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'ul', 'ol', 'li', 'code', 'pre', 'em', 'strong']
    .reduce((acc: Record<string, React.FunctionComponent<any>>, tagName: string) => {
        acc[tagName] = (props: any) => <TextContainer {...props} tagName={tagName}/>;
        return acc;
    }, {});

// @ts-expect-error: the react types are missing.
const jsxElementConfig = {Fragment: reactJsxRuntime.Fragment, jsx: reactJsxRuntime.jsx, jsxs: reactJsxRuntime.jsxs}

export default function Editor() {


    const MakrdownContent = `
 # Welcome to @[aaa] Editor! @[bbb]

 Hi! I'm your first Markdown file in **Editor**.

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
                .use(MDSpecialLinks)
                .use(rehypeStringify)
                .process(MakrdownContent);


            let ReactElementOutput = await unified()
                .use(rehypeParse, {fragment: true})
                .use(rehypeReact, {
                    ...jsxElementConfig,
                    components: {
                        ...TextNodes,
                        "span": (props: any) => <SpecialLinkComponent {...props} />
                    }
                })
                .process(htmlOutput);

            setCurrentContent(ReactElementOutput.result);
        })()

    }, [])

    let HTMLToMD = async () => {

        let MDOutput = await unified()
            .use(rehypeParse)
            .use(HTMLSpecialLinks)
            .use(rehypeRemark)
            .use(remarkStringify)
            .process(renderToString(CurrentContent));

        console.log(String(MDOutput));
    }

    // useEditMonitor(EditorRef);

    return (
        <>
            <button className={"bg-amber-600"} onClick={HTMLToMD}>Save</button>
            <div className="Editor" ref={EditorRef}>
                {CurrentContent}
            </div>
        </>
    )
}

