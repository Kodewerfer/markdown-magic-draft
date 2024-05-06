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
 * Returns the concatenated text content of the child nodes.
 *
 * @param {NodeListOf<ChildNode> | undefined} ChildNodes - The child nodes to extract the text content from.
 * @returns {string} The concatenated text content.
 */
export function GetChildNodesTextContent(ChildNodes: NodeListOf<ChildNode> | undefined): string {
    let textContent = '';
    
    if (!ChildNodes)
        return textContent;
    
    ChildNodes.forEach((node: ChildNode) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
            let element = node as HTMLElement;
            if (!element.hasAttribute('data-is-generated'))
                textContent += element.textContent;
        } else if (node.nodeType === Node.TEXT_NODE) {
            textContent += node.textContent;
        }
    });
    
    return textContent;
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

export function GetNextSiblings(node: Node): Node[] {
    let current: Node | null = node;
    const siblings: Node[] = [];
    while (current) {
        if (current.nextSibling) {
            siblings.push(current.nextSibling);
            current = current.nextSibling;
        } else {
            break;
        }
    }
    return siblings;
}


/**
 * Retrieves the context of the caret within the current selection.
 *
 * @return {Object} - An object containing the current selection, the anchor node,
 *                   the remaining text from the caret position to the end of the node,
 *                   and the preceding text from the start of the node to the caret position.
 */
export function GetCaretContext(): {
    /**
     * Text content before the caret position
     */
    PrecedingText: string;
    /**
     * If the selection is extended, this will be the selected text content
     * otherwise it will be null.
     */
    SelectedText: string | null;
    /**
     * Text content after the caret position,
     * DOES NOT account for extended selection.
     */
    RemainingText: string;
    /**
     * Actual remaining text content after the current selection,
     * If the selection is not extended, it will be same as RemainingText,
     * If the selection IS extended, it will be the remaining text after the extended selection.
     * returns as null, if the selection extend beyond the starting text node,
     */
    TextAfterSelection: string | null;
    CurrentSelection: Selection | null;
    CurrentAnchorNode: any
} {
    const CurrentSelection = window.getSelection();
    
    let RemainingText = '';
    let PrecedingText = '';
    let SelectedText: string | null = null;
    let TextAfterSelection: string | null = null;
    let CurrentAnchorNode = undefined;
    
    if (CurrentSelection) {
        const Range = CurrentSelection.getRangeAt(0);
        
        CurrentAnchorNode = window.getSelection()?.anchorNode;
        
        let textContent: string | null = CurrentAnchorNode!.textContent;
        
        if (textContent) {
            PrecedingText = textContent.substring(0, Range.startOffset);
            RemainingText = textContent.substring(Range.startOffset, textContent.length);
            TextAfterSelection = textContent.substring(Range.endOffset, textContent.length);
            if (!CurrentSelection.isCollapsed) {
                SelectedText = textContent.substring(Range.startOffset, Range.endOffset);
                if (CurrentSelection.focusNode !== CurrentSelection.anchorNode) {
                    SelectedText = textContent.substring(Range.startOffset, textContent.length);
                    TextAfterSelection = null;
                }
            }
        }
    }
    
    return {PrecedingText, SelectedText, RemainingText, TextAfterSelection, CurrentSelection, CurrentAnchorNode,};
    
}

/**
 * Moves the caret to the specified target node at the given offset.
 * When used in Key handling functions, that key may require a second key-press to "work properly", making it seemingly less responsive
 * it is for this reason that this func is deprecated for now, saving for future reference.
 *
 * @param {Node | null | undefined} TargetNode - The target node to move the caret to.
 * @param {number} [Offset=0] - The offset within the target node to move the caret to. Default is 0.
 *
 * @returns {void}
 */
export function MoveCaretToNode(TargetNode: Node | null | undefined, Offset = 0) {
    
    if (!TargetNode) return;
    const currentSelection = window.getSelection();
    if (!currentSelection) return;
    
    
    const range = document.createRange();
    try {
        range.setStart(TargetNode, Offset);
        range.collapse(true);
        currentSelection.removeAllRanges();
        currentSelection.addRange(range);
    } catch (e: any) {
        console.warn("MoveCaretToNode: ", e.message);
    }
    
}

/**
 * A Modified version of above function,Moves the caret into a specified node at a given offset.
 * Aimed to deal with the situation where caret is focused on a container node itself, instead of the actual elements within
 * Used primarily in dealing with editing bugs in del and backspace functionality.
 *
 * @param {Node | null | undefined} ContainerNode - The container node in which to move the caret.
 * @param {number} [Offset=0] - The offset at which to place the caret in the container node. Default is 0.
 *
 * @returns {void}
 */
export function MoveCaretIntoNode(ContainerNode: Node | null | undefined, Offset = 0) {
    
    if (!ContainerNode || !ContainerNode.childNodes.length) return;
    
    let ValidNode: Node | null = null;
    for (let ChildNode of ContainerNode.childNodes) {
        if (ChildNode.nodeType === Node.TEXT_NODE && ChildNode.parentNode && (ChildNode.parentNode as HTMLElement).contentEditable !== 'false') {
            ValidNode = ChildNode;
            break;
        }
        if (ChildNode.nodeType === Node.ELEMENT_NODE && (ChildNode as HTMLElement).contentEditable !== 'false') {
            ValidNode = ChildNode;
            break;
        }
    }
    
    if (!ValidNode) return;
    
    const currentSelection = window.getSelection();
    if (!currentSelection) return;
    
    
    const range = document.createRange();
    try {
        range.setStart(ValidNode, Offset);
        range.collapse(true);
        currentSelection.removeAllRanges();
        currentSelection.addRange(range);
    } catch (e: any) {
        console.warn("MoveCaretIntoNode: ", e.message);
    }
}
