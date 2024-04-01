import React from "react";
import {renderToString} from "react-dom/server";
import {MD2HTMLSync} from "../Utils/Conversion";

/**
 * Run a html text node through the conversion, may result in a mixture of text and element nodes.
 * Used in the editor as well as plainSyntax component.
 * @param textNode - the node to be processed
 */
export function TextNodeProcessor(textNode: Node | string) {
    
    if (typeof textNode === 'string')
        textNode = document.createTextNode(textNode);
    
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

/**
 * Retrieves the HTML string representation of child nodes.
 *
 * @param {NodeListOf<ChildNode> | undefined} ChildNodes - The child nodes to be converted to HTML string.
 * @returns {string} - The HTML string representation of the child nodes.
 */
export function GetChildNodesAsHTMLString(ChildNodes: NodeListOf<ChildNode> | undefined): string {
    let htmlString = '';
    
    if (!ChildNodes)
        return htmlString;
    
    ChildNodes.forEach((node: ChildNode) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
            let element = node as HTMLElement;
            if (!element.hasAttribute('data-is-generated'))
                htmlString += element.outerHTML;
        } else if (node.nodeType === Node.TEXT_NODE) {
            htmlString += node.textContent;
        }
    });
    
    return htmlString;
}

/**
 * Get the Nearest "Paragraph" under the 'Element' arg, usually a p tag, but can also be ul/pre etc.
 * @param node - the child node
 * @param Element - the containers that contains the child node and the "Paragraph"
 */
export function FindNearestParagraph(node: Node, Element: HTMLElement): HTMLElement | null {
    
    let current: Node | null = node;
    while (current) {
        if (current.parentNode && current.parentNode === Element) {
            return current as HTMLElement;
        }
        current = current.parentNode;
    }
    return null;
}

/**
 * Retrieves the context of the caret within the current selection.
 *
 * @return {Object} - An object containing the current selection, the anchor node,
 *                   the remaining text from the caret position to the end of the node,
 *                   and the preceding text from the start of the node to the caret position.
 */
export function GetCaretContext(): {
    RemainingText: string;
    PrecedingText: string;
    CurrentSelection: Selection | null;
    CurrentAnchorNode: any
} {
    const CurrentSelection = window.getSelection();
    
    let RemainingText = '';
    let PrecedingText = '';
    let CurrentAnchorNode = undefined;
    
    if (CurrentSelection) {
        const Range = CurrentSelection.getRangeAt(0);
        
        CurrentAnchorNode = window.getSelection()?.anchorNode;
        
        let textContent: string | null = CurrentAnchorNode!.textContent;
        
        if (textContent) {
            RemainingText = textContent.substring(Range.startOffset, textContent.length);
            PrecedingText = textContent.substring(0, Range.startOffset);
        }
    }
    
    return {CurrentSelection, CurrentAnchorNode, RemainingText, PrecedingText};
    
}