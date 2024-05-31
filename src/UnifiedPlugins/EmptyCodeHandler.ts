import {visit} from 'unist-util-visit'


/**
 * This is needed for a special quirk when converting triple backticks to pre element with unified.
 * the pre element doesn't need the closing part for it to be converted, thus if the triple backticks are surrounding a whitespace,
 * the ending triple backticks becomes the content of the code element within
 * this plugin manually correct it each time it happens
 */
function EmptyCodeTransformer(ast: object) {
    
    visit<any, any>(ast, 'element', Visitor);
    
    
    function Visitor(node: any, index: any, parent: any) {
        
        if (node.tagName === 'code' && parent.tagName === 'pre' && Array.isArray(node.children)) {
            for (let item of node.children) {
                if (item.type === 'text' && typeof item.value === 'string' && item.value.trim() === "```") {
                    item.value = "\u00A0";
                }
            }
        }
        
        return node;
    }
}

export const EmptyCodeHandler = () => EmptyCodeTransformer