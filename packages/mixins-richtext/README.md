# foldkit-mixins-richtext

The rich-text editor's chrome (toolbars, menus, a block handle, a status line, a Markdown
source mode) drawn as [Mixins](../mixins) slot views, so an application restyles or extends
every element the way it does any other view.

## Who owns what

```text
foldkit-richtext-dom     the editor: its host element, the editable subtree, every edit
your application         every piece of state the chrome shows, and where it is drawn
foldkit-mixins-richtext  nothing: each view is a function of what it is given  (this package)
```

The editor renders its host and nothing else (§29 of the Rich Text design); the chrome beside
it is the application's. `foldkit-richtext-dom/toolbar` ships plain versions of some of it,
such as `marksToolbar`. This package draws the same chrome as slot views. It cannot wrap the
plain ones, because a slot's contributions resolve at the element the view creates, so a slot
view owns its elements; the two share the rules, such as `markActive`.

## The contract every view keeps

- **It holds no state.** Whether a palette is open, what is typed in a field, which entry is
  highlighted: each is the application's, passed in and changed through a Message.
- **What it shows is a read of the document.** A pressed mark (`markActive`), the caret's
  block style (`RichText.textBlockAt`), the link around the caret (`RichText.linkAt`), and the
  slash menu (`RichText.textBefore`) are computed from the document and selection it is given.
- **Messages go out through what the caller passes.** An editor Message goes through `wrap` (or
  `toggled`), because the caller usually dispatches a wrapper such as the editor Bundle's
  `edited`; an application Message through a named callback, such as `changed` or `closed`.
- **Every element is a slot.** Each view names its slots and their capabilities in a table
  below; `Style` and Behaviors reach them the way they reach any Mixins view.

In the snippets, `model`, `h`, `Message`, and `edited` are the application's, as in
`foldkit-richtext-dom`'s editor; a name such as `DraftedLink` is one of its own Message
constructors.

## Install

The `foldkit-richtext` family is **early**: 0.x, and its API may change between minor versions.

```bash
pnpm add foldkit-mixins-richtext foldkit-mixins foldkit-richtext foldkit-richtext-dom
```

## Sixty seconds: the mark toolbar

```ts
import { Style } from 'foldkit-mixins'
import { MarkToolbarSlots, markToolbar } from 'foldkit-mixins-richtext'

const Toolbar = markToolbar<Message>().pipe(
  Style.attach(Style.forSlots(MarkToolbarSlots)({ button: Style.class('mark-button') })),
)

// In a view:
Toolbar(
  {
    state: { document, selection, storedMarks },
    toggled: mark => edited(Message.ToggledMark({ mark })),
  },
  h,
)
```

`state` is what the editor projects; `toggled` turns a mark into the caller's Message; `marks`
defaults to the three `foldkit-richtext` ships. The `Style.attach` line is the point of the
package: the buttons are a slot, and the application styled them without the view knowing.
Each button renders with its mark as the slot item's `id`, so a Behavior can single one out.
The view owns each button's click and pressed state, so neither is in a slot's contract, and a
mixin cannot take them over.

| Slot | Capability | Renders |
| --- | --- | --- |
| `root` | Container | the toolbar's wrapper |
| `toolbar` | Collection | the row of buttons |
| `button` | Interactive | one mark's button, per mark |

A floating toolbar is this one inside an element carrying `foldkit-richtext-dom/toolbar`'s
`selectionAnchor`, as that package's README shows.

## The block style picker

A button per text style the caret's block can take: Paragraph, Heading 1, 2, and 3, under the
slash menu's labels.

```ts
import { blockStyles } from 'foldkit-mixins-richtext'

blockStyles<Message>()(
  { document: model.document, selection: model.editor.selection, wrap: edited },
  h,
)
```

A click sends that style's `RetypedBlock` through `wrap`. At a heading level it does not list,
none is pressed. In a code block none is pressed either, and a button retypes the block out of
it, which the editor does given a vocabulary that says the kind holds text. With a node
selection or none, every button is disabled, because a retype there is refused. Lists and
quotes are not styles here: leaving one is a lift, not a retype.

