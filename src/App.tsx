import React from "react";
import "./App.css";

import Editor from "./components/Editor";

const MarkdownFakeDate = `
# Title!

Hi! I'm ~~your~~ Markdown file in Editor**.

**custom** link **syntax**: :LinkTo[CCC] AHHHHHHHHH [123](google.com)

:br

## Test with composite :LinkTo[AAA, A1A]{aaa}

:br

Test with no sibling

:br

GFM syntax:

:br

* [x] done

:br

\`\`\`javascript
var s = "JavaScript syntax highlighting";
alert(s);
\`\`\`

:br

* list1
* list2
* list3

A note[1](#user-content-fn-1)

## Footnotes

1. Big note. [↩](#user-content-fnref-1)
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
