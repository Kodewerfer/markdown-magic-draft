import {TextNodeProcessor} from "../../Utils/Helpers";
import {TDaemonReturn} from "../../hooks/useEditorDaemon";

/**
 * Compiles all the text nodes within the specified container element.
 *
 * @param {HTMLElement} ContainerElement - The container element to search for text nodes.
 *
 * @returns {string} - The compiled text from all the found text nodes.
 */
export function CompileAllTextNode(ContainerElement: HTMLElement) {
    if (!ContainerElement) return null;
    let elementWalker = document.createTreeWalker(ContainerElement, NodeFilter.SHOW_TEXT);
    
    let node;
    let textContentResult = '';
    while (node = elementWalker.nextNode()) {
        let textActual = node.textContent;
        if (node.textContent) {
            if ((node.parentNode as HTMLElement).hasAttribute("data-fake-text"))
                textActual = "";
            else if (node.textContent === '\u00A0')
                textActual = "";
            else
                textActual = node.textContent.replace(/\u00A0/g, ' ');
        }
        textContentResult += textActual;
    }
    
    return textContentResult;
}

export function CompileDisplayTextNodes(ContainerElement: HTMLElement) {
    if (!ContainerElement) return null;
    let elementWalker = document.createTreeWalker(ContainerElement, NodeFilter.SHOW_TEXT);
    
    let node;
    let textContentResult = '';
    while (node = elementWalker.nextNode()) {
        let textActual = node.textContent;
        if (node.textContent) {
            if ((node.parentNode as HTMLElement).dataset["IsGenerated"] || (node.parentNode as HTMLElement).contentEditable === "false")
                textActual = "";
            else if (node.textContent === '\u00A0')
                textActual = "";
            else
                textActual = node.textContent.replace(/\u00A0/g, ' ');
        }
        textContentResult += textActual;
    }
    
    return textContentResult;
}

export function UpdateComponentAndSync(daemonHandle: TDaemonReturn, TextNodeContent: string | null | undefined, ParentElement: HTMLElement | Node | null) {
    if (!TextNodeContent || !ParentElement || !daemonHandle) return;
    const textNodeResult = TextNodeProcessor(TextNodeContent);
    if (!textNodeResult) return;
    
    let documentFragment = document.createDocumentFragment();
    textNodeResult?.forEach(item => documentFragment.appendChild(item));
    
    daemonHandle.AddToOperations({
        type: "REPLACE",
        targetNode: ParentElement,
        newNode: documentFragment //first result node only
    });
    return daemonHandle.SyncNow();
}

export function UpdateContainerAndSync(daemonHandle: TDaemonReturn, ContainerFullText: string | null | undefined, Container: HTMLElement | Node, ContainerTagName: string) {
    if (!ContainerFullText || !Container || !daemonHandle) return
    // Not removing the wrapper with processor
    const textNodeResult = TextNodeProcessor(ContainerFullText, false);
    if (!textNodeResult) return;
    
    // console.log(ContainerFullText)
    // console.log(textNodeResult)
    
    let documentFragment = document.createDocumentFragment();
    textNodeResult?.forEach(item => documentFragment.appendChild(item));
    
    daemonHandle.AddToOperations({
        type: "REPLACE",
        targetNode: Container,
        newNode: documentFragment //first result node only
    });
    return daemonHandle.SyncNow();
}