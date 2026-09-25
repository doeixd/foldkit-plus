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
versions. The first slice is the mark toolbar; the rest of the design's editor chrome (floating toolbar,
link popover, block handle, placeholder, status) arrives when a view needs it.

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

## The slash menu's vocabulary

The menu itself is the next slice (§123 of the design). What has landed is the part a
menu and an application drawing its own agree on, because none of it is state:

```ts
import { matchingEntries, slashEntries, slashQuery } from 'foldkit-mixins-richtext'

slashQuery('see /head') // 'head' — opens at a block's start or after whitespace
slashQuery('see/head') // undefined — that is text

// Entries lead with the text blocks a caret can become, then the marks it can carry.
const entries = slashEntries(message => edited(message))
matchingEntries(entries, 'mono').map(entry => entry.label) // ['Code']

// The one value a view and an update share: is there a menu, what matches, what Enter
// would send. `index` is what the menu last highlighted.
const menu = slashMenu(entries, 'see /head', 0)
menu?.matches.length // 3
menu?.highlighted?.label // 'Heading 1'

// Movement is the primitive's rule, so a menu and any other list agree on ArrowUp/Down,
// Home/End, wrapping, and on a modified key moving nothing.
slashMove(entries, 'see /head', 0, 'ArrowDown', modifiers) // 1
```

`slashMove` returns the index the key moves the highlight to, or `undefined` when the
key moves nothing, and it starts from what `slashMenu` highlights rather than from a
remembered index — a query that narrowed past it is not moved from a position the user
cannot see.

`slashMenu` is the decision both the menu's view and the editor's `update` read, so they
cannot disagree about whether a menu is open or what `Enter` means. A stale index — one
the query narrowed past, or a negative one — falls back to the first match, because
narrowing must not leave Enter with nothing to send; a query that matches nothing is
still a menu, with `highlighted` undefined, which is what keeps `/zzz` from sending
anything.

`slashQuery` reads the text before the caret, so whether a menu is open is a read of the
document (`RichText.textBefore`) rather than a flag. `slashEntries(wrap)` builds the
catalogue — `Paragraph`, `Heading 1`–`3`, then every mark `foldkit-richtext` ships — each
entry carrying a stable `id`, a `label`, the words a query may also match, and the editor
Message choosing it sends, wrapped for the caller the way the toolbar's `toggled` is.
`matchingEntries` is the filter, and an empty query offers everything.

The highlighted entry is the menu's only state, and per §123 it belongs beside the
editor's.

`slashMenuView<Message>()` draws it:

```ts
Menus.slashMenuView<Message>()(
  { entries, textBefore: RichText.textBefore(document, caret), index: model.menuIndex },
  h,
)
// Keys are the application's, because only it knows the caret: handle ArrowUp/Down,
// Home/End, and Escape in `OnKeyDownPreventDefault` while `slashMenu` says a query is
// live, moving with `slashMove` and closing on Escape.
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
