# `foldkit-primitives/dom`

Element Mounts that act while attached, and one-shot Commands that run once
and report back. Nothing here owns lasting state: a Mount reads and writes the
DOM for its element, a Command's result comes back as a Message your union
wraps.
([source](https://github.com/doeixd/foldkit-plus/blob/main/packages/primitives/src/dom))

| Name | Form | Reports or yields | Args |
| --- | --- | --- | --- |
| `copyText(text)` | Command | `Copied`, `CopyFailed` | |
| `readText()` | Command | `Read { text }`, `ReadFailed` | |
| `share(data)` | Command | `Shared`, `Dismissed`, `ShareFailed` | `{ title?, text?, url? }` |
| `loadScript(src)` | Command | `Loaded`, `LoadFailed` | |
| `Autofocus()` | Mount | `Focused` | |
| `InputMask({ pattern })` | Mount | `Input { value, raw }` | `#`, `A`, `*` placeholders |
| `KeepInView({ selector })` | Mount | nothing | |
| `Measure({ targets })` | Mount | nothing; writes custom properties | |
| `FluidHover({ name, item, axis, gapClick, gapReach?, follows?, from? })` | Mount | nothing; writes custom properties | `axis`: `x`, `y`, `xy` |
| `FocusScope(options)` | Mount | nothing | `{ contain?, restore?, initialFocus? }` |
| `FollowTabStop` | Mount | nothing | |
| `ScrollLock`, `HideOutside` | Mounts | nothing | |
| `keepScroll(options?)` | entry | nothing | |
| `pointedLinks()` | stream | `Url` | |
| `applyMask(value, pattern)` | function | `{ value, raw }` | |

## Start with one: copy to the clipboard

```ts
import { mapMessage } from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import { ClipboardMessage, copyText } from 'foldkit-primitives/dom'

const Message = defineMessageUnion({
  CopyClicked: {},
  Clipboard: { message: ClipboardMessage },
})
type Model = { readonly text: string; readonly status: string }

const update = (model: Model, message: typeof Message.Type) =>
  Message.match(message, {
    CopyClicked: () => ({
      model,
      commands: [mapMessage(copyText(model.text), message => Message.Clipboard({ message }))],
    }),
    Clipboard: ({ message }) => ({
      model: {
        ...model,
        status: ClipboardMessage.match(message, {
          Copied: () => 'Copied',
          CopyFailed: ({ message }) => message,
        }),
      },
    }),
  })
```

`copyText` describes a Command; returning it from `update` lets the runtime
perform the write. `mapMessage` wraps its result into the parent's union, so
success and failure land in the same reducer, and the clipboard never enters
the Model: it is not application state. `readText()` reads the same way.

## The Commands

**`share(data)`** posts `{ title?, text?, url? }` to the platform sheet:
`Shared` on success, `Dismissed` when the user cancels the sheet (its own
outcome, not a failure), `ShareFailed` otherwise.

**`loadScript(src)`** appends a head script unless one carries the URL
already, so concurrent loads collapse onto the first tag and share its fate,
yielding `Loaded` or `LoadFailed`. A dead tag is removed, so a retry fetches
afresh.

Denial, an insecure context, a missing API (a server), and a network error
all become the failure Message. No Command here throws.

## Mounts for focus

**`Autofocus()`** focuses the element on insert, then emits `Focused`:
requested, not landed, since a non-focusable element may decline.

**`FocusScope({ contain?, restore?, initialFocus? })`** keeps focus inside an
overlay. On insert the container focuses `initialFocus`, else its first
tabbable descendant, else itself. With `contain` (default), Tab from the last
tabbable wraps to the first, Shift+Tab from the first wraps to the last, and
focus that lands outside comes straight back; Tab in the middle is the
browser's. On unmount, with `restore` (default), focus returns to the element
that had it, if still in the document. A native `<dialog>` does all of this
itself; this is for a custom overlay, a menu, or a command palette.
`tabbableWithin(element)` is exported: focusable, visible descendants with a
non-negative `tabindex`, in order. Its Behavior form is in [`interaction`](../interaction/README.md).

**`FollowTabStop`** moves focus within a container to its roving tab stop when
a transition the container did not see moves it or removes the focused row. It
never takes focus from outside the container. `TreeNavigation` uses it.

**`ScrollLock`** locks the document's scroll while its element is mounted,
refcounted so nested overlays release together, with Foldkit's iOS handling;
**`HideOutside`** marks everything outside its element inert while mounted,
keyed by an id the Mount mints so two overlays restore independently. Both are
Foldkit's own `Dom.lockScroll` and `Dom.inertOthers` as Mounts. A native
`<dialog>` shown modally needs neither.

## Mounts for layout

**`KeepInView({ selector })`** keeps what is marked in view: whenever an
element in its subtree newly matches `selector` (the row just selected, the
node just inserted), it is scrolled into view the least amount that shows it.
It sends no Message and redraws nothing, so a focused row stays focused. Where
there is no layout (jsdom), it scrolls nothing.

**`Measure({ targets: { selected: '[aria-selected="true"]' } })`** measures,
for each named target, the first element in its subtree that matches, relative
to its scroll box, and writes `--fk-selected-x`, `-y`, `-w`, `-h` (pixels) and
`--fk-selected-display` (`block`, or `none` while nothing matches) on the
element; `measured('selected')` names them. A child placed absolutely from
them, such as an editor's selection outline, sits over the target and scrolls
with it. Where an element is, is presentation: it sends no Message and keeps
nothing in the Model. It measures again when the subtree changes, as the
records arrive, so the box moves in the frame the change is drawn in; and, at
most once a frame, when the element scrolls, when it or a target changes size,
when the window resizes, when an image or a font inside loads, and on each
frame of a transition or animation inside. Anything else that moves a target
without resizing it (a stylesheet added) is seen at the next of these.

**`FluidHover({ name: 'hover', item: '[data-item]', axis: 'y', gapClick: true })`**
moves one highlight across a container's items: the item nearest the pointer is
the one highlighted, so in a gap between two items the pointer still points at
one, and the highlight moves from item to item rather than blinking off between
them. `axis` says how nearness is read: `y` for a list (the row level with the
pointer wins), `x` for a strip, `xy` for a grid. A disabled item
(`aria-disabled="true"`, `data-disabled`, `:disabled`) is never highlighted, an
item reached by the keyboard (`:focus-visible`) is, and a touch highlights
nothing. It writes `--fk-hover-x`, `-y`, `-w`, `-h` (pixels, relative to the
scroll box like `Measure`'s), `--fk-hover-shown` (`1` or `0`) and
`--fk-hover-moving` (`0` for the frame the highlight appears in, so a
movement's duration scaled by it puts the highlight on its item rather than
sliding it in); `fluidHovered('hover')` names them. With `gapClick`, a click in
a gap presses the highlighted item: its descendant marked `data-fluid-press`
(`FLUID_PRESS_ATTRIBUTE`), or the item; `gapReach: 16` limits that to a click
within 16px of it, as a grid of cards with wide gutters wants. Like `Measure`,
it sends no Message.

`follows` names the item the highlight sits on while the pointer is not
moving it: a menu marks the row its keys reach with `data-active`, so
`follows: '[data-active]'` lights that row whenever the mark moves, and the
highlight fades once no item is marked and neither the pointer nor focus is
inside. `from` names the item a fresh highlight grows out of and returns to as
it fades: `from: '[aria-selected="true"]'` makes a tab's hover leave the chosen
tab and rejoin it. A marker on the chosen item itself is `Measure`'s job, on
the same element. While it runs, the container carries `data-fluid-hover`
(`FLUID_HOVER_ATTRIBUTE`) set to the name, so a stylist draws the highlight,
and drops each item's own hover, only where it really follows the pointer:
before a page hydrates, the items keep theirs.
Where there is no layout (jsdom), it starts and highlights nothing; an item
with no layout box yet (a popup still opening) keeps the highlight's last
place, and is measured again for three frames, rather than drawing it at zero.

Give only what a click reaches a highlight: lighting an item that does
nothing promises a press with nowhere to land, so a card group joins only its
pressable cards. Fluid Functionalism's list of when to leave it off holds
here too: where a wrong click would hurt, where only some items are
clickable, where items stand in a lot of empty space, and where rows move as
the page scrolls.

**`InputMask({ pattern })`** masks a field against `#` (digit), `A`
(letter), and `*` (either) placeholders with literal separators, rewrites the
field with approximate caret restore, and emits `Input { value, raw }` with
the masked and unmasked text. The parent owns the value, like any controlled
input. `applyMask(value, pattern)` is the pure rule.

## `keepScroll`: the window's scroll across navigations

An entry, lifted with `Subscription.persistentEntry`, that sends no Messages: it
keeps the window's scroll across same-document navigations, so a pushed entry
starts at the top and Back, Forward, or a reload return where that entry was.
Without a window the stream is empty. The CMS example lifts it beside its
other subscriptions.

## `pointedLinks`: where the reader may go next

A stream of the address of each link the reader points at or tabs to, on the
page's own origin, once while they stay on it (crossing the text inside a
link is one link). Without a document it is empty. Map each address to a
Message and lift it with `Subscription.persistentEntry`; the Message's branch in
`update` is where a `Data.preload` reads the page there ahead. The CMS site
and studio do (`examples/cms/src/content/siteConfig.ts`,
`examples/cms/src/apps/studioApp.ts`).

## Failure

A missing capability yields the failure Message, never a throw. A Mount reads
its args once, on insert; key the element by what the args depend on.
