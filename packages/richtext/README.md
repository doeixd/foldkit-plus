# foldkit-richtext

Pure semantic documents and text transactions for Foldkit. Content is versioned
data with stable node IDs; edits return a new document, mapped selection, and an
invalidation summary. This package is **in development and unpublished**.

The application Model owns the document and local selection. Call `apply` from
the application's `update`; it performs no I/O and holds no editor store. DOM
editing lives in the private `foldkit-richtext-dom` spike; Form/CMS integration
and Sync replication are not implemented yet.

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

## Commands

Intent is resolved into operations by `run`, so durable history keeps its
meaning and identity comes from the caller:

```ts
let n = 0
const ids = { mint: () => `new-${++n}` }

RichText.run(state, { type: 'InsertText', text: 'hi' }, ids)
RichText.run(state, { type: 'ToggleMark', mark: 'Bold' }, ids)
RichText.run(state, { type: 'SplitBlock' }, ids)
```

`InsertText`, `DeleteBackward`, `DeleteForward`, `SplitBlock`, `ToggleMark`,
and `SetSelection` read the current selection, emit a Transaction, and apply it
in one step; the returned `ChangeSet` and `positionMap` describe the effect.
Nothing mints identity unless the caller's `mint` does, and replay applies
transactions rather than commands.

`InsertText` takes an optional `marks`. With it, the inserted text carries
exactly that set wherever it lands; without it, the boundary rule decides and the
text inherits the marks of the run it joins. A mark the caller's vocabulary does
not declare is rejected. That is how *stored marks* stay the application's state:
the caret's format belongs to the caller, and the command layer reads no hidden
cursor state. A collapsed `ToggleMark` is likewise a no-op — the application
decides what the caret carries and passes it back on the next `InsertText`.

## Mark definitions

A mark is a definition, not a bare name. It says where typing continues it
(**boundary expansion**) and, when it carries data, what schema that data
satisfies. A Kit declares the vocabulary, so an editor extends it:

```ts
const Link = RichText.mark('Link', {
  Props: Schema.Struct({ href: Schema.String }),
  expand: 'none',
})

const ArticleKit = RichText.kit({
  nodes: [RichText.block('Paragraph'), RichText.block('Heading')],
  marks: [RichText.Bold, RichText.Italic, RichText.Code, Link],
})

RichText.run(state, command, ids, { marks: RichText.markRegistry(ArticleKit.marks) })
```

A run stores a mark as a bare name when it has no props, and as
`{ name, props }` when it does. Loading preserves the form it found, so a
names-only document round-trips byte-equal, and since a run carries a name at
most once it never holds both forms of one mark:

```ts
Link.of({ href: '/docs' }) // { name: 'Link', props: { href: '/docs' } }
```

`of` accepts decoded props and encodes them with the declared schema before
storing them as JSON. Transforming codecs therefore preserve their encoded
representation in the document. Encoding must require no services; invalid
props or a non-JSON-object encoded result throw at the builder call.

`markName(mark)` and `markProps(mark)` read either form, and `sameMark` decides
equivalence. Props are part of a mark's identity: two runs carrying the same name
with different props are not equivalent, so normalization does not merge them, and
`AddMark` is a *set* for its name — it appends, replaces props that differ, and
no-ops on the same value. `RemoveMark` keys on the name alone.

The shipped policy is `Bold`/`Italic` → `after`, `Code` → `none`, and a mark no
registry declares → `both` (so preservation never retargets an unknown mark
away). `resolveInsertion` retargets a boundary insertion when the current run
carries marks that forbid the edge and the neighbor carries exactly the marks
that remain; a registry changes which marks those are, not the rule. Declared
names are also what `run` may add, so a Kit's marks are usable by name or value.

`validate(document, kit)` is the publishing gate: it reports `UnknownMark` for a
name the Kit does not declare, and `InvalidProps` for a declared mark whose props
its `Props` schema refuses — including a mark that declares props but carries
none, and one carrying a field the schema does not declare.

The HTML fallback carries mark *names*; props travel in the slice format. A
declared mark with props gets real attributes once a Kit-aware renderer exists.

## Application node blocks

