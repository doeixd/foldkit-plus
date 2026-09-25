# foldkit-richtext-dom

The DOM adapter for a [`foldkit-richtext`](../richtext) editable subtree.

A rich-text editor cannot let a virtual DOM own its `contenteditable` subtree:
the browser mutates that subtree directly for typing, selection, IME, and
clipboard, and rebuilding it on every keystroke fights that native behavior. This
package owns the subtree instead. It renders a semantic `Document` into real DOM
once, patches only the nodes a `ChangeSet` names, and translates the browser
events it understands into `foldkit-richtext` commands.

## Ownership

```text
foldkit-richtext       owns the semantics: Document, commands, transactions
foldkit-richtext-dom   owns the contenteditable subtree and its events  (this package)
foldkit / application  owns everything around it: host, toolbar, menus, status
```

Only `Document`, `ChangeSet`, and `Selection` values, commands, and intents cross
the boundary. Nothing inside the subtree is read as truth; the semantic document
stays authoritative, and the DOM is consulted only to map a browser selection back
to a position.

This package is **early**: 0.x, and its API may change between minor versions.

```bash
pnpm add foldkit-richtext-dom foldkit-richtext foldkit-bundle foldkit effect
```

## Entries

```text
foldkit-richtext-dom          the interpreter: mount, patch, repair, position mapping
foldkit-richtext-dom/host     mountInto, attachmentIn, releaseMount, placeRendering, renderingFor
foldkit-richtext-dom/events   attach, intentFor, selection read and restore
foldkit-richtext-dom/html     parseHtml
foldkit-richtext-dom/view     renderDocument, renderBlocks
foldkit-richtext-dom/toolbar  marksToolbar
foldkit-richtext-dom/editor   Message, toMessage, attachEditor, events, patchEditor
foldkit-richtext-dom/editor-bundle  Editor, editorAt, application, update, the Messages
```

## The loop

```ts
import { mount } from 'foldkit-richtext-dom'
import { attach } from 'foldkit-richtext-dom/events'
import * as RichText from 'foldkit-richtext'

let dom = mount(ownerDocument, content) // render once
host.append(dom.root) // the host element is yours

// Events become intent; your update decides and commits.
const attachment = attach(dom, {
  onIntent: command => dispatch({ type: 'Edited', command }),
})

// In the resulting transition, after RichText.run returns a new state:
attachment.sync(next, result.changeSet)
dom = attachment.current()
```

This is the shape, not a copyable module: `ownerDocument`, `content`, `host`,
`dispatch`, `next`, and `result` come from the surrounding application, and `next`
is the `EditorState` that transition committed.

Read the calls literally:

- `mount(ownerDocument, content, renderer?)` builds the subtree and the identity
  index it is patched through: `data-block` on a block, `data-run` on a run. It
  listens to nothing and runs nothing. A renderer (§121) nests each mark as an
  element *inside* its run element, exactly as the read-only renderer nests them,
  so the run element stays outermost and the text node stays deepest, and a
  selection still maps; a mark name no entry renders stays on `data-marks`. A node
  entry renders a node block as its element — attributes included, its nested blocks
  inside — and `data-block` stays the interpreter's identity; a kind no entry renders
  keeps a `div`. The registry is kept on the `EditorDom`, and every later patch uses
  that one, so a run or a container cannot come back rendered differently.
- `attach(dom, { onIntent })` listens for `beforeinput`, `keydown`, composition,
  copy, cut, and paste, and reports each one it understands as intent. Everything
  it understands it `preventDefault`s, so the browser never mutates the DOM behind
  the document; an event it cannot honor yet is prevented with no intent rather
  than allowed to drift. `onSelection` reports a caret or range the application
  did not just commit, so the editor can follow it; a position it did commit is
  not reported back, and neither is anything while an IME owns the caret.
  `attachment.sync(state, changeSet)` does the patch and selection restore below
  in one call, and `detach()` removes the listeners. `keymap` adds or overrides
  chord bindings, checked before the built-in chords.
- `patch(dom, content, changeSet)` removes the identities the change set removed,
  re-renders the ones it marked dirty, and places inserted or moved elements in
  document order. Every other element is left alone — but "left alone" is decided
  against the whole block, not its text: an element that is no longer what its block
  renders as (a heading re-leveled to `h3`, or a kind whose entry names another tag)
  is re-rendered rather than kept as the old one.
