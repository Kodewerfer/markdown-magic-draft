import {visit} from 'unist-util-visit'
import {remove} from "unist-util-remove";

function TextCleanUpTransformer(ast: object) {
    visit<any, any>(ast, 'text', Visitor)
    
    // in the current logic, there should not be any text nodes directly under the "body" of the editor,
    // Thus they're unhandled, and will be non-editable if appeared. this plug delete all of them
    // TODO: this will remove "\n" text, maybe buggy, need more testing
    function Visitor(node: any, index: any, parent: any) {
        
        if (parent.type === "root") {
            // console.log("cleaning node:", node);
            remove(node);
        }
    }
}

export const CleanUpExtraText = () => TextCleanUpTransformer