A `Node` block is an application's own kind — a Callout, an Image, an embed. Its
`props` are JSON at the codec level, because the document codec cannot know an
application's schemas; a Kit's node definition validates them at that boundary,
and it also declares what content the kind holds:

```ts
const ArticleKit = RichText.kit({
  nodes: [
    RichText.block('Paragraph'),
    RichText.node('Callout', { Props: Schema.Struct({ tone: Schema.Literals(['info', 'warning']) }) }),
    RichText.node('Image'),
    RichText.node('List', { children: RichText.blockContent }),
  ],
  marks: [RichText.Bold],
})

RichText.validate(document, ArticleKit)
// → [] | UnsupportedNode (kind not declared) | InvalidProps (schema refused them)
//   | MismatchedDefinition (declaration and document disagree)
```

`children` defaults to `RichText.textContent`, so a node holds runs; `blockContent`
says it holds nested blocks (§116). `RichText.block(name)` declares one of the
built-in blocks and `RichText.atom(name)` declares a kind holding nothing, so an
atom is exactly an application node with no content. `validate` walks nested blocks
and reports `MismatchedDefinition` when a declaration and the document disagree
about the shape or the content — an atom holding runs, a `blockContent` kind held
as a run holder, or a `textContent` kind held as a container. An *empty*
application node is the one case it accepts either way, because the document
cannot say whether it is an atom or a run holder with no runs.

A node block's children are text runs, so positions, operations, selection,
clipboard slices, history, and the interpreters all work on it unchanged — a
split keeps its kind and props on both halves. `data-node="Kind"` is the default
rendering in HTML and in the view until a Kit renderer replaces it.

A node block may also accept **nested blocks** in `blocks` (§116), which is how a
List holds ListItems. The HTML serializer renders them inside the node's element
and `toText` gives one line per text block; the read-only view and the editable
adapter do the same, so a list keeps its items in every interpreter. HTML import
reads `data-node` back, and maps `<ul>`/`<ol>` to a `List` and `<li>` to a
`ListItem` when the Kit declares those names: an element holding block children
becomes a container, an element holding inline content becomes a run holder, and a
kind the Kit does not declare degrades to its content with a diagnostic. A
`blockContent` declaration settles the one ambiguous case — a container whose
element holds only inline content — because the declaration says what the content
is. Props are not carried by HTML; the slice format keeps them, so an imported
node starts with `{}` props.

## Transforms

Normalization runs as a registry of transforms. Each is a pure function of the
document plus what the transaction touched, and returns the new document with
the position steps and identity bookkeeping that go with it:

```ts
const DropEmptyRuns: RichText.Transform = {
  name: 'dropEmptyRuns',
  apply: (document, { dirtyNodes }) => ({ document: next, steps, removedNodes, dirtyNodes, textChanged }),
}

RichText.apply(state, transaction, [DropEmptyRuns])
RichText.apply(state, transaction) // defaultTransforms: mergeAdjacentRuns
```

Two rules make a loop over them safe: a transform is **deterministic** and
**idempotent on normalized state**, so the loop knows it has settled when a pass
changes nothing. A pass that keeps changing the document is refused with
`UnstableNormalization` after `MAX_NORMALIZATION_PASSES` rather than spinning.

Three constraints follow from replay and from positions:

- **A transform cannot mint identities.** It may merge, move, or remove, never
  create — so "ensure an empty Document has a Paragraph" belongs to a command
  that mints, not to a transform.
- **Removing a run that positions address requires a step.** Report a
  `RelocateStep` (or a collapse) for it, or the selection can be left dangling.
- **Only what the transaction touched is in scope.** `dirtyNodes` is how a
  transform stays incremental; the shipped merge uses it and leaves every other
  block alone.

`apply` folds a transform's report into the same `ChangeSet` and `positionMap`
it was already building, and maps the selection through the transform's steps,
so a caller cannot tell whether a change came from an operation or from
normalization.

## Performance

`pnpm bench` measures the shapes an editor meets (`bench/operations.bench.ts`).
A transaction accumulates changes per block and copies each affected container
once, so N edits in one paragraph are O(N) rather than N copies of the same
array. Measured back to back on the same machine (mean), old per-operation
copying against the current accumulation:

