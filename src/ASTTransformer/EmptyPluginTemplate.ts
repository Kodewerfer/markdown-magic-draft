import {visit} from 'unist-util-visit'

function transformer(ast:object) {
    visit<any,any>(ast, 'TYPE', visitor)

    function visitor(node:any,index: any, parent: any) {
        let newNode = 'do work here'
        return Object.assign(node, newNode)
    }
}

function plugin() {
    return transformer
}

export default plugin