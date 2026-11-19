# foldkit-richtext-dom

Rebuilding a `contenteditable` element on every keystroke through a virtual DOM fights the browser's typing, selection, IME composition, and clipboard handling. You want your application state to stay the single source of truth while only the changed DOM nodes update in place.

`foldkit-richtext-dom` bridges [`foldkit-richtext`](../richtext) documents and the browser DOM. It mounts a real `contenteditable` subtree once, converts user input into Foldkit Messages (events sent to your `update` function), and patches only the nodes named by each edit's `ChangeSet`. Your application owns the document in its Model (your app's state) and draws any surrounding toolbars or menus. See the editor running in [the rich-text playground](https://foldkit-richtext-demo.pages.dev/).

## Install

```bash
pnpm add foldkit-richtext-dom foldkit-richtext foldkit-bundle foldkit effect
```

## A first editor on a page

Place an editor Bundle (a self-contained unit of state, `update`, and `view`) on a page, decode an initial document, and embed the runtime:

```ts
import { Bundle } from 'foldkit-bundle'
import * as RichText from 'foldkit-richtext'
import * as Runtime from 'foldkit/runtime'
import { editorAt, Model, type ParentMessage } from 'foldkit-richtext-dom/editor-bundle'

const body = editorAt('body', {
  rendering: RichText.standardRendering,
  vocabulary: {
    marks: RichText.markRegistry(RichText.standardMarks),
    nodes: RichText.nodeRegistry(RichText.standardNodes),
  },
  placeholder: 'Write something…',
})
const app = Bundle.assemble<Model, ParentMessage>()([body])
const document = RichText.decodeDocument({
  version: 1,
  children: [{ type: 'Paragraph', id: 'p', children: [{ type: 'Text', id: 't', text: 'Hello', marks: [] }] }],
})

Runtime.embed(
  Runtime.makeElement({
    Model,
    container: window.document.getElementById('app')!,
    init: () => app.initial({ document }),
    update: app.update(),
    view: (model, h) => h.main([], [body.view(model, h)]),
  }),
)
```

When embedded, `body.view` renders `<foldkit-richtext id="body">` showing `"Hello"` inside a paragraph. Typing or pressing shortcuts dispatches Messages to `update`, which validates the edit against `vocabulary`, stores the new `document` in `model.document`, and returns a Command that patches only the changed DOM nodes.

Three boundaries keep state predictable:

- **Your application** owns `model.document` and all chrome around the editor (toolbars, menus, handles).
- **`foldkit-richtext-dom`** owns the `<foldkit-richtext>` subtree, converting browser events into Messages and syncing DOM selections back to positions.
- **`foldkit-richtext`** owns the pure document codec, commands, and validation.

`editorAt(hostId, placement)` registers rendering and vocabulary rules under `hostId` without performing I/O or rendering yet. `Model` holds `{ document, editor }` where `editor` tracks selection, stored marks, undo history, and the slash menu index. Because the document is never read back from the DOM, unsupported browser edits are prevented before they mutate the tree.

## Configuring an editor placement

`editorAt(hostId, placement)` accepts the following optional settings:

- **`rendering`**: Maps marks and node kinds to DOM elements; defaults to `foldkit-richtext`'s built-in names. Marks render *inside* their text run element so run boundaries remain intact for selection mapping.
- **`vocabulary`**: `{ marks, nodes }` registries that refuse disallowed edits immediately in `update` rather than waiting for `validate`.
- **`inputRules`**: Rules run on typed characters, such as `markdownInputRules` from [`foldkit-richtext-markdown`](../richtext-markdown). When a vocabulary refuses a rule's transformation, the typed text still inserts normally.
- **`decorate`**: Pure `(document) => DecorationSet` callback evaluated on mount and on every patch—for example, syntax highlighting. Highlights derived from application state (search matches, remote cursors) go through the `overlay(hostId, decorations)` Command instead, which renders after `decorate` and preserves the caret. Use `focus(hostId, selection)` to move focus into the editor from external controls and scroll the target into view.
- **`keymap`**: Custom `{ chord, command }` bindings (where `Mod` is Ctrl or Cmd) checked before the built-in chords.
- **`slashEntries`**: Custom slash-menu items resolved on Enter and shared with your menu view.
- **`label` / `labelledBy`**: Accessible name written as `aria-label` or `aria-labelledby` on the `role="textbox"` root. Passing both is a type error. Without either, an editor inside a labelled `role="group"` (such as a `foldkit-mixins-form` field) adopts the group's label after hydration.
- **`placeholder`**: Text shown via `data-placeholder` and `aria-placeholder` when `RichText.isBlank(document)` is true. Style `[data-placeholder]::before` in CSS so placeholder text stays out of the document content.
- **`lineHint`**: Hint text set on `data-hint` for the empty paragraph holding a collapsed caret (for example, `"Type / for blocks"`), styled with `[contenteditable]:focus [data-hint]::before`.
- **`serverRendered`**: Boolean thunk indicating server-rendered markup is already present to adopt on mount.

Empty lines automatically render a `<br data-richtext-filler>` after their run so the browser can place and display a caret on blank lines; importers strip it and it holds no position.

Each placement option is stored per `hostId` in `foldkit-richtext-dom/host` (`placeRendering`/`renderingFor`, `placeVocabulary`/`vocabularyFor`, and siblings), surviving unmount and remount under the same `hostId`.

### When the document changes outside an edit

`body.view` keys its host element by the `Document` object identity produced by editor transitions. When your parent `update` replaces `model.document` via an external event (loading a record, resetting a form, restoring a revision), the host mounts fresh. Always commit the exact `Document` instance returned by an edit rather than cloning it, or every keystroke will remount the editor and drop the caret.

When a replacement continues the live document—such as incoming collaborative edits—return `patchTo(hostId, previous, next)` in the same transition. Pass the previous and next `Document` objects along with the mapped `next.selection` so untouched DOM nodes keep their elements and the caret moves to the right spot.

## Embed the editor as a form control

`foldkit-richtext-dom/input` integrates the editor into a [`foldkit-form`](../form) field backed by a `RichText.Document` or a custom serialized format:

```ts
import { Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { Form } from 'foldkit-form'
import * as RichText from 'foldkit-richtext'
import { richTextInput } from 'foldkit-richtext-dom/input'

const Post = Entity.define('Post', Schema.Struct({ id: Schema.String, body: RichText.Document }))
const PostInput = Entity.input(Post, Schema.Struct({ body: Post.fields.body.schema }))

const PostForm = Form.make('PostForm', PostInput, {
  inputs: { body: richTextInput('post-body', { placeholder: 'Write the post…' }) },
})
```

Because a form field owns its draft state without a parent `OutMessage`, `EditorInput` stores its `Document` inside its own `Model` and reports changes to the form like any other input. New records start with one empty paragraph, and blank documents report as empty so required validation catches them. One `hostId` identifies one editor, so repeated form rows cannot each host a `richTextInput` yet.

To store Markdown or another text format in the Entity while editing rich text, provide a `codec` with `value` and `fill`:

```ts
import { parse, print } from 'foldkit-richtext-markdown'

const Note = Entity.define('Note', Schema.Struct({ id: Schema.String, body: Schema.String }))
const NoteInput = Entity.input(Note, Schema.Struct({ body: Note.fields.body.schema }))

const NoteForm = Form.make('NoteForm', NoteInput, {
  inputs: {
    body: richTextInput('note-body', {}, {
      codec: {
        value: document => print(document).markdown,
        fill: text => {
          let next = 0
          return parse(text, { mint: () => `m${next++}` }).document
        },
      },
    }),
  },
})
```

`fill` runs when populating stored data; avoid throwing on malformed input, and return `EditorInput.init({ hostId }).model.document` when filling empty text (`''`) so the editor always starts with one paragraph. Calling `settled` on a restored draft preserves caret, stored marks, and undo history while updating the `hostId`.

## Position toolbars, block handles, and menus

The editor renders only its host element. `foldkit-richtext-dom/toolbar` provides plain views and Mount positioning helpers for surrounding chrome, while [`foldkit-mixins-richtext`](../mixins-richtext) provides fully restyleable Slot versions.

### Marks and floating toolbars

`marksToolbar({ state, toMessage, marks? })` renders buttons for the standard marks (or a custom list) using `markActive(state, mark)` to reflect caret/selection state. Pair it with `selectionAnchor` to float over a text range (assuming `model` holds `{ document, editor }` and `h` is Foldkit's `HtmlBuilder`):

<!-- docs-check standalone
import type { HtmlBuilder } from 'foldkit/html'
import type * as RichText from 'foldkit-richtext'
import { Message } from 'foldkit-richtext-dom/editor'
import type { ToolbarState } from 'foldkit-richtext-dom/toolbar'
declare const model: { readonly editor: Omit<ToolbarState, 'document'>; readonly document: RichText.Document }
declare const h: HtmlBuilder<Message>
declare const edited: (message: Message) => Message
-->
```ts
import * as RichText from 'foldkit-richtext'
import { marksToolbar, selectionAnchor } from 'foldkit-richtext-dom/toolbar'

RichText.coversText(model.editor.selection)
  ? h.div(
      [h.OnMount(selectionAnchor({ hostId: 'body', gap: 8 }))],
      [
        marksToolbar({
          state: { ...model.editor, document: model.document },
          toMessage: mark => edited(Message.ToggledMark({ mark })),
        })(h),
      ],
    )
  : h.empty
```

`selectionAnchor` writes `position: fixed`, `top`, `left`, and `data-placement` (`top` or `bottom`) whenever the selection, scroll, or viewport changes. Pass `caret: true` to anchor below a collapsed caret (for example, for a slash menu).

### Anchor and drag blocks

- **`blockAnchor({ hostId, node, gap, side? })`** positions an element beside block `node` (defaulting to the left edge, or `'above'` / `'inside-end'` for block toolbars), updating on DOM patches, scrolls, resizes, and element size changes.
- **`blockDrag({ hostId, node })`** makes the mounted element drag block `node` to any target allowed by `RichText.moveTargets`. It marks `[data-richtext-drop]` at the drop edge, sets `data-richtext-dragging` on the dragged block, auto-scrolls within 48 px of the viewport edge, cancels cleanly on Escape or cancelled pointers, and dispatches `MovedBlock` on release.

Because Mounts read arguments once on insertion, key anchored elements by `h.Key(node)` whenever `node` can change.

### Slash menu helpers

`foldkit-richtext-dom/editor` exports `slashEntries`, `slashQuery`, and `slashMenu` so your menu view and the Bundle's Enter handler agree on matches and order:

```ts
import { slashEntries, slashMenu, slashQuery } from 'foldkit-richtext-dom/editor'

slashQuery('see /head') // 'head'
slashMenu(slashEntries, 'see /head', 0)?.highlighted?.label // 'Heading 1'
```

`menuTextOf(view)` from `foldkit-richtext-dom/editor-bundle` reads the active query text while respecting `Message.DismissedSlash` (Escape), keeping the menu closed until a new `/` query begins.

## Render a read-only document

`foldkit-richtext-dom/view` renders a `Document` or slice blocks as static Foldkit `Html` via `inertHtml`, without mounting any editable runtime:

```ts
import * as RichText from 'foldkit-richtext'
import { renderBlocks, renderDocument } from 'foldkit-richtext-dom/view'

const doc = RichText.decodeDocument({
  version: 1,
  children: [{ type: 'Paragraph', id: 'p', children: [{ type: 'Text', id: 't', text: 'Read only', marks: [] }] }],
})

const html = renderDocument(doc)
renderBlocks(doc.children)
renderDocument(doc, RichText.standardRendering)
renderDocument(doc, RichText.standardRendering, [])
```

Pass the same `Rendering` registry used by the editor and HTML serializer so custom marks and blocks render identically. Decorations map via `RichText.decorationsIn` to `<span data-decoration="...">`, with safe lowercase string fields in `decoration.data` emitted as `data-decoration-<key>` attributes.

## Hydrate server-rendered editor markup

`<foldkit-richtext>` renders `display: block` inline, and Foldkit hydration preserves custom-element children until the editor mounts. Pass `serverRendered: SSR.serving` (from [`foldkit-ssr`](../ssr)) to `editorAt` so the server emits `renderEditable(...)` HTML and the browser adopts the existing DOM nodes on mount without replacing them:

```ts
import * as RichText from 'foldkit-richtext'
import { editorAt } from 'foldkit-richtext-dom/editor-bundle'
import { SSR } from 'foldkit-ssr'

editorAt('body', { rendering: RichText.standardRendering, serverRendered: SSR.serving })
```

Ensure the browser's initial Model holds the exact `Document` rendered on the server; otherwise `mountInto` replaces the mismatched subtree cleanly.

## Handle editor Messages

`foldkit-richtext-dom/editor` defines the `Message` union handled by the editor Bundle:

- **Typing and marks:** `Typed`, `Backspace`, `DeletedForward`, `Entered`, `ToggledMark`, `AppliedMark`, `ClearedMark`, `Pasted`, `Selected`
- **Blocks and tables:** `RetypedBlock`, `WrappedBlock`, `ConvertedBlock`, `LiftedBlock`, `MovedBlock`, `InsertedBlock`, `DeletedBlock`, `ChangedProps`, `InsertedRow`, `InsertedColumn`, `DeletedRow`, `DeletedColumn`, `Indented`, `Outdented`
- **Search, footnotes, and chrome:** `ReplacedText`, `InsertedFootnote`, `RenamedFootnote`, `ActivatedAdornment`, `DismissedSlash`
- **History and patching:** `Undone`, `Redone`, `Patched`

Built-in keyboard chords dispatch `Mod+B` (`Bold`), `Mod+I` (`Italic`), `Mod+E` (`Code`), `Mod+Shift+S` (`Strikethrough`), and `Mod+Z` / `Mod+Shift+Z` / `Mod+Y` (undo/redo), while `Tab` / `Shift+Tab` emit `Indented` / `Outdented` only where `RichText.takesTab` applies (code blocks, lists, and table cells). Controls inside an element carrying `data-editor-controls` (`CONTROLS_ATTRIBUTE` from `foldkit-richtext-dom/toolbar`) preserve text focus on pointer presses unless the target is an input field.

## Embed the low-level interpreter directly

To host the editable subtree outside the Bundle, call `mount` and `attach` (or `mountInto` / `releaseMount` from `foldkit-richtext-dom/host`):

```ts
import { mount } from 'foldkit-richtext-dom'
import { attach } from 'foldkit-richtext-dom/events'
import * as RichText from 'foldkit-richtext'

function mountRawEditor(
  host: HTMLElement,
  content: RichText.Document,
  onCommand: (command: RichText.Command) => void,
) {
  let dom = mount(host.ownerDocument, content)
  host.append(dom.root)

  const attachment = attach(dom, { onIntent: onCommand })
  return {
    sync: (next: RichText.EditorState, changeSet: RichText.ChangeSet) => {
      attachment.sync(next, changeSet)
      dom = attachment.current()
    },
    detach: () => attachment.detach(),
  }
}
```

- **`mount` / `adopt` / `patch` / `repair`**: Build, reuse server-rendered, incrementally update, or recover the DOM subtree indexed by `data-block` and `data-run`.
- **`attach`**: Intercepts `beforeinput`, `keydown`, composition, copy, cut, and paste so the browser cannot mutate content directly, queues state patches during IME composition, paints `span[data-decoration="selection"]` when focus moves to external controls, and scrolls the caret into view honoring `scroll-padding`.
- **`positionToRange` / `rangeToPosition`**: Translate between semantic `Position` values and DOM `Range` objects.
- **`parseHtml(html, { kit, mint })`** (`foldkit-richtext-dom/html`): Sanitizes pasted HTML through a strict whitelist and `safeUrl` check.

## Current behavior and limits

- **Intent reporting only:** `attach` reports user intent and waits for the caller to run commands and pass back the new state and `ChangeSet`.
- **Container re-rendering:** When a container's list of child items changes, the container re-renders in place rather than diffing each child item individually.
- **Single host per ID:** Each `hostId` identifies one editor on a page, so repeating rows inside a single form cannot yet host separate `richTextInput` editors.

## Subpath exports

| Subpath | Main exports |
| --- | --- |
| `foldkit-richtext-dom` | `mount`, `adopt`, `patch`, `repair`, position mapping |
| `foldkit-richtext-dom/editor-bundle` | `Editor`, `editorAt`, `application`, `update`, Message helpers |
| `foldkit-richtext-dom/input` | `richTextInput`, `EditorInput` form control |
| `foldkit-richtext-dom/toolbar` | `marksToolbar`, `selectionAnchor`, `blockAnchor`, `blockDrag` |
| `foldkit-richtext-dom/editor` | `Message`, `toMessage`, `attachEditor`, `events`, slash menu |
| `foldkit-richtext-dom/view` | `renderDocument`, `renderBlocks`, `renderEditable` |
| `foldkit-richtext-dom/host` | `mountInto`, `attachmentIn`, `releaseMount`, placement records |
| `foldkit-richtext-dom/events` | `attach`, `intentFor`, selection read and restore |
| `foldkit-richtext-dom/html` | `parseHtml` |

## Next

- Style toolbars, menus, block handles, and source mode: [`foldkit-mixins-richtext`](../mixins-richtext)
- Understand document nodes, commands, and Kits: [`foldkit-richtext`](../richtext)
- Convert documents to Markdown and input rules: [`foldkit-richtext-markdown`](../richtext-markdown)
