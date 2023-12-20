import {visit} from "unist-util-visit";
import {h} from 'hastscript'

//Regex for the custom MD syntax
const SyntaxRegex = /@\[(.*?)]/g;
const transformer = (ast: object) => {
    // At this stage, the custom MD syntax will be in a normal text syntax node due to it not being processed by previous plugins that only handled the general use cases.
    visit<any, any>(ast, 'text', visitor)

    function visitor(node: any, nodeIndex: any, parentNode: any) {


        let regExpCopy = SyntaxRegex;

        let textNodeValue: string = node.value;

        // const nodePosition = node.position;

        let match: RegExpExecArray | null;

        let NewChildNodesForParent = [];

        while (null !== (match = regExpCopy.exec(textNodeValue))) {
            const [matchedTextWhole, matchedTextBare] = match;

            const textPreValue = textNodeValue.slice(0, match.index);
            if (textPreValue !== "" && textPreValue !== " ") {
                const textNodePre = {
                    type: 'text',
                    value: textPreValue
                }
                // console.log("Pre:");
                // console.log(textNodePre);
                NewChildNodesForParent.push(textNodePre);
            }

            // Add the Special link in the middle
            const ConvertChildNode = h(`span`,
                {'data-link': `${matchedTextBare}`},
                [`${matchedTextBare}`]);


            NewChildNodesForParent.push(ConvertChildNode);

            let bPostValuePlain = true;
            const textPostValue = textNodeValue.slice(match.index + matchedTextWhole.length, textNodeValue.length);
            if (textPostValue.search(regExpCopy) !== -1) {
                bPostValuePlain = false;
                textNodeValue = textPostValue;

                // Now that the original text has been changed.
                // Manually resetting the RegExp's index to 0 so that it can start again
                // If we remove the `g` from the RegExp, this reset would not have been needed.
                // but that way the RegExp won't know what has been searched already, and therefore go into a loop for the `normal` cases where the Post Text is plain
                // in that case,
                regExpCopy.lastIndex = 0;

            }

            if (textPostValue !== "" && bPostValuePlain) {

                const textNodePost = {
                    type: 'text',
                    value: textPostValue
                }

                // console.log("Post:");
                // console.log(textNodePost);

                NewChildNodesForParent.push(textNodePost);
            }

        }

        // No custom tags found
        if (!NewChildNodesForParent.length) {
            return node;
        }


        let parentNodeModified = {
            children: [
                ...parentNode.children.slice(0, nodeIndex),
                ...NewChildNodesForParent,
                ...parentNode.children.slice(nodeIndex + 1)
            ]
        };

        Object.assign(parentNode, parentNodeModified);

        return node;
    }
};

const SpecialLinkSyntax = () => transformer;

export default SpecialLinkSyntax