```text
                                          before   after
paste 50k characters into one run          0.021    0.023 ms
type one character into a 20k-character run 0.024    0.025 ms
toggle a mark over a 400-run selection     2.07     1.80 ms
toggle a mark over a 2000-run selection   16.99     9.59 ms
toggle a mark over 200 runs / 200 blocks   1.47     1.48 ms
delete a range spanning 100 paragraphs     3.06     3.27 ms
split a block inside a 400-run paragraph   1.14     1.35 ms
paste one paragraph into a 200-block document 1.13   1.22 ms
```

The large formatting case is the one the change targets: it halves, and it now
scales linearly (5× the runs costs 5.3× the time, where it used to cost 8.2×).
Differences under a few percent in the other rows are within this machine's
run-to-run noise, not a claim either way.

Two costs remain. A structural operation still rebuilds the document index, though
a contiguous run of joins is now batched: deleting a range across B paragraphs
emits B joins but `apply` consumes them as one structural edit, so the block array
is copied once and the index rebuilt once instead of B times. That case measured
3.06 ms before the batching and 1.77 ms after, on this machine in one session
(where runs vary by roughly a fifth), and it stays in the benchmark as its check.
Normalization also walks the whole dirty set — including run identities, which
cannot match a block — so a transaction that touches every run of a block does
O(dirty) lookups in the merge pass. Neither is measured as a problem at these
sizes; the benchmark exists so a claim about them can be checked rather than
asserted.

## Migrations

Migrations move semantic data forward when a deployment changes its vocabulary
(§73) — a preserved node that is now implemented, a prop renamed, a kind
replaced:

```ts
const Callout = Schema.Struct({ tone: Schema.Literals(['info', 'warning', 'critical']) })

RichText.migrate(document, [
  RichText.promoteUnknown('EmbedToCallout', 'Embed', 'Callout', Callout),
  RichText.migration('DangerToCritical', 'Callout', block =>
    block.type === 'Node' && block.props.tone === 'danger'
      ? { ...block, props: { ...block.props, tone: 'critical' } }
      : undefined,
  ),
])
// → { document, applied: [{ name, node }], unused: ['…'] }
```

They operate on blocks, never on DOM, and run at a boundary the application
chooses — loading, publishing, or an explicit upgrade — never automatically on
every read. The list order *is* the chain: a later migration sees what an
earlier one produced. A migration descends into containers, so a preserved block
nested in a list is rewritten where it sits.

Three rules are enforced rather than documented and hoped for:

- **Identity survives.** A migration returns the same `id`, so positions,
  references, and selections keep addressing the same node; changing it throws
  instead of silently breaking every reference. That holds for a nested block too.
- **The result is still content.** Returned blocks must decode, and the complete
  document is validated after each changed migration pass. Non-JSON props,
  unknown shapes, and identities duplicated across blocks are rejected.
- **Declining is allowed.** Returning `undefined` keeps the block as it is —
  which is what `promoteUnknown` does when legacy data does not decode against
  the target's schema, rather than half-converting it. `promoteUnknown` takes the
  target's content mode, so promoting into a container kind yields a valid block
  (`blocks: []`) rather than one `validate` would call a mismatch.

## HTML export

`toHtml(blocks)` and `documentToHtml(document)` serialize to HTML for other
applications; `toText` / `documentToText` give the plain-text projection.

```ts
RichText.documentToHtml(document)
// → '<p>plain <strong>bold</strong></p><h2><code><em>Title</em></code></h2>'
```

Known marks become `strong`/`em`/`code` in a deterministic nesting order (not
the order they were added), unknown marks survive as `data-marks` on a span,
unknown blocks as a `<div data-unknown="Type">` placeholder, and text and
attribute values are escaped, so content cannot become markup. Importing HTML
is a whitelist walk over a `DOMParser` tree, and the read-only Foldkit view is
built with `inertHtml`; both live outside this package — the importer and view in
the `examples/richtext` harness, and the editable DOM interpreter in
`foldkit-richtext-dom` — because the package stays DOM-free and framework-free.
Nothing parses HTML back into authority without that walk.

## Clipboard slices
Clipboard content is semantic, not HTML. A `Slice` is a versioned fragment with
its own identities:

