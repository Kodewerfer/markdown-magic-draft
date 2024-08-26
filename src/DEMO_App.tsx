import React, {useEffect, useRef, useState} from "react";
import dedent from "dedent";
import MagicDraftEditor, {TEditorForwardRef} from "./components/MagicDraftEditor";

import "./DEMO_App.css";

const MarkdownFakeDateEmpty = dedent`
`

const MarkdownFakeDate = dedent`
# Title!

Normal text
Normal text
Normal text

Normal text *italic* Normal text **strong**

:br

- list item
- list item
- list item

:br

> blockqoute

`

//
export default function DEMO_App() {
    
    const [dataSource, setDataSource] = useState('');
    
    const EditorRef = useRef<TEditorForwardRef>(null);
    
    useEffect(() => {
        // simulate late data loading
        setDataSource(MarkdownFakeDateEmpty);
    }, []);
    
    function appClickToLoad() {
        setDataSource(MarkdownFakeDate);
    }
    
    async function appClickToExtract() {
        
        console.log(await EditorRef?.current?.ExtractMD())
    }
    
    
    return (
        <div className="App">
            <button className={"bg-emerald-600 rounded-md mx-2 px-2 text-white"} onClick={appClickToLoad}>Load data
            </button>
            <button className={"bg-amber-600 rounded-md mx-2 px-2 text-white"} onClick={appClickToExtract}>Extra data
            </button>
            <main className="Main-wrapper">
                <MagicDraftEditor SourceData={dataSource}
                                  DaemonShouldLog={true} //output detailed logs
                                  KeepBrs={false} //extra won't save extra br as :br
                                  DebounceSyncDelay={2000} //delay before the text is converted
                                  ref={EditorRef}/>
            </main>
        </div>
    );
}
