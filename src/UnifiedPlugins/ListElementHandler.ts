import {visit} from 'unist-util-visit'
import {remove} from 'unist-util-remove';
import {findAfter} from "unist-util-find-after";
import {findBefore} from "unist-util-find-before";

function ListElementTransformer(ast: object) {
    
    visit<any, any>(ast, 'element', Visitor);
    
    function Visitor(node: any, index: any, parent: any) {
        
        if (node.tagName !== 'ul') return node;
        
        const NodeProps = node.properties || (node.properties = {});
        
        // Remove Empty
        if (Array.isArray(node.children)) {
            const bHasSubElements = node.children.some((child: any) => {
                return String(child.type).toLowerCase() === 'element';
            })
            if (!bHasSubElements) return remove(node);
        }
        
        // No surrounding Ul element
        // Add data-list-merge-valid attr to indicate this is an "OG" ul that can be merged
        const NextSibling: any = findAfter(parent, node, (node: any) => node.value !== '\n'); // filters line break chars out with test funcs
        const PrevSibling: any = findBefore(parent, node, (node: any) => node.value !== '\n');
        
        const bNextSiblingIsList = NextSibling && NextSibling.tagName === "ul";
        const bPreviousSiblingIsList = PrevSibling && PrevSibling.tagName === "ul";
        
        if (!bNextSiblingIsList && !bPreviousSiblingIsList) {
            NodeProps["dataListMergeValid"] = 'true';
            return node;
        }
        
        // Merge to prev Ul, this takes priority
        if (bPreviousSiblingIsList && PrevSibling.properties['dataListMergeValid'] && Array.isArray(PrevSibling.children) && Array.isArray(node.children)) {
            let filteredChildren = node.children.slice().filter((Child: any) => Child.type === 'element');
            
            PrevSibling.children.push(...filteredChildren);
            
            return remove(parent, node);
        }
        
        // Merge to next UL
        if (bNextSiblingIsList && NextSibling.properties['dataListMergeValid'] && Array.isArray(NextSibling.children) && Array.isArray(node.children)) {
            let filteredChildren = node.children.slice().filter((Child: any) => Child.type === 'element');
            
            NextSibling.children.unshift(...filteredChildren);
            
            return remove(parent, node);
        }
        
        
        return node;
    }
}

export const ListElementHandler = () => ListElementTransformer