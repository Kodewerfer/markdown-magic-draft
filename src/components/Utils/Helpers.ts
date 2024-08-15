import React from "react";
import {renderToString} from "react-dom/server";
import {MD2HTMLSync} from "./Conversion";

/**
 * Processes a text node and converts it to HTML.
 *
 * @param {Node|string} textNode - The text node to be processed. Can be either a Node or a string.
 * @param ShouldRemoveWrapper =true - should remove the outer P tag if exist (converter quirk)
 *
 * @return {Node[]|null} - An array of new nodes created from the processed text node. Returns null if the converted HTML is empty or if the textNode parameter is not a text node.
 */
export function TextNodeProcessor(textNode: Node | string, ShouldRemoveWrapper: boolean = true) {
    
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
    if (ShouldRemoveWrapper && TemplateChildNodes.length === 1 && TemplateChildNodes[0].nodeType === Node.ELEMENT_NODE && (TemplateChildNodes[0] as HTMLElement).tagName.toLowerCase() === 'p') {
        
        let WrapperTag = TemplateConverter.content.children[0];
        NewNodes = [...WrapperTag.childNodes];
        if (!NewNodes.length) return null;
        
        return NewNodes;
    }
    
    // Multiple element are at the top level result, eg: textnode + p tag + textnode. (usually indicate bug if not sent by a container)
    if (TemplateChildNodes.length > 1) {
        NewNodes = [...TemplateChildNodes];
        console.warn("TextNodeProcessor: Multiple top level nodes.", NewNodes);
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

export function FindWrappingElementWithinContainer(Node: Node, Container: HTMLElement, NodeNameTest?: RegExp): HTMLElement | null {
    
    let currentNode = Node;
    
    if (currentNode === Container) return currentNode as HTMLElement;
    
    while (currentNode.parentNode) {
        let parentNode = currentNode.parentNode;
        if (parentNode === Container) return currentNode as HTMLElement;
        if (NodeNameTest && NodeNameTest.test(parentNode.nodeName.toLowerCase())) return currentNode as HTMLElement;
        
        currentNode = parentNode;
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

export function GetRealChildren(node: Node | HTMLElement) {
    let RealChildren: Node[] = [];
    if (!node || !node.childNodes.length) return RealChildren;
    
    RealChildren = Array.from(node.childNodes).filter(item => {
        return item.textContent !== '\n';
    })
    
    return RealChildren;
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
        try {
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
        } catch (e) {
            console.error(`Error getting caret context:${(e as Error).message}`);
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
    } catch (e: any) {
        console.warn("MoveCaretToNode: ", e.message);
        range.setStart(TargetNode, 0);
    } finally {
        range.collapse(true);
        currentSelection.removeAllRanges();
        currentSelection.addRange(range);
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

/**
 * Creates a TreeWalker and walks to the specified target node.
 *
 * @param {Node | HTMLElement} rootNode - The root node from which to start the tree traversal.
 * @param {Node | HTMLElement} targetNode - The node to walk to.
 * @return {TreeWalker} The TreeWalker that has been walked to the targetNode if reachable.
 */
export function CreateAndWalkToNode(rootNode: Node | HTMLElement, targetNode: Node | HTMLElement): TreeWalker {
    const nodeWalker = document.createTreeWalker(
        rootNode,
        NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
        null
    );
    
    let tempNode: Node | null;
    while (tempNode = nodeWalker.nextNode()) {
        if (tempNode === targetNode)
            break;
    }
    
    return nodeWalker; // returns TreeWalker that has been walked to the targetNode (if reachable)
}

/**
 * Retrieves the last text node within the given container node.
 *
 * @param {Node | HTMLElement} ContainerNode - The container node from which to search for the last text node.
 * @return {Node | null} - The last text node found or null if no text node is found.
 */
export function GetLastTextNode(ContainerNode: Node | HTMLElement): Node | null {
    if (!ContainerNode) return null;
    let lastTextNode: Node | null = null;
    
    const {childNodes} = ContainerNode;
    
    for (let i = childNodes.length - 1; i >= 0; i--) {
        const childNode = childNodes[i];
        if (childNode.nodeType !== Node.TEXT_NODE) continue;
        lastTextNode = childNode;
        break;
    }
    
    return lastTextNode;
}

/**
 * Retrieves the first text node within a given container node.
 *
 * @param {Node | HTMLElement} ContainerNode - The container node to search within.
 * @return {Node | null} - The first text node found, or null if no text node is found.
 */
export function GetFirstTextNode(ContainerNode: Node | HTMLElement): Node | null {
    if (!ContainerNode) return null;
    let firstTextNode: Node | null = null;
    
    const {childNodes} = ContainerNode;
    
    for (let i = 0; i < childNodes.length; i++) {
        const childNode = childNodes[i];
        if (childNode.nodeType !== Node.TEXT_NODE) continue;
        firstTextNode = childNode;
        break;
    }
    
    return firstTextNode;
}

export function GetAllSurroundingText(CurrentSelection: Selection, ContainerLimit?: Node | HTMLElement, HardLimit = 3) {
    let node: Node | null = CurrentSelection.focusNode;
    let precedingText: string[] = [];
    let followingText: string[] = [];
    let iterationCount = 0;
    
    if (!node) {
        return {precedingText: '', followingText: ''};
    }
    
    // Add current node's text if it's a text node
    if (node.nodeType === Node.TEXT_NODE) {
        const contents = node.textContent || '';
        precedingText.push(contents.slice(0, CurrentSelection.focusOffset));
        followingText.push(contents.slice(CurrentSelection.focusOffset));
    }
    
    while (node && iterationCount < HardLimit && node !== ContainerLimit) {
        // Get preceding sibling node text
        let previousNode = node.previousSibling;
        while (previousNode) {
            let text = previousNode.textContent;
            if (text) {
                precedingText.unshift(text);
            }
            previousNode = previousNode.previousSibling;
        }
        
        // Get next sibling node text
        let nextNode = node.nextSibling;
        while (nextNode) {
            let text = nextNode.textContent;
            if (text) {
                followingText.push(text);
            }
            nextNode = nextNode.nextSibling;
        }
        
        // Move to the parent level
        node = node.parentNode;
        iterationCount += 1;
    }
    
    return {
        precedingText: precedingText.join(''),
        followingText: followingText.join(''),
    };
}