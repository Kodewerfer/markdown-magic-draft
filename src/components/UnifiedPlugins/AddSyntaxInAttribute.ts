import {visit} from 'unist-util-visit'

function AddSyntaxAttrTransformer(ast: object) {
    visit<any, any>(ast, 'element', Visitor)
    
    function Visitor(node: any, index: any, parent: any) {
        
        const NodeProps = node.properties || (node.properties = {});
        // const NodeProps = node.properties && (node.properties = {})
        const tagName = node.tagName.toLowerCase();
        
        // special cases, when element is a part of a "composite" element
        let parentTagName: string = parent.tagName?.toLowerCase();
        
        // ['p','a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'ul', 'ol', 'li', 'code', 'pre', 'em', 'strong', 'del']
        switch (tagName) {
            case 'a':
                NodeProps['data-md-link'] = "true";
                break
            case 'p':
                NodeProps['data-md-paragraph'] = "true";
                break;
            case 'h1':
                NodeProps['data-md-header'] = "# ";
                break;
            case 'h2':
                NodeProps['data-md-header'] = "## ";
                break;
            case 'h3':
                NodeProps['data-md-header'] = "### ";
                break;
            case 'h4':
                NodeProps['data-md-header'] = "#### ";
                break;
            case 'h5':
                NodeProps['data-md-header'] = "##### ";
                break;
            case 'h6':
                NodeProps['data-md-header'] = "###### ";
                break;
            case 'strong':
                NodeProps['data-md-syntax'] = "**";
                NodeProps['data-md-wrapped'] = 'true';
                NodeProps['data-md-inline'] = 'true';
                break;
            case 'em':
                NodeProps['data-md-syntax'] = "*";
                NodeProps['data-md-wrapped'] = 'true';
                NodeProps['data-md-inline'] = 'true';
                break;
            case 'del':
                NodeProps['data-md-syntax'] = "~~";
                NodeProps['data-md-wrapped'] = 'true';
                NodeProps['data-md-inline'] = 'true';
                break;
            case 'code':
                NodeProps['data-md-syntax'] = "`";
                NodeProps['data-md-wrapped'] = 'true';
                NodeProps['data-md-code'] = 'true';
                break;
            // Container-like elements
            case 'hr':
                // Hr is more of a "block" element, added the attr in so that del and backspace will have an easier time dealing with it
                NodeProps['data-md-container'] = "true";
                break;
            case 'blockquote':
                NodeProps['data-md-syntax'] = ">";
                NodeProps['data-md-blockquote'] = "true";
                NodeProps['data-md-container'] = "true";
                break;
            case 'ul':
                NodeProps['data-md-syntax'] = "-";
                NodeProps['data-md-list'] = "true";
                NodeProps['data-md-container'] = 'true';
                break;
            case 'pre':
                NodeProps['data-md-syntax'] = "```";
                NodeProps['data-md-wrapped'] = 'true';
                NodeProps['data-md-preformatted'] = 'true';
                NodeProps['data-md-container'] = 'true';
                break;
            // case 'thead':
            //     NodeProps['data-md-syntax'] = "| --- | --- |";
            //     break;
        }
        
        // Switch on parent tag names
        switch (parentTagName) {
            case 'blockquote': // a single block quote item
                NodeProps['data-md-quote-item'] = "true";
                break;
            case 'ul': //list item
                NodeProps['data-md-list-item'] = "true";
                break;
            case 'pre': //pre item usually a single code element that serves as a code block, different from inline code element
                NodeProps['data-md-pre-item'] = "true";
                if (tagName === 'code') NodeProps['data-md-syntax'] = "```"; //override the md syntax
                break;
        }
        
        return node;
    }
}

export const AddSyntaxInAttribute = () => AddSyntaxAttrTransformer