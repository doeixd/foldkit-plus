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

## Follow-up: performance, TypeScript, and design contracts

This pass also includes the custom-node work present as uncommitted changes at
review time. These findings describe that snapshot, not a released API.

### R8 — P1: the public mark type guard accepts prototype properties and crashes commands

`packages/richtext/src/marks.ts:21`, `isKnownMark`.

`mark in definitions` accepts `toString`, `constructor`, and `__proto__` as known
marks. The type predicate then falsely narrows these strings to `Mark`.
Reproduced: `isKnownMark('toString')` returns true; ToggleMark over a nonempty
range with that value throws from the AddMark schema constructor instead of
returning the advertised diagnostic. This is both a TypeScript soundness bug
and a validation-boundary bug, matching the prototype-key trap in AGENTS.md.
Use an own-property lookup or Map, and test prototype names through `run`.

### R9 — P2: bulk formatting/deletion has quadratic copying and lookup work

`packages/richtext/src/transaction.ts`, per-operation array copies;
`packages/richtext/src/transform.ts`, dirty-node `findIndex` loop.

For N runs in one paragraph, ToggleMark creates approximately N mark operations.
Each operation copies the entire N-element children array: O(N²) element copies
before normalization. Range deletion has the same per-run copying pattern.
For B blocks touched across a document, normalization performs a linear block
lookup for every dirty block and run identity, including runs that cannot match
a block ID: O(B²) lookups even with one run per block. Structural operations
also rebuild the entire document index after every operation.

These costs follow directly from the loops; no latency or benchmark numbers are
claimed. They undermine §77's large paste/many-span targets and the stated
transaction batching advantage. Accumulate changes per block, copy each affected
container once, and carry a block index into normalization. Retain a benchmark
for large selections/pastes before claiming the performance target is met.

### R10 — P2: typing rebuilds untouched sibling run DOM

`examples/richtext/src/dom.ts`, dirty block branch in `patch`.

InsertText marks the run and its parent block dirty. The adapter replaces that
whole block, rebuilding every sibling run even when its ID/content is unchanged;
it then renders the edited run again when processing the run's dirty ID. Thus
the comment promising every untouched element retains identity is false within
the edited paragraph. A long paragraph with many formatting runs rebuilds all
of them on every keystroke. Distinguish container invalidation from full subtree
replacement and add a sibling-run identity check, not only an untouched-block
check. This also matters when browser composition owns another run in the block.

### R11 — P2: Kit validation ignores declared child constraints

`packages/richtext/src/kit.ts`, built-in block branch of `validate`.

Reproduced: a Paragraph containing text validates with zero diagnostics against
`kit({ nodes: [atom('Paragraph')], marks: [] })`, even though the declaration
requires `children: 'none'`. The validator checks the name but not the declared
kind/children. This advertises a constraint that is not enforced (§13/§75).
Reject incompatible definitions or enforce their child contracts during
validation; include negative cases for same-name, different-kind definitions.

### R12 — P2: transform reports cannot describe the structural changes they allow

`packages/richtext/src/transform.ts`, `TransformReport`;
`packages/richtext/src/transaction.ts`, normalization result accumulation.

A Transform may return any new Document, but its report has no insertedNodes or
structureChanged field, and its steps omit SplitStep/CollapseStep. Reproduced
with a well-typed, idempotent transform appending one valid paragraph: apply
returns two blocks but `insertedNodes` is empty and `structureChanged` is false.
Consumers trusting ChangeSet receive a false structural summary. The contract
needs either an explicit restriction to supported normalization edits or the
same structural/mapping vocabulary as transactions, accumulated by `apply`.
This is a public type/API design gap, not just missing test coverage.

### R13 — P2: node definitions erase caller prop schema types to any

`packages/richtext/src/kit.ts:5`, `PropsSchema`, `node`, and `NodeDefinition`.

The authoring function returns the erased NodeDefinition union containing
`Schema.Codec<any, any, never>`. After narrowing `kind === 'node'`, decoding a
declared `{ tone: string }` schema produces `any`: assigning its object result
to a `number` compiles. The decoded and encoded types, literal node name, and
concrete definition variant are lost at the authoring boundary. Preserve these
on the returned descriptor and erase only inside heterogeneous registries;
add negative type cases for invalid prop reads and decoded/encoded confusion.

