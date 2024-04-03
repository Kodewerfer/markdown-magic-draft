import React from "react";
import "./App.css";

import Editor from "./components/Editor";

const MarkdownFakeDate = `
# Title!

Normal text test one

Normal text test two

Normal text test three

:br

Hi! I'm ~~your~~ Markdown file in Editor**.

**custom** link **syntax**

Normal text test

:br

## Test with h2 title

:br

> back quote test


Normal text testNormal text testNormal text testNormal text test

:br

[Link test](google.com) normal text

:br

* list1
* list2
* list3

normal textnormal textnormal text
:br

* [x] List with items

:br

\`\`\`javascript
var s = "JavaScript syntax highlighting";
alert(s);
\`\`\`

Special links:

:LinkTo[AAA, A1A]{aaa}

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
