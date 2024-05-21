import React from "react";

export default function SpecialLink(props: any) {
    const {children, tagName, ParentAction, ...otherProps} = props;
    
    // TODO
    
    return React.createElement(tagName, otherProps, children);
}