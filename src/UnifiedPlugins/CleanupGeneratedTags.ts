import {visit} from 'unist-util-visit'
import {remove} from 'unist-util-remove';

function TagsCleanupTransformer(ast: object) {
    let CleanupCount = 0;
    visit<any, any>(ast, 'element', Visitor);
    if (CleanupCount > 0) {
        console.log("Cleanup Plugin: generated tags removed:", CleanupCount)
    }
    
    function Visitor(node: any, index: any, parent: any) {
        
        const NodeProps = node.properties || (node.properties = {});
        
        if (NodeProps['dataIsGenerated']) {
            remove(parent, node);
            CleanupCount += 1;
            return;
        }
        
        return node;
    }
}

export const CleanupGeneratedTags = () => TagsCleanupTransformer