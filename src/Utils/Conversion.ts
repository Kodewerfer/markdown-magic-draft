import React, {} from "react";
import * as reactJsxRuntime from 'react/jsx-runtime'
import {unified} from "unified";
import {Compatible} from "unified/lib";
import {u} from 'unist-builder'

import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import remarkStringify from "remark-stringify";
import rehypeParse from "rehype-parse";
import rehypeReact from "rehype-react";
import rehypeSanitize, {defaultSchema} from "rehype-sanitize";
import rehypeRemark from "rehype-remark";
import rehypeStringify from "rehype-stringify";
import remarkDirective from "remark-directive";

import HandleCustomDirectives from "../UnifiedPlugins/HandleCustomDirectives";
import {AddSyntaxInAttribute} from "../UnifiedPlugins/AddSyntaxInAttribute";

let SanitizSchema = Object.assign({}, defaultSchema);
SanitizSchema!.attributes!['*'] = SanitizSchema!.attributes!['*'].concat(['data*'])

function MDProcess() {
    return unified()
        .use(remarkParse)
        .use(remarkGfm)
        .use(remarkDirective)
        .use(HandleCustomDirectives)
        .use(remarkRehype)
        .use(rehypeSanitize, SanitizSchema)
        .use(AddSyntaxInAttribute)
        .use(rehypeStringify);
}

export async function MD2HTML(MarkdownContent: Compatible) {
    
    return MDProcess()
        .process(MarkdownContent);
}

export function MD2HTMLSync(MarkdownContent: Compatible) {
    return MDProcess()
        .processSync(MarkdownContent);
}

// @ts-expect-error: the react types are missing.
const jsxElementConfig = {Fragment: reactJsxRuntime.Fragment, jsx: reactJsxRuntime.jsx, jsxs: reactJsxRuntime.jsxs}

export async function HTML2React(HTMLContent: Compatible, componentOptions?: Record<string, React.FunctionComponent<any>>) {
    
    return await unified()
        .use(rehypeParse, {fragment: true})
        .use(rehypeSanitize, SanitizSchema) //this plug remove some attrs/aspects that may be important.
        .use(AddSyntaxInAttribute)
        .use(rehypeReact, {
            ...jsxElementConfig,
            components: componentOptions
        })
        .process(HTMLContent);
}

export function HTML2ReactSnyc(HTMLContent: Compatible, componentOptions?: Record<string, React.FunctionComponent<any>>) {
    
    return unified()
        .use(rehypeParse, {fragment: true})
        .use(rehypeSanitize, SanitizSchema) //this plug remove some attrs/aspects that may be important.
        .use(AddSyntaxInAttribute)
        .use(rehypeReact, {
            ...jsxElementConfig,
            components: componentOptions
        })
        .processSync(HTMLContent);
}

export async function HTML2MD(CurrentContent: Compatible) {
    
    const rehyperRemarkHandlers = GetRehyperRemarkHandlers();
    
    return await unified()
        .use(rehypeParse)
        .use(remarkGfm)
        .use(rehypeRemark, {
            handlers: rehyperRemarkHandlers
        })
        .use(remarkStringify, {
            handlers: {
                'text': (node, parent, state) => {
                    // This is to "unescape" the MD syntax such as [ or *,
                    return node.value;
                }
            }
        })
        .process(CurrentContent);
    
}

function GetRehyperRemarkHandlers() {
    return {
        'br': (State: any, Node: any) => {
            const result = u('text', ':br');
            State.patch(Node, result);
            return result;
        },
        'span': (State: any, Node: any) => {
            const LinkedTarget = Node.properties['dataLinkTo'];
            if (!LinkedTarget || LinkedTarget === '') {
                return;
            }
            
            const FirstTextNode = Node.children[0];
            if (!(typeof FirstTextNode === 'object') || !('value' in FirstTextNode))
                return;
            
            let TextDirectiveContent: string;
            
            if (LinkedTarget === FirstTextNode.value)
                TextDirectiveContent = `:LinkTo[${LinkedTarget}]`
            else
                TextDirectiveContent = `:LinkTo[${FirstTextNode.value}]{${LinkedTarget}}`
            
            const result = u('text', TextDirectiveContent);
            
            State.patch(Node, result);
            return result;
        }
    };
}