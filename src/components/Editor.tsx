import React, {useEffect, useLayoutEffect, useRef, useState} from "react";
import {HTML2MD, HTML2ReactSnyc, HTMLCleanUP, MD2HTML} from "../Utils/Conversion";
import useEditorHTMLDaemon, {ParagraphTest} from "../hooks/useEditorHTMLDaemon";
import {Compatible} from "unified/lib";
import "./Editor.css";

// helper
import {
    TextNodeProcessor,
    FindWrappingElementWithinContainer,
    GetCaretContext,
    MoveCaretIntoNode,
    GetNextSiblings,
    MoveCaretToNode, GetFirstTextNode
} from "./Helpers";
// Editor Components
import Paragraph from './Editor_Parts/Paragraph';
import PlainSyntax from "./Editor_Parts/PlainSyntax";
import Links from "./Editor_Parts/Links";
import {Blockquote, QuoteItem} from "./Editor_Parts/Blockquote";
import {ListContainer, ListItem} from "./Editor_Parts/List";
import {CodeItem, Preblock} from "./Editor_Parts/Preformatted";
import {TActivationReturn} from "./Editor_Types";

type TEditorProps = {
    SourceData?: string | undefined
};

type TActivationCache = {
    fiber: Object | null;
    func: ((arg: boolean) => TActivationReturn) | null | undefined;
    return: TActivationReturn | null;
    anchor: Node | null;
}

