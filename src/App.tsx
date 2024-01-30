import React from "react";
import "./App.css";

import Editor from "./components/Editor";

const MarkdownFakeDate = `
# Welcome to :LinkTo[AAA, A1A]{aaa} Editor! :LinkTo[BBB]

Hi! I'm ~~your~~ Markdown file in Editor**.

**custom** link **syntax**: :LinkTo[CCC] AHHHHHHHHH [123](google.com)
:br

TEXTTEXT**testOneWithPre**

:br

~~DelTag~~**testOneWithAFT**TEXTTEXT

:br

:br

Test with no sibling
:br

GFM syntax:

:br

* [ ] to do
* [x] done

:br

A note[^1]
[^1]: Big note.

:br

\`\`\`javascript
var s = "JavaScript syntax highlighting";
alert(s);
\`\`\`

:br

+ list1
+ list2
+ list3

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
