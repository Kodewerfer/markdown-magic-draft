import {visit} from 'unist-util-visit'

function Transformer(ast: object) {
    visit<any, any>(ast, 'element', Visitor)
    
    function Visitor(node: any, index: any, parent: any) {
        
        const NodeProps = node.properties || (node.properties = {});
        
        const tagName = node.tagName.toLowerCase();
        
        // Add as ID could break how caret restoration works
        NodeProps.dataKey = `${tagName}_${Math.random().toString(36).slice(2)}_${index}`;
        
        return node;
    }
}

export const AddKeyToElement = () => Transformer