const AutoCompleteSymbols = /([*~`"(\[{])/;
const AutoCompletePairsMap = new Map([
    ["[", "]"],
    ["(", ")"],
    ["{", "}"]
]);

export default function Editor(
    {SourceData}: TEditorProps
) {
    const [sourceMD, setSourceMD] = useState<string>(() => {
        SourceData = SourceData || "";
        return SourceData;
    });
    const EditorElementRef = useRef<HTMLElement | null>(null);
    const EditorSourceStringRef = useRef('');
    const EditorSourceDOCRef = useRef<Document | null>(null);
    const EditorMaskRef = useRef<HTMLDivElement | null>(null);
    
    const [EditorComponent, setEditorComponent] = useState<React.ReactNode>(null);
    
    // Cache of the last activated component
    let LastActivationCache = useRef<TActivationCache>({
        fiber: null,
        func: null,
        return: null,
        anchor: null
    });
    
    // Subsequence reload
    async function ReloadEditorContent() {
        if (!EditorSourceDOCRef.current) return;
        const bodyElement: HTMLBodyElement | null = EditorSourceDOCRef.current.documentElement.querySelector('body');
        if (!bodyElement) return;
        bodyElement.normalize();
        
        EditorSourceStringRef.current = String(bodyElement.innerHTML);
        const CleanedHTML = HTMLCleanUP(bodyElement.innerHTML);
        
        EditorSourceStringRef.current = String(CleanedHTML);
        const HTMLParser = new DOMParser();
        EditorSourceDOCRef.current = HTMLParser.parseFromString(String(CleanedHTML), "text/html");
        
        
        setEditorComponent(ConfigAndConvertToReact(EditorSourceStringRef.current));
    }
    
    // FIXME: this structure is getting unwieldy, find a way to refactor.
    function ConfigAndConvertToReact(md2HTML: Compatible) {
        
        // Map all possible text-containing tags to TextContainer component and therefore manage them.
        const TextNodesMappingConfig: Record<string, React.FunctionComponent<any>> = ['p', 'span', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'ul', 'ol', 'li', 'code', 'pre', 'em', 'strong', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'br', 'img', 'del', 'input', 'hr']
            .reduce((acc: Record<string, React.FunctionComponent<any>>, tagName: string) => {
                acc[tagName] = (props: any) => {
                    // inline syntax
                    if (props['data-md-syntax'] && props['data-md-inline']) {
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
                    // List and items
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
                    
                    
                    if (props['data-md-preformatted'] === 'true') {
                        return <Preblock {...props}
                                         daemonHandle={DaemonHandle}
                                         tagName={tagName}/>
                    }
                    // Code and Code block
                    // usually code blocks, supersede in-line codes
                    if (props['data-md-pre-item'] === 'true' && props['data-md-code'] === 'true') {
                        return <CodeItem {...props}
                                         daemonHandle={DaemonHandle}
                                         tagName={tagName}/>
                    }
                    // singular in-line code items
                    if (props['data-md-code'] === 'true') {
                        return <PlainSyntax {...props}
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
        
        const editorInnerHTML = EditorElementRef.current?.innerHTML;
        if (editorInnerHTML) {
            EditorElementRef.current?.classList.add("No-Vis");
            EditorMaskRef.current!.innerHTML = editorInnerHTML;
            EditorMaskRef.current!.classList.remove("Hide-It");
        }
        
        // return the Unmask function for the Daemon
        return () => {
            if (!EditorElementRef.current || !EditorMaskRef.current) return;
            EditorElementRef.current.classList.remove("No-Vis");
            EditorMaskRef.current.classList.add('Hide-It');
            EditorMaskRef.current.innerHTML = " ";
        }
    }
    
    async function ExtractMD() {
        const ConvertedMarkdown = await HTML2MD(EditorSourceStringRef.current);
        console.log(String(ConvertedMarkdown));
    }
    
    // Editor level selection status monitor
    const ComponentActivationSwitch = () => {
        const selection: Selection | null = window.getSelection();
        if (!selection) return;
        // Must be an editor element
        if (!EditorElementRef.current?.contains(selection?.anchorNode)) return;
        // Must not contains multiple elements
        if (!selection.isCollapsed) {
            if (selection.anchorNode === selection.focusNode)
                return;
            
            const LastActivationFunc = LastActivationCache.current.func;
            if (typeof LastActivationFunc !== 'function') return;
            
            // Switch off last activation if drag selection passed the last element
            const ActiveComponentEndPoint: any = FindActiveEditorComponentFiber(selection.focusNode! as HTMLElement);
            if (ActiveComponentEndPoint && ActiveComponentEndPoint !== LastActivationFunc) {
                LastActivationFunc(false);
                LastActivationCache.current.func = undefined;
                LastActivationCache.current.anchor = null;
            }
            return;
        }
        
        if (LastActivationCache.current.anchor === selection.anchorNode) return;
        // refresh the cache
        LastActivationCache.current.anchor = selection.anchorNode;
        
        // retrieve the component, set the editing state
        const ActiveComponentFiber: any = FindActiveEditorComponentFiber(selection.anchorNode! as HTMLElement);
        
        // FIXME: This is VERY VERY VERY HACKY
        // right now the logic is - for a editor component, the very first state need to be a function that handles all logic for "mark as active"
        // with the old class components, after gettng the components from dom, you can get the "stateNode" and actually call the setState() from there
        if (!ActiveComponentFiber) return;
        if (LastActivationCache.current.fiber === ActiveComponentFiber) return;
        
        // Switch off the last
        typeof LastActivationCache.current.func === 'function' && LastActivationCache.current.func(false);
        LastActivationCache.current.func = null;
        LastActivationCache.current.return = null;
        
        // Switch on the current, add to cache
        LastActivationCache.current.fiber = ActiveComponentFiber;
        if (ActiveComponentFiber.memoizedState && typeof ActiveComponentFiber.memoizedState.memoizedState === "function") {
            LastActivationCache.current.func = ActiveComponentFiber.memoizedState.memoizedState;
            LastActivationCache.current.return = ActiveComponentFiber.memoizedState.memoizedState(true);
        }
    }
    // FIXME: Not in use, introduce too much side-effect. Keeping in case more optimization is needed
    // const DebouncedComponentActivationSwitch = _.debounce(ComponentActivationSwitch, 100);
    
    // Functionalities such as wrapping selected text with certain symbols or brackets
    function AutocompleteHandler(KeyboardInput: string) {
        let {
            PrecedingText,
            SelectedText,
            RemainingText,
            TextAfterSelection,
            CurrentSelection,
            CurrentAnchorNode
        } = GetCaretContext();
        if (!CurrentAnchorNode || !CurrentSelection) return;
        
        const NearestContainer = FindWrappingElementWithinContainer(CurrentAnchorNode, EditorElementRef.current!)
        if (!NearestContainer) return;
        
        // TODO: could cause non-responsiveness, need more testing
        if (CurrentAnchorNode.nodeType !== Node.TEXT_NODE || CurrentAnchorNode.textContent === null) return;
        
        // Prep the symbol
        let KeyboardInputPair = AutoCompletePairsMap.get(KeyboardInput);
        if (!KeyboardInputPair) KeyboardInputPair = KeyboardInput;
        
        // When multi-selecting
        // Wrap the selected content
        if (!CurrentSelection.isCollapsed && SelectedText) {
            let OldRange = {
                startOffset: CurrentSelection.getRangeAt(0).startOffset || 0,
                endOffset: CurrentSelection.getRangeAt(0).endOffset || 0,
            };
            
            /**
             *  When double click to select text, the selection may include preceding or tailing whitespace,
             *  the extra ws will break the conversion. eg: *strong* is fine, but *strong * will not immediately convert to strong tag.
             *  in this case, remove the ws from selection, and then add them back in their original position
             */
                
                
                // Padding for whitespace that was removed
            let LeftPadding = '';
            let RightPadding = '';
            
            if (SelectedText.trim() !== SelectedText) {
                if (SelectedText.startsWith(" ")) {
                    LeftPadding = " ";
                    OldRange.startOffset += 1;
                }
                if (SelectedText.endsWith(" ")) {
                    RightPadding = " ";
                    OldRange.startOffset -= 1;
                }
            }
            
            CurrentAnchorNode.textContent = PrecedingText + LeftPadding + KeyboardInput + SelectedText.trim() + KeyboardInputPair;
            if (TextAfterSelection) {
                CurrentAnchorNode.textContent += (RightPadding + TextAfterSelection);
            }
            
            const selection = window.getSelection();
            if (!selection) return;
            
            let NewRange = document.createRange();
            
            try {
                NewRange.setStart(CurrentAnchorNode, OldRange.startOffset + KeyboardInput.length || 0);
                
                if (TextAfterSelection) {
                    NewRange.setEnd(CurrentAnchorNode, OldRange.endOffset + KeyboardInputPair.length || 0);
                } else {
                    NewRange.setEnd(CurrentAnchorNode, CurrentAnchorNode.textContent.length - KeyboardInputPair.length);
                }
                
                selection.removeAllRanges()
                selection.addRange(NewRange);
                
            } catch (e) {
                console.warn(e);
            }
            
            return;
        }
        
        // Single selection only, add symbol in pair
        let currentSelectionStartOffset = CurrentSelection?.getRangeAt(0).startOffset || 0;
        CurrentAnchorNode.textContent = PrecedingText + KeyboardInput + KeyboardInputPair + RemainingText;
        
        MoveCaretToNode(CurrentAnchorNode, currentSelectionStartOffset + KeyboardInput.length);
        
    }
    
    /**
     * Following are the logics to handle key presses
     * The idea is that these are the "generic" logic handling line breaking/joining, sometimes using only vanilla content editable logic.
     * if subcomponents need to have their own logic on these keys, they are injected via state function return and stored in "ActivationCallbacksRef.current"
     * when no special logic is present, the "generic" logic would run.
     */
    async function EnterKeyHandler(ev: HTMLElementEventMap['keydown']) {
        // Run the component spec handler if present
        // if the callback returns 'true', continue the editor's logic
        if (typeof LastActivationCache.current.return?.enter === 'function') {
            const CallbackReturn = await LastActivationCache.current.return?.enter(ev);
            
            if (CallbackReturn !== true)
                return
        }
        console.log("Editor Enter key");
        ev.preventDefault();
        ev.stopPropagation();
        
        // Normal logic
        let {RemainingText, PrecedingText, CurrentSelection, CurrentAnchorNode} = GetCaretContext();
        if (!CurrentSelection || !CurrentAnchorNode) return;
        
        // Collapse selection, otherwise expanded selection may extend to the new line and cause weird behaviors.
        if (!CurrentSelection.isCollapsed) return CurrentSelection.collapseToEnd();
        
        if ((CurrentAnchorNode as HTMLElement)?.contentEditable === 'false' || (CurrentAnchorNode.parentNode as HTMLElement)?.contentEditable === 'false' || CurrentAnchorNode.textContent === '\n') {
            console.warn("Enter Key Exception, not a valid node", CurrentAnchorNode);
            DaemonHandle.SetFutureCaret("NextRealEditable");
            DaemonHandle.SyncNow();
            return;
        }
        
        let NearestContainer: HTMLElement | null = FindWrappingElementWithinContainer(CurrentAnchorNode, EditorElementRef.current!);
        if (!NearestContainer) return; //unlikely
        
        // Check if caret at an empty line
        const bEmptyLine = NearestContainer === CurrentAnchorNode || (NearestContainer?.childNodes.length === 1 && NearestContainer.childNodes[0].nodeName.toLowerCase() === 'br');
        
        // Empty line when caret landed on the p tag itself. the NearestContainer would be the p tag
        if (bEmptyLine && NearestContainer.firstChild) {
            RemainingText = '';
            PrecedingText = '';
            CurrentAnchorNode = NearestContainer.firstChild;
        }
        
        // Caret usually land on a text node, get the wrapping element
        let Current_ElementNode = FindWrappingElementWithinContainer(CurrentAnchorNode, NearestContainer);
        if (!Current_ElementNode) return; //unlikly
        
        // if landed on a non-editble content, do nothing
        if (Current_ElementNode.contentEditable === 'false') return;
        
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
            !Current_ElementNode.previousSibling
            || (Current_ElementNode.previousSibling as HTMLElement).contentEditable === 'false' && !Current_ElementNode.previousSibling.previousSibling;
        
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
            DaemonHandle.SetFutureCaret("NextLine");
            DaemonHandle.SyncNow();
            return;
        }
        
        let FollowingNodes = GetNextSiblings(Current_ElementNode)
        // Breaking anywhere in the middle of the line
        if (RemainingText !== '' || FollowingNodes.length > 1 || (FollowingNodes.length === 1 && FollowingNodes[0].textContent !== '\n')) {
            console.log("Breaking - Mid line");
            // Exception, when caret is on the element tag itself, and didn't fit the previous cases (happens on PlainSyntax primarily)
            // FIXME: May be a better solution
            if (CurrentAnchorNode.nodeType !== Node.TEXT_NODE) {
                console.warn("Enter Key Exception, move caret to", NearestContainer);
                MoveCaretIntoNode(NearestContainer);
                return;
            }
            
            let anchorNodeClone: Node = CurrentAnchorNode.cloneNode(true);
            if (anchorNodeClone.textContent !== null) anchorNodeClone.textContent = RemainingText;
            const NewLine = document.createElement("p");  // The new line
            NewLine.appendChild(anchorNodeClone);
            
            // Add the following elements in right order
            FollowingNodes.forEach(Node => {
                NewLine.appendChild(Node.cloneNode(true));
            })
            
            // Delete the elements in the old line, need to remove the last one first otherwise the xpath will not be correct
            FollowingNodes.slice().reverse().forEach(Node => {
                DaemonHandle.AddToOperations({
                    type: "REMOVE",
                    targetNode: Node,
                });
            })
            
            
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
    
    function BackSpaceKeyHandler(ev: HTMLElementEventMap['keydown']) {
        // basically a reverse of the "delete", but with key differences on "normal join line"
        let {PrecedingText, CurrentSelection, CurrentAnchorNode} = GetCaretContext();
        if (!CurrentAnchorNode) return;
        
        const NearestContainer = FindWrappingElementWithinContainer(CurrentAnchorNode, EditorElementRef.current!)
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
            console.log("Backspace: Invalid Caret, moving Caret to ", CurrentAnchorNode);
            MoveCaretIntoNode(CurrentAnchorNode);
            return
        }
        
        // Moves caret, This may not be needed for "deleting forward", but added for good measure.
        let anchorParent = CurrentAnchorNode.parentNode;
        if (CurrentAnchorNode.parentNode && anchorParent !== NearestContainer) {
            const nearestSibling = GetPrevAvailableSibling(CurrentAnchorNode, NearestContainer);
            if (nearestSibling) {
                console.log("Backspace: Moving Caret to ", nearestSibling);
                MoveCaretToNode(nearestSibling, 0);
                return;
            }
        }
        
        const bSelfIsEmptyLine = NearestContainer?.childNodes.length === 1 && NearestContainer?.firstChild?.nodeName.toLowerCase() === 'br';
        const bPrevLineEmpty = previousElementSibling?.childNodes.length === 1 && previousElementSibling?.firstChild?.nodeName.toLowerCase() === 'br';
        
        // Backspace previous empty lines
        if (bPrevLineEmpty) {
            console.log("Backspace: Empty Line");
            
            DaemonHandle.AddToOperations({
                type: "REMOVE",
                targetNode: previousElementSibling
            });
            
            MoveCaretToNode(previousElementSibling);
            
            DaemonHandle.SyncNow();
            return;
        }
        
        // self is empty line
        if (bSelfIsEmptyLine) {
            console.log("Backspace: Self Empty Line");
            DaemonHandle.AddToOperations({
                type: "REMOVE",
                targetNode: NearestContainer
            });
            MoveCaretToLastEOL(window.getSelection(), EditorElementRef.current!);
            DaemonHandle.SyncNow();
            return;
        }
        
        // Run the component spec handler if present
        if (typeof LastActivationCache.current.return?.backspace === 'function') {
            console.log("Backspace: Component Spec Logic");
            if (LastActivationCache.current.return?.backspace(ev) !== true)
                return;
        }
        
        // Dealing with container type of element
        if (previousElementSibling.nodeType === Node.ELEMENT_NODE && (previousElementSibling as HTMLElement)?.hasAttribute('data-md-container')) {
            console.log("Backspace: Container Item");
            
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
        console.log("Backspace: Line Join");
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
        
        MoveCaretToLastEOL(window.getSelection(), EditorElementRef.current!);
        DaemonHandle.SyncNow();
    }
    
    function DelKeyHandler(ev: HTMLElementEventMap['keydown']) {
        
        let {RemainingText, CurrentSelection, CurrentAnchorNode} = GetCaretContext();
        
        if (!CurrentAnchorNode) return;
        
        let NearestContainer = FindWrappingElementWithinContainer(CurrentAnchorNode, EditorElementRef.current!)
        if (!NearestContainer) return;
        
        const bCaretOnContainer = CurrentAnchorNode === NearestContainer;
        const bHasContentToDelete = RemainingText.trim() !== '' || (CurrentAnchorNode.nextSibling && CurrentAnchorNode.nextSibling.textContent !== '\n');
        const bAnchorIsTextNode = CurrentAnchorNode.nodeType === Node.TEXT_NODE;
        
        // Expanded selection, use browser defualt logic
        if (CurrentSelection && !CurrentSelection.isCollapsed) return;
        if (!bCaretOnContainer && bHasContentToDelete && bAnchorIsTextNode) return;   // NOTE: when deleting text, default browser logic behaved strangely and will see the caret moving back and forth
        
        // line joining
        ev.preventDefault();
        ev.stopPropagation();
        
        // NOTE: this is an override on editing text, so far only needed for del key
        // TODO: Incomplete,browser's logic cause caret to move back and fourth, but re-implementing causes too much problem, saving this for reference.
        // if (!bCaretOnContainer && bHasContentToDelete && bAnchorIsTextNode) {
        //     if (RemainingText !== '') {
        //         CurrentAnchorNode.deleteData(CurrentSelection?.anchorOffset, 1);
        //         return;
        //     }
        //     let nextSibling = CurrentAnchorNode.nextSibling;
        //     if (!nextSibling) return;
        //     // Delete the first character of the next text node
        //     if (nextSibling.nodeType === Node.TEXT_NODE) {
        //         (nextSibling as Text).deleteData(0, 1);
        //         MoveCaretToNode(nextSibling);
        //     }
        //     if (nextSibling.nodeType === Node.ELEMENT_NODE) {
        //         let textNode = GetFirstTextNode(nextSibling);
        //         if (!textNode) return MoveCaretIntoNode(textNode);
        //         (textNode as Text).deleteData(0, 1);
        //         MoveCaretToNode(textNode);
        //     }
        //     return;
        // }
        
        let nextElementSibling = NearestContainer?.nextElementSibling; //nextsibling could be a "\n"
        if (!nextElementSibling) return; //No more lines following
        
        
        // same as back space, when there is still content that could be deleted, but caret lands on the wrong element
        // FIXME: may be buggy
        if (CurrentAnchorNode.nextSibling && CurrentAnchorNode.nextSibling !== nextElementSibling) {
            console.log("Del: Invalid Caret, moving Caret to ", CurrentAnchorNode);
            MoveCaretIntoNode(CurrentAnchorNode);
            return;
        }
        
        // Move the caret, mainly dealing with nested node structure with their own text nodes
        let anchorParent = CurrentAnchorNode.parentNode;
        if (CurrentAnchorNode.parentNode && anchorParent !== NearestContainer) {
            const nearestSibling = GetNextAvailableSibling(CurrentAnchorNode, NearestContainer);
            if (nearestSibling) {
                console.log("Del: Moving Caret to ", nearestSibling);
                MoveCaretToNode(nearestSibling, 0);
                return;
            }
        }
        
        // Line joining logics
        // deleting empty lines
        if (nextElementSibling?.childNodes.length === 1 && nextElementSibling?.firstChild?.nodeName.toLowerCase() === 'br') {
            console.log("Del:Delete Empty Line");
            DaemonHandle.AddToOperations({
                type: "REMOVE",
                targetNode: nextElementSibling
            });
            DaemonHandle.SyncNow();
            return;
        }
        
        // self is empty line
        if (NearestContainer?.childNodes.length === 1 && NearestContainer?.firstChild?.nodeName.toLowerCase() === 'br') {
            console.log("Del:Self Empty Line");
            DaemonHandle.AddToOperations({
                type: "REMOVE",
                targetNode: NearestContainer
            });
            DaemonHandle.SyncNow();
            return;
        }
        
        // Run the component spec handler if present
        if (typeof LastActivationCache.current.return?.del === 'function') {
            console.log("Del: Component Spec Deleting");
            
            if (LastActivationCache.current.return?.del(ev) !== true)
                return
        }
        
        // Dealing with container type of element
        if (nextElementSibling.nodeType === Node.ELEMENT_NODE && (nextElementSibling as HTMLElement)?.hasAttribute('data-md-container')) {
            console.log("Del: Container Item");
            
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
        console.log("Del:Line join");
        
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
    
    // First time loading
    useEffect(() => {
        ;(async () => {
            // convert MD to HTML
            const convertedHTML: string = String(await MD2HTML(sourceMD));
            let CleanedHTML = HTMLCleanUP(convertedHTML);
            
            // Save a copy of HTML
            const HTMLParser = new DOMParser();
            EditorSourceDOCRef.current = HTMLParser.parseFromString(String(CleanedHTML), "text/html");
            
            // save a text copy
            EditorSourceStringRef.current = String(CleanedHTML);
            // load editor component
            setEditorComponent(ConfigAndConvertToReact(String(CleanedHTML)))
        })()
        
    }, [sourceMD]);
    
    // Masking and unmasking to hide flicker
    useLayoutEffect(() => {
        if (!EditorElementRef.current || !EditorMaskRef.current) return;
        // After elements are properly loaded, hide the mask to show editor content
        EditorElementRef.current.classList.remove("No-Vis");
        EditorMaskRef.current.classList.add('Hide-It');
        EditorMaskRef.current.innerHTML = " ";
    });
    
    // Editor level selection status monitor
    useLayoutEffect(() => {
        const OnSelectionChange = () => ComponentActivationSwitch();
        const OnSelectStart = () => ComponentActivationSwitch();
        
        document.addEventListener("selectstart", OnSelectStart);
        document.addEventListener("selectionchange", OnSelectionChange);
        
        return () => {
            document.removeEventListener("selectstart", OnSelectStart);
            document.removeEventListener("selectionchange", OnSelectionChange);
        }
        
    }, [EditorElementRef.current, document]);
    
    // Override keys
    useLayoutEffect(() => {
        
        function EditorKeydown(ev: HTMLElementEventMap['keydown']) {
            if (ev.key === "Enter") {
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
            if (AutoCompleteSymbols.test(ev.key)) {
                ev.stopPropagation();
                ev.stopImmediatePropagation();
                ev.preventDefault();
                AutocompleteHandler(ev.key);
            }
        }
        
        EditorElementRef.current?.addEventListener("keydown", EditorKeydown);
        return () => {
            EditorElementRef.current?.removeEventListener("keydown", EditorKeydown);
        }
    }, [EditorElementRef.current])
    
    const DaemonHandle = useEditorHTMLDaemon(EditorElementRef, EditorSourceDOCRef, ReloadEditorContent,
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
                <main className={'Editor-Inner'} ref={EditorElementRef}>
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

/**
 * The hack func that retrieves the react fiber and thus the active component
 */
function FindActiveEditorComponentFiber(DomNode: HTMLElement, TraverseUp = 0): any {
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
    
    if (!key) return;
    
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

/**
 * Moves the caret to the last end of line (EOL) position within the provided container element.
 * If a current selection is not provided or does not exist, the method will return without performing any action.
 * Used in handling backspace, move caret then sync is more reliable than to set up future token
 *
 * @param {Selection | null} currentSelection - The current selection.
 * @param {HTMLElement} ContainerElement - The container element within which the caret will be moved.
 */
function MoveCaretToLastEOL(currentSelection: Selection | null, ContainerElement: HTMLElement) {
    if (!currentSelection) return;
    let CurrentAnchor = currentSelection.anchorNode;
    if (!CurrentAnchor) return;
    
    const NearestParagraph = FindWrappingElementWithinContainer(CurrentAnchor, ContainerElement);
    
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

/**
 * Returns the next available sibling of a given node within an upper limit.
 *
 * @param {Node | HTMLElement} node - The starting node to find the next available sibling.
 * @param {Node | HTMLElement} upperLimit - The upper limit node to stop the search.
 * @return {Node | null} - The next available sibling or null if not found.
 */
function GetNextAvailableSibling(node: Node | HTMLElement, upperLimit: Node | HTMLElement): Node | null {
    let current = node;
    
    do {
        let nextSibling = current.nextSibling;
        if (nextSibling && (nextSibling.nodeType === Node.ELEMENT_NODE || nextSibling.textContent && nextSibling.textContent !== '\n')) {
            return nextSibling;
        }
        
        current = current.parentNode as Node;
        
    } while (current && current !== upperLimit);
    
    return null;
}

/**
 * Returns the previous available sibling of a given node within a specified upper limit.
 * An available sibling is defined as the previous sibling that is either an element node or has non-empty text content.
 * If no available sibling is found, null is returned.
 *
 * @param {Node | HTMLElement} node - The node to find the previous available sibling for.
 * @param {Node | HTMLElement} upperLimit - The upper limit node to stop searching for the previous sibling.
 * @return {Node | null} - The previous available sibling of the given node, or null if not found.
 */
function GetPrevAvailableSibling(node: Node | HTMLElement, upperLimit: Node | HTMLElement): Node | null {
    let current = node;
    
    do {
        let previousSiblingNode = current.previousSibling;
        if (previousSiblingNode && (previousSiblingNode.nodeType === Node.ELEMENT_NODE || previousSiblingNode.textContent && previousSiblingNode.textContent !== '\n')) {
            return previousSiblingNode;
        }
        
        current = current.parentNode as Node;
        
    } while (current && current !== upperLimit);
    
    return null;
}
