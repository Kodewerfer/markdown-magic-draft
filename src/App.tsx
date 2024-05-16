import React from "react";
import "./App.css";
import dedent from "dedent";

import Editor from "./components/Editor";

/**
 *
 * normal textnormal textnormal text
 * :br
 *
 * * [x] List with items
 *
 * Special links:
 *
 * :LinkTo[AAA, A1A]{aaa}
 *
 * :br
 *
 */
const MarkdownFakeDate = dedent`
# Title!

Normal text test one

Normal text test two

Normal text test three


:br

Hi! I'm ~~your~~ Markdown file in Editor**.

**custom** **syntax**

Normal text test
:br

**custom1** **custom2** **custom3**

:br

## Test with h2 **title**

:br

> back quote test

Normal text testNormal text testNormal text testNormal text test

:br

pre text [Link test](google.com) afte text

:br

Normaltextabov
- list1
- list2
- list3

:br

test normal text

* [x] List with items

test normal text with inline \`code()\` element

\`\`\`javascript
var s = "JavaScript syntax highlighting";


alert(s);
**12333**

321
\`\`\`
`

export default function App() {
    return (
        <div className="App">
            <header></header>
            <main className="Main-wrapper">
                <Editor SourceData={MarkdownFakeDate}/>
            </main>
        </div>
    );
}
