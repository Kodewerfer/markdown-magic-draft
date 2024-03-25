import {visit} from 'unist-util-visit'

function AddSyntaxAttrTransformer(ast: object) {
    visit<any, any>(ast, 'element', Visitor)
    
    function Visitor(node: any, index: any, parent: any) {
        
        const NodeProps = node.properties || (node.properties = {})
        const tagName = node.tagName.toLowerCase();
        
        // special cases, when element is a part of a "composite" element
        let parentTagName: string = parent.tagName?.toLowerCase();
        switch (parentTagName) {
            case 'blockquote':
                NodeProps['data-md-quote-item'] = "true";
                return;
            case 'ul':
                NodeProps['data-md-list-item'] = "true";
                return;
            case 'pre':
                NodeProps['data-md-pre-item'] = "true";
                return;
        }
        
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
                break;
            case 'em':
                NodeProps['data-md-syntax'] = "_";
                NodeProps['data-md-wrapped'] = 'true';
                break;
            case 'del':
                NodeProps['data-md-syntax'] = "~~";
                NodeProps['data-md-wrapped'] = 'true';
                break;
            // Container-like elements
            case 'blockquote':
                NodeProps['data-md-syntax'] = ">";
                NodeProps['data-md-blockquote'] = "true";
                NodeProps['data-md-container'] = "true";
                break;
            case 'ul':
            case 'ol':
            case 'li':
                NodeProps['data-md-syntax'] = "-";
                NodeProps['data-md-list'] = "true";
                NodeProps['data-md-container'] = 'true';
                break;
            case 'pre':
                NodeProps['data-md-syntax'] = "```";
                NodeProps['data-md-wrapped'] = 'true';
                NodeProps['data-md-container'] = 'true';
                break;
            case 'code':
                NodeProps['data-md-syntax'] = "`";
                NodeProps['data-md-wrapped'] = 'true';
                NodeProps['data-md-container'] = 'true';
                break;
            // case 'thead':
            //     NodeProps['data-md-syntax'] = "| --- | --- |";
            //     break;
        }
        return node;
    }
}

export const AddSyntaxInAttribute = () => AddSyntaxAttrTransformer