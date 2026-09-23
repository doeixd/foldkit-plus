# foldkit-richtext controlled-Bundle harness

A private feasibility harness, not a runnable example and not published. It
answers one question from the [Rich Text design](../../docs/design/richtext-DESIGN.md#27-the-document-and-editor-bundle)
(§27): can a rich-text editor be a Bundle whose authoritative document lives in
the parent, with one parent transition committing the document and the editor's
interaction state together?

There is no DOM, no persistence, and no collaboration here. `src/controlled.ts`
is the whole experiment:

```text
parent Model
  document        the authoritative Document
  editor          interaction state: selection, nextId (identity source)

editor Bundle reads  →  { document, selection, nextId }
editor Bundle writes →  { selection, nextId }        (the document is not its own)
editor Bundle emits  →  Edited { state } | Rejected { error }
parent onOut         →  document = state.document, selection = state.selection
```

The Link's `read` projects the parent's document into the child on every
transition, so the child never stores a copy, and `write` deliberately drops the
document field. `onOut` runs with the child already written back, in the same
parent transition, which is what makes the two halves commit together.

`test/controlled.test.ts` asserts what that step commits: typing and mark
toggles land document and selection in one transition; a split mints block and
run identities from the parent-owned counter; a refused command changes nothing
and does not burn identities; and a document replaced from outside is what the
next command resolves against.

## The DOM half (first increment)

`src/dom.ts` is a minimal DOM interpreter for the editable subtree. It renders a
Document into an owned `contenteditable` root (one element per block, one
`span[data-run]` per run, marks as `data-marks`, preserved unknown blocks as
read-only placeholders), maps positions both ways (`positionToRange` /
`rangeToPosition`), and patches a ChangeSet in place: removed identities lose
their elements, dirty identities are re-rendered or inserted, and every
untouched element keeps its object identity so a keystroke does not rebuild the
tree.

`test/dom.test.ts` runs under jsdom and covers rendering, both-way position
mapping (including what a DOM caret cannot recover: affinity is derived, not
round-tripped), in-place patching, retired identities after normalization, and
one end-to-end editing loop: DOM selection → `RichText.run` → patch → restored
selection.

## The DOM half (second increment)

`src/events.ts` wires the subtree to an application. `intentFor(event)` reads
`beforeinput` and `keydown` as a semantic command; every event the adapter
understands is `preventDefault`ed so the browser cannot mutate the DOM behind
the document, and one it understands but cannot honor yet (paste, word
deletion, autocorrect) is prevented with no command rather than allowed to
drift. `attach(dom, { onIntent })` listens, tracks composition, and `sync`s a
committed `EditorState` back into the DOM and the browser selection.

Composition is the sharp case: while an IME is composing, input passes through
and no command is emitted; `compositionend` becomes one `InsertText` at the
semantic caret, and the following patch corrects whatever temporary text the
browser had put in the DOM.

Undo and redo are editor intents rather than commands, so `intentFor` reports
them separately (`{ history: 'undo' | 'redo' }` on the `Mod-z`, `Mod-Shift-z`,
and `Mod-y` chords) and `attach` routes them through `onHistory`. The harness
commits history in the child and replaces the document on undo, reporting a
whole-document ChangeSet so the patch cannot leave stale elements behind.

`repair(dom, content)` is recovery, not domain state (§31): it re-renders only
blocks whose rendered text drifted, drops elements the document does not know,
and returns the same `EditorDom` when nothing was wrong. `compositionend` uses
it — whether the IME committed or cancelled, the browser's temporary text is not
in the document — and because a repair detaches the live selection, the adapter
captures the semantic selection first and restores it after.

`test/events.test.ts` covers the translation table, the deliberate no-ops, the
IME handover and cancellation, the history chords, and the wired loop (type,
Enter, Backspace, composition commit, detach). `test/controlled.test.ts` covers
undo end to end: a typing burst collapses to one step, a discrete command undoes
alone, an empty history is refused, and redo restores what undo took away.
`test/dom.test.ts` covers repair directly.

Four bugs the loop tests caught, all now recorded in the design doc: inserted
nodes must be inserted (replacement alone leaves them out), an empty run still
needs a text node for the caret to be addressable, a removed identity that is
also dirty must still lose its element, and repairing detaches the live
selection unless it is captured and restored.

Not built yet: the DOM clipboard events that carry copy/cut/paste, and mobile
virtual keyboards. The adapter is still private and throwaway-tolerant.

## Running it

```bash
pnpm vitest run examples/richtext/test
pnpm exec tsc -b examples/richtext
```

## Why there is no package.json

The harness only needs `foldkit-richtext` and `foldkit-bundle`, both mapped to
source in `tsconfig.json` and aliased in the root `vitest.config.ts`. Keeping it
out of the workspace dependency graph means it needs no `pnpm install`, so it
adds no lockfile churn. Promote it to a runnable example (add a `package.json`
with `workspace:*` dependencies and run `pnpm install`) only when it grows a
demo entry point.

## Results

Recorded in the design doc (§27): controlled ownership works without a second
synchronized document copy or a delayed Command. The DOM half has its first
increment (`src/dom.ts`): rendering, both-way position mapping, and in-place
patching, exercised by the editing loop in `test/dom.test.ts`. What neither
proves yet is the browser's transient state — IME composition, autocorrect,
undo, and mobile keyboards — which is the rest of the Phase 3 slice.
