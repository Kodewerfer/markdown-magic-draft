import React, {useDebugValue, useEffect, useLayoutEffect, useRef, useState} from "react";
import {renderToString} from 'react-dom/server';
import {HTML2MD, HTML2ReactSnyc, MD2HTML, MD2HTMLSync} from "../Utils/Conversion";
import useEditorHTMLDaemon, {TDaemonReturn} from "../hooks/useEditorHTMLDaemon";
import {Compatible} from "unified/lib";
import "./Editor.css";
import _ from 'lodash';


type TSubElementsQueue = {
    [key: string]: HTMLElement | null;
};

type TEditorProps = {
    SourceData?: string | undefined
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
    
    const ActiveComponentStack = useRef<((arg: boolean) => void)[]>([]);
    const AnchorNodeLastCache = useRef<Node | null>(null);
    
    // Subsequence reload
    async function ReloadEditorContent() {
        if (!EditorSourceRef.current) return;
        const bodyElement: HTMLBodyElement | null = EditorSourceRef.current.documentElement.querySelector('body');
        if (!bodyElement) return;
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
                            return <SpecialLinkComponent {...props}
                                                         daemonHandle={DaemonHandle}
                                                         tagName={tagName}/>;
                        }
                        //Containers
                        //Simple syntax
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
    
    // First time loading
    useEffect(() => {
        ;(async () => {
            // convert MD to HTML
            const convertedHTML: string = String(await MD2HTML(sourceMD));
            
            // Save a copy of HTML
            const HTMLParser = new DOMParser()
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
        const debouncedSelectionMonitor = _.debounce(() => {
            const selection: Selection | null = window.getSelection();
            if (!selection) return;
            // Must be an editor element
            if (!EditorRef.current?.contains(selection?.anchorNode)) return;
            // Must not contains multiple elements
            if (!selection.isCollapsed && selection.anchorNode !== selection.focusNode) return;
            
            if (AnchorNodeLastCache.current === selection.anchorNode) return;
            // refresh the cache
            AnchorNodeLastCache.current = selection.anchorNode;
            
            // retrieve the component, set the editing state
            const findActiveEditorComponent: any = FindActiveEditorComponent(selection.anchorNode! as HTMLElement);
            
            // FIXME: This is VERY VERY VERY HACKY
            // FIXME: right now the logic is - for a editor component, the very first state need to be a function that handles all logic for "mark as active"
            // FIXME: with the old class components, after gettng the components from dom, you can get the "stateNode" and actually call the setState() from there
            if (findActiveEditorComponent) {
                // Switch off the last
                let LastestActive;
                while (LastestActive = ActiveComponentStack.current.shift()) {
                    LastestActive(false);
                }
                // Switch on the current, add to cache
                if (findActiveEditorComponent.memoizedState && typeof findActiveEditorComponent.memoizedState.memoizedState === "function") {
                    ActiveComponentStack.current.push(findActiveEditorComponent.memoizedState.memoizedState);
                    findActiveEditorComponent.memoizedState.memoizedState(true);
                }
            }
            
        }, 200);
        const OnSelectionChange = (ev: Event) => debouncedSelectionMonitor();
        const OnSelectStart = (ev: Event) => debouncedSelectionMonitor();
        
        document.addEventListener("selectstart", OnSelectStart);
        document.addEventListener("selectionchange", OnSelectionChange);
        
        return () => {
            document.removeEventListener("selectstart", OnSelectStart);
            document.removeEventListener("selectionchange", OnSelectionChange);
        }
        
    }, [EditorRef.current, document]);
    
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

const Paragraph = ({children, tagName, isHeader, headerSyntax, daemonHandle, ...otherProps}: {
    children: React.ReactNode[] | React.ReactNode;
    tagName: string;
    isHeader: boolean;
    headerSyntax: string;
    daemonHandle: TDaemonReturn; // replace Function with a more specific function type if necessary
    [key: string]: any; // for otherProps
}) => {
    const [SetActivation] = useState<(state: boolean) => void>(() => {
        return (state: boolean) => {
            // setIsEditing((prev) => {
            //     return !prev;
            // });
            setIsEditing(state);
        }
    }); // the Meta state, called by parent via dom fiber
    const [isEditing, setIsEditing] = useState(false); //Not directly used, but VITAL
    const MainElementRef = useRef<HTMLElement | null>(null);
    const SyntaxElementRef = useRef<HTMLElement>();  //filler element
    const ChildrenHTMLString = useRef("");
    
    // Add filler element to ignore, add filler element's special handling operation
    useEffect(() => {
        if (isHeader && SyntaxElementRef.current) {
            daemonHandle.AddToIgnore(SyntaxElementRef.current, "any");
            if (MainElementRef.current) {
                const ReplacementElement = document.createElement('p') as HTMLElement;
                ReplacementElement.innerHTML = ExtraRealChild(children);
                
                daemonHandle.AddToBindOperation(SyntaxElementRef.current, "remove", {
                    type: "REPLACE",
                    targetNode: MainElementRef.current,
                    newNode: ReplacementElement
                });
            }
        }
    });
    
    return React.createElement(tagName, {
        ...otherProps,
        ref: MainElementRef,
    }, [
        isHeader && React.createElement('span', {
            key: 'HeaderSyntaxLead',
            ref: SyntaxElementRef,
            contentEditable: false,
            className: ` ${isEditing ? '' : 'Hide-It'}`
        }, headerSyntax),
        ...(Array.isArray(children) ? children : [children]),
    ]);
};

const CommonRenderer = (props: any) => {
    const {children, tagName, ParentAction, ...otherProps} = props;
    
    return React.createElement(tagName, otherProps, children);
};

// TODO
function SpecialLinkComponent(props: any) {
    const {children, tagName, ParentAction, ...otherProps} = props;
    return React.createElement(tagName, otherProps, children);
}

function PlainSyntax({children, tagName, daemonHandle, ...otherProps}: {
    children: React.ReactNode[] | React.ReactNode;
    tagName: string;
    daemonHandle: TDaemonReturn; // replace Function with a more specific function type if necessary
    [key: string]: any; // for otherProps
}) {
    
    const [SetActivation] = useState<(state: boolean) => void>(() => {
        return (state: boolean) => {
            // send whatever within the text node before re-rendering to the processor
            if (!state) {
                if (WholeElementRef.current && WholeElementRef.current.firstChild) {
                    const textNodeResult = TextNodeProcessor(WholeElementRef.current.firstChild);
                    if (textNodeResult) {
                        daemonHandle.AddToOperationAndSync({
                            type: "REPLACE",
                            targetNode: WholeElementRef.current,
                            newNode: textNodeResult[0] //first result node only
                        });
                    }
                }
            }
            if (state) {
                daemonHandle.SyncNow();
            }
            setIsEditing(state);
        }
    }); // the Meta state, called by parent via dom fiber
    
    const [isEditing, setIsEditing] = useState(false); //Reactive state, toggled by the meta state
    
    const propSyntaxData: any = otherProps['data-md-syntax'];
    const propShouldWrap: any = otherProps['data-md-wrapped'];
    
    const [childrenWithSyntax] = useState<String>(() => {
        let result;
        if (propSyntaxData) {
            result = propSyntaxData + children;
            if (propShouldWrap === 'true')
                result += propSyntaxData;
        }
        
        return result;
    });
    
    const WholeElementRef = useRef<HTMLElement | null>(null);
    
    useLayoutEffect(() => {
        if (WholeElementRef.current && WholeElementRef.current?.firstChild)
            daemonHandle.AddToIgnore(WholeElementRef.current?.firstChild, "any");
        // if (WholeElementRef.current)
        //     const ReplacementElement = document.createTextNode(ExtraRealChild(children));
    });
    
    const OnKeydown = (ev: HTMLElementEventMap['keydown']) => {
        if (ev.key === 'Enter') {
            ev.stopPropagation();
            ev.preventDefault();
        }
    }
    
    return React.createElement(tagName, {
        ...otherProps,
        ref: WholeElementRef,
        onKeyDown: OnKeydown,
    }, isEditing ? childrenWithSyntax : children);
    
}

function ExtraRealChild(children: React.ReactNode[] | React.ReactNode) {
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

// Modified helper function to find domfiber
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

function TextNodeProcessor(textNode: Node) {
    if (textNode.textContent === null) {
        console.warn(textNode, " Not a text node.");
        return
    }
    const convertedHTML = String(MD2HTMLSync(textNode.textContent));
    
    let DOC = new DOMParser().parseFromString(convertedHTML, "text/html");
    
    const treeWalker: TreeWalker = DOC.createTreeWalker(DOC, NodeFilter.SHOW_TEXT);
    let newNodes: Node[] = [];
    let newTextNode;
    while (newTextNode = treeWalker.nextNode()) {
        
        if (!newTextNode.parentNode) continue;
        
        if (newTextNode.parentNode.nodeName.toLowerCase() === 'p'
            || newTextNode.parentNode.nodeName.toLowerCase() === 'body') {
            newNodes.push(newTextNode);
        } else {
            newNodes.push(newTextNode.parentNode);
        }
    }
    
    if (newNodes.length === 0) return null;
    
    return newNodes;
}