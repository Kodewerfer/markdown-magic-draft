import {unified} from "unified";
import {Compatible} from "unified/lib";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import {HTMLSpecialLinks, MDSpecialLinks} from "./UnifiedPlugins/SpecialLinksSyntax";
import rehypeStringify from "rehype-stringify";
import rehypeParse from "rehype-parse";
import rehypeReact from "rehype-react";
import rehypeRemark from "rehype-remark";
import remarkStringify from "remark-stringify";
import React, {} from "react";
import * as reactJsxRuntime from 'react/jsx-runtime'


export async function MD2HTML(MarkdownContent: Compatible) {
    return await unified()
        .use(remarkParse)
        // .use(TestPlugin)
        .use(remarkGfm)
        .use(remarkRehype)
        .use(MDSpecialLinks)
        .use(rehypeStringify)
        .process(MarkdownContent);
}

// @ts-expect-error: the react types are missing.
const jsxElementConfig = {Fragment: reactJsxRuntime.Fragment, jsx: reactJsxRuntime.jsx, jsxs: reactJsxRuntime.jsxs}

type ComponentOptions = {
    [tagName: string]: React.ComponentType<any> | (() => React.ComponentType<any>);
}

export async function HTML2React(HTMLContent: Compatible, componentOptions?: ComponentOptions) {
    return await unified()
        .use(rehypeParse, {fragment: true})
        .use(rehypeReact, {
            ...jsxElementConfig,
            components: componentOptions
        }).process(HTMLContent);
}

export async function HTML2MD(CurrentContent: Compatible) {

    return await unified()
        .use(rehypeParse)
        .use(HTMLSpecialLinks)
        .use(rehypeRemark)
        .use(remarkStringify)
        .process(CurrentContent);

}