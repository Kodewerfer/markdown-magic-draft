import {visit} from 'unist-util-visit'
import {u} from 'unist-builder'
import {h} from 'hastscript'

function MDTransformer(ast: object) {
    // Visit every node
    visit<any, any>(ast, Visitor)
    
    function Visitor(node: any, index: any, parent: any) {
        if (node.type === 'containerDirective' || node.type === 'leafDirective' || node.type === 'textDirective') {
            
            const data = node.data || (node.data = {})
            
            // what the text node should be like, return as a text node when there is not a match
            const directiveAttrKeys = Object.keys(node.attributes)
            const directiveAttrString = JSON.stringify(Object.keys(node.attributes)).replace(/\[/g, '{').replace(/]/g, '}');
            const directiveChildrenValues = Array.from(node.children).map(((item: any) => {
                return item.value
            }));
            // as fallback
            const TextNodeRestored = u('text',
                `:${node.name}${directiveChildrenValues.length ? JSON.stringify(directiveChildrenValues) : ""}${directiveAttrKeys.length ? directiveAttrString : ""}`)
            
            /**
             * extra empty lines
             */
            if (node.name === 'br' && node.type === 'textDirective') {
                
                // this created an extra layer of p tag, although it may be useful when using :br in a existing line.
                // const hast = h('p', [
                //     h('br')
                // ]);
                
                const hast = h('br');
                
                data.hName = hast.tagName
                data.hProperties = hast.properties
                data.hChildren = hast.children
                
                return node;
            }
            
            /**
             * Special Links
             */
            if (node.name.toLowerCase() === 'tag' && node.type === 'textDirective') {
                
                // attr is not used
                // let LinkToTarget = Object.keys(node.attributes)[0];
                // Chars that are not allowed in filenames
                // const forbiddenChars = /[\\/:*?"<>|]/;
                // if (!LinkToTarget) {
                //     return Object.assign(node, TextNodeRestored);
                // }
                
                const childNodes = node.children;
                if (!childNodes || !childNodes[0]) return Object.assign(node, TextNodeRestored);
                const firstChildValue: string = childNodes[0].value; //as target for the file links
                
                
                const hast = h(`span`,
                    {'dataTagLink': firstChildValue},
                    [...childNodes]);
                
                data.hName = hast.tagName
                data.hProperties = hast.properties
                data.hChildren = hast.children
                return node;
            }
            
            // fallback, return the text node as it was
            Object.assign(node, TextNodeRestored);
            return node;
            
        }
    }
}

const HandleCustomDirectives = () => MDTransformer;

export default HandleCustomDirectives;