### R14 — P2: prop validation silently accepts undeclared fields

`packages/richtext/src/kit.ts`, `propsFailure`.

The validator calls `decodeUnknownSync(props)` with default excess-property
handling, discards the decoded result, and keeps the original JSON props.
Reproduced: a schema declaring only `tone` reports no diagnostics for
`{ tone: 'info', extra: 'retained' }`; the extra field survives in the document.
This differs from the package's strict persisted-content boundary and repeats
AGENTS.md's intermediate-validator trap. Use strict excess-property options or
explicitly document an open-props contract. Schema failures are also copied
verbatim into public diagnostics; define a deliberate redaction policy before
these diagnostics cross a server/API boundary.

## Disposition

Addressed in the working tree after this review, one commit per group:

| Finding | Fix | Commit |
| --- | --- | --- |
| R1 | `deleteRange` joins the blocks a range spanned; the boundary goes with the text | `199a323` |
| R2 | `previousBoundary`/`nextBoundary` step over a surrogate pair and its combining marks, in-run and into a neighbor run | `199a323` |
| R3 | `patch` places every block relative to the previous block's element, so a move lands in document order | `365edd8` |
| R4 | the harness commits history only when the document changed, so a caret move keeps redo | `365edd8` |
| R5 | §3 status and §101/§102/§103 remainder lists reconciled; spike completion is distinguished from promotion | `cf00c0e` |
| R6 | composition start retains the semantic selection; the commit uses it, not the browser's temporary caret | `365edd8` |
| R7 | normalization maps Node selections through its steps (`mapThrough`) | `765432b` |
| R8 | `isKnownMark` is an array lookup, not `in`; prototype names are refused with a diagnostic | `765432b` |
| R9 | the merge transform carries a block index; `bench/operations.bench.ts` records the edit costs, and the remaining per-operation copying is stated rather than claimed fixed | `cf00c0e` |
| R10 | a dirty block whose run list is unchanged keeps its element; only its dirty runs are re-rendered | `365edd8` |
| R11 | a declaration must agree with the block's shape (`MismatchedDefinition`) | `765432b` |
| R12 | `TransformReport` carries `insertedNodes`, `structureChanged`, and the full step vocabulary, accumulated by `apply` | `765432b` |
| R13 | `node(name, { Props })` returns `NodeDefinitionOf<Name, Props>`; erasure happens only in the Kit registry | `765432b` |
| R14 | prop validation is strict about excess properties, and diagnostics carry a stable verdict rather than a schema's message | `765432b` |

Every fix has a regression test, and each was mutation-checked (the fix reverted,
the test confirmed red, then restored). Two findings are partly deferred by
design and say so in place: R9's per-operation copying, and the DOM adapter's
real-browser behaviour, which this review could not exercise.


## Validation results

Follow-up runtime probes reproduced R8, R11, R12, and R14. R13's invalid
object-to-number assignment passed strict TypeScript compilation; adding a
deliberate string-to-number error then produced TS2322, proving the probe file
was checked. The probe was removed. R9/R10 are source-traced complexity and DOM
identity findings; no measured performance claim is made.
The follow-up focused suite passed **320 tests in 29 files**, and the RichText
package/example typecheck passed. Earlier repository-wide results below are
retained with their original scope; they are not a claim that the entire
concurrently changing workspace is green.

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

Coverage includes runtime correctness, ownership, edge cases, algorithmic costs,
DOM reconciliation, TypeScript boundary soundness, validation, and whether tests
distinguish the failing behavior. Existing operation builders preserve variant
types and the type suite includes useful negative cases; the findings identify
gaps beyond those checks. No standalone slop/style issue was elevated over the
functional problems. This is not a complete audit of deferred
collaboration, Form/CMS integrations, custom node APIs, or real-browser behavior.
No implementation fixes or persistent tests were added, so no implementation
Jev review or mutation-testing claim is made.