| Slot | Capability | Renders |
| --- | --- | --- |
| `root` | Container | the picker's wrapper |
| `toolbar` | Collection | the row, `role="toolbar"` |
| `button` | Interactive | one style, `data-style` (the entry's id) and `aria-pressed` |

## The link editor

An address field with two buttons: link the selection (or change the link around the caret),
and remove that link. The address being typed is the application's; what it sends is the
editor's `AppliedMark` or `ClearedMark` through `wrap`, so the editor applies either as one
transition and one undo step.

```ts
import * as RichText from 'foldkit-richtext'
import { linkEditor } from 'foldkit-mixins-richtext'

// Opening the editor: start the draft from the link the selection is in, if any.
const linkDraft = RichText.linkAt(model.document, model.editor.selection)?.href ?? ''

// In a view:
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

What it sends is `RichText.safeUrl(draft)`, so the address is cleaned and a `javascript:` or
`data:` one is never sent. Applying needs such an address and something to link: a range of
text, or a caret inside a link. Otherwise the apply button is disabled and Enter in the field
falls through. The remove button is drawn only inside a link. Where the editor appears, and
when it opens or closes, is the application's.

| Slot | Capability | Renders |
| --- | --- | --- |
| `root` | Container | the editor's wrapper, `role="group"` |
| `input` | TextInput | the address field, `data-link="address"` |
| `apply` | Interactive | the apply button, `data-link="apply"`, labelled Link or Update |
| `remove` | Interactive | the remove button, `data-link="remove"`, inside a link only |

## The slash menu

What opens a menu, what it offers, and what Enter sends are the editor's
(`foldkit-richtext-dom`'s README explains `slashQuery`, `slashEntries`, and `slashMenu`), and
they are re-exported here so the chrome and the editor share one vocabulary. This package adds
the two things the editor cannot: the keys that move the highlight, and the view.

```ts
import { slashEntries, slashMenuView, slashMove } from 'foldkit-mixins-richtext'

// The catalogue as the caller's Messages.
const entries = slashEntries(message => edited(message))

// Where ArrowDown moves the highlight: the primitive's rule, shared with any other list.
const next = slashMove(entries, 'see /head', model.editor.menuIndex, 'ArrowDown', modifiers)

// The view, placed only while `slashMenu` says a query is open.
slashMenuView<Message>()(
  { entries, textBefore: RichText.textBefore(document, caret), index: model.editor.menuIndex },
  h,
)
```

`slashMove` returns the index a key moves the highlight to, or `undefined` for a key that moves
nothing, and it starts from what the menu highlights now rather than a remembered index, so a
query that narrowed past the old one does not move from a position no one can see. The keys
are the application's to handle, because only it knows the caret: ArrowUp/Down, Home/End, and
Escape in `OnKeyDownPreventDefault` while a query is open, writing the index to
`editor.menuIndex`. Enter is not: the editor's `update` resolves it against that index (§123).

Each item carries `data-entry` (its id), `role="menuitem"`, `aria-current="true"` on the
highlighted one, and its entry's Message on click. Outside a query the view draws an empty
list.

| Slot | Capability | Renders |
| --- | --- | --- |
| `root` | Container | the menu's wrapper |
| `list` | Collection | the list of matches |
| `item` | Interactive | one entry, per match |

## The block handle

The moves one block can make as a whole: dragged by its grip, or up and down. Which block it
stands for is the caller's, usually one of `RichText.blocksAt(document, selection)`: the
outermost to move a whole list, an item to reorder a list.

```ts
import * as RichText from 'foldkit-richtext'
import { blockAnchor } from 'foldkit-richtext-dom/toolbar'
import { blockHandle } from 'foldkit-mixins-richtext'

const [outermost] = RichText.blocksAt(model.document, model.editor.selection)

// Drawn beside its block, in an element `blockAnchor` places and the block keys.
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

- **The grip** drags the block anywhere the vocabulary lets it stand (`blockDrag`). It is out of
  the tab order, since a drag has no keyboard form.
- **Up and down** send `MovedBlock` to put the block before its previous sibling or after its
  next. They move it only within its container, so moving it into another one has no keyboard
  path yet. Each is disabled at its end of the container, and both when the block is not in
  the document.
- **The key matters.** A Mount reads its args once, when its element is inserted, so without
  it the handle would stay beside, and drag, the first block the caret visited.

| Slot | Capability | Renders |
| --- | --- | --- |
| `root` | Container | the handle, `role="group"` |
| `grip` | Interactive | what it is dragged by, `data-handle="grip"` |
| `up` | Interactive | `data-handle="up"` |
| `down` | Interactive | `data-handle="down"` |

## The command palette

The slash menu's catalogue, searched from a field of its own instead of typed into the
document. Whether it is open, its query, and its highlighted index are the application's, as
`{ query, index } | null` in its Model.

```ts
import { commandPalette, slashEntries } from 'foldkit-mixins-richtext'

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

Typing sends `changed(query, 0)`; ArrowUp and ArrowDown send `changed(query, next)`, wrapping;
Home and End stay the field's. Enter and a click send the entry's own Message, which is why the
entries are wrapped: the application's `ChoseCommand` closes the palette and hands `event` to
the editor. Enter with nothing matching sends nothing, and Escape sends `closed`. The field is
a `combobox` whose `aria-activedescendant` names the highlighted option, so `id` must be unique
on the page. Opening the palette on a chord and moving focus into it are the application's.

| Slot | Capability | Renders |
| --- | --- | --- |
| `root` | Container | the palette, `role="dialog"` |
| `input` | TextInput | the search field, `role="combobox"` |
| `list` | Collection | the matches, `role="listbox"` |
| `option` | Interactive | one entry, `data-entry` and `aria-selected` |

## The status line

How long the document is, and what the application found wrong with it. It sends nothing.

```ts
import * as RichText from 'foldkit-richtext'
import { editorStatus } from 'foldkit-mixins-richtext'

editorStatus<Message>()(
  { document: model.document, diagnostics: RichText.validate(model.document, ArticleKit) },
  h,
)
```

The counts are `RichText.count`: words and characters as `Intl.Segmenter` splits them, kept per
document value so a caret move does not count again. The problems are whatever `diagnostics`
holds, one item each; the view does not validate, because which Kit a document answers to is
the application's. Leave `diagnostics` out and none is shown.

| Slot | Capability | Renders |
| --- | --- | --- |
| `root` | Container | the status line's wrapper |
| `counts` | Base | `2 words · 11 characters`, `data-status="counts"` |
| `problems` | Collection | the list, `data-status="problems"` |
| `problem` | Base | one diagnostic, `data-code`, and `data-node` when it has one |

## The Markdown source editor

Source mode is `SourceSession | null` in the application's Model: `foldkit-richtext-markdown`'s
`openSource` sets it, and `closeSource` ends it. While it is set, draw this instead of the rich
editor:

```ts
import { sourceEditor } from 'foldkit-mixins-richtext'

sourceEditor<Message>()(
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

- **The text area** holds the draft and sends `drafted` as it changes. When drawn it takes focus
  with its caret at `session.caret`, where `openSource(document, { selection })` put the rich
  editor's caret, then sends `moved` as the caret moves. The application keeps that in
  `session.caret`, so `closeSource(...).selection` is the caret back in the rich editor. The
  caret is placed when the text area appears, not on every render, since a Mount reads its args
  once.
- **The warnings** under it name what switching back would lose or refuse, read from
  `closeSource`, so there are none until the draft is edited. They are computed once per draft.
- **`done`** is the way back. The application's `update` decides whether to commit
  `closeSource(...).document` at once or to ask first when there are warnings.

Split mode is the same session drawn twice: `sourcePreview<Message>()({ session, document,
rendering? })` beside the editor renders the document switching back would commit, through the
read-only renderer, so it dispatches nothing. It shares the editor's parse of the draft, and
while the draft is unedited it shows the document the application holds now.

| Slot | Capability | Renders |
| --- | --- | --- |
| `root` | Container | the editor's wrapper |
| `text` | TextInput | the Markdown, `data-source="text"` |
| `warnings` | Collection | the list, `data-source="warnings"` |
| `warning` | Base | one loss, with `data-code` and `data-detail` for a Style to key on |
| `done` | Interactive | the way back, `data-source="done"` |

## What it does not draw

- **The placeholder** is the editor's own, placed with `editorAt`, because it is drawn inside
  the editable subtree this package stays out of.
- **Positioning** is `foldkit-richtext-dom/toolbar`'s: `selectionAnchor` for a floating
  toolbar, `blockAnchor` and `blockDrag` for the handle.

## Checks

```bash
pnpm --filter foldkit-mixins-richtext typecheck
pnpm vitest run packages/mixins-richtext/test
```

`smoke/` checks the *built* richtext packages the way a consumer meets them: through each
package's `exports` map, from `dist`. Everything inside this workspace resolves them from
source, so nothing else catches a wrong `exports` path, a missing file, or a wrong `types`
condition. Build first, then:

```bash
pnpm build
pnpm --filter foldkit-mixins-richtext smoke
```
