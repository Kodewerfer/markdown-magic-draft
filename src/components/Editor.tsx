import React, {useEffect, useLayoutEffect, useRef, useState} from "react";
import {HTML2MD, HTML2ReactSnyc, MD2HTML, MD2HTMLSync} from "../Utils/Conversion";
import useEditorHTMLDaemon, {ParagraphTest} from "../hooks/useEditorHTMLDaemon";
import {Compatible} from "unified/lib";
import "./Editor.css";
import _ from 'lodash';

// helper
import {TextNodeProcessor, FindNearestParagraph, GetCaretContext, MoveCaretIntoNode, GetNextSiblings} from "./Helpers";
// Editor Components
import Paragraph from './sub_components/Paragraph';
import PlainSyntax from "./sub_components/PlainSyntax";
import Links from "./sub_components/Links";
import {Blockquote, QuoteItem} from "./sub_components/Blockquote";
import {ListContainer, ListItem} from "./sub_components/List";

type TEditorProps = {
    SourceData?: string | undefined
};

type TActivationReturn = {
    'enter'?: (ev: Event) => void | boolean,
    'del'?: (ev: Event) => void | boolean,
    'backspace'?: (ev: Event) => void | boolean
};

export default function Editor(
    {SourceData}: TEditorProps
) {
    const [sourceMD, setSourceMD] = useState<string>(() => {
        SourceData = SourceData || "";
        return SourceData;
    });
    const EditorRef = useRef<HTMLElement | null>(null);
    const EditorSourceRef = useRef<Document | null>(null);
    const EditorMaskRef = useRef<HTMLDivElement | null>(null);
    
    const EditorHTMLString = useRef('');
    const [EditorComponent, setEditorComponent] = useState<React.ReactNode>(null);
    
    // The very first state of the component under caret, needs to be a function
    const ActiveComponentSwitchStack = useRef<((arg: boolean) => void)[]>([]);
    // the return of the above function
    const ActivationCallbacksRef = useRef<TActivationReturn | undefined>(undefined);
    const LastActivationCache = useRef<Node | null>(null);
    
    // Subsequence reload
    async function ReloadEditorContent() {
        if (!EditorSourceRef.current) return;
        const bodyElement: HTMLBodyElement | null = EditorSourceRef.current.documentElement.querySelector('body');
        if (!bodyElement) return;
        bodyElement.normalize();
        EditorHTMLString.current = String(bodyElement!.innerHTML);
        setEditorComponent(ConfigAndConvertToReact(EditorHTMLString.current));
    }
    
    function ConfigAndConvertToReact(md2HTML: Compatible) {
        
        // Map all possible text-containing tags to TextContainer component and therefore manage them.
        const TextNodesMappingConfig: Record<string, React.FunctionComponent<any>> = ['p', 'span', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'ul', 'ol', 'li', 'code', 'pre', 'em', 'strong', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'br', 'img', 'del', 'input', 'hr']
            .reduce((acc: Record<string, React.FunctionComponent<any>>, tagName: string) => {
                acc[tagName] = (props: any) => {
                    // inline syntax
                    if (props['data-md-syntax'] && props['data-md-container'] !== 'true') {
                        if (props['data-link-to']) {
                            return <SpecialLink {...props}
                                                daemonHandle={DaemonHandle}
                                                tagName={tagName}/>;
                        }
                        //Containers
                        //Simple syntax
                        return <PlainSyntax {...props}
                                            daemonHandle={DaemonHandle}
                                            tagName={tagName}/>;
                    }
                    // Links
                    if (props['data-md-link']) {
                        return <Links {...props}
                                      daemonHandle={DaemonHandle}
                                      tagName={tagName}/>;
                    }
                    // Paragraph and Headers
                    if (props['data-md-paragraph'] || props['data-md-header']) {
                        // Header
                        if (props['data-md-header'] !== undefined) {
                            return <Paragraph {...props}
                                              isHeader={true}
                                              headerSyntax={props['data-md-header']}
                                              daemonHandle={DaemonHandle}
                                              tagName={tagName}/>
                        }
                        // Normal P tags
                        return <Paragraph {...props}
                                          daemonHandle={DaemonHandle}
                                          tagName={tagName}/>
                    }
                    
                    // Block quote
                    if (props['data-md-blockquote'] === 'true') {
                        return <Blockquote {...props}
                                           daemonHandle={DaemonHandle}
                                           tagName={tagName}/>
                    }
                    if (props['data-md-quote-item'] === 'true') {
                        return <QuoteItem {...props}
                                          daemonHandle={DaemonHandle}
                                          tagName={tagName}/>
                    }
                    // TODO:list component
                    if (props['data-md-list'] === 'true') {
                        return <ListContainer {...props}
                                              daemonHandle={DaemonHandle}
                                              tagName={tagName}/>
                    }
                    
                    if (props['data-md-list-item'] === 'true') {
                        return <ListItem {...props}
                                         daemonHandle={DaemonHandle}
                                         tagName={tagName}/>
                    }
                    
                    // FIXME:Placeholder
                    return <CommonRenderer {...props}
                                           tagName={tagName}/>;
                }
                return acc;
            }, {});
        
        const componentOptions = {
            ...TextNodesMappingConfig
        }
        return HTML2ReactSnyc(md2HTML, componentOptions).result;
    }
    
    // Will be called by the Daemon
    function MaskEditingArea() {
        
        if (!EditorMaskRef.current || !EditorMaskRef.current.innerHTML) return;
        
        const editorInnerHTML = EditorRef.current?.innerHTML;
        if (editorInnerHTML) {
            EditorRef.current?.classList.add("No-Vis");
            EditorMaskRef.current!.innerHTML = editorInnerHTML;
            EditorMaskRef.current!.classList.remove("Hide-It");
        }
        
        // return the Unmask function for the Daemon
        return () => {
            if (!EditorRef.current || !EditorMaskRef.current) return;
            EditorRef.current.classList.remove("No-Vis");
            EditorMaskRef.current.classList.add('Hide-It');
            EditorMaskRef.current.innerHTML = " ";
        }
    }
    
    async function ExtractMD() {
        const ConvertedMarkdown = await HTML2MD(EditorHTMLString.current);
        console.log(String(ConvertedMarkdown));
    }
    
    // Editor level selection status monitor
    const DebouncedSelectionMonitor = _.debounce(() => {
        const selection: Selection | null = window.getSelection();
        if (!selection) return;
        // Must be an editor element
        if (!EditorRef.current?.contains(selection?.anchorNode)) return;
        // Must not contains multiple elements
        if (!selection.isCollapsed) {
            if (selection.anchorNode === selection.focusNode)
                return;
            
            const LastActivation = ActiveComponentSwitchStack.current[0];
            if (typeof LastActivation !== 'function') return;
            
            // Switch off last activation if drag selection passed the last element
            const ActiveComponentEndPoint: any = FindActiveEditorComponent(selection.focusNode! as HTMLElement);
            if (ActiveComponentEndPoint && ActiveComponentEndPoint !== LastActivation) {
                LastActivation(false);
                ActiveComponentSwitchStack.current.shift();
                LastActivationCache.current = null;
            }
            return;
        }
        if (LastActivationCache.current === selection.anchorNode) return;
        // refresh the cache
        LastActivationCache.current = selection.anchorNode;
        
        // retrieve the component, set the editing state
        const ActiveComponent: any = FindActiveEditorComponent(selection.anchorNode! as HTMLElement);
        
        // FIXME: This is VERY VERY VERY HACKY
        // right now the logic is - for a editor component, the very first state need to be a function that handles all logic for "mark as active"
        // with the old class components, after gettng the components from dom, you can get the "stateNode" and actually call the setState() from there
        if (ActiveComponent) {
            // Switch off the last
            let LastestActive;
            while (LastestActive = ActiveComponentSwitchStack.current.shift()) {
                LastestActive(false);
                ActivationCallbacksRef.current = undefined;
            }
            // Switch on the current, add to cache
            if (ActiveComponent.memoizedState && typeof ActiveComponent.memoizedState.memoizedState === "function") {
                ActiveComponentSwitchStack.current.push(ActiveComponent.memoizedState.memoizedState);
                ActivationCallbacksRef.current = ActiveComponent.memoizedState.memoizedState(true);
            }
        }
        
    }, 100);
    
    /**
     * Following are the logics to handle key presses
     * The idea is that these are the "generic" logic handling line breaking/joining, sometimes using only vanilla content editable logic.
     * if sub-components need to have their own logic on these keys, they are injected via state function return and stored in "ActivationCallbacksRef.current"
     * when no special logic is present, the "generic" logic would run.
     */
    function EnterKeyHandler(ev: HTMLElementEventMap['keydown']) {
        // Run the component spec handler if present
        // If the callback returns 'true', continue the editor's logic
        if (typeof ActivationCallbacksRef.current?.enter === 'function') {
            const CallbackReturn = ActivationCallbacksRef.current?.enter(ev);
            
            if (CallbackReturn !== true)
                return
        }
        
        // Normal logic
        let {RemainingText, PrecedingText, CurrentSelection, CurrentAnchorNode} = GetCaretContext();
        if (!CurrentSelection || !CurrentAnchorNode) return;
        if ((CurrentAnchorNode as HTMLElement)?.contentEditable === 'false' || (CurrentAnchorNode.parentNode as HTMLElement)?.contentEditable === 'false') return
        
        let NearestContainer: HTMLElement | null = FindNearestParagraph(CurrentAnchorNode, EditorRef.current!);
        
        // Check if caret at an empty line
        const bEmptyLine = NearestContainer === CurrentAnchorNode || (NearestContainer?.childNodes.length === 1 && NearestContainer.childNodes[0].nodeName.toLowerCase() === 'br');
        
        // Empty line when caret landed on the p tag itself. the NearestContainer would be the p tag
        if (bEmptyLine && NearestContainer!.firstChild) {
            RemainingText = '';
            PrecedingText = '';
            CurrentAnchorNode = NearestContainer!.firstChild;
        }
        
        // Caret usually land on a text node, get the wrapping element
        let CurrentElementNode: HTMLElement;
        // Check if it was a text node under P tag or under other tags such as strong
        if (CurrentAnchorNode.parentNode !== null && CurrentAnchorNode.parentNode !== NearestContainer && !ParagraphTest.test(CurrentAnchorNode.parentNode.nodeName)) {
            // When caret is in the text node of a, for example, strong tag within a p tag
            CurrentElementNode = CurrentAnchorNode.parentNode;
        } else {
            CurrentElementNode = CurrentAnchorNode;
        }
        
        // if landed on a non-editble content, do nothing
        if (CurrentElementNode.contentEditable === 'false') return;
        
        let FollowingNodes = GetNextSiblings(CurrentElementNode)
        
        // Breaking in an empty line
        if (bEmptyLine && CurrentAnchorNode.nodeName.toLowerCase() === 'br') {
            console.log('Breaking - Empty line');
            
            const NewLine = document.createElement("p");  // The new line
            const lineBreakElement: HTMLBRElement = document.createElement("br");
            NewLine.appendChild(lineBreakElement);
            
            DaemonHandle.AddToOperations({
                type: "ADD",
                newNode: NewLine,
                siblingNode: NearestContainer,
                parentXP: "//body"
            });
            DaemonHandle.SetFutureCaret('NextLine');
            DaemonHandle.SyncNow();
            return;
        }
        
        const Range = CurrentSelection.getRangeAt(0);
        const bNoValidPreSiblings =
            !CurrentElementNode.previousSibling
            || (CurrentElementNode.previousSibling as HTMLElement).contentEditable === 'false' && !CurrentElementNode.previousSibling.previousSibling;
        
        // Breaking at the very beginning of the line
        if (bNoValidPreSiblings && Range.startOffset === 0) {
            console.log('Breaking - First element');
            
            // A new line with only a br
            const lineBreakElement: HTMLBRElement = document.createElement("br");
            const NewLine = document.createElement("p");  // The new line
            NewLine.appendChild(lineBreakElement);
            
            DaemonHandle.AddToOperations({
                type: "ADD",
                newNode: NewLine,
                siblingNode: NearestContainer,
                parentXP: "//body"
            });
            DaemonHandle.SyncNow();
            return;
        }
        // Breaking anywhere in the middle of the line
        if (RemainingText !== '' || FollowingNodes.length > 1 || (FollowingNodes.length === 1 && FollowingNodes[0].textContent !== '\n')) {
            console.log("Breaking - Mid line");
            // Exception, when caret is on the element tag itself, and didn't fit the previous cases (happens on PlainSyntax primarily)
            // FIXME: May be a better solution
            if (CurrentAnchorNode.nodeType !== Node.TEXT_NODE) {
                console.warn("Enter Key Exception")
                return;
            }
            
            let anchorNodeClone: Node = CurrentAnchorNode.cloneNode(true);
            if (anchorNodeClone.textContent !== null) anchorNodeClone.textContent = RemainingText;
            const NewLine = document.createElement("p");  // The new line
            NewLine.appendChild(anchorNodeClone);
            
            if (FollowingNodes.length) {
                for (let Node of FollowingNodes) {
                    NewLine.appendChild(Node.cloneNode(true));
                    DaemonHandle.AddToOperations({
                        type: "REMOVE",
                        targetNode: Node,
                    });
                }
            }
            
            // Clean up the old line
            DaemonHandle.AddToOperations({
                type: "TEXT",
                targetNode: CurrentAnchorNode,
                nodeText: PrecedingText
            });
            
            DaemonHandle.AddToOperations({
                type: "ADD",
                newNode: NewLine,
                siblingNode: NearestContainer?.nextSibling,
                parentXP: "//body"
            });
            DaemonHandle.SetFutureCaret('NextLine');
            DaemonHandle.SyncNow();
            
            return;
        }
        
        
        // Breaking at the very end of the line
        console.log("Breaking - End of line");
        
        const lineBreakElement: HTMLBRElement = document.createElement("br");
        const NewLine = document.createElement("p");
        NewLine.appendChild(lineBreakElement);
        
        DaemonHandle.AddToOperations({
            type: "ADD",
            newNode: NewLine,
            siblingNode: NearestContainer?.nextSibling,
            parentXP: "//body"
        });
        
        DaemonHandle.SetFutureCaret("NextLine");
        DaemonHandle.SyncNow();
    }
    
    function DelKeyHandler(ev: HTMLElementEventMap['keydown']) {
        
        let {RemainingText, PrecedingText, CurrentSelection, CurrentAnchorNode} = GetCaretContext();
        if (!CurrentAnchorNode) return;
        
        let NearestContainer = FindNearestParagraph(CurrentAnchorNode, EditorRef.current!)
        if (!NearestContainer) return;
        
        const bCaretOnContainer = CurrentAnchorNode === NearestContainer;
        const bHasContentToDelete = RemainingText.trim() !== '' || (CurrentAnchorNode.nextSibling && CurrentAnchorNode.nextSibling.textContent !== '\n');
        const bAnchorIsTextNode = CurrentAnchorNode.nodeType === Node.TEXT_NODE;
        
        // Run the normal key press on in-line editing
        if (!bCaretOnContainer && bHasContentToDelete && bAnchorIsTextNode) return;
        if (CurrentSelection && !CurrentSelection.isCollapsed) return;
        
        // line joining
        ev.preventDefault();
        ev.stopPropagation();
        
        let nextElementSibling = NearestContainer?.nextElementSibling; //nextsibling could be a "\n"
        if (!nextElementSibling) return; //No more lines following
        
        // same as back space, when there is still content that could be deleted, but caret lands on the wrong element
        // FIXME: may be buggy
        if (CurrentAnchorNode.nextSibling && CurrentAnchorNode.nextSibling !== nextElementSibling) {
            MoveCaretIntoNode(CurrentAnchorNode);
            return;
        }
        
        // deleting empty lines
        if (nextElementSibling?.childNodes.length === 1 && nextElementSibling?.firstChild?.nodeName.toLowerCase() === 'br') {
            console.log("Delete Empty Line");
            DaemonHandle.AddToOperations({
                type: "REMOVE",
                targetNode: nextElementSibling
            });
            DaemonHandle.SyncNow();
            return;
        }
        
        // self is empty line
        if (NearestContainer?.childNodes.length === 1 && NearestContainer?.firstChild?.nodeName.toLowerCase() === 'br') {
            console.log("Self is Empty Line");
            DaemonHandle.AddToOperations({
                type: "REMOVE",
                targetNode: NearestContainer
            });
            DaemonHandle.SyncNow();
            return;
        }
        
        // Run the component spec handler if present
        if (typeof ActivationCallbacksRef.current?.del === 'function') {
            console.log("Component Spec Deleting");
            
            if (ActivationCallbacksRef.current?.del(ev) !== true)
                return
        }
        
        // Dealing with container type of element
        if (nextElementSibling.nodeType === Node.ELEMENT_NODE && (nextElementSibling as HTMLElement)?.hasAttribute('data-md-container')) {
            console.log("Delete into container");
            
            if (nextElementSibling.childElementCount > 1)
                DaemonHandle.AddToOperations({
                    type: "REMOVE",
                    targetNode: (nextElementSibling as HTMLElement).firstElementChild!
                });
            else
                // Only one sub element, delete the whole thing
                DaemonHandle.AddToOperations({
                    type: "REMOVE",
                    targetNode: nextElementSibling
                });
            
            DaemonHandle.SyncNow();
            
            return;
        }
        
        
        // "Normal" joining lines
        console.log("Line joining");
        
        let NewLine = NearestContainer.cloneNode(true);
        
        nextElementSibling.childNodes.forEach((ChildNode) => {
            NewLine.appendChild(ChildNode.cloneNode(true));
        })
        
        DaemonHandle.AddToOperations({
            type: "REMOVE",
            targetNode: nextElementSibling,
        });
        
        DaemonHandle.AddToOperations({
            type: "REPLACE",
            targetNode: NearestContainer,
            newNode: NewLine
        });
        
        DaemonHandle.SyncNow();
    }
    
    function BackSpaceKeyHandler(ev: HTMLElementEventMap['keydown']) {
        // basically a reverse of the "delete", but with key differences on "normal join line"
        let {RemainingText, PrecedingText, CurrentSelection, CurrentAnchorNode} = GetCaretContext();
        if (!CurrentAnchorNode) return;
        
        const NearestContainer = FindNearestParagraph(CurrentAnchorNode, EditorRef.current!)
        if (!NearestContainer) return;
        
        if (NearestContainer === CurrentAnchorNode) {
            CurrentAnchorNode = NearestContainer.firstChild
            if (!CurrentAnchorNode) {
                ev.preventDefault();
                ev.stopPropagation();
                return;
            }
            // This method is less responsive
            // ev.preventDefault();
            // ev.stopPropagation();
            // MoveCaretToNode(NearestContainer.firstChild, 0);
            // return;
        }
        
        const bPrecedingValid = PrecedingText.trim() !== '' || (CurrentAnchorNode.previousSibling && CurrentAnchorNode.previousSibling.textContent !== '\n');
        const bAnchorIsTextNode = CurrentAnchorNode.nodeType === Node.TEXT_NODE;
        
        // Run the normal key press on in-line editing
        if (bPrecedingValid && bAnchorIsTextNode) return;
        if (CurrentSelection && !CurrentSelection.isCollapsed) return;
        
        // line joining
        ev.preventDefault();
        ev.stopPropagation();
        
        let previousElementSibling = NearestContainer?.previousElementSibling; //nextsibling could be a "\n"
        if (!previousElementSibling) return; //No more lines following
        
        // when there is still content that could be deleted, but caret lands on the wrong element
        // FIXME: may be buggy
        if (CurrentAnchorNode.previousSibling && CurrentAnchorNode.previousSibling !== previousElementSibling) {
            MoveCaretIntoNode(CurrentAnchorNode);
            return
        }
        
        // deleting empty lines
        if (previousElementSibling?.childNodes.length === 1 && previousElementSibling?.firstChild?.nodeName.toLowerCase() === 'br') {
            console.log("Backspace on empty line");
            DaemonHandle.AddToOperations({
                type: "REMOVE",
                targetNode: previousElementSibling
            });
            DaemonHandle.SyncNow();
            return;
        }
        
        // self is empty line
        if (NearestContainer?.childNodes.length === 1 && NearestContainer?.firstChild?.nodeName.toLowerCase() === 'br') {
            console.log("Backspace on self empty line");
            DaemonHandle.AddToOperations({
                type: "REMOVE",
                targetNode: NearestContainer
            });
            MoveCaretToLastEOL(window.getSelection(), EditorRef.current!);
            DaemonHandle.SyncNow();
            return;
        }
        
        // Run the component spec handler if present
        if (typeof ActivationCallbacksRef.current?.backspace === 'function') {
            console.log("Backspace component logic");
            if (ActivationCallbacksRef.current?.backspace(ev) !== true)
                return;
        }
        
        // Dealing with container type of element
        if (previousElementSibling.nodeType === Node.ELEMENT_NODE && (previousElementSibling as HTMLElement)?.hasAttribute('data-md-container')) {
            console.log("Backspace into container");
            
            if (previousElementSibling.childElementCount > 1)
                DaemonHandle.AddToOperations({
                    type: "REMOVE",
                    targetNode: (previousElementSibling as HTMLElement).lastElementChild!
                });
            else
                DaemonHandle.AddToOperations({
                    type: "REMOVE",
                    targetNode: previousElementSibling
                });
            
            DaemonHandle.SetFutureCaret('zero');
            DaemonHandle.SyncNow();
            return;
        }
        
        // "Normal" joining lines
        console.log("Backspace line joning");
        let NewLine = previousElementSibling.cloneNode(true);
        
        NearestContainer.childNodes.forEach((ChildNode) => {
            NewLine.appendChild(ChildNode.cloneNode(true));
        })
        
        DaemonHandle.AddToOperations({
            type: "REMOVE",
            targetNode: NearestContainer,
        });
        
        DaemonHandle.AddToOperations({
            type: "REPLACE",
            targetNode: previousElementSibling,
            newNode: NewLine
        });
        
        MoveCaretToLastEOL(window.getSelection(), EditorRef.current!);
        DaemonHandle.SyncNow();
    }
    
    // First time loading
    useEffect(() => {
        ;(async () => {
            // convert MD to HTML
            const convertedHTML: string = String(await MD2HTML(sourceMD));
            
            // Save a copy of HTML
            const HTMLParser = new DOMParser();
            EditorSourceRef.current = HTMLParser.parseFromString(convertedHTML, "text/html");
            
            // save a text copy
            EditorHTMLString.current = convertedHTML;
            // load editor component
            setEditorComponent(ConfigAndConvertToReact(convertedHTML))
        })()
        
    }, [sourceMD]);
    
    // Masking and unmasking to hide flicker
    useLayoutEffect(() => {
        if (!EditorRef.current || !EditorMaskRef.current) return;
        // After elements are properly loaded, hide the mask to show editor content
        EditorRef.current.classList.remove("No-Vis");
        EditorMaskRef.current.classList.add('Hide-It');
        EditorMaskRef.current.innerHTML = " ";
    });
    
    // Editor level selection status monitor
    useLayoutEffect(() => {
        const OnSelectionChange = () => DebouncedSelectionMonitor();
        const OnSelectStart = () => DebouncedSelectionMonitor();
        
        document.addEventListener("selectstart", OnSelectStart);
        document.addEventListener("selectionchange", OnSelectionChange);
        
        return () => {
            document.removeEventListener("selectstart", OnSelectStart);
            document.removeEventListener("selectionchange", OnSelectionChange);
        }
        
    }, [EditorRef.current, document]);
    
    // Override keys
    useLayoutEffect(() => {
        
        function EditorKeydown(ev: HTMLElementEventMap['keydown']) {
            if (ev.key === "Enter") {
                ev.preventDefault();
                ev.stopPropagation();
                EnterKeyHandler(ev);
                return;
            }
            if (ev.key === 'Delete') {
                DelKeyHandler(ev);
                return
            }
            if (ev.key === 'Backspace') {
                BackSpaceKeyHandler(ev);
                return;
            }
        }
        
        EditorRef.current?.addEventListener("keydown", EditorKeydown);
        return () => {
            EditorRef.current?.removeEventListener("keydown", EditorKeydown);
        }
    }, [EditorRef.current])
    
    const DaemonHandle = useEditorHTMLDaemon(EditorRef, EditorSourceRef, ReloadEditorContent,
        {
            OnRollback: MaskEditingArea,
            TextNodeCallback: TextNodeProcessor,
            ShouldLog: true, //detailed logs
            IsEditable: true,
            ShouldObserve: true
        });
    
    return (
        <>
            <button className={"bg-amber-600"} onClick={ExtractMD}>Save</button>
            <section className="Editor">
                <main className={'Editor-Inner'} ref={EditorRef}>
                    {EditorComponent}
                </main>
                <div className={'Editor-Mask'} ref={EditorMaskRef}>
                    Floating Mask To Hide Flickering
                </div>
            </section>
        </>
    )
}

