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
import {GetRehyperRemarkHandlers} from "../UnifiedPlugins/HTMLToDirective";
import {EmptyDocHandler} from "../UnifiedPlugins/EmptyDocHandler";
import {AddKeyToElement} from "../UnifiedPlugins/AddKeyToElement";

/**
 * Initializes the Markdown processing pipeline.
 *
 * @return {Object} - Returns a unified processor object with a configured pipeline for processing Markdown.
 */
function MDProcessPipeline() {
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

export const MD2HTMLAsync = async (MarkdownContent: Compatible) => (MDProcessPipeline().process(MarkdownContent))

export const MD2HTMLSync = (MarkdownContent: Compatible) => (MDProcessPipeline().processSync(MarkdownContent))

// the config looks like this to satisfy rehypeReact's spec on option,
// IMPORTANT: after react 18.3.0, Fragment/jsx/jsxs will correctly provide the types, but the resulting config would be incompatible with rehypeReact 8.0
// until rehypeReact is updated, the structure will need to stay this way.
const jsxElementConfig: { Fragment: any, jsx: any, jsxs: any } = {
    Fragment: (reactJsxRuntime as any).Fragment,
    jsx: (reactJsxRuntime as any).jsx,
    jsxs: (reactJsxRuntime as any).jsxs
}

function HTML2ReactPipeline(componentOptions?: Record<string, React.FunctionComponent<any>>) {
    return unified()
        .use(rehypeParse, {fragment: true})
        .use(rehypeSanitize, GetSanitizeSchema()) //this plug remove some attrs/aspects that may be important.
        .use(AddSyntaxInAttribute)
        .use(rehypeReact, {
            ...jsxElementConfig,
            components: componentOptions
        })
}

export const HTML2ReactAsync = async (HTMLContent: Compatible, componentOptions?: Record<string, React.FunctionComponent<any>>) => (
    HTML2ReactPipeline(componentOptions)
        .process(HTMLContent));

export const HTML2ReactSync = (HTMLContent: Compatible, componentOptions?: Record<string, React.FunctionComponent<any>>) => (
    HTML2ReactPipeline(componentOptions)
        .processSync(HTMLContent));

/**
 * Cleans up HTML content by removing unnecessary elements and attributes.
 *
 * @param {Compatible} HTMLContent - The HTML content to be cleaned up.
 * @param {Object} [componentOptions] - Optional component options.
 * @return {string} - The cleaned up HTML content.
 */
export function HTMLCleanUP(HTMLContent: Compatible, componentOptions?: Record<string, React.FunctionComponent<any>>) {
    
    return unified()
        .use(rehypeParse, {fragment: true})
        .use(rehypeSanitize, GetSanitizeSchema()) //this plug remove some attrs/aspects that may be important.
        .use(CleanUpExtraText)
        .use(CleanupExtraTags)
        .use(CleanupEmptyElements)
        .use(ListElementHandler)
        .use(EmptyCodeHandler)
        .use(EmptyDocHandler)
        .use(AddKeyToElement)
        .use(rehypeStringify)
        .processSync(HTMLContent);
}

/**
 * Converts HTML content to Markdown format.
 *
 * @param {Compatible} CurrentContent - The HTML content to be converted.
 *
 * @return {Promise<string>} - The converted Markdown content.
 */
export async function HTML2MDSync(CurrentContent: Compatible) {
    
    const rehyperRemarkHandlers = GetRehyperRemarkHandlers();
    
    return unified()
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
        .processSync(CurrentContent);
    
}

/**
 * Returns a sanitized schema by cloning the default schema and adding an additional attribute.
 */
function GetSanitizeSchema() {
    let SanitizeSchema = Object.assign({}, defaultSchema);
    SanitizeSchema!.attributes!['*'] = SanitizeSchema!.attributes!['*'].concat(['data*'])
    return SanitizeSchema;
}