```ts
const slice = RichText.sliceOf(document, selection)   // → Slice | undefined
RichText.serializeSlice(slice)                         // → string for the clipboard
RichText.deserializeSlice(payload)                     // → Slice | undefined
RichText.withFreshIds(slice, mint)                     // identities that cannot collide
RichText.sliceFromText('plain\npaste', mint)           // the text fallback
```

`sliceOf` takes a whole block for a node selection, and for a range only the
covered part of each touched block, with runs trimmed to the selection — so a
partial copy never drags in an untouched block. `deserializeSlice` returns
`undefined` for anything this version did not write (bad JSON, another version,
excess fields, duplicate identities inside the slice) rather than guessing.
Identities always come from the caller, like every other identity a live edit
mints.

Paste is a command (`{ type: 'Paste', slice }`): it remints every identity, then
places the content relative to the caret — above the block at its start, below
it at its end, and mid-block by splitting the block and landing the content
between the halves, so text after the caret stays below what was pasted. A range
selection is replaced first, and the caret lands at the end of the pasted text
(or at the start of what follows when the pasted content has none). The DOM
clipboard events that carry these payloads are not wired yet.

## Undo history

`History` is interaction state: snapshots of `EditorState` (document plus
selection), kept beside the selection in the application Model, never in
published content.

```ts
let history = RichText.emptyHistory
history = RichText.commit(history, previousState, { group: RichText.groupFor(command) })
const back = RichText.undo(history, currentState) // → { history, state } | undefined
const forward = RichText.redo(back.history, back.state)
```

Grouping is explicit and clock-free: `groupFor` returns `'typing'` for text
insertion and deletion, so a typing burst collapses into one undo step, while
every other command stands alone. `undo`/`redo` return `undefined` when there is
nothing to do, and a new commit after an undo clears the redo stack. History is
bounded (200 steps by default). Collaborative undo is a different operation and
is not implemented.

In the harness, the parent Model owns the history and the child commits it, so
one transition still commits document and interaction state together. Because
undo replaces the document rather than editing it, the child reports a
`Replaced` out-message with a whole-document `ChangeSet`
(`replaceChangeSet(previous, next)`): every surviving identity is dirty and every
departed one is removed, so the DOM cannot keep a stale element.

## Kits

A `Kit` declares the vocabulary one editor accepts — node kinds and marks — as
plain data, with no renderers or executable code:

```ts
const ArticleKit = RichText.kit({
  nodes: [RichText.block('Paragraph'), RichText.block('Heading'), RichText.atom('Image')],
  marks: ['Bold', 'Italic'],
})

RichText.validate(document, ArticleKit)
// → [] when the document fits; otherwise UnknownNode / UnsupportedNode / UnknownMark
```

`validate` reads the document and never repairs it: callers decide whether a
diagnostic blocks publishing or shows a placeholder. Prop schemas, nested
children, transforms, and metadata arrive with node definitions; the Kit does
not yet drive parsing or `apply`.

## Current semantics

- Documents contain paragraphs and headings (levels 1–6), each containing text
  runs. The shipped marks are `Bold`, `Italic`, and `Code`, and a run carries a
  mark name at most once. A mark with props is stored as `{ name, props }`; a
  name the vocabulary does not define loads verbatim for forward compatibility
  (see `findUnknownMarks`) and rides along through text edits. `Edit.addMark`
  takes any mark; `run` is what refuses to add one the caller's vocabulary does
  not declare — the shipped marks by default, or a Kit's through its registry.
- Empty documents, empty blocks, and empty text runs are valid. No normalization
  creates nodes or merges text runs yet.
- A `Node` block may carry nested blocks in `blocks`, and its presence is what
  says the kind accepts them (§116): a List holds ListItems, a Quote paragraphs.
  Nested content decodes, round-trips byte-equal, is counted by `inspect` and the
  decode limits, survives a deploy that lost its kind, and a selection or
  reference inside it resolves. Commands reach a run wherever it sits, so typing,
  grapheme deletion, marks, stored marks, undo, and the clipboard work inside a
  container — a copy across its children carries the container — and every
  interpreter renders one, with the HTML importer reading a container back.
  Structural placement works at depth too: a split keeps its halves in the block's
  own container, siblings join within theirs, and a move or insert takes an
  optional `parent` to enter or leave a container. What is still refused with
  `InvalidParent` is a range that would have to merge across containers, and a
  parent that cannot hold blocks.
