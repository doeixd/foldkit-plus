# RichText — semantic document foundation

`foldkit-richtext` is an unpublished workspace package. The application Model
owns the document and local selection; the package supplies pure data validation
and text transitions. It has no DOM editor, persistence runtime, or hidden store.

The current loop is `EditorState + Transaction → next state + ChangeSet + positionMap`,
or a diagnostic with no partial result. Call `apply` inside the application's
`update`, and install its successful state there.

Available now: version-1 documents, explicit branded NodeIds, paragraphs,
headings, text runs, Bold/Italic/Code marks, range and node selections,
InsertText/DeleteText/AddMark/RemoveMark/SetSelection/SplitNode/JoinNode/MoveNode/SetNodeProps/InsertNode/DeleteNode,
text position mapping with split relocation and deletion collapse, structural
ChangeSets, bounded decode limits, and inspection. Unknown mark strings load
verbatim and
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

Custom Kits, unknown node preservation, normalization, Form/Bundle integration,
DOM editing, and collaboration remain unfinished. Unknown nodes are rejected
rather than silently stripped. Preserve the
original input for recovery. Do not present the design's API sketches as shipped APIs.

The planned integrations reuse Bundle lifecycle, Form controls, CMS drafts,
metadata keys, and Sync presence; they must not add another document owner.

See the [package README](https://github.com/doeixd/foldkit-plus/blob/main/packages/richtext/README.md)
and [phase plan](https://github.com/doeixd/foldkit-plus/blob/main/docs/design/richtext-DESIGN.md).
