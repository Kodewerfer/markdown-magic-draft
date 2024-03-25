import React from "react";
import {renderToString} from "react-dom/server";
import {MD2HTMLSync} from "../Utils/Conversion";

/**
 * Run a html text node through the conversion, may result in a mixture of text and element nodes.
 * Used in the editor as well as plainSyntax component.
 * @param textNode - the node to be processed
 */
export function TextNodeProcessor(textNode: Node) {
    if (textNode.textContent === null) {
        console.warn(textNode, " Not a text node.");
        return
    }
    const convertedHTML = String(MD2HTMLSync(textNode.textContent));
    
    let TemplateConverter: HTMLTemplateElement = document.createElement('template');
    TemplateConverter.innerHTML = convertedHTML;
    const TemplateChildNodes: NodeListOf<ChildNode> = TemplateConverter.content.childNodes;
    
    // New node for the daemon
    let NewNodes: Node[] = [];
    
    // Normal case where the P tag was added by the converter serving as a simple wrapper.
    if (TemplateChildNodes.length === 1 && TemplateChildNodes[0].nodeType === Node.ELEMENT_NODE && (TemplateChildNodes[0] as HTMLElement).tagName.toLowerCase() === 'p') {
        
        let WrapperTag = TemplateConverter.content.children[0];
        NewNodes = [...WrapperTag.childNodes];
        if (!NewNodes.length) return null;
        
        return NewNodes;
    }
    
    // Multiple element are at the top level result, eg: textnode + p tag + textnode. (Not really likely at the moment)
    if (TemplateChildNodes.length > 1) {
        NewNodes = [...TemplateChildNodes];
        console.warn("TextNodeProcessor: Multiple top level nodes.");
        return NewNodes;
    }
    
    // top level element is one single "composite" element, the likes of "Blockquote"/"UL"/"pre"
    NewNodes = [...TemplateChildNodes];
    return NewNodes;
}

/**
 * Render the child prop as string, in order to store it as a ref.
 * used in Paragraph component where there may be a React generated child.
 * @param children
 */
export function ExtraRealChild(children: React.ReactNode[] | React.ReactNode) {
    let ActualChildren;
    if (Array.isArray(children)) {
        ActualChildren = [...children];
    } else {
        ActualChildren = [children];
    }
    const ElementStrings = ActualChildren.map(element =>
        renderToString(element));
    
    return ElementStrings.join('');
}