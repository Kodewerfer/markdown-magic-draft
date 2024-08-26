# markdown-magic-draft


An experimental react-based markdown editor that handles rendering and editing MD files on the fly while providing other
functionalities such as exporting/restoring caret position, and life cycle callbacks.

Support List, Blockqoute, code block and all in-line markdown syntax. **No support for table**.

Base usage demo Address: -TO-BE-ADDED-

NPM install:
```
npm install react-magic-draft
```

```
yarn add react-magic-draft
```

## Disclaimer

This project is experimental in nature and includes some ~~terrible hacks~~ unconventional methods to achieve its more
advanced features. Tested to work in React `18.3`. Future major changes in react will likely break the
editor.

The editor uses [unified](https://unifiedjs.com/) to do conversion under the hood, markdown formatting and conversion may
be affected by [unified](https://unifiedjs.com/)'s implementation and updates

## Editor Functions

The editor provides these functions through forward ref:

```typescript
FlushChanges: () => Promise<void>;
```

Sync the editor's HTML and MD content, flush all the pending changes on the editor, and all Markdown syntax that is still in
The form of plain text will be rendered in HTML.

```typescript
ExtractMD: () => Promise<string>;
```

Extract the HTML content of the Editor, and convert it to Markdown syntax.

```typescript
ExtractCaretData: () => TSelectionStatus | null;
```

Extract the current caret position in the editor, the returning object of the type `TSelectionStatus` can later be used
to restore selection in the next function.

```typescript
SetCaretData: (caretData: TSelectionStatus, ShouldOverride?: boolean) => void;
```

Restore the caret position using the data extracted from `ExtractCaretData()`.

```typescript
InsertText: (TextContent: string, bSyncAfterInsert?: boolean) => void;
```

Insert text to the current caret position, which can be plain text or with Markdown syntax, with the option to perform
sync right after(default is `true`).

```
GetDOM: () => {
    root: HTMLElement | null,
      
    editor:HTMLElement | null,
        
    mask:HTMLElement | null
}
```

Get the DOM element of the editor. `root` is the editor's main element which contains:
* `editor` the editable div
* `mask` This is a mocking element that will display when the editor is syncing to hide flickers

## Editor Options and callbacks

- `SourceData?: string | undefined;`
    * set the source markdown data for the editor
- `KeepBrs?: boolean;`
    * whether to save empty lines as markdown directive `:br`.
- `DebounceSyncDelay?: number;`
    * the delay between typing stopped and conversion begins, default is 500ms.
- `DaemonShouldLog?: boolean;`
    * whether to log detailed information to console
- `IsEditable?: boolean;`
    * whether the editor is editable
- `AutoFocus?: boolean;`
    * should auto-focus on the editor after it is loaded in.
- `HistoryLength?: number;`
    * affect undo, how many steps(syncs operations) should the editor record (may affect performance in a very large
      file)
- `EditorCallBacks?: TEditorCallbacks;`
    * This is the editor life cycle callback that takes in two functions
    * `OnInit: (HTMLString: string) => void;` this function will be called when the editor inits or when the editor's source
      data (the `SourceData` prop) is changed. the latest render is passed to the callback.
    * `OnReload: (HTMLString: string) => void;` this function is called whenever a change is made to the content and the
      editor's rendering is reloaded. The latest render will be passed to the callback.
- `ComponentCallbacks?: TComponentCallbacks;`
    * This is designed to be the interface to pass down callback functions to each component(such as list, strong tag
      etc).
    * at the moment it only has a callback for the special file link component(see below)

## Special component

`FileLink` component is designed to handle links to local files, it's markdown syntax is a markdown in-line directive
`:link[linkTarget]`.
when the linked target has a `.` in the name, the component will only display the part before the first `.`.

You can pass in additional life cycle callbacks in `ComponentCallbacks`

```typescript
ComponentCallbacks?:{
    FileLinks ? : {
        initCallback? : (linkTarget: string) => void | Promise<void>;
        removeCallback? : (linkTarget: string) => void | Promise<void>;
    }
}
```

`initCallback` will be called when the component is loaded in, `removeCallback` when the component is deleted. Both will
pass the `linkTarget` to callbacks.

## How it works
This editor has three major parts, `MagicDraftEditor.tsx`, `useEditorDaemon` hook and rendering components under `src/components/Editor_Parts`
there are also various unified plugins are made to handle format conversions under `src/components/UnifiedPlugins`

The very foundation of this editor is an editable div that takes in the user's input, and a mutation observer that records them.
contentEditable does not play well with react, so the changes that the user made are recorded and synced to a mirror document(via Xpath) before rolling back.

If there is any markdown syntax in the mix, the syntax will be converted to HTML element. A masking element that displays the same HTML is shown to hide the flickers during the syncing and reloading.
This is the text-to-HTML process, which is handled by `useEditorDaemon`

After the sync is complete, the mirror document will be converted to React components, and elements with corresponding Markdown
syntax will be converted to components from `src/components/Editor_Parts`. These components have hidden elements containing markdown syntax, and are designed to allow for editing of that type of element;

For example, when breaking at the middle of a `strong` tag, the caret will move to the beginning of the next node, signalling that the edit of the strong tag is complete;
But breaking in the middle of a `li` will create another `li` element after the current, and move the content from caret to end-of-line to it.

when these elements are modified, the content of the whole "line" (a `p`, `h1` or `li`) will be re-calculated and synced with mirror doc to avoid any dangling syntax causing problems.

Additionally, `MagicDraftEditor.tsx` keeps track of what component is currently being edited, it also handles line-changing key presses like enter, backspace and del line joining.
Component may also have their own handling logic for these keys according to their spec. the component's handling logic can override or augment the key press logic in `MagicDraftEditor.tsx`, which is more for generic cases and within `p` elements.

## The terrible Hack

In order to let caret move freely(and not to be restrained by, for example, `input`) while also keeping track of editing elements accurately, a hack is used to extract components directly from react fibres.
The first state of a component in `src/components/Editor_Parts` also matters, it has to be written in a certain way as it is used to activate/de-active components and pass special callbacks to `MagicDraftEditor.tsx`.

So should there be a major change in how react fiber is handled, the editor will break.