// TODO
function SpecialLink(props: any) {
    const {children, tagName, ParentAction, ...otherProps} = props;
    return React.createElement(tagName, otherProps, children);
}

// FIXME: placeholder
const CommonRenderer = (props: any) => {
    const {children, tagName, ParentAction, ...otherProps} = props;
    
    return React.createElement(tagName, otherProps, children);
};

// Editor Spec helpers
function FindActiveEditorComponent(DomNode: HTMLElement, TraverseUp = 0): any {
    if (DomNode.nodeType === Node.TEXT_NODE) {
        if (DomNode.parentNode)
            DomNode = DomNode.parentNode as HTMLElement
        else {
            console.log("Activation Monitor: Text node without parent");
            return null;
        }
    }
    // Find the key starting with "__reactFiber$" which indicates a React 18 element
    const key = Object.keys(DomNode).find(key => key.startsWith("__reactFiber$"));
    
    if (!key) return null;
    
    // Get the Fiber node from the DOM element
    const domFiber = (DomNode as any)[key] as { type?: string; return?: any; stateNode?: any; };
    if (domFiber === undefined) return null;
    
    // Function to get parent component fiber
    const getCompFiber = (fiber: { type?: string; return?: any; stateNode?: any; }) => {
        let parentFiber = fiber.return;
        while (parentFiber && typeof parentFiber.type === "string") {
            parentFiber = parentFiber.return;
        }
        return parentFiber;
    };
    
    // Get the component fiber
    let compFiber = getCompFiber(domFiber);
    for (let i = 0; i < TraverseUp; i++) {
        compFiber = getCompFiber(compFiber);
    }
    
    // return compFiber.stateNode; // if dealing with class component, in that case "setState" can be called from this directly.
    return compFiber;
}

