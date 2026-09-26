# foldkit-mixins-richtext

The rich-text editor's chrome, drawn through [Mixins](../mixins) slots.

The editor is a Bundle that renders one host element and nothing else (§29 of the
Rich Text design): the toolbar beside it is the application's chrome. This package
draws that chrome as a `SlotView`, so every element it makes is a slot an
application styles or extends the way it does any other view.

It does not wrap `foldkit-richtext-dom/toolbar`'s `marksToolbar`, and cannot: a
slot's contributions resolve at the element the view creates, so a slot view owns
its elements. The two share `markActive`, the rule that decides whether a mark is
lit.

## Status

Early: the `foldkit-richtext` family is 0.x, and its API may change between minor
versions. The mark toolbar, the block style picker, the slash menu, and the link editor are
built; the rest of the design's editor chrome (floating toolbar, block handle, status)
arrives when a view needs it. The placeholder is the editor's own, placed with `editorAt`,
because it is drawn inside the editable subtree this package stays out of.

## The mark toolbar

```ts
import { Style } from 'foldkit-mixins'
import { MarkToolbarSlots, markToolbar } from 'foldkit-mixins-richtext'

const Toolbar = markToolbar<Message>().pipe(
  Style.attach(Style.forSlots(MarkToolbarSlots)({ button: Style.class('mark-button') })),
)

// In a view: `toggled` builds the caller's own Message from a mark.
Toolbar(
  {
    state: { document, selection, storedMarks },
    toggled: mark => edited(Message.ToggledMark({ mark })),
  },
  h,
)
```

`state` is what the editor projects (`document`, `selection`, `storedMarks`); `marks`
defaults to the three `foldkit-richtext` ships; `toggled` turns a mark into the
caller's Message, which is a function because a caller usually dispatches its own
wrapper. Each button renders with its mark as the slot item's `id`, so a Behavior
can single one out.

| Slot | Capability | Renders |
| --- | --- | --- |
| `root` | Container | the toolbar's wrapper |
| `toolbar` | Collection | the row of buttons |
| `button` | Interactive | one mark's button, per mark |

The view owns each button's click and its pressed state, so neither is in a slot's
contract: a mixin cannot take them over.

## The block style picker

A button per text style the caret's block can take: Paragraph, Heading 1, 2, and 3, the
slash menu's retype entries under the same labels.

```ts
import { blockStyles } from 'foldkit-mixins-richtext'

blockStyles<Message>()(
  { document: model.document, selection: model.editor.selection, wrap: edited },
  h,
)
```

The pressed button is a read of the document (`RichText.textBlockAt`), and a click sends that
entry's `RetypedBlock` through `wrap`. At a heading level it does not list, none is pressed.
In a code block, with a node selection, or with no selection, every button is disabled,
because a retype there is refused. Lists, quotes, and code blocks are not styles here:
leaving one is a lift or a replace, not a retype, so a button for one would send a Message
that does not undo what it shows.

