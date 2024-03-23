import React from "react";
import "./App.css";

import Editor from "./components/Editor";

const MarkdownFakeDate = `
# Title!

Hi! I'm ~~your~~ Markdown file in Editor**.

**custom** link **syntax**: :LinkTo[CCC] AHHHHHHHHH

:br

## Test with composite :LinkTo[AAA, A1A]{aaa}

:br

Test with no sibling

:br

[Link test](google.com)

:br

> back quote test

:br

* list1
* list2
* list3

:br

* [x] List with items

:br

\`\`\`javascript
var s = "JavaScript syntax highlighting";
alert(s);
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
