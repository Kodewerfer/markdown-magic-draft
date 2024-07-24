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
import {CleanupExtraTags} from "../UnifiedPlugins/CleanupExtraTags";
import {CleanupEmptyElements} from "../UnifiedPlugins/CleanupEmptyElements";
import {ListElementHandler} from "../UnifiedPlugins/ListElementHandler";
import {EmptyCodeHandler} from "../UnifiedPlugins/EmptyCodeHandler";
import {CleanUpExtraText} from "../UnifiedPlugins/CleanupExtraText";

function MDProcess() {
    return unified()
        .use(remarkParse)
        .use(remarkGfm)
        .use(remarkDirective)
        .use(HandleCustomDirectives)
        .use(remarkRehype)
        .use(rehypeSanitize, GetSanitizeSchema())
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

// the config looks like this to satisfy rehypeReact's spec on option,
// after react 18.3.0, Fragment/jsx/jsxs will correctly provide the types, but the resulting config would be incompatible with rehypeReact 8.0
// until rehypeReact is updated, the structure will need to stay this way.
const jsxElementConfig: { Fragment: any, jsx: any, jsxs: any } = {
    Fragment: (reactJsxRuntime as any).Fragment,
    jsx: (reactJsxRuntime as any).jsx,
    jsxs: (reactJsxRuntime as any).jsxs
}

export async function HTML2React(HTMLContent: Compatible, componentOptions?: Record<string, React.FunctionComponent<any>>) {
    
    return await unified()
        .use(rehypeParse, {fragment: true})
        .use(rehypeSanitize, GetSanitizeSchema()) //this plug remove some attrs/aspects that may be important.
        .use(CleanUpExtraText)
        .use(CleanupExtraTags)
        .use(CleanupEmptyElements)
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
        .use(rehypeSanitize, GetSanitizeSchema()) //this plug remove some attrs/aspects that may be important.
        .use(CleanUpExtraText)
        .use(CleanupExtraTags)
        .use(CleanupEmptyElements)
        .use(AddSyntaxInAttribute)
        .use(rehypeReact, {
            ...jsxElementConfig,
            components: componentOptions
        })
        .processSync(HTMLContent);
}

export function HTMLCleanUP(HTMLContent: Compatible, componentOptions?: Record<string, React.FunctionComponent<any>>) {
    
    return unified()
        .use(rehypeParse, {fragment: true})
        .use(rehypeSanitize, GetSanitizeSchema()) //this plug remove some attrs/aspects that may be important.
        .use(CleanUpExtraText)
        .use(CleanupExtraTags)
        .use(CleanupEmptyElements)
        .use(ListElementHandler)
        .use(EmptyCodeHandler)
        .use(rehypeStringify)
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

// Handles custom directive conversion from HTML to MD
function GetRehyperRemarkHandlers() {
    return {
        'br': (State: any, Node: any) => {
            const result = u('text', ':br');
            State.patch(Node, result);
            return result;
        },
        'span': (State: any, Node: any) => {
            const LinkedTarget = Node.properties['dataTagLink'];
            if (!LinkedTarget || LinkedTarget === '') {
                return;
            }
            
            const FirstTextNode = Node.children[0];
            if (!(typeof FirstTextNode === 'object') || !('value' in FirstTextNode))
                return;
            
            let TextDirectiveContent: string;
            
            if (LinkedTarget === FirstTextNode.value)
                TextDirectiveContent = `:Tag[${LinkedTarget}]`
            else
                TextDirectiveContent = `:Tag[${FirstTextNode.value}]{${LinkedTarget}}`
            
            const result = u('text', TextDirectiveContent);
            
            State.patch(Node, result);
            return result;
        }
    };
}

/**
 * Returns a sanitized schema by cloning the default schema and adding an additional attribute.
 */
function GetSanitizeSchema() {
    let SanitizeSchema = Object.assign({}, defaultSchema);
    SanitizeSchema!.attributes!['*'] = SanitizeSchema!.attributes!['*'].concat(['data*'])
    return SanitizeSchema;
}