# RichText — semantic document foundation

`foldkit-richtext` is an unpublished workspace package. The application Model
owns the document and local selection; the package supplies pure data validation
and text transitions. It has no DOM editor, persistence runtime, or hidden store.

The current loop is `EditorState + Transaction → next state + ChangeSet + positionMap`,
or a diagnostic with no partial result. Call `apply` inside the application's
`update`, and install its successful state there.

Available now: version-1 documents, explicit branded NodeIds, paragraphs,
headings, text runs, Bold/Italic/Code marks, range and node selections,
InsertText/DeleteText/AddMark/RemoveMark/SetSelection/SplitNode/JoinNode/MoveNode/SetNodeProps/InsertNode/DeleteNode/SplitRun,
text position mapping with split relocation and deletion collapse, structural
ChangeSets, merge normalization, mark definitions with boundary expansion,
unknown node preservation, bounded decode limits, Kits with vocabulary
validation, a command layer resolving intent into transactions, local undo
history with explicit grouping, clipboard slices with a strict codec, HTML
export, and inspection. Unknown mark
strings load verbatim and
round-trip; `findUnknownMarks` lists them per run for a publishing gate, while
`Edit.addMark` accepts only known marks. Mark edits are idempotent per run: redundant adds and removes
are no-ops without position steps. Build operations with `Edit.*`, which fills
`type`, accepts a NodeId or `Node.make` reference, and returns a narrowed
variant; shape misuse throws at the call site while document mismatches stay
`apply` diagnostics. `decodeDocument` enforces `DocumentLimits` (defaults:
10,000 blocks, 50,000 runs, 5,000,000 UTF-16 units); violations throw a named
error. `apply` does not enforce limits, so size-check untrusted payloads first.
Schema constructors build values; `decodeDocument` strictly validates persisted
input. Offsets are UTF-16 units. Position maps use sequential edit coordinates;
the returned selection is already mapped. ChangeSet tracks touched nodes, not
net authored-content change or a durable replication packet.

`Node.make(id)` gives an immutable identity reference with `.id`, `.at(offset,
affinity)`, and `.read(document)`. It holds no content and performs no insertion.
Reads return the current block/text node or `undefined`; narrow by `type`.
Positions validate shape at construction and resolve against the document during
`apply`. References are document-local identities, not authorization capabilities
or stable collaborative anchors. Keep references in application definitions,
not serialized Models. Reuse the ID across edits rather than holding a
stale content snapshot. `read` performs a linear lookup.

`RichText.kit({ nodes, marks })` declares an editor's vocabulary as data;
`validate(document, kit)` reports `UnknownNode` / `UnsupportedNode` /
`UnknownMark` diagnostics without changing the document. It does not yet drive
parsing or `apply`, and prop schemas and nested children are pending.

`History` is snapshot undo over `EditorState`, kept in the application Model:
`commit(history, previous, { group })`, `undo`, `redo`, with `groupFor(command)`
collapsing a typing burst into one step. It is clock-free and bounded;
collaborative undo is not implemented.

`sliceOf(document, selection)` takes a semantic clipboard `Slice` (versioned,
trimmed to the selection), `serializeSlice`/`deserializeSlice` round-trip it
with a strict decoder, `withFreshIds` remints identities for a paste, and
`sliceFromText` is the plain-text fallback. `run(state, { type: 'Paste', slice },
ids)` places a slice at the caret — above the block at its start, below at its
end, and mid-block by splitting the block so trailing text stays below. `toHtml(blocks)` / `documentToHtml(document)` export HTML (marks as
`strong`/`em`/`code`, unknown marks as `data-marks`, unknown blocks as a
placeholder, everything escaped) and `toText`/`documentToText` give plain text.
Import needs a kit-constrained parser and does not exist yet, so paste reads the
slice or plain text only.

The harness adapter carries slices over the clipboard
(`application/x-foldkit-richtext+json`, HTML, and plain text), preferring a
slice payload on paste and falling back to text.

`run(state, command, ids)` resolves editor intent (typing, backward/forward
delete, split block, toggle mark over a range, set selection) into a
transaction and applies it; identity comes from the caller's `mint`, never a
clock. A collapsed toggle is a no-op until stored marks exist.

Custom Kits, migrations, further transforms, Form/Bundle integration, DOM
editing, and collaboration remain unfinished. Unknown nodes and marks are
preserved verbatim (listed by `findUnknownNodes`/`findUnknownMarks`) rather
than stripped; everything else is rejected. Preserve the
original input for recovery. Do not present the design's API sketches as shipped APIs.

The planned integrations reuse Bundle lifecycle, Form controls, CMS drafts,
metadata keys, and Sync presence; they must not add another document owner.

See the [package README](https://github.com/doeixd/foldkit-plus/blob/main/packages/richtext/README.md)
and [phase plan](https://github.com/doeixd/foldkit-plus/blob/main/docs/design/richtext-DESIGN.md).
