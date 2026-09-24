# foldkit-richtext-dom

The DOM interpreter for a [`foldkit-richtext`](../richtext) editable subtree.

A rich-text editor cannot let a virtual DOM own its `contenteditable` subtree:
the browser mutates that subtree directly for typing, selection, IME, and
clipboard, and rebuilding it on every keystroke fights that native behavior. This
package owns the subtree instead. It renders a semantic `Document` into real DOM
once, then patches only the nodes a `ChangeSet` names, so untouched elements keep
their object identity and the caret stays where the browser put it.

## Ownership

```text
foldkit-richtext       owns the semantics: Document, commands, transactions
foldkit-richtext-dom   owns the contenteditable subtree          (this package)
foldkit / application  owns everything around it: host, toolbar, menus, status
```

Only a `Document`, a `ChangeSet`, and a `Selection` cross the boundary. Nothing
inside the subtree is read as truth; the semantic document stays authoritative,
and the DOM is consulted only to map a browser selection back to a position.

This package is a **private spike**: unpublished, and its API may change. It moved
here from `examples/richtext`, where the Phase 3 slice proved it. Event
translation (`beforeinput`, `keydown`, composition, clipboard) and the editable
Bundle still live in that harness and move here in later increments.

## The loop

```ts
import { mount, patch, repair } from 'foldkit-richtext-dom'
import * as RichText from 'foldkit-richtext'

let dom = mount(ownerDocument, content) // render once
host.append(dom.root) // the host element is yours

const result = RichText.run(state, command, ids)
if (result.ok) {
  dom = patch(dom, result.state.document, result.changeSet) // patch, not re-render
}

dom = repair(dom, state.document) // after an IME or an outside mutation
```

Read the calls literally:

- `mount(ownerDocument, content)` builds the subtree and the identity index it is
  patched through: `data-block` on a block, `data-run` on a run. It listens to
  nothing and runs nothing.
- `patch(dom, content, changeSet)` removes the identities the change set removed,
  re-renders the ones it marked dirty, and places inserted or moved elements in
  document order. Every other element is left alone.
- `repair(dom, content)` is recovery, not domain state (§31): it drops anything the
  subtree holds that the document does not, re-renders blocks whose rendered text
  drifted, and returns the same `EditorDom` when nothing was wrong.
- `positionToRange` and `rangeToPosition` translate between a semantic `Position`
  and a DOM `Range`. A DOM caret carries no affinity, so mapping back derives it
  (`after` at a run's end, `before` elsewhere) rather than pretending to
  round-trip it.

## What it does not do

- It does not run commands. A caller runs `RichText.run` and hands the result here.
- It does not listen to events; `examples/richtext/src/events.ts` translates them.
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
