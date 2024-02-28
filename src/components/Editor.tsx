import React, {Profiler, useEffect, useLayoutEffect, useRef, useState} from "react";
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
    
    const [isEditingSubElement, setIsEditingSubElement] = useState(false);
    const EditingQueue: React.MutableRefObject<TSubElementsQueue> = useRef<TSubElementsQueue>({});
    
    const toggleEditingSubElement = (bSubEditing: boolean, Identifier: string, ElementRef: HTMLElement, ChangeRecord?: MutationRecord) => {
        if (!Identifier) {
            console.warn('Editing Sub Element with invalid Identifier', ElementRef);
            return;
        }
        
        console.log("Sub triggered:", bSubEditing, " ID:", Identifier)
        
        if (EditingQueue.current === null || EditingQueue.current === undefined) {
            EditingQueue.current = {};
        }
        
        if (!bSubEditing) {
            if (typeof EditingQueue.current[Identifier] !== 'undefined') {
                let {[Identifier]: value, ...remaining} = EditingQueue.current;
                EditingQueue.current = remaining;
            }
            
            if (EditingQueue.current && Object.keys(EditingQueue.current).length === 0) {
                setIsEditingSubElement(false);
            }
            
            if (ChangeRecord) {
                DaemonHandle.AddToRecord(ChangeRecord);
            }
            
            return;
        }
        
        EditingQueue.current[Identifier] = ElementRef
        setIsEditingSubElement(true);
    }
    
    async function ExtractMD() {
        const ConvertedMarkdown = await HTML2MD(EditorHTMLString.current);
        console.log(String(ConvertedMarkdown));
    }
    
    function MaskEditingArea() {
        
        if (!EditorMaskRef.current || !EditorMaskRef.current.innerHTML) return;
        
        const editorInnerHTML = EditorRef.current?.innerHTML;
        if (editorInnerHTML) {
            EditorRef.current?.classList.add("No-Vis");
            EditorMaskRef.current!.innerHTML = editorInnerHTML;
            EditorMaskRef.current!.classList.remove("Hide-It");
        }
    }
    
    async function ReloadEditorContent() {
        if (!EditorSourceRef.current) return;
        const bodyElement: HTMLBodyElement | null = EditorSourceRef.current.documentElement.querySelector('body');
        if (!bodyElement) return;
        EditorHTMLString.current = String(bodyElement!.innerHTML);
        setEditorComponent(EditorConverter(EditorHTMLString.current));
    }
    
    function TextNodeHandler(textNode: Node) {
        if (textNode.textContent === null) return;
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
    
    function EditorConverter(md2HTML: Compatible) {
        
        // Map all possible text-containing tags to TextContainer component and therefore manage them.
        const TextNodesMappingConfig: Record<string, React.FunctionComponent<any>> = ['p', 'span', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'ul', 'ol', 'li', 'code', 'pre', 'em', 'strong', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'br', 'img', 'del', 'input', 'hr']
            .reduce((acc: Record<string, React.FunctionComponent<any>>, tagName: string) => {
                acc[tagName] = (props: any) => {
                    // inline syntax
                    if (props['data-md-syntax'] && props['data-md-container'] !== 'true') {
                        if (props['data-link-to']) {
                            return <SpecialLinkComponent {...props}
                                                         ParentAction={toggleEditingSubElement}
                                                         tagName={tagName}/>;
                        }
                        //Containers
                        //Simple syntax
                        return <PlainSyntax {...props}
                                            ParentAction={toggleEditingSubElement}
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
                    
                    // Placeholder
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
            setEditorComponent(EditorConverter(convertedHTML))
        })()
        
    }, [sourceMD]);
    
    useLayoutEffect(() => {
        if (!EditorRef.current || !EditorMaskRef.current) return;
        // After elements are properly loaded, hide the mask to show editor content
        EditorRef.current.classList.remove("No-Vis");
        EditorMaskRef.current.classList.add('Hide-It');
        EditorMaskRef.current.innerHTML = " ";
    });
    
    useLayoutEffect(() => {
        // Editor level selection status monitor
        const debouncedSelectionMonitor = _.debounce((ev: Event) => {
            const selection: Selection | null = window.getSelection();
            if (!selection) return;
            // Must be an editor element
            if (!EditorRef.current?.contains(selection?.anchorNode)) return;
            // Must not contains multiple elements
            if (!selection.isCollapsed && selection.anchorNode !== selection.focusNode) return;
            
            // console.log('Editor selection!', selection.anchorNode)
            
        }, 200);
        const OnSelectionChange = (ev: Event) => debouncedSelectionMonitor(ev);
        const OnSelectStart = (ev: Event) => debouncedSelectionMonitor(ev);
        
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
            TextNodeCallback: TextNodeHandler,
            ShouldLog: true,
            IsEditable: !isEditingSubElement,
            ShouldObserve: !isEditingSubElement
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
    const ParagraphRef = useRef<HTMLElement | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const IgnoreItemRef = useRef<HTMLElement>();
    
    useLayoutEffect(() => {
        if (isHeader && IgnoreItemRef.current) {
            daemonHandle.AddToIgnore(IgnoreItemRef.current, "any");
            daemonHandle.AddToOperation(IgnoreItemRef.current, "remove", {type: "ADD"});
            
        }
    });
    
    return React.createElement(tagName, {
        ...otherProps,
        ref: ParagraphRef,
    }, [
        isHeader && React.createElement('span', {
            key: 'HeaderSyntaxLead',
            ref: IgnoreItemRef,
            contentEditable: false,
        }, headerSyntax),
        ...(Array.isArray(children) ? children : [children]),
    ]);
};

const CommonRenderer = (props: any) => {
    const {children, tagName, ParentAction, ...otherProps} = props;
    
    return React.createElement(tagName, otherProps, children);
};

function SpecialLinkComponent(props: any) {
    const {children, tagName, ParentAction, ...otherProps} = props;
    return React.createElement(tagName, otherProps, children);
}

function PlainSyntax(props: any) {
    const {tagName, ParentAction, children, ...otherProps} = props;
    
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
    
    const ElementRef = useRef<HTMLElement | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const IdentifierRef = useRef<string | undefined>(undefined);
    
    useLayoutEffect(() => {
        const OnClick = (ev: Event) => {
            ev.stopPropagation();
            ElementRef.current?.focus();
        };
        
        const OnFocus = (ev: HTMLElementEventMap['focusin']) => {
            ev.stopPropagation();
            
            if (!isEditing)
                setIsEditing(true);
            
            const timestamp = new Date().valueOf();
            const generatedId: string = _.uniqueId("_" + ElementRef.current?.tagName.toLowerCase());
            IdentifierRef.current = timestamp + generatedId;
            
            
            ParentAction(true, IdentifierRef.current, ElementRef.current);
            
        };
        
        const OnFocusOut = (ev: Event) => {
            ev.stopPropagation();
            if (!ElementRef.current) return;
            
            let mutation;
            
            if (!ElementRef.current.firstChild || ElementRef.current.firstChild.textContent === '' || ElementRef.current.firstChild.textContent === null) {
                mutation = {
                    type: "childList",
                    target: ElementRef.current?.parentNode,
                    removedNodes: [ElementRef.current],
                }
            } else {
                mutation = {
                    type: "characterData",
                    oldValue: String(children),
                    target: ElementRef.current?.firstChild!,
                    newValue: ElementRef.current?.firstChild!.nodeValue
                }
            }
            
            ParentAction(false, IdentifierRef.current, ElementRef.current, mutation);
            setIsEditing(false);
        }
        
        const OnKeydown = (ev: HTMLElementEventMap['keydown']) => {
            if (ev.key === 'Enter') {
                ev.stopPropagation();
                ev.preventDefault();
                ElementRef.current?.blur();
            }
        }
        
        ElementRef.current?.addEventListener("mouseup", OnClick);
        ElementRef.current?.addEventListener("focusin", OnFocus);
        ElementRef.current?.addEventListener("focusout", OnFocusOut);
        // prevent enter breaking new line
        ElementRef.current?.addEventListener("keydown", OnKeydown);
        
        return () => {
            ElementRef.current?.removeEventListener("mouseup", OnClick);
            ElementRef.current?.removeEventListener("focusin", OnFocus);
            ElementRef.current?.removeEventListener("focusout", OnFocusOut);
            
            ElementRef.current?.removeEventListener("keydown", OnKeydown);
        }
    }, [ElementRef.current!])
    
    return React.createElement(tagName, {
        tabIndex: -1,
        ...(isEditing ? {contentEditable: true, suppressContentEditableWarning: true} : {}),
        suppressContentEditableWarning: true,
        ...otherProps,
        ref: ElementRef,
    }, isEditing ? childrenWithSyntax : children);
    
}

// Modified helper function to get react component from Dom Element
// FIXME: this is a terrible hack.
function FindReactComponent(DomNode: HTMLElement, traverseUp: number = 0): any {
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
    
    // If traverseUp is specified, we move up the component tree
    for (let i = 0; i < traverseUp; i++) {
        compFiber = getCompFiber(compFiber);
    }
    
    return compFiber.stateNode;
}