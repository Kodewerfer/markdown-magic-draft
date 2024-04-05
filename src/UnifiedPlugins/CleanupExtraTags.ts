import {visit} from 'unist-util-visit'
import {remove} from 'unist-util-remove';

function TagsCleanupTransformer(ast: object) {
    
    let GeneratedCount = 0;
    let BRCount = 0;
    
    visit<any, any>(ast, 'element', Visitor);
    
    if (GeneratedCount + BRCount > 0) {
        console.log("Cleanup Plugin: tags removed:", GeneratedCount + BRCount, "Generated:", GeneratedCount, "Extra Br:", BRCount)
    }
    
    function Visitor(node: any, index: any, parent: any) {
        
        const NodeProps = node.properties || (node.properties = {});
        
        // Remove react generated tags that are left behind
        if (NodeProps['dataIsGenerated']) {
            remove(parent, node);
            GeneratedCount += 1;
            return;
        }
        
        // remove extra br when there are other elements
        if (node.tagName === 'br' && parent.children.length > 1) {
            remove(parent, node);
            BRCount += 1;
            return;
        }
        
        return node;
    }
}

export const CleanupExtraTags = () => TagsCleanupTransformer