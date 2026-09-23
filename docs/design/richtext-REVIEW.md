# RichText implementation review

Review date: 2026-09-23. Scope: the current working tree of
`packages/richtext` and `examples/richtext`, against `richtext-DESIGN.md` and
`AGENTS.md`. Existing uncommitted implementation changes are included but are
not modified by this review. Deferred phases are not treated as implemented
features. Findings are recorded as they are verified.

## Findings

### R1 — P1: range deletion leaves selected paragraph boundaries intact

`packages/richtext/src/command.ts:139`, `deleteRange` and its callers.

The helper only emits `DeleteText` for covered runs. Selecting from offset 1
of paragraph `abc` to offset 1 of paragraph `def` and deleting produces two
paragraphs (`a`, `ef`), instead of one (`aef`). Selecting just the paragraph
boundary deletes nothing. InsertText, SplitBlock, and Paste reuse this helper,
so replacing a cross-block selection also retains selected structure.

Resolve the structural deletion as part of the same transaction. Add cases for
forward/backward selections and a range covering only the paragraph boundary.
This affects the Phase 3 semantic editing loop, not a deferred rich-node feature.

### R2 — P1: Backspace/Delete can corrupt Unicode text

`packages/richtext/src/command.ts:191`, collapsed DeleteBackward/DeleteForward.

Both directions remove exactly one UTF-16 code unit, including when crossing a
run boundary. Backspacing after an emoji leaves a lone high surrogate; forward
deletion leaves a lone low surrogate. Combining sequences also lose only part
of the visible character. UTF-16 position coordinates do not require deletion
commands to split characters. Resolve the preceding/following grapheme boundary
before producing DeleteText, including relevant adjacent-run cases.

### R3 — P1: DOM patching does not apply block moves

`examples/richtext/src/dom.ts:108`, `patch` / `place`.

When an element already exists, `place` replaces it at its old DOM position and
returns without consulting the next block identity. MoveNode changes document
order but the adapter continues showing the old order. Whole-document replacement
with reordered surviving IDs has the same problem. Place surviving blocks in
the new document order; test both a move and undo/replacement with reused IDs.

### R4 — P2: selection changes consume undo steps and discard redo

`examples/richtext/src/controlled.ts:161`, successful-command history commit.

Every successful command calls `commit`, including SetSelection and no-op edits.
`commit` always clears `future`. After undo, clicking to move the caret therefore
destroys redo; moving the caret also adds an undo step that changes no content.
Keep selection updates out of content history while explicitly ending typing
groups when appropriate. Assert redo survives selection changes and undo skips
no-op/selection-only commands.

### R5 — P2: design status contradicts implemented milestones

`docs/design/richtext-DESIGN.md:3` says Phases 2–12 have not started, while §103
documents multiple completed editing increments and the tree contains both a
read-only renderer and clipboard event handling. §103 also says paste insertion
and clipboard events remain to build, although §69 and the implementation include
them. Reconcile the summary and per-phase remainder lists together, as required
by AGENTS.md; distinguish private spike completion from supported API promotion.

### R6 — P1: IME commit restores a temporary DOM offset into the old document

`examples/richtext/src/events.ts:191`, `onCompositionStart` / `onCompositionEnd`.

Composition start retains only a boolean. Composition end reads the browser's
post-composition caret and treats it as a position in the pre-composition
document. Reproduction: start at offset 2 of `ab`, let the browser change its
text node to `abに` and move the caret to 3, then end composition with `に`.
Repair restores `ab`; restoring offset 3 fails, and `onIntent` observes a null
selection. A consumer reading the live selection cannot commit the text. At an
interior offset the same error can insert at the wrong location instead.

Retain the semantic selection/range at composition start and resolve the commit
against it. The existing composition test appends temporary text without moving
the caret, so it misses the browser behavior that triggers this failure.

### R7 — P1: normalization can return an invalid Node selection

`packages/richtext/src/transaction.ts:645`, normalization report selection mapping.

The normalization loop maps only Range selections. Select text node `b` using
`{ type: 'Node', node: b }`, where adjacent `a` is unmarked and `b` is bold;
remove Bold from `b`. Normalization merges `b` into `a` but returns success with
the selection still addressing retired `b`. `selectionIsValid` returns false,
and the next `apply(state, [])` rejects with InvalidInput. This violates the
transaction invariant and prevents further editing until selection is repaired.

Relocate Node selections when their identities retire, and verify successful
transaction results remain valid inputs. Add a regression covering Node
selection, not just Range endpoint relocation.

## Validation results

Temporary executable probes against source reproduced R1–R4, R6, and R7:

| Finding | Observed result |
| --- | --- |
| R1 | Remaining paragraphs: `["a", "ef"]` |
| R2 | Remaining UTF-16 unit: `0xd83d` (unpaired surrogate) |
| R3 | Model IDs: `[p1, p0]`; DOM IDs: `[p0, p1]` |
| R4 | Redo entries before/after selection change: `1 → 0` |
| R6 | Selection observed by composition commit callback: `null` |
| R7 | Result selection invalid; next transaction: `InvalidInput` |

These were diagnostic probes, not passing regression coverage; the temporary
probe file was removed. R5 was checked against the source and design text.

Final focused verification: **300 tests passed in 27 files** using
`pnpm exec vitest run packages/richtext examples/richtext`;
`pnpm exec tsc -b packages/richtext examples/richtext` passed.
The first suite run reported 14 UnstableNormalization failures, but both a
targeted normalization rerun and the final full focused run passed. RichText
working-tree changes were committed externally during this review; the initial
failures are therefore recorded as transient observations, not an open finding.
The final focused run followed commit `8bde2d1` (transform registry extraction).

Repository-wide pre-commit checks on the concurrently changing tree:

- `pnpm format:check`: failed on `packages/richtext/src/html.ts`.
- `pnpm typecheck`: failed on SSR type tests, including incompatible Message
  types and an unused `@ts-expect-error` in `bindings.test-d.ts`.
- `pnpm test`: 3,508 passed, one failed. The later RichText Kit inspection test
  expected `{ blocks: 2, atoms: 1, marks: 2 }` but received a different shape.
  This occurred after the focused suite passed; recheck the evolving Kit API
  and its test before merging.
- `pnpm demo`: passed, including the workspace build.

This review focuses on correctness, ownership, edge cases, and whether existing
tests distinguish the failing behavior. It is not a complete audit of deferred
collaboration, Form/CMS integrations, custom node APIs, or real-browser behavior.
No implementation fixes or persistent tests were added, so no implementation
Jev review or mutation-testing claim is made.
