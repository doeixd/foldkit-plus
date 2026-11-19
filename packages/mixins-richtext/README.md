# foldkit-mixins-richtext

A rich-text editor draws only its editable text box. Everything around it—formatting toolbars, slash command menus, drag handles, table controls, find-and-replace bars, and Markdown source mode—must still be wired to your application state and styled to match your design system without forking the views.

`foldkit-mixins-richtext` provides those chrome views as styleable [Mixins](../mixins) components for [`foldkit-richtext-dom`](../richtext-dom). Each view exposes named *Slots* (typed parts such as `root`, `button`, or `input` that accept styles and behaviors from outside), reads state you pass in, and dispatches Messages back to your `update`. See the full toolbar, slash menu, block handle, and find bar running in [the rich-text playground](https://foldkit-richtext-demo.pages.dev/).

## Install

```bash
pnpm add foldkit-mixins-richtext foldkit-mixins foldkit-richtext foldkit-richtext-dom
```

## A first mark toolbar

Style the mark buttons via `MarkToolbarSlots` and render a toolbar that dispatches `ToggledMark` Messages:

```ts
import type { HtmlBuilder } from 'foldkit/html'
import { Style } from 'foldkit-mixins'
import { MarkToolbarSlots, markToolbar } from 'foldkit-mixins-richtext'
import * as RichText from 'foldkit-richtext'
import { Message as EditorMessage } from 'foldkit-richtext-dom/editor'

const Toolbar = markToolbar<EditorMessage>().pipe(
  Style.attach(Style.forSlots(MarkToolbarSlots)({ button: Style.class('mark-button') })),
)

const document = RichText.decodeDocument({
  version: 1,
  children: [{ type: 'Paragraph', id: 'p', children: [{ type: 'Text', id: 't', text: 'Hello', marks: ['Bold'] }] }],
})

const renderToolbar = (h: HtmlBuilder<EditorMessage>) =>
  Toolbar(
    {
      state: { document, selection: null, storedMarks: null },
      toggled: mark => EditorMessage.ToggledMark({ mark }),
    },
    h,
  )
```

`Toolbar` renders a `<div role="toolbar">` containing one `<button class="mark-button">` per mark (`Bold`, `Italic`, `Code` by default). Each button reads `markActive(state, mark)` from the document and selection you pass in, carries its mark name as its slot item ID so Behaviors can target it, and emits `ToggledMark` through `toggled` when clicked.

Every view in this package keeps the same boundary:

- **Your application owns chrome state:** Open menus, draft link URLs, palette queries, and tab stops stay in your Model.
- **Document state is read, never stored:** Active buttons, block styles, links, and slash queries derive directly from `document` and `selection`.
- **Every element is a Slot:** You attach classes, tokens, and Behaviors from outside without touching the view's click or ARIA logic.

| Slot | Capability | Renders |
| --- | --- | --- |
| `root` | Container | Toolbar wrapper |
| `toolbar` | Collection | Row of mark buttons |
| `button` | Interactive | One button per mark |

Place `Toolbar` inside a `selectionAnchor` element from `foldkit-richtext-dom/toolbar` to float it above the current text selection.

<!-- docs-check standalone
import { Schema } from 'effect'
import type { HtmlBuilder, KeyboardModifiers } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as RichText from 'foldkit-richtext'
import { Message as EditorMessage, type EditorEvent } from 'foldkit-richtext-dom/editor'
import type { EditorState } from 'foldkit-richtext-dom/editor-bundle'
import type { SourceSession } from 'foldkit-richtext-markdown'
const Message = defineMessageUnion({
  GotEditor: { message: EditorMessage },
  DraftedLink: { href: Schema.String },
  CopiedCode: { node: RichText.NodeId },
  ChoseCommand: { event: EditorMessage },
  ChangedPalette: { query: Schema.String, index: Schema.Number },
  ClosedPalette: {},
  DraftedSource: { draft: Schema.String },
  MovedInSource: { caret: Schema.Number },
  LeftSource: {},
  ToggledMenu: { menu: Schema.Literals(['style', 'insert', 'link', 'more']), open: Schema.Boolean },
  FocusedControl: { id: Schema.String },
  ToggledFind: {},
  PickedFile: {},
  ReturnedToText: {},
})
type Message = typeof Message.Type
const {
  DraftedLink,
  DraftedSource,
  MovedInSource,
  LeftSource,
  ToggledMenu,
  FocusedControl,
  ToggledFind,
  PickedFile,
  ReturnedToText,
} = Message
const edited = (message: EditorEvent): Message => Message.GotEditor({ message })
declare const model: {
  readonly document: RichText.Document
  readonly editor: EditorState
  readonly linkDraft: string
  readonly palette: { readonly query: string; readonly index: number } | null
  readonly source: SourceSession | null
  readonly menu: 'style' | 'insert' | 'link' | undefined
  readonly tabStop: string | null
}
declare const h: HtmlBuilder<Message>
declare const document: RichText.Document
declare const modifiers: KeyboardModifiers
declare const code: RichText.Block
const ArticleKit = RichText.kit({ nodes: [RichText.block('Paragraph')], marks: [RichText.Bold] })
-->

## Pick a block style

In the sections below, `model` holds your `document`, `editor`, and chrome state, `h` is Foldkit's `HtmlBuilder`, and `edited` wraps editor Messages into your parent `Message`.

`blockStyles` renders a toolbar of buttons for Paragraph and Heading 1–3 using the slash menu labels:

```ts
import { blockStyles } from 'foldkit-mixins-richtext'

blockStyles<Message>()(
  { document: model.document, selection: model.editor.selection, wrap: edited },
  h,
)
```

Clicking a button sends `RetypedBlock` through `wrap`. Inside a code block, buttons show unpressed and retype the block to a paragraph or heading when your vocabulary allows it; with a node selection or no selection, all buttons are disabled. Lists and quotes lift out rather than retyping, so they stay unpressed here.

| Slot | Capability | Renders |
| --- | --- | --- |
| `root` | Container | Picker wrapper |
| `toolbar` | Collection | Row with `role="toolbar"` |
| `button` | Interactive | Style button with `data-style` and `aria-pressed` |

`blockStyleMenu<Message>()` fits the same options into a dropdown trigger (`open` and `toggled` come from your Model), showing the active style's icon and label (or `"Text style"`) and opening a `role="menu"` list of `menuitemradio` items.

| Slot | Capability | Renders |
| --- | --- | --- |
| `root` | Container | Wrapper anchoring the menu |
| `trigger` | Interactive | Trigger with `aria-haspopup="menu"` and `aria-expanded` |
| `menu` | Collection | Open menu |
| `item` | Interactive | Style row with `data-style` and `aria-checked` |
| `icon` | Container | Style icon |
| `label` | Container | Style label |
| `check` | Container | Checkmark beside the active style |

## Build a full formatting toolbar

`formattingToolbar` combines undo/redo, the text style menu, marks, link trigger, lists, quote, and an insert menu into a single APG `role="toolbar"` with roving tabindex:

```ts
import { formattingToolbar } from 'foldkit-mixins-richtext'

formattingToolbar<Message>()(
  {
    id: 'body-bar',
    document: model.document,
    selection: model.editor.selection,
    storedMarks: model.editor.storedMarks,
    wrap: edited,
    menu: model.menu,
    toggled: (menu, open) => ToggledMenu({ menu, open }),
    roving: { current: model.tabStop },
    onFocus: id => FocusedControl({ id }),
  },
  h,
)
```

Pass a unique `id` to prefix button IDs for arrow navigation. Store the ID emitted by `onFocus` and pass it back in `roving.current` so `Tab` returns to the last focused control. Choosing an item in the style or insert menu emits through `wrap`, where your `update` closes the menu; clicking `link` triggers `toggled('link', ...)` so you can open `linkEditor`.

Customize the controls with `items` (defaulting to `standardFormattingItems`), using `'undo'`, `'redo'`, `'style'`, `'link'`, `'bulleted-list'`, `'numbered-list'`, `'checklist'`, `'quote'`, `'insert'`, `'separator'`, `{ mark: 'Underline' }`, or `{ control }`. Pass `inserts` (`InsertEntry.Editor` or `InsertEntry.App`) to populate the insert menu, `history: { undo, redo }` when your app controls undo state, `words` for custom labels, and `shortcuts` (`foldkit-primitives` patterns such as `'mod+u'`) for `aria-keyshortcuts` and tooltips.

ArrowLeft/ArrowRight (mirrored for `direction: 'rtl'`), Home, and End navigate controls; ArrowDown opens menus; unavailable actions use `aria-disabled` so arrow keys can still reach them.

### Add custom application controls

Add `{ control: { id, label, icon?, shortcut?, pressed?, disabled?, message, popup? } }` anywhere in `items` and `InsertEntry.App` entries in `inserts`:

```ts
import { InsertEntry } from 'foldkit-mixins-richtext'

formattingToolbar<Message>()(
  {
    id: 'body-bar',
    document: model.document,
    selection: model.editor.selection,
    wrap: edited,
    toggled: (menu, open) => ToggledMenu({ menu, open }),
    roving: { current: model.tabStop },
    onFocus: id => FocusedControl({ id }),
    items: [
      'undo',
      'redo',
      'separator',
      { mark: 'Bold' },
      { control: { id: 'find', label: 'Find', icon: 'search', message: ToggledFind() } },
      'insert',
    ],
    inserts: [InsertEntry.App({ id: 'file', label: 'Image, video or file', message: PickedFile() })],
    returned: ReturnedToText(),
  },
  h,
)
```

Also refuse disallowed actions in `update` when `disabled` is true, since the view only marks the button `aria-disabled`.

### Collapse low-priority controls on narrow screens

Wrap secondary items in `{ low: item }` and set `compact: true` (driven by a `MediaQuery` or `Resize` observer in your Model) to collapse them into a trailing **More** menu (`menu: 'more'`):

```ts
formattingToolbar<Message>()(
  {
    id: 'body-bar',
    document: model.document,
    selection: model.editor.selection,
    wrap: edited,
    toggled: (menu, open) => ToggledMenu({ menu, open }),
    roving: { current: model.tabStop },
    onFocus: id => FocusedControl({ id }),
    items: ['undo', 'redo', 'separator', { mark: 'Bold' }, { low: { mark: 'Code' } }, { low: 'quote' }],
    compact: true,
  },
  h,
)
```

Keep popup triggers (`style`, `insert`, `link`, or controls with `popup`) out of `{ low }` unless narrow screens can omit them, since the **More** menu only lists direct actions and toggles.

### Keep focus predictable across pointer and keyboard

Toolbar roots carry `data-editor-controls`, so pointer clicks keep focus inside the editor text and leave the browser selection intact while still triggering the button. Keyboard navigation (`Tab` into the bar, then arrow keys) holds focus on the bar while the editor draws `span[data-decoration="selection"]` to keep the text range visible; pressing `Escape` dispatches `returned` so your `update` can return focus via `focus(hostId, selection)`. Mark your own custom editor chrome with `h.Attribute(CONTROLS_ATTRIBUTE, '')` from `foldkit-richtext-dom/toolbar`.

| Slot | Capability | Renders |
| --- | --- | --- |
| `root` | Container | `role="toolbar"` root owning `keydown` |
| `button` | Interactive | Control with `data-item`, `aria-pressed` or `aria-expanded` |
| `separator` | Container | Divider between groups |
| `anchor` | Container | Trigger and panel wrapper for anchoring |
| `label` | Container | Trigger text |
| `menu` | Collection | Open `role="menu"` panel |
| `item` | Interactive | Entry with `data-style` or `data-insert` |
| `itemLabel`, `itemDescription` | Container | Entry label and description |

## Edit and remove links

`linkEditor` provides an address input with Apply/Update and Remove buttons, returning `AppliedMark` or `ClearedMark` through `wrap`:

```ts
import { linkEditor } from 'foldkit-mixins-richtext'

const linkDraft = RichText.linkAt(model.document, model.editor.selection)?.href ?? ''

linkEditor<Message>()(
  {
    document: model.document,
    selection: model.editor.selection,
    draft: model.linkDraft,
    drafted: href => DraftedLink({ href }),
    wrap: edited,
  },
  h,
)
```

URLs are sanitized with `RichText.safeUrl` before emitting, and Apply stays disabled unless a valid URL and either a text range or a link around the caret exist. Pass `closed` to catch `Escape`, and pass `submitted` so fast Enter presses compute `linkEdit(document, selection, model.linkDraft)` from the latest Model draft rather than the last rendered props.

| Slot | Capability | Renders |
| --- | --- | --- |
| `root` | Container | `role="group"` wrapper |
| `input` | TextInput | Address input with `data-link="address"` |
| `apply` | Interactive | Apply/Update button with `data-link="apply"` |
| `remove` | Interactive | Remove button with `data-link="remove"` inside links |

## Render the slash menu

`slashMenuView` renders the filtered slash menu entries while `slashMove` updates `menuIndex` on arrow, Home, and End keys:

```ts
import { slashEntries, slashMenuView, slashMove } from 'foldkit-mixins-richtext'
import { menuTextOf } from 'foldkit-richtext-dom/editor-bundle'

const entries = slashEntries(message => edited(message))
const next = slashMove(entries, 'see /head', model.editor.menuIndex, 'ArrowDown', modifiers)

slashMenuView<Message>()(
  { entries, textBefore: menuTextOf({ document, ...model.editor }), index: model.editor.menuIndex },
  h,
)
```

Handle ArrowUp/ArrowDown and Home/End with `OnKeyDownPreventDefault` while a query is open, and send `DismissedSlash` on Escape. Reading `menuTextOf` ensures `slashMenuView` stays hidden after Escape until a new `/` query begins.

| Slot | Capability | Renders |
| --- | --- | --- |
| `root` | Container | Menu wrapper |
| `list` | Collection | Match list |
| `heading` | Container | Group heading before its first item |
| `item` | Interactive | Menu row with `data-entry` and `aria-current="true"` |
| `icon` | Container | Entry icon |
| `label` | Container | Entry label |
| `description` | Container | Entry description |
| `empty` | Container | `"No matches"` fallback |

## Render editor icons

`richTextIcon(h, name, { size })` draws inline Lucide SVG icons hidden from assistive technology (`aria-hidden`), and `richTextIconUrl(name)` produces a CSS `url(...)` data URI for masked CSS adornments. `isRichTextIcon(name)` checks whether an icon name exists across slash entries, marks, blocks, and toolbar actions.

## Move and reorder blocks with a handle

Anchor `blockHandle` beside the active block using `blockAnchor` from `foldkit-richtext-dom/toolbar`:

```ts
import { blockAnchor } from 'foldkit-richtext-dom/toolbar'
import { blockHandle } from 'foldkit-mixins-richtext'

const [outermost] = RichText.blocksAt(model.document, model.editor.selection)

outermost === undefined
  ? h.empty
  : h.div(
      [h.Key(outermost.id), h.OnMount(blockAnchor({ hostId: 'body', node: outermost.id, gap: 8 }))],
      [
        blockHandle<Message>()(
          { document: model.document, hostId: 'body', node: outermost.id, wrap: edited },
          h,
        ),
      ],
    )
```

Key the wrapper with `h.Key(outermost.id)` so `blockAnchor` and `blockDrag` rebind whenever the target block changes. The grip drags blocks anywhere allowed by the vocabulary, while the up and down buttons reorder siblings within the current container.

| Slot | Capability | Renders |
| --- | --- | --- |
| `root` | Container | `role="group"` handle wrapper |
| `grip` | Interactive | Drag grip with `data-handle="grip"` |
| `up` | Interactive | Move-up button with `data-handle="up"` |
| `down` | Interactive | Move-down button with `data-handle="down"` |

## Add table and code block toolbars

`tableToolbar` edits rows, columns, and header flags around the caret's cell, while `codeToolbar` changes a code block's language and dispatches a copy Message:

```ts
import { codeToolbar, tableToolbar } from 'foldkit-mixins-richtext'

const table = RichText.tableAt(model.document, model.editor.selection)

table === undefined
  ? h.empty
  : h.div(
      [
        h.Key(table.table.id),
        h.OnMount(blockAnchor({ hostId: 'body', node: table.table.id, gap: 6, side: 'above' })),
      ],
      [
        tableToolbar<Message>()(
          { document: model.document, selection: model.editor.selection, wrap: edited },
          h,
        ),
      ],
    )

codeToolbar<Message>()(
  {
    document: model.document,
    node: code.id,
    languages: [{ id: 'typescript', label: 'TypeScript' }, { id: '', label: 'Plain text' }],
    wrap: edited,
    copied: Message.CopiedCode({ node: code.id }),
  },
  h,
)
```

| Slot | Capability | Renders |
| --- | --- | --- |
| `TableToolbarSlots.root` | Container | Table toolbar wrapper |
| `TableToolbarSlots.toolbar` | Collection | `role="toolbar"` button row |
| `TableToolbarSlots.button` | Interactive | Action button with `data-table` |
| `CodeToolbarSlots.root` | Container | `role="toolbar"` wrapper |
| `CodeToolbarSlots.language` | Interactive | Language `<select>` |
| `CodeToolbarSlots.copy` | Interactive | Copy button with `data-code="copy"` |

## Find and replace text

`findReplace<Message>()` renders the search and replacement inputs, match counter (`2 of 5` or `No matches`), and navigation/replace buttons. Keep `query`, `replacement`, `current`, and `caseSensitive` in your Model, advance `current` with `stepMatch(current, count, step)` in `update`, and overlay highlights using `overlay(hostId, RichText.searchDecorations(...))`.

| Slot | Capability | Renders |
| --- | --- | --- |
| `root` | Container | `role="search"` wrapper |
| `field` | TextInput | Inputs with `data-find="query"` or `"replacement"` |
| `count` | Container | Live match count (`aria-live`) |
| `button` | Interactive | Controls keyed by `data-find` (`previous`, `next`, `case`, `replace`, `replace-all`, `close`) |

## Outline, footnotes, and command palette

- **`tableOfContents<Message>()`**: Renders `RichText.outlineOf(document)` as a `nav` list, marking `RichText.sectionAt` with `aria-current="location"` and calling `chosen(node)` on click (returns empty when no headings exist). Slots: `root` (`nav`), `list` (`ul`), `entry` (button with `--fk-toc-level`).
- **`footnotePreview<Message>()`**: Renders when the caret is inside a `FootnoteRef` (`RichText.footnoteAt`), showing the note text, a label field emitting `RenamedFootnote`, and a Go to note button sending `opened(definition)`. Slots: `root` (`role="group"`), `label` (`TextInput`), `text` (`Container`), `button` (`Interactive`).
- **`commandPalette<Message>()`**: Searches `slashEntries` from a standalone `role="combobox"` dialog driven by `{ query, index } | null` in your Model:

```ts
import { commandPalette } from 'foldkit-mixins-richtext'

const commands = slashEntries(event => Message.ChoseCommand({ event }))

model.palette === null
  ? h.empty
  : commandPalette<Message>()(
      {
        id: 'commands',
        entries: commands,
        query: model.palette.query,
        index: model.palette.index,
        changed: (query, index) => Message.ChangedPalette({ query, index }),
        closed: Message.ClosedPalette(),
      },
      h,
    )
```

| Slot | Capability | Renders |
| --- | --- | --- |
| `root` | Container | `role="dialog"` palette |
| `input` | TextInput | `role="combobox"` search input |
| `list` | Collection | `role="listbox"` matches |
| `option` | Interactive | Option row with `data-entry` and `aria-selected` |

## Show word counts and validation diagnostics

`editorStatus<Message>()` displays cached word and character counts (`RichText.count`) alongside any `diagnostics` you pass from `RichText.validate`:

```ts
import { editorStatus } from 'foldkit-mixins-richtext'

editorStatus<Message>()(
  { document: model.document, diagnostics: RichText.validate(model.document, ArticleKit) },
  h,
)
```

| Slot | Capability | Renders |
| --- | --- | --- |
| `root` | Container | Status bar wrapper |
| `counts` | Base | Counts summary with `data-status="counts"` |
| `problems` | Collection | Diagnostics list with `data-status="problems"` |
| `problem` | Base | Diagnostic item with `data-code` and `data-node` |

## Switch to Markdown source mode

Pair `sourceEditor<Message>()` (and optionally `sourcePreview<Message>()` for split view) with `openSource` and `closeSource` from [`foldkit-richtext-markdown`](../richtext-markdown) while `model.source` is non-null:

```ts
import { sourceEditor } from 'foldkit-mixins-richtext'

model.source === null
  ? h.empty
  : sourceEditor<Message>()(
      {
        session: model.source,
        document: model.document,
        drafted: draft => DraftedSource({ draft }),
        moved: caret => MovedInSource({ caret }),
        done: LeftSource(),
      },
      h,
    )
```

The textarea sets initial focus and caret position from `session.caret` on mount, emits `drafted` and `moved` as the user types or moves, lists any conversion warnings computed from `closeSource`, and emits `done` when leaving source mode so `update` can inspect warnings before committing `closed.document`.

| Slot | Capability | Renders |
| --- | --- | --- |
| `root` | Container | Source editor wrapper |
| `text` | TextInput | Markdown textarea with `data-source="text"` |
| `warnings` | Collection | Warnings list with `data-source="warnings"` |
| `warning` | Base | Warning item with `data-code` and `data-detail` |
| `done` | Interactive | Exit button with `data-source="done"` |

## What lives elsewhere

- **Editor placeholder and line hints:** Configured on `editorAt` in [`foldkit-richtext-dom`](../richtext-dom#configuring-an-editor-placement) because they live inside the `contenteditable` tree.
- **Floating and block positioning:** `selectionAnchor`, `blockAnchor`, and `blockDrag` live in [`foldkit-richtext-dom/toolbar`](../richtext-dom#position-toolbars-block-handles-and-menus).

## Next

- Mount the editable host and configure placements: [`foldkit-richtext-dom`](../richtext-dom)
- Style Slots with theme tokens and Behaviors: [`foldkit-mixins`](../mixins)
- Parse and print Markdown for source mode: [`foldkit-richtext-markdown`](../richtext-markdown)
