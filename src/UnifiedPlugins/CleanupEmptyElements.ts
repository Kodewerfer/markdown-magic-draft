import {visit} from 'unist-util-visit'
import {remove} from 'unist-util-remove';
import {h} from 'hastscript'

const SelfClosingHTMLElementsMap = new Map<string, boolean>([
    ["area", true],
    ["base", true],
    ["br", true],
    ["col", true],
    ["command", true],
    ["embed", true],
    ["hr", true],
    ["img", true],
    ["input", true],
    ["keygen", true],
    ["link", true],
    ["meta", true],
    ["param", true],
    ["source", true],
    ["track", true],
    ["wbr", true]
]);

function ElementsCleanupTransformer(ast: object) {
    
    visit<any, any>(ast, 'element', Visitor);
    
    
    function Visitor(node: any, index: any, parent: any) {
        
        if (node.type.toLowerCase() === "element" && !SelfClosingHTMLElementsMap.get(node.tagName) && !node.children.length) {
            
            if (node.tagName === 'li' || (node.tagName === 'code' && parent.tagName === 'pre')) {
                
                const mockupElement = h("span", "\u00A0");
                node.children && node.children.push(...mockupElement.children);
                return node;
                
            } else {
                
                remove(parent, node);
            }
            
        }
        
        return node;
    }
}

export const CleanupEmptyElements = () => ElementsCleanupTransformer