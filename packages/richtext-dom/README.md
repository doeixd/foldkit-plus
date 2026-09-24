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
foldkit-richtext-dom/events   attach, intentFor, selection read and restore
foldkit-richtext-dom/html     parseHtml
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
  than allowed to drift. `attachment.sync(state, changeSet)` does the patch and
  selection restore below in one call, and `detach()` removes the listeners.
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