- `repair(dom, content)` is recovery, not domain state (§31): it drops anything the
  subtree holds that the document does not, re-renders blocks whose rendering
  drifted (text, marks, or the element itself), and returns the same `EditorDom`
  when nothing was wrong. Call it after a cancelled IME.
- `positionToRange` and `rangeToPosition` translate between a semantic `Position`
  and a DOM `Range`. A DOM caret carries no affinity, so mapping back derives it
  (`after` at a run's end, `before` elsewhere) rather than pretending to
  round-trip it.
- `parseHtml(html, { kit, mint })` at `foldkit-richtext-dom/html` is the clipboard
  fallback: a whitelist walk over a `DOMParser` tree that mints fresh identities,
  so a pasted `style`, `href`, or `onclick` can never survive as anything
  executable.

## Mounting into a view

A Foldkit view owns the host element; the interpreter owns what goes inside it.
`mountInto` renders into the host and records the attachment there, so a patch
Command that has only the element can find it (§118). It takes the same
`rendering(...)` registry as `mount`, so the subtree a *view* mounts can carry a
declared mark's props too:

```ts
import { attachmentIn, mountInto, releaseMount } from 'foldkit-richtext-dom/host'

// The mount: once, when the host element enters the DOM. The registry is optional.
const attachment = mountInto(host, content, { onIntent, onSelection }, renderer)

// The patch Command: after the transition committed, given the host element.
attachmentIn(host)?.sync(state, changeSet)

// Unmount.
releaseMount(host)
```

## The editor's Messages

`editor` is the vocabulary an editor's `update` handles, and the mount that
produces it (§118). The adapter reports what happened as commands, a caret, and a
history chord; `toMessage` turns each into a Message:

```ts
const Message = defineMessageUnion({
  Typed, Backspace, DeletedForward, Entered, ToggledMark, RetypedBlock,
  Selected, Pasted, Undone, Redone, Patched,
})
```

`toMessage(command)` refuses what the vocabulary cannot carry rather than dropping
a detail: the adapter reports only plain insertions and toggles by name, so an
insertion carrying marks and a mark value with props come back `undefined` — the
vocabulary has no shape for them yet, and silently losing the marks would be
worse. `RetypedBlock` is the same kind of Message and never arrives from
`toMessage`: no browser event means "make this block a heading", so an application
sends it itself. `attachEditor(host, content, emit, renderer?)` attaches the translation to a host
element and reports each Message; `events({ content })` wraps the same thing in a
`Mount.defineStream`, so a view renders a host element whose mount produces these
Messages and releases the subtree when the element goes. `patchEditor(hostId,
state, changeSet)` is what the patch Command runs: it finds the element by id,
syncs the attachment it holds, and reports whether it patched — a missing host is
an editor that went away while the transition was in flight, not an error.
`Patched` is that Command's own completion, because a Foldkit Command must return
a Message.

## The slash menu

The editor also owns the slash menu's vocabulary, because an entry is one of its own
Messages and the Bundle resolves Enter by handling the chosen entry as that Message (§123):

```ts
import {
  matchingEntries,
  slashEntries,
  slashMenu,
  slashQuery,
} from 'foldkit-richtext-dom/editor'

slashQuery('see /head') // 'head' — opens at a block's start or after whitespace
slashMenu(slashEntries, 'see /head', 0)?.highlighted?.label // 'Heading 1'
```

`slashEntries` leads with the text blocks a caret can become (`Paragraph`, `Heading 1`–`3`)
and then the marks it can carry, each with a stable `id`, a `label`, the words a query may
also match, and the Message choosing it. `matchingEntries` filters; an empty query offers
everything. `slashMenu(entries, textBefore, index)` is the one value a view and `update`
share — whether a query is open, what matches, and what Enter would send — with a stale
index falling back to the first match. `textBefore` is a read
(`RichText.textBefore(document, position)`), not stored state, and `slashQuery` and
`matchingEntries` work over any entries carrying a `message`, so an application's own
catalogue reuses them.

`EditorState.menuIndex` is the one thing a menu owns; the application moves it (with
`slashMove` from `foldkit-mixins-richtext`) and the Link re-projects it. When `Entered`
arrives and the caret's text opens a query, the Bundle treats the highlighted entry as the
Message a click would send, so a mark entry updates the caret's stored marks and a retype
replaces the block through the same paths a click or a chord uses. Choosing an entry also
removes the query it was typed into, as one action (§124 §5): `textRangeBefore` reads the
range and `runAction` commits the deletion and the choice together, so one transition and
one undo step cover both. The menu is resolved whenever the caret's text opens a query;
there is no switch to turn it off.

## The read-only renderer

`view` renders a document or a slice as ordinary Foldkit `Html` through
`inertHtml`, so it dispatches nothing and owns no DOM — the counterpart to the
editable adapter, not a second editor:

```ts
const html = renderDocument(document) // a div of block elements
renderBlocks(slice.blocks) // one element per block
renderDocument(document, renderer) // a declared Link as a real <a href>
```

Both take the same `rendering(...)` registry as the HTML serializer (§121), so a
declared mark or node kind becomes its element here too. Without one, blocks become
`p`/`h1`–`h6`, marks nest as `strong`/`em`/`code` in the same order the serializer
uses, unknown marks ride on a `span` with `data-marks`, and unknown blocks render as
an inert `div data-unknown="Type"` placeholder.

Foldkit types one builder per tag name and publishes no builder for an arbitrary tag,
so a renderer tag outside the tags Foldkit can build — a custom element's, say — is
*reported* rather than swapped for another element. The serializer and the adapter
accept any tag; that asymmetry is Foldkit's, not the registry's.

One caveat worth knowing: `h.DataAttribute` prefixes `data-` itself, so it takes the
bare name (`DataAttribute('unknown', …)` → `data-unknown`).

## The editor Bundle

`editor-bundle` is the editor as a Bundle whose authoritative document may live in
the parent (§27). `Editor` is the Bundle; `EditorState` and `EditorView` are the
state the parent owns beside the document — selection, stored marks, history, the
menu highlight (`menuIndex`), and the identity counter; `editorAt(hostId, renderer?)`
places one
editor and binds it to the host element its view renders. A `renderer` is placed for
that host id rather than passed as an arg, because a registry holds functions and the
Bundle's args are schema-decoded (§122): `placeRendering` and `renderingFor` at
`foldkit-richtext-dom/host` are the same record the editor's mount reads, and a
placement without one renders with the default. The Link's `read` projects the
parent's document in, and `write` keeps only the editor fields, so the child never
stores a document copy; `onOut` commits the returned state in the same parent
transition. `application` and `update` are the assembled parent, and `edited` /
`typed` / `pressed` / `toggled` / `retyped` / `selected` / `undone` / `redone` /
`patched` build the Messages it dispatches. Every accepted edit returns a `RichText.patch`
Command carrying the `ChangeSet`, which is how rendering follows the commit instead
of sharing it.

## The marks toolbar

`marksToolbar({ state, toMessage, marks? })` returns a view — `(h) => Html` — of one
button per mark, dispatching the same Message a chord does. It is the application's
chrome: §29 gives the editor the subtree and the application everything around it,
so the application places this beside the editor's host rather than the Bundle
rendering it. `state` is what the editor projects (`document`, `selection`,
`storedMarks`), and `marks` defaults to the three the package ships. A mark is
active when the caret carries it, or — with no stored format — when every run the
selection covers does. `markActive(state, mark)` is that rule on its own, for a
renderer that draws its own buttons.

## What it does not do

- It does not run commands or resolve domain state. A caller runs `RichText.run`
  and hands the result here; `attach` reports intent and stops.
- A registry placed for a host id is kept for that id, not released with a host, so
  a host that unmounts and mounts again renders the same way; the record is bounded
  by the placements an application makes, not by mounts (§122). It is a per-id
  record the view's author writes, not a service locator.
- It does not patch nested structural changes item by item: a container whose item
  list changed is re-rendered where it stood, so its surviving items are rebuilt
  rather than patched individually. Correct, and a follow-up for identity
  preservation.

## Checks

```bash
pnpm --filter foldkit-richtext-dom typecheck
pnpm vitest run packages/richtext-dom/test
```
