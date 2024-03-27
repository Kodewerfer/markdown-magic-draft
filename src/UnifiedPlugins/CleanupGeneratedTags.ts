import {visit} from 'unist-util-visit'
import {remove} from 'unist-util-remove';

function TagsCleanupTransformer(ast: object) {
    visit<any, any>(ast, 'element', Visitor)
    
    function Visitor(node: any, index: any, parent: any) {
        
        const NodeProps = node.properties || (node.properties = {});
        
        if (NodeProps['dataIsGenerated']) {
            remove(parent, node);
            return;
        }
        
        return node;
    }
}

export const CleanupGeneratedTags = () => TagsCleanupTransformer