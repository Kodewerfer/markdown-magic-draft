// Handles custom directive conversion from HTML to MD
import {u} from "unist-builder";

export function GetRehyperRemarkHandlers() {
    return {
        'br': (State: any, Node: any) => {
            const result = u('text', ':br');
            State.patch(Node, result);
            return result;
        },
        'span': (State: any, Node: any) => {
            const LinkedTarget = Node.properties['dataFileLink'];
            if (!LinkedTarget || LinkedTarget === '') {
                return;
            }
            
            const FirstTextNode = Node.children[0];
            if (!(typeof FirstTextNode === 'object') || !('value' in FirstTextNode))
                return;
            
            let TextDirectiveContent: string;
            
            if (LinkedTarget === FirstTextNode.value)
                TextDirectiveContent = `:Link[${LinkedTarget}]`
            else
                TextDirectiveContent = `:Link[${FirstTextNode.value}]{${LinkedTarget}}`
            
            const result = u('text', TextDirectiveContent);
            
            State.patch(Node, result);
            return result;
        }
    };
}