import {visit} from 'unist-util-visit'
import {remove} from 'unist-util-remove';

function TagsCleanupTransformer(ast: object) {
    visit<any, any>(ast, 'element', Visitor)
    
    function Visitor(node: any, index: any, parent: any) {
        
        const NodeProps = node.properties || (node.properties = {});
        // const NodeProps = node.properties && (node.properties = {})
        
        if (NodeProps['dataIsGenerated']) {
            return remove(node);
        }
        
        return node;
    }
}

export const CleanupGeneratedTags = () => TagsCleanupTransformer