function MoveCaretToLastEOL(currentSelection: Selection | null, ContainerElement: HTMLElement) {
    if (!currentSelection) return;
    let CurrentAnchor = currentSelection.anchorNode;
    if (!CurrentAnchor) return;
    
    const NearestParagraph = FindNearestParagraph(CurrentAnchor, ContainerElement);
    
    let currentPrevSibling = NearestParagraph?.previousElementSibling;
    while (currentPrevSibling) {
        if (currentPrevSibling.childNodes.length)
            break
        
        currentPrevSibling = currentPrevSibling.previousElementSibling;
    }
    let ValidLandingPoint;
    for (let i = currentPrevSibling!.childNodes.length - 1; i >= 0; i--) {
        let LastEOLElement = currentPrevSibling!.childNodes[i];
        if (LastEOLElement.nodeType === Node.TEXT_NODE && LastEOLElement.parentNode && (LastEOLElement.parentNode as HTMLElement).contentEditable !== 'false') {
            ValidLandingPoint = LastEOLElement;
            break;
        }
        
        if (LastEOLElement.nodeType === Node.ELEMENT_NODE && (LastEOLElement as HTMLElement).contentEditable !== 'false') {
            ValidLandingPoint = LastEOLElement;
            break;
        }
    }
    if (!ValidLandingPoint || !ValidLandingPoint.textContent) return;
    
    const range = document.createRange();
    try {
        range.collapse(true);
        range.setStart(ValidLandingPoint, ValidLandingPoint.textContent.length);
        currentSelection.removeAllRanges();
        currentSelection.addRange(range);
    } catch (e: any) {
        console.warn(e.message);
    }
    return;
}
