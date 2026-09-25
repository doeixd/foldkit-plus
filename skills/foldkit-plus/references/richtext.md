# RichText — semantic document foundation

`foldkit-richtext` is published at 0.1.0 and early. The application Model
owns the document and local selection; the package supplies pure data validation
and text transitions. It has no DOM editor, persistence runtime, or hidden store;
the editable DOM adapter is the separate `foldkit-richtext-dom` package, also
0.1.0 and early.

The current loop is `EditorState + Transaction → next state + ChangeSet + positionMap`,
or a diagnostic with no partial result. Call `apply` inside the application's
`update`, and install its successful state there.

Available now: version-1 documents, explicit branded NodeIds, paragraphs,
headings, text runs, Bold/Italic/Code marks, range and node selections,
InsertText/DeleteText/AddMark/RemoveMark/SetSelection/SplitNode/JoinNode/MoveNode/RetypeBlock/InsertNode/DeleteNode/SplitRun,
text position mapping with split relocation and deletion collapse, structural
ChangeSets, merge normalization, mark definitions with boundary expansion and
prop schemas, unknown node preservation, bounded decode limits, Kits with
vocabulary validation, a command layer resolving intent into transactions, reads for
the marks a selection carries (`marksInRange`, for a toolbar's active button) and for
the text of a block before a position (`textBefore`, what a slash menu queries),
local
undo history with explicit grouping, clipboard slices with a strict codec, HTML
export, and inspection. Unknown marks load verbatim and round-trip;
`findUnknownMarks` lists them per run for a publishing gate. The operation
builder takes any mark; `run` is what refuses to add one the caller's vocabulary
does not declare. Mark edits are idempotent per run: a
redundant add or remove is a no-op without position steps. Build operations with
`Edit.*`, which fills
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
`UnknownMark` / `InvalidProps` / `MismatchedDefinition` diagnostics without
changing the document, walking nested blocks as it goes. A node declaration says
what content its kind holds — `RichText.node(name, { Props, children })` with
`RichText.textContent` (the default) or `RichText.blockContent` — and `validate`
reports a declaration the document contradicts: an atom holding runs, a
`blockContent` kind held as a run holder, a `textContent` kind held as a
container. An empty application node is accepted either way, because a document
cannot say whether it is an atom or a run holder with no runs. The Kit is what
`run` may add marks from; `apply` still takes no Kit, so a content contract is
enforced at validation rather than at the operation. Parsing stays with the
caller, and `foldkit-richtext-dom`'s parser maps `<ul>`/`<ol>`/`<li>` to a
`List`/`ListItem` the Kit declares.

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
`toHtml(blocks, renderer?)` takes a `rendering({ marks, nodes })` vocabulary — built
over a Kit, never inside one — mapping a declared mark or node kind to
`{ tag, attributes }`, so a Link with an `href` prop exports as `<a href>` instead
of `data-marks`. A name with no entry keeps the shipped rendering, entries nest
outside the shipped marks and in alphabetical order, attribute values are escaped,
and a tag or attribute name that would end the markup is refused.

HTML import and the editable adapter live in `foldkit-richtext-dom`,
because `foldkit-richtext` stays DOM-free. Import is a whitelist walk over a
`DOMParser` tree: known tags map to blocks and marks, `data-marks`/`data-unknown`
round-trip, other elements are unwrapped or dropped with a diagnostic, attributes
are never interpreted, and `script`/`style`/`iframe` are dropped with their
content. The adapter's `mount(ownerDocument, content, renderer?)` builds an owned
`contenteditable` subtree and takes the same `rendering(...)` registry — as do
`mountInto` and `attachEditor` — so each mark
nests as an element inside its run element exactly as the read-only view nests it,
while a name no entry renders stays on `data-marks`; the registry lives on the
`EditorDom` and every later patch reuses it. A declared node kind renders as its
element too, with its nested blocks inside and `data-block` still the interpreter's
own identity. `patch`
applies a `ChangeSet` in place and keeps untouched element identity (a block is kept
only while its element is still what it renders as, so a re-leveled heading is not
left as an `h2`), `repair`
recovers after an IME or an outside mutation,
`positionToRange`/`rangeToPosition` map a semantic `Position` to and from a DOM
`Range`, and `attach(dom, { onIntent })` turns `beforeinput`/`keydown`/composition
and clipboard events into editor intent while preventing the browser from mutating
the subtree behind the document. `onSelection` reports a caret the application did
not just commit, and `mountInto(host, content, options)` at
`foldkit-richtext-dom/host` renders into a view's host element and records the
attachment a patch Command later finds. A registry can also be `placeRendering`d for
a host id — what the editor Bundle's `editorAt(hostId, renderer?)` does — and the
mount reads it by that id, so a renderer reaches a view's mount without entering a
Model or schema-decoded args (`renderingFor` reads the record back). A Kit passed to `attach` degrades
undeclared node kinds, and its `keymap` adds or overrides chord bindings
(`Mod-b`, `Alt-ArrowUp`), checked before the built-in chords.
`foldkit-richtext-dom/toolbar` renders the marks as buttons (`marksToolbar`) that
dispatch their Messages, each active when the caret carries it or every run the
selection covers does (`markActive` is that rule on its own).
`foldkit-mixins-richtext` draws that toolbar through Mixins slots instead
(`MarkToolbarSlots`, `markToolbar<Message>()`), for an application that restyles or
extends its parts. It also carries the slash menu's vocabulary (§123): `slashQuery`
(the query the caret is in, read from `RichText.textBefore`), `slashEntries(wrap)` (the
text blocks and marks a menu offers, each with a stable id, a label, search keywords,
and the editor Message choosing it sends), and `matchingEntries(entries, query)`. `slashMenu(entries, textBefore, index)` is the one value a menu's view and an editor's `update` share — the query, the matches, and the entry Enter would send, with a stale index falling back to the first match — so the two cannot disagree. The menu's own view — a slot view over `foldkit-primitives`' `ListNavigation` — is the next slice.

`foldkit-richtext-dom/editor` carries the editor's own layer: the Message
vocabulary (`Typed`, `Entered`, `ToggledMark`, `RetypedBlock`, `Selected`, `Pasted`,
`Undone`, `Redone`, `Patched`), `toMessage`, the `events` mount a view renders as its
host element's `OnMount`, and `patchEditor`, the work a patch Command runs against the
element that host names. `RetypedBlock` is a Message an application sends itself — no
browser event means "make this block a heading" — and `editor-bundle` exposes
`retyped(block)` for it. `foldkit-richtext-dom/editor-bundle` is the editor as a
Bundle (§27): `Editor`, `editorAt(hostId, renderer?)`, `application`/`update`, and the
Messages a host dispatches; every accepted edit returns that patch Command.

The read-only view (`foldkit-richtext-dom/view`) renders a document or a
slice as ordinary Foldkit `Html` through `inertHtml` — no dispatch, no DOM
ownership — with the same element and attribute names the editable adapter uses.
`renderDocument(document, renderer?)` / `renderBlocks(blocks, renderer?)` take the
same `rendering(...)` registry as the serializer, so a declared Link renders as a
real `<a href>`; a tag Foldkit has no builder for is reported, not swapped.

The harness also carries a page (`examples/richtext/harness.html`, served from
source with `pnpm exec vite examples/richtext`) for exercising the editable
adapter in a real browser, where jsdom cannot reach: real typing, a real
selection, a real Enter. The page is verified to build and serve; driving it needs
a browser connected to the session.

The harness adapter carries slices over the clipboard
(`application/x-foldkit-richtext+json`, HTML, and plain text) and resolves a
paste as slice → HTML → text.

`run(state, command, ids)` resolves editor intent (typing, backward/forward
delete, split block, toggle mark over a range, set selection, paste, retype block)
into a transaction and applies it; identity comes from the caller's `mint`, never a
clock. `RetypeBlock` changes the type of the block the selection starts in — a
paragraph, or a heading at a level — and keeps that block's runs, so identities and
the caret survive; a node block is refused, because its content is its Kit's contract.
`InsertText` takes an optional `marks`: with it the inserted span carries
exactly that set, without it the boundary rule decides and the text inherits the
run it joins; an unknown mark is refused. That keeps stored marks in the
application: a collapsed toggle is a no-op in the command layer, and the caller
hands the caret's format back on the next insertion. In the controlled harness,
`storedMarks: null` inherits the document's marks; an array overrides them, and
`[]` explicitly turns formatting off. Moving the caret resets the override.

Normalization is a transform registry: `Transform` is a pure function of the
document plus the touched nodes, returning the new document with its position
steps and identity bookkeeping, which `apply` folds into the same ChangeSet and
position map. `defaultTransforms` ships `mergeAdjacentRuns`; a transform may
merge, move, or remove but never mint an identity, and one that never settles is
refused with `UnstableNormalization` after `MAX_NORMALIZATION_PASSES`.

Form integration (Phase 5), the rest of Phase 4 (toolbar, slash commands, keymaps),
and collaboration remain
unfinished. Nested children are done: a node block may carry nested `blocks`,
which decode, round-trip, count, and survive an unknown kind, and commands reach
a run inside one — typing, grapheme deletion, marks, and the clipboard work at
depth, with a copy across a container's children carrying the container. The HTML
serializer, the read-only view, and the editable adapter all render a container
with its nested blocks, and
HTML import reads `data-node` back and maps `<ul>`/`<ol>`/`<li>` to a
`List`/`ListItem` the Kit declares (props start empty; the slice keeps them).
Structural placement works at depth too: a split keeps its halves in the block's
container, siblings join within theirs, and `insertBlock`/`moveBlock` take an
optional parent to enter or leave a container. Migrations descend into containers,
and `promoteUnknown` takes the target's content mode. A Kit declares what content
a kind holds (`textContent` or `blockContent`), and `validate` reports a
declaration the document contradicts. Marks are definitions with a boundary policy
and, when they carry data, a prop schema:

```ts
const Link = RichText.mark('Link', {
  Props: Schema.Struct({ href: Schema.String }),
  expand: 'none',
})
Link.of({ href: '/docs' }) // { name: 'Link', props: { href: '/docs' } }
RichText.kit({ nodes, marks: [RichText.Bold, Link] })
RichText.run(state, command, ids, { marks: RichText.markRegistry(kit.marks) })
```

`of` accepts the definition's decoded props, then synchronously encodes them and
validates the encoded result as a JSON object. Wrong input types are compile
errors; invalid values or non-JSON output throw at the call. Encoding must
require no services. A definition without props builds a value carrying only
its name.

A run stores a mark as a bare name with no props or as `{ name, props }` with
them. Loading preserves the form it found, so a names-only document round-trips
byte-equal, and a run carries a name at most once, so it never holds both forms
of one mark. Read
either with `markName`/`markProps`, and compare with `sameMark`/`sameMarkSet`.
`markRegistry(kit.marks)` answers both what `run` may add (`declares`) and how a
mark expands across a boundary (`expansionOf`). Props are part of a mark's
identity: normalization does not merge runs whose props differ, and `AddMark` is a
set for its name (append, replace props, no-op on the same value) while
`RemoveMark` keys on the name alone. Declared names are what `run` may add, so a
Kit's marks work by name or value: `InsertText`'s stored marks and `ToggleMark`'s
mark each take a bare name or a `{ name, props }` value. `validate` reports
`UnknownMark` for an
undeclared name and `InvalidProps` for props its schema refuses, including a mark
that declares props but carries none. `resolveInsertion` honors the policy, with
an undeclared mark expanding `both`. Application node kinds are
first-class: `RichText.node(name, { Props })` declares a `Node` block whose JSON
props the Kit validates (`UnsupportedNode` / `InvalidProps`), with text-run
children so positions and operations work unchanged. Migrations move persisted
data forward: `migrate(document, migrations)` runs in list order, must keep each
block's identity, must produce content the codec can store with document-wide
unique IDs after each changed migration pass, and may decline a
block by returning `undefined`; `promoteUnknown` turns a preserved unknown block
into a declared kind. Unknown nodes and marks are
preserved verbatim (listed by `findUnknownNodes`/`findUnknownMarks`) rather
than stripped; everything else is rejected. Preserve the original input for
recovery. The HTML fallback carries mark names, not props; the slice format
carries both. Do not present the design's API sketches as shipped APIs.

The planned integrations reuse Bundle lifecycle, Form controls, CMS drafts,
metadata keys, and Sync presence; they must not add another document owner.

See the [package README](https://github.com/doeixd/foldkit-plus/blob/main/packages/richtext/README.md)
and [phase plan](https://github.com/doeixd/foldkit-plus/blob/main/docs/design/richtext-DESIGN.md).