| Slot | Capability | Renders |
| --- | --- | --- |
| `root` | Container | the picker's wrapper |
| `toolbar` | Collection | the row, `role="toolbar"` |
| `button` | Interactive | one style, `data-style` (the entry's id) and `aria-pressed` |

## The slash menu

The query, the catalogue, and the menu are the editor's
(`foldkit-richtext-dom/editor`) and re-exported here, so an application that imports the
chrome gets one vocabulary. The family adds the two things the editor cannot: the
movement rule over `foldkit-primitives`, and the view.

```ts
import {
  matchingEntries,
  slashEntries,
  slashMenu,
  slashMove,
  slashQuery,
} from 'foldkit-mixins-richtext'

slashQuery('see /head') // 'head' — opens at a block's start or after whitespace
slashQuery('see/head') // undefined — that is text

// Entries lead with the text blocks a caret can become, then quote, lists, and code block,
// then the marks it can carry.
const entries = slashEntries(message => edited(message))
matchingEntries(entries, 'mono').map(entry => entry.label) // ['Code']

// The one value a view and the editor's `update` share: is there a menu, what matches,
// what Enter would send. `index` is what the menu last highlighted.
const menu = slashMenu(entries, 'see /head', 0)
menu?.matches.length // 3
menu?.highlighted?.label // 'Heading 1'

// Movement is the primitive's rule, so a menu and any other list agree on ArrowUp/Down,
// Home/End, wrapping, and on a modified key moving nothing.
slashMove(entries, 'see /head', 0, 'ArrowDown', modifiers) // 1
```

`slashEntries(wrap)` maps the editor's catalogue to the caller's Messages — the seam the
toolbar's `toggled` is, because the caller usually dispatches a wrapper like `edited(...)`.
`slashMove` returns the index the key moves the highlight to, or `undefined` when the key
moves nothing, and it starts from what `slashMenu` highlights rather than from a remembered
index: a query that narrowed past it is not moved from a position the user cannot see.

`slashQuery` reads the text before the caret, so whether a menu is open is a read of the
document (`RichText.textBefore`) rather than a flag. A stale index falls back to the first
match, because narrowing must not leave Enter with nothing to choose; a query that matches
nothing is still a menu, with `highlighted` undefined, which is what keeps `/zzz` from
choosing anything.

The highlighted entry is the menu's only state, and per §123 it belongs beside the
editor's: `EditorState.menuIndex`. The application moves it with `slashMove`, and the
editor's `update` resolves `Enter` against it — handling the chosen entry as the Message a
click would send, so the view never sends Enter, a mark entry updates the caret's stored
marks, and the query the entry was typed into is removed in the same action.

`slashMenuView<Message>()` draws it:

```ts
Menus.slashMenuView<Message>()(
  { entries, textBefore: RichText.textBefore(document, caret), index: model.menuIndex },
  h,
)
// Keys are the application's, because only it knows the caret: handle ArrowUp/Down,
// Home/End, and Escape in `OnKeyDownPreventDefault` while `slashMenu` says a query is
// live, moving with `slashMove` and writing the index back to `editor.menuIndex`.
```

| Slot | Capability | Renders |
| --- | --- | --- |
| `root` | Container | the menu's wrapper |
| `list` | Collection | the list of matches |
| `item` | Interactive | one entry, per match |

Each item carries `data-entry` (its id), `role="menuitem"`, `aria-current="true"` on the
highlighted one, and its own entry's Message on click. Outside a query the view draws an
empty list, so the application places it only when `slashMenu` says there is a menu — and
Enter is not the view's: the editor's `update` resolves it (§123).

## The link editor

An address field with two buttons: link the selection, or change the link around the caret,
and remove that link. It keeps no state. The link it edits is a read of the document
(`RichText.linkAt`), the address being typed is the application's, and what it sends is the
editor's `AppliedMark` or `ClearedMark` passed through `wrap`, so the editor Bundle applies
either as one transition and one undo step.

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
when it opens or closes, is the application's, as the slash menu's is.

| Slot | Capability | Renders |
| --- | --- | --- |
| `root` | Container | the editor's wrapper, `role="group"` |
| `input` | TextInput | the address field, `data-link="address"` |
| `apply` | Interactive | the apply button, `data-link="apply"`, labelled Link or Update |
| `remove` | Interactive | the remove button, `data-link="remove"`, inside a link only |

## Checks

```bash
pnpm --filter foldkit-mixins-richtext typecheck
pnpm vitest run packages/mixins-richtext/test
```

`smoke/` checks the *built* richtext packages the way a consumer meets them —
through each package's `exports` map, from `dist`. Everything inside this workspace
resolves them from source, so nothing else catches a wrong `exports` path, a
missing file, or a wrong `types` condition. Build first, then:

```bash
pnpm build
pnpm --filter foldkit-mixins-richtext smoke
```