- `InsertText` targets one run and inherits that run's marks. When the command
  carries `marks`, the inserted span is split out of its run and given exactly
  that set instead — that is how a caller's stored marks reach the document.
- `DeleteText` removes a half-open range `[from, to)` within one run.
- `AddMark` sets one run's mark for that name: it appends when the name is
  absent, replaces the value when its props differ, and no-ops when the mark is
  already exactly this one. `RemoveMark` filters that name away whatever props it
  carries. Redundant mark edits preserve state identity, and mark edits dirty the
  run and its block without emitting position steps.
- `SplitNode` splits one block at a run offset into two: runs before the split  stay (trailing runs move right with their ids), the split run keeps its id on
  the left, and the right remainder takes the caller-supplied run id under a
  caller-supplied block id of the same block type. Splitting an empty block is
  rejected; split that via node insertion once it exists. New identities must be
  fresh within the transaction.
- `SplitRun` divides one run at an offset so each side can carry different
  marks; the left keeps the identity, the right takes the caller-supplied id
  and inherits the marks. Splitting at 0 is a no-op. A bare split (no
  subsequent difference) is normalized away by the merge pass, so a split is
  only meaningful together with an edit that makes the sides differ.
- `JoinNode` moves every run of the removed block into the surviving previous
  sibling, preserving run identities, marks, and range selections without
  emitting position steps. No runs merge (that is future normalization's job);
  the survivor keeps its block type. Node selections on the removed block
  remap to the survivor. Only adjacent siblings join, and only compatible ones:
  opaque content, application nodes of a different kind or props, and a container
  with a run holder are all refused rather than merged lossily. Joining two
  containers of the same kind concatenates their nested blocks.
- `MoveNode` reorders one block to an explicit post-removal index; moving to
  the same index is a no-op. Run identities and selections are untouched, so no
  position steps are emitted. An optional `parent` moves it into a node block's
  nested blocks (and back out), and a parent that cannot hold blocks is refused.
- `SetNodeProps` retypes a heading's level today (the first block prop; Kit
  definitions generalize this later). Same-level sets are no-ops; paragraphs
  reject the operation.
- `InsertNode` splices a caller-built block at an explicit index, or into a node
  block's nested blocks when `parent` is given; every carried identity must be
  fresh within the transaction. Positions need no mapping (they address runs, not
  indexes).
- `DeleteNode` removes one block and collapses its positions to the nearest
  surviving run in document order — the first at or after the removed block's
  place, else the last before it — or clears the selection when no run remains.
  Node selections on the removed subtree remap to the collapse target. Collapse
  steps in the position map carry the same rule to external positions.
- `decodeDocument` preserves blocks whose type this version does not implement
  as `Unknown` nodes: original type, remaining JSON fields, and no text runs.
  Unknown nodes are addressable structurally (move, delete) but never
  text-editable; `findUnknownNodes` lists them. Non-JSON payloads, missing ids,
  unknown top-level fields, and unsupported versions are rejected rather than
  dropped.
- Marks carry boundary expansion (`Bold`/`Italic`: `after`, `Code`: `none`).
  `resolveInsertion(document, position)` retargets edge insertions whose marks
  forbid the edge to the neighbor carrying exactly the remaining marks; mixed
  edges stay put rather than swapping formatting. Unknown marks default to
  expanding both ways so preservation never retargets them away.
- Every transaction ends by running its transforms (by default
  `mergeAdjacentRuns`): adjacent same-mark runs within touched blocks merge, the
  first run keeping its identity and text and later equivalents retiring
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
decoding untrusted payloads. Nested children and collaboration are still
pending. Retain rejected source content for
recovery; do not replace it with an empty document.

Each transaction currently validates the whole input and indexes its text runs.
Edits copy the affected arrays and preserve untouched nodes. The performance
section records the measured cases; collaborative replay remains unmeasured.

See the [design and phase status](../../docs/design/richtext-DESIGN.md#101-phase-1--pure-semantics-and-integration-feasibility).
