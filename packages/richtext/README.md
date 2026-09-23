# foldkit-richtext

Pure semantic documents and text transactions for Foldkit. Content is versioned
data with stable node IDs; edits return a new document, mapped selection, and an
invalidation summary. This package is **in development and unpublished**.

The application Model owns the document and local selection. Call `apply` from
the application's `update`; it performs no I/O and holds no editor store. Form/CMS
integration, DOM editing, and Sync replication are not implemented yet.

```text
EditorState + Transaction → next EditorState + ChangeSet + positionMap
                         ↘ diagnostic, with no partial result
```

## A small edit

Within this workspace, import the package as follows:

```ts
import * as RichText from 'foldkit-richtext'

const Text = RichText.Node.make('text-1')
const paragraph = RichText.Paragraph.make({
  type: 'Paragraph',
  id: RichText.NodeId.make('paragraph-1'),
  children: [RichText.Text.make({
    type: 'Text',
    id: Text.id,
    text: 'Hello',
    marks: ['Bold'],
  })],
})
const document = RichText.Document.make({ version: 1, children: [paragraph] })
const result = RichText.apply({ document, selection: null }, [
  RichText.Edit.insertText(Text.at(5, 'after'), '!'),
])

if (result.ok) {
  // The parent reducer installs result.state in its Model.
  const editedDocument = result.state.document
  void editedDocument
}
```

Schema constructors validate the value; IDs are supplied by the caller and must
be unique across blocks and text runs. `apply` validates state and operations,
then applies operations in array order. A later invalid operation rejects the
whole transaction. No partially edited state is returned, and inputs are not
mutated. `result.error` is a stable diagnostic code, without raw validation internals.

## Named node references

`Node.make('text-1')` declares a reusable identity. Its `.id` is a validated
`NodeId`, `.at(offset, affinity)` constructs a Position, and `.read(document)`
returns the node from that document or `undefined`. Narrow the returned node's
`type` before reading text or block-specific fields.

Keep references in application definitions; persist IDs and content, not reference
methods. The reference is immutable and holds no content. Read it against the next
document to see an edit, or against an older snapshot to inspect that version.
Two references with the same ID address the same node within a document; neither
reserves the ID or inserts anything. Document validation still rejects duplicate
content IDs. IDs are document-local: using a reference with another document
looks up that same ID there, without an ownership or authorization guarantee.

`at` validates offset shape and affinity, but cannot prove the node exists, is
text, or is long enough. `apply` checks those conditions against the current
document. A Position remains a resolved offset and must still be mapped through
edits; a Node reference does not turn it into a collaborative anchor. `read`
performs a linear lookup, intended for application reads rather than bulk editing.

## Building operations

Prefer `Edit.*` over hand-written literals; the builder fills `type` and the
return type is narrowed to that variant:

```ts
const result = RichText.apply(state, [
  RichText.Edit.insertText(Text.at(5, 'after'), '!'),
  RichText.Edit.addMark(Text, 'Bold'),
])
```

Builders accept a `NodeId` or a `Node.make` reference interchangeably and
validate shape immediately: a bad mark, offset, or `from > to` throws at the
call site. `Edit.splitBlock` additionally takes the two new identities as
strings or ids (`NodeId.make` rejects empties). Document-dependent failures —
missing nodes, block targets, out-of-bounds ranges, unresolvable selections,
reused split identities — still return `apply` diagnostics (`MissingText`,
`MissingNode`, `InvalidRange`, `InvalidSelection`, `InvalidInput`), and raw wire
input still decodes to `InvalidInput`. `Edit` builds values only; it reads no
document and owns no state.

## Current semantics

- Documents contain paragraphs and headings (levels 1–6), each containing text
  runs. The known marks are `Bold`, `Italic`, and `Code`, with no duplicates.
  Unknown mark strings load verbatim for forward compatibility (see
  `findUnknownMarks`); they ride along through text edits, cannot be added via
  `Edit.addMark`, and can be removed by name via `Edit.removeMark`.
- Empty documents, empty blocks, and empty text runs are valid. No normalization
  creates nodes or merges text runs yet.
- `InsertText` targets one run and inherits that run's marks. Boundary mark
  expansion awaits the Kit/mark semantics work.
