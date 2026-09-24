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

This package is a **private spike**: unpublished, and its API may change. It moved
here from `examples/richtext`, where the Phase 3 slice proved it. The read-only
`view.ts` and the editable Bundle still live in that harness and move next.

## Entries

```text
foldkit-richtext-dom          the interpreter: mount, patch, repair, position mapping
foldkit-richtext-dom/host     mountInto, attachmentIn, releaseMount
foldkit-richtext-dom/events   attach, intentFor, selection read and restore
foldkit-richtext-dom/html     parseHtml
foldkit-richtext-dom/view     renderDocument, renderBlocks
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

- `mount(ownerDocument, content)` builds the subtree and the identity index it is
  patched through: `data-block` on a block, `data-run` on a run. It listens to
  nothing and runs nothing.
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
  document order. Every other element is left alone.
- `repair(dom, content)` is recovery, not domain state (§31): it drops anything the
  subtree holds that the document does not, re-renders blocks whose rendered text
  drifted, and returns the same `EditorDom` when nothing was wrong. Call it after a
  cancelled IME.
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
Command that has only the element can find it (§118):

```ts
import { attachmentIn, mountInto, releaseMount } from 'foldkit-richtext-dom/host'

// The mount: once, when the host element enters the DOM.
const attachment = mountInto(host, content, { onIntent, onSelection })

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
  Typed, Backspace, DeletedForward, Entered, ToggledMark,
  Selected, Pasted, Undone, Redone, Patched,
})
```

`toMessage(command)` refuses what the vocabulary cannot carry rather than dropping
a detail: the adapter reports only plain insertions and toggles by name, so an
insertion carrying marks and a mark value with props come back `undefined` — the
vocabulary has no shape for them yet, and silently losing the marks would be
worse. `attachEditor(host, content, emit)` attaches the translation to a host
element and reports each Message; `events({ content })` wraps the same thing in a
`Mount.defineStream`, so a view renders a host element whose mount produces these
Messages and releases the subtree when the element goes. `patchEditor(hostId,
state, changeSet)` is what the patch Command runs: it finds the element by id,
syncs the attachment it holds, and reports whether it patched — a missing host is
an editor that went away while the transition was in flight, not an error.
`Patched` is that Command's own completion, because a Foldkit Command must return
a Message.

## The read-only renderer

`view` renders a document or a slice as ordinary Foldkit `Html` through
`inertHtml`, so it dispatches nothing and owns no DOM — the counterpart to the
editable adapter, not a second editor:

```ts
const html = renderDocument(document) // a div of block elements
renderBlocks(slice.blocks) // one element per block
```

Blocks become `p`/`h1`–`h6`, marks nest as `strong`/`em`/`code` in the same order
the HTML serializer uses, unknown marks ride on a `span` with `data-marks`, and
unknown blocks render as an inert `div data-unknown="Type"` placeholder. One
caveat worth knowing: `h.DataAttribute` prefixes `data-` itself, so it takes the
bare name (`DataAttribute('unknown', …)` → `data-unknown`).

## The editor Bundle

`editor-bundle` is the editor as a Bundle whose authoritative document may live in
the parent (§27). `Editor` is the Bundle; `EditorState` and `EditorView` are the
state the parent owns beside the document; `editorAt(hostId)` places one editor and
binds it to the host element its view renders. The Link's `read` projects the
parent's document in, and `write` keeps only the editor fields, so the child never
stores a document copy; `onOut` commits the returned state in the same parent
transition. `application` and `update` are the assembled parent, and `edited` /
`typed` / `pressed` / `toggled` / `selected` / `undone` / `redone` / `patched`
build the Messages it dispatches. Every accepted edit returns a `RichText.patch`
Command carrying the `ChangeSet`, which is how rendering follows the commit instead
of sharing it.

## What it does not do

- It does not run commands or resolve domain state. A caller runs `RichText.run`
  and hands the result here; `attach` reports intent and stops.
- It does not render mark props. A run's marks become sorted names in
  `data-marks`; the semantic document is the lossless store.
- It does not patch nested structural changes item by item: a container whose item
  list changed is re-rendered where it stood, so its surviving items are rebuilt
  rather than patched individually. Correct, and a follow-up for identity
  preservation.

## Checks

```bash
pnpm --filter foldkit-richtext-dom typecheck
pnpm vitest run packages/richtext-dom/test
```
