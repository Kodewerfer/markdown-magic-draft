import {visit} from 'unist-util-visit'
import {remove} from "unist-util-remove";

function TextCleanUpTransformer(ast: object) {
    visit<any, any>(ast, 'text', Visitor)
    
    // TODO: this will remove "\n" text, maybe buggy, need more testing
    function Visitor(node: any, index: any, parent: any) {
        if (parent.type === "root") {
            // console.log("cleaning node:", node);
            remove(node);
        }
    }
}

export const CleanUpExtraText = () => TextCleanUpTransformer