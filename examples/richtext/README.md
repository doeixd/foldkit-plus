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
synchronized document copy or a delayed Command. What it does **not** yet prove
is the browser half — that a real `contenteditable` can be patched from the
same transition — which is the Phase 3 slice.
