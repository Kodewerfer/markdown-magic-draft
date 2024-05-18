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
 * * [x] List with items
 * :br
 * Normaltextabov
 * - list1**test**
 * - list2
 * - list3
 */
const MarkdownFakeDate = dedent`
# Title!

Normal text test one

Normal text test two

Normal text test three


:br

Hi! I'm ~~your~~ Markdown file in Editor**.

**custom**Normal text test
:br

**syntax**

**custom1** **custom2** **custom3**

:br

## Test with h2 **title**

:br

> back quote test

Normal text testNormal text testNormal text testNormal text test

:br

pre text [Link test](google.com) afte text

:br


:br

test normal text

test normal text with inline \`code()\` element

\`\`\`javascript
var s = "JavaScript syntax highlighting";


alert(s);
**12333**

321
\`\`\`
`

const MarkdownFakeDateTwo = dedent`
# Title!

Normal text test one

Normal text test two

Normal text test three

**custom**Normal text test

**syntax**

**custom1** **custom2** **custom3**

 - list1**test**
 - list2
 - list3

`

export default function App() {
    return (
        <div className="App">
            <header></header>
            <main className="Main-wrapper">
                <Editor SourceData={MarkdownFakeDateTwo}/>
            </main>
        </div>
    );
}
