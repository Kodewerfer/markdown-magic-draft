import {visit} from 'unist-util-visit'

function Transformer(ast: object) {
    visit<any, any>(ast, 'TYPE', Visitor)
    
    function Visitor(node: any, index: any, parent: any) {
        let newNode = 'do work here'
        return Object.assign(node, newNode)
    }
}

export const Plugin = () => Transformer