- `DeleteText` removes a half-open range `[from, to)` within one run.
- `AddMark` appends a missing mark to one run; `RemoveMark` filters a present
  mark away. Redundant mark edits are no-ops that preserve state identity.
  Mark edits dirty the run and its block without emitting position steps.
- `SplitNode` splits one block at a run offset into two: runs before the split
  stay (trailing runs move right with their ids), the split run keeps its id on
  the left, and the right remainder takes the caller-supplied run id under a
  caller-supplied block id of the same block type. Splitting an empty block is
  rejected; split that via node insertion once it exists. New identities must be
  fresh within the transaction.
- `JoinNode` moves every run of the removed block into the surviving previous
  sibling, preserving run identities, marks, and range selections without
  emitting position steps. No runs merge (that is future normalization's job);
  the survivor keeps its block type. Node selections on the removed block
  remap to the survivor. Only adjacent pairs join.
- `MoveNode` reorders one block to an explicit post-removal index; moving to
  the same index is a no-op. Run identities and selections are untouched, so no
  position steps are emitted.
- `SetNodeProps` retypes a heading's level today (the first block prop; Kit
  definitions generalize this later). Same-level sets are no-ops; paragraphs
  reject the operation.
- `InsertNode` splices a caller-built block at an explicit index; every carried
  identity must be fresh within the transaction. Positions need no mapping
  (they address runs, not indexes).
- `DeleteNode` removes one block and collapses its positions to the start of
  the block now at that index, wrapping to the document start — or clears the
  selection when no text remains. Node selections on the removed subtree remap
  to the collapse target. Collapse steps in the position map carry the same
  rule to external positions.
- Every transaction ends by merging adjacent same-mark runs within touched
  blocks: the first run keeps its identity and text, later equivalents retire
  (reported in `removedNodes` with `RelocateStep`s). Loading never normalizes,
  so decoded documents stay verbatim until first edited; empty transactions
  stay untouched to preserve state identity.
- Positions count **UTF-16 code units**. Low-level edits may split a surrogate
  pair; grapheme-aware user commands are not implemented.
- `SetSelection` resolves against the document at that point in the transaction.
  Ranges retain anchor/focus direction; node selections may target a block or run.
- Insertion at a range endpoint keeps `before` affinity on the left and moves
  `after` affinity past the insertion. Deletion collapses covered positions to
  its start. Other nodes' positions are unchanged.

`positionMap` records text replacements in sequential coordinates, plus split
relocations (`{ node, into, at }`): offsets above the split point move to the
new run, the split point itself follows affinity, lower offsets stay. Use
`mapPosition(position, result.positionMap)` for another position from the original
document. The returned selection is already mapped. `ChangeSet` names touched
text runs and their blocks, plus `insertedNodes`/`removedNodes` and
`structureChanged` once structural operations exist; it is neither a replication
packet nor proof of a net content change (insert-then-delete can cancel).
`selectionChanged` compares the final selection with the original. Empty edits
preserve state identity.

## Loading and limits

Use `decodeDocument(input, limits?)` at a persistence boundary. It rejects excess
fields, duplicate IDs, empty or duplicate marks, invalid structure, unknown nodes,
and unsupported versions — but preserves unknown mark strings verbatim and
round-trips them. `findUnknownMarks(document)` lists them per text run for a
publishing gate; unknown nodes are still rejected, not preserved. Then enforces `limits` (default `DefaultDocumentLimits`: 10,000 blocks,
50,000 text runs, 5,000,000 UTF-16 text units). A violation throws an `Error`
naming the exceeded bound. Tighten per document with
`{ ...DefaultDocumentLimits, maxBlocks: 100 }`. The exported Schemas also compose
into an application's Model; when decoding them directly, pass
`{ onExcessProperty: 'error' }` for the same strict policy.

`apply` does not enforce limits: size-check untrusted operation payloads
(notably inserted text) before applying, and apply byte-size limits before
decoding untrusted payloads. Unknown-extension preservation, migrations, custom
Kits, mark boundary expansion, transforms, history, rendering, and collaboration
are still pending. Retain rejected source content for recovery; do not replace
it with an empty document.

Each transaction currently validates the whole input and indexes its text runs.
Edits copy the affected arrays and preserve untouched nodes. Large-document
performance remains to be measured in the Phase 1 feasibility work.

See the [design and phase status](../../docs/design/richtext-DESIGN.md#101-phase-1--pure-semantics-and-integration-feasibility).
