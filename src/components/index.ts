// This is the build entry point for the editor component (not to be confused with index.tsx under src)

import MagicDraftEditor, {TEditorForwardRef, TEditorProps} from "./MagicDraftEditor";

export type {
    TEditorForwardRef,
    TEditorProps
};

export default MagicDraftEditor;