import React, {
    useState,
    useEffect,
    createElement,
    Fragment,
    useRef
} from "react";
import {HTML2React, MD2HTML} from "../Utils";
import useEditMonitor from "../hooks/useEditMonitor";

const MarkdownFakeDate = `
 # Welcome to @[aaa] Editor! @[bbb]

 Hi! I'm your first Markdown file in **Editor**.

 custom link **syntax**: @[ccc] AHHHHHHHHH
`
export default function Editor() {

    const [sourceMD, setSourceMD] = useState(MarkdownFakeDate);

    const [EditorContent, setEditorContent] = useState(createElement(Fragment));
    //Has to set the type for typescript
    const EditorRef = useRef<HTMLDivElement | null>(null)


    useEffect(() => {
        ;(async () => {

            const md2HTML = await MD2HTML(sourceMD);

            const componentOptions = {
                ...TextNodesMappingConfig,
                "span": (props: any) => <SpecialLinkComponent {...props}/>
            }
            const EditorComponents = await HTML2React(md2HTML, componentOptions);

            setEditorContent(EditorComponents.result);
        })()

    }, [sourceMD])

    let ExtractMD = () => {

    }

    // useEditMonitor(EditorRef);

    return (
        <>
            <button className={"bg-amber-600"} onClick={ExtractMD}>Save</button>
            <div className="Editor" ref={EditorRef}>
                {EditorContent}
            </div>
        </>
    )
}

// Map all possible text-containing tags to TextContainer component and therefore manage them.
const TextNodesMappingConfig = ['a', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'ul', 'ol', 'li', 'code', 'pre', 'em', 'strong']
    .reduce((acc: Record<string, React.FunctionComponent<any>>, tagName: string) => {
        acc[tagName] = (props: any) => <TextContainer {...props} tagName={tagName}/>;
        return acc;
    }, {});


function SpecialLinkComponent(props: any) {
    const {children, ...otherProps} = props;
    return React.createElement('span', otherProps, children);
}

function TextWrapper(props: any) {
    const {children} = props;
    return (
        <span className={"Text-Wrapper"}>{children}</span>
    )
}

function TextContainer(props: any) {

    const {children, tagName, ...otherProps} = props;

    const NewChildrenNodes = React.Children.map(children,
        (childNode) =>
            typeof childNode === 'string'
                ? <TextWrapper>{childNode}</TextWrapper>
                : childNode
    );

    return React.createElement(tagName, otherProps, NewChildrenNodes);
}
