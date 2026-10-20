# foldkit-richtext

Pure semantic documents and text transactions for Foldkit. Content is versioned
data with stable node IDs; edits return a new document, mapped selection, and an
invalidation summary. This package is **early**: 0.x, and its API may change
between minor versions.

The application Model owns the document and local selection. Call `apply` from
the application's `update`; it performs no I/O and holds no editor store. DOM
editing lives in [`foldkit-richtext-dom`](../richtext-dom); Form/CMS integration
and Sync replication are not implemented yet.

```text
EditorState + Transaction → next EditorState + ChangeSet + positionMap
                         ↘ diagnostic, with no partial result
```

## A small edit

```bash
pnpm add foldkit-richtext effect
```

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
edits; a Node reference does not turn it into a collaborative anchor (see
[Shared documents](#shared-documents) for one that is). `read`
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
RichText.run(state, { type: 'RetypeBlock', to: { type: 'Heading', level: 2 } }, ids)
```

`InsertText`, `DeleteBackward`, `DeleteForward`, `SplitBlock`, `ToggleMark`, `SetMark`,
`ClearMark`, `SetSelection`, `Paste`, and the block commands below (`RetypeBlock`,
`WrapBlock`, `ConvertBlock`, `RetypeContainer`, `LiftBlock`) read the current selection; `MoveBlock`,
`SetProps`, `InsertBlock` and `DeleteBlock` name their blocks instead. Each resolves to transactions applied as one step, usually one (Enter over
a range in a list item is two: the delete, then the split); the returned `ChangeSet` and
`positionMap` describe the effect, and `transactions` holds what was applied, in order, an
empty one for a command that changed nothing. Nothing mints
identity unless the caller's `mint` does, and replay applies transactions rather than
commands: folding `apply` over `transactions` from the starting state gives the same result.

An *action* is an ordered list of those commands committed as one step:

```ts
RichText.runAction(state, [removeTheMarker, retypeTheBlock], ids)
```

`runAction` runs the commands in sequence and returns one state, one `ChangeSet` (the
union of its commands'), and one identity stream. It stops at the first refusal and
returns that command's error; state is a value, so nothing partial escapes. One command
behaves exactly as `run` does.

An *input rule* turns what was just typed into such an action:

```ts
interface InputRule {
  name: string
  match: (
    textBefore: string,
    within: ReadonlyArray<string>,
  ) => { remove: number; commands: Action; storedMarks?: ReadonlyArray<string> } | undefined
}
```

`within` is the kinds of the node blocks around the caret's block, innermost first,
so a rule can tell `[ ] ` typed at the start of a list item from the same text at the
top level. `applyInputRules` takes it as `within`, defaulting to none, and the editor
fills it in.

`applyInputRules(rules, { textBefore, text, insertion })` builds the action — the insertion,
one `DeleteBackward` per character the rule consumed, then the rule's commands. The deletes
are what let a rule work without a range: `# ` is not in the document until the insertion
that completes it has run, so a range read before that would be the wrong range. A rule that
claims to consume more than the text it was shown throws, because those deletes would run
past the block's start and join it to the one before. `textBefore` for a selection that is
a range is read from `rangeStart(document, range)` — the end that comes first, whichever
way the range was made — since that is where what is typed over it lands.
`resolveInputRules` returns the same action with the matching rule's `storedMarks`: the marks
the text typed next carries, which an editor keeps, so `**bold**` closed as typed ends its bold
rather than letting the bold run continue. A delete removes a whole grapheme, so `remove` counts
graphemes.

`RetypeBlock` changes the type of the block the selection starts in — `Paragraph`, or
a `Heading` at a level — and keeps that block's runs, so identities and the caret
survive. Given a vocabulary that declares a node kind as holding text, it also takes a block
of that kind back out — a `CodeBlock` to a paragraph — the same way, keeping the block's and
its runs' identities. Any other node block, or preserved content, is refused, because its
content is not runs.

`WrapBlock` puts that same block inside new containers, listed outermost first —
`{ type: 'WrapBlock', containers: [{ kind: 'Quote' }] }`, or a `List` holding a `ListItem`
— built where the block stood, with identities from `mint`. The block moves rather than
being copied, so its identity, its runs, and the caret all survive. Given a vocabulary, a
wrap the vocabulary would not hold is refused with `UnexpectedChild`: the parent must accept
the outermost container, each container must be a kind declared to hold nested blocks, and
each must accept the next. A container's props must decode as its kind declares them, or the
wrap is refused with `InvalidInput`. With a vocabulary, a wrap whose outer container holds
items (as `List` holds `ListItem`) and whose block sits right after a container of that kind
and those props joins it: the block becomes its last item instead of starting a second list,
which Markdown would read back as the same one.

`ConvertBlock` makes a paragraph or heading a node kind that holds text —
`{ type: 'ConvertBlock', to: { kind: 'CodeBlock', props: { language: 'ts' } } }` — with its
text and marks. It is a retype: the block and its runs keep their identities, so the
selection, a decoration, a remote cursor, and another replica's edit to that text still
find them. Given a vocabulary, the kind must be declared to hold text and its
parent must accept it (`UnexpectedChild`), its props must decode as the kind declares them
(`InvalidInput`), and a kind that forbids marks refuses a block that carries any
(`ForbiddenMark`).

`RetypeContainer` retypes the container around that block — the node holding it, such as a
list item — to another node kind where it stands:
`{ type: 'RetypeContainer', to: { kind: 'TaskItem', props: { checked: false } } }` makes the
item a task without moving it, splitting its list, or touching what it holds, and the
container keeps its identity, so another replica's edit inside it survives. It acts only from
the container's first block, which is where a marker for the container is typed, and refuses
elsewhere, or with no container, with `InvalidInput`. Given a vocabulary, the new kind must
be declared to hold blocks, hold every block the container holds, and stand where the
container stands (`UnexpectedChild`), and its props must decode (`InvalidInput`).

`LiftBlock` is the inverse of a wrap: it moves the block the selection starts in out of its
container — before it when it was first, after it when it was last, and between the two halves
of a split container when it was in the middle — and deletes a container it leaves empty. With
a vocabulary, it keeps lifting while the new parent does not hold the block's kind, so a list
item's paragraph leaves both the item and the list; without one it takes a single step. It
never leaves a container declared `isolating`, such as the standard `TableCell`, and a block
with nothing to leave is refused with `InvalidInput`. The block keeps its identity, and the
caret with it.

`MoveBlock` moves a block, with everything it holds, before or after another block:
`{ type: 'MoveBlock', node, to: { before: other } }` or `{ after: other }`. It addresses blocks
by identity, not by the selection, so a block handle or a key sends it for the block it stands
for; identities are kept, and so is the selection, except a node selection on a container the
move empties and deletes, which moves to the moved block. `other` can be in any container the block may
move into. With a vocabulary, that container has to hold the block's kind, and the kind has to
stand in it by its `within` (otherwise `UnexpectedChild`). The move may not leave an
`isolating` container such as a table cell, or go inside itself (`InvalidParent`). A container
the move leaves empty is deleted with it, as a lift deletes one: an item moved out of a
one-item list takes the list too. A block that is not there is `InvalidInput`, and moving a
block beside itself changes nothing. `moveTargets(document, node, nodes?)` lists the blocks it
may move beside, in document order, which is what a drag offers.

`SetProps` sets props on a node block by identity and keeps the ones it does not name:
`{ type: 'SetProps', node: item, props: { checked: true } }` ticks a task item. Given a
vocabulary, props that decode as the kind declares them must still decode after, or the
command is refused with `InvalidInput`, as it is for a block that is not a node. Props that
already fail (a key an older version wrote, which cannot be deleted) can still be changed.

`InsertBlock` puts a block, with everything it holds, beside another:
`{ type: 'InsertBlock', block, to: { after: other } }`. Its identities are minted afresh, so
the same block value can be inserted twice (a handle's Duplicate sends the block it stands for).
Without `to` it goes beside the caret's block: before it when that block is empty, so a slash
command typed on a blank line leaves the line below to type on, and after it otherwise. The
caret moves to the start of its first text, when it has any. With a vocabulary, the container
has to hold the kind and the kind has to stand there, as for a move (`UnexpectedChild`).

`DeleteBlock` deletes a block and everything it holds: `{ type: 'DeleteBlock', node }`. A
container it leaves empty goes with it, as a move's does. A caret inside it moves to the start of
the text after it, or the end of the text before; a document it would empty gets an empty
paragraph, so there is always somewhere to type.

A table is edited as a grid from the cell the caret is in (`tableAt(document, selection)` reads
which: the table, its rows, the row and the column). `InsertRow` and `InsertColumn` (`{ where:
'before' | 'after' }`) add a row as wide as the widest, or a cell beside the caret's in every row,
at the end of a row too short for that column; `DeleteRow` and `DeleteColumn` remove them, a row a
column empties with it, and the last row or column takes the table. The caret goes to the new
cell, or to its neighbour. Each is one transaction, so one undo step, and each is refused outside
a table (`InvalidSelection`).

`Indent` and `Outdent` are Tab and Shift+Tab. In a kind declared `indents` (code) they add or
remove a level of indentation (`INDENT`, two spaces): at the caret, or at the start of every line
a range covers; Enter there starts the new line as indented as the one it broke. In a table cell
they move the caret to the next or previous cell, and Tab in the last cell adds a row. In a list
item, Tab nests it under the item before it (in the list that item ends with, or a new one of its
own kind), and Shift+Tab moves a nested item out to follow its parent item, or takes a top-level
item out of its list; the first item has nothing to nest under and stays. The innermost wins: code
in a cell indents, a list in a cell nests. Anywhere else they are refused, and `takesTab(document, selection, nodes)` says so
beforehand, which is how an editor leaves Tab to move focus there.

`DeleteBackward` at the start of a container's first block used to do nothing, having no
sibling to join. With a vocabulary it now lifts the block, which is how Backspace undoes a
`> ` or `- ` typed at a block's start. Without a vocabulary, in a table cell, and forwards, the
edge still does nothing. At the start of a kind the vocabulary declares as holding text, such
as a `CodeBlock`, Backspace retypes it to a paragraph instead of joining it to the block
above, which undoes a fence the way a lift undoes a list marker. A heading does the same with
or without a vocabulary, undoing its `# `; a second press joins it.

Beside a block it cannot be joined with, Backspace and Delete reach the nearest line on that
side. Inside a list or a quote that is its last or first line, which the line at the caret
joins, as clearing the empty range between them would; Delete at the end of a list item's last
line reaches the next item's in the same way. A table cell or code cannot take the line, so
there Backspace only moves the caret in, and Delete beside a line with text does nothing. An
empty line goes, the caret stepping into its neighbour, rather than taking a line out of a
list. An image or a divider reached this way is selected. Each was refused (`InvalidRange`),
which left an empty line after a table that nothing could remove.

`SplitBlock` at the end of a heading starts a paragraph under it, since what follows a title is
text; in the middle of one, both halves stay headings. Over a selection, the range's end
decides, and one ending past the heading also starts a paragraph.

`SplitBlock` inside a list item works on the item, with a vocabulary to say what an item is: a
container its parent declares it holds (a `List` holds `ListItem`s), and not isolating. Enter
splits the block, and the second half, with every block after it in the item, becomes a new
item of the same kind and props right after; the caret lands at its start. Enter in an empty
block that is the item's whole content leaves the list instead, as Backspace does. Over a range
inside an item, the range is deleted first. The new item copies the old one's props, with the
kind's `splitProps` laid over them when it declares some: the standard `TaskItem`'s
`{ checked: false }` makes Enter in a done task start an open one. Together they must still
decode by the kind's `Props`, or the split is refused (`InvalidInput`), and a heading's rule
holds inside an item too. Without a vocabulary, in a quote, and in a table
cell, Enter splits only the block, as before.

`InsertText` takes an optional `marks`. With it, the inserted text carries
exactly that set wherever it lands; without it, the boundary rule decides and the
text inherits the marks of the run it joins. A mark the caller's vocabulary does
not declare is rejected, and so is one whose props its definition does not decode — a
`Link` named bare, with no `href` (`MarkRegistry.accepts` is the check). That is how *stored marks* stay the application's state:
the caret's format belongs to the caller, and the command layer reads no hidden
cursor state. A collapsed `ToggleMark` is likewise a no-op — the application
decides what the caret carries and passes it back on the next `InsertText`.

A toggle can take a link off but cannot change where it points. `SetMark` puts exactly
the given mark on every run a range covers, replacing the props of a same-named mark,
and `ClearMark` takes a mark off by name, or, given a mark value, off only the runs carrying
exactly that value (one discussion's highlight, leaving another's inside it). At a caret both act on the mark's extent
around it, so an editor changes or removes the link the caret sits in without selecting
it first; outside a mark they do nothing. `markExtent(document, position, name)` is that
extent as a read: the mark, and the range of adjacent runs carrying it with the same
props, which is what a link editor shows before it sends either command. `linkAt(document,
selection)` is the standard vocabulary's reading of it for `Link`: the `href` and extent of
the link a selection starts in, or undefined outside one.

`marksInRange(document, selection)` is the read beside them, for a toolbar's active
button: the marks every run the selection covers carries. A caret reports its run's
marks — an empty run can carry them, which is how a caret holds a format — a range
that straddles a marked run and a plain one reports neither, and a node selection
reports what its whole subtree agrees on.

`textBlockAt(document, selection)` is the style of the block a selection starts in — a
paragraph, or a heading at its level — in the shape `RetypeBlock` takes, or undefined for any
other block (a code block) or a node selection, which is what a style picker presses.

`count(document)` is `{ words, characters }` as a reader counts them: `Intl.Segmenter`'s
word-like segments and graphemes, so an emoji is one character and a word in a script without
spaces still counts. Runs join within a block, so a word whose mark changes midway is one word;
blocks never join.

`blocksAt(document, selection)` is the chain of blocks a selection starts in, outermost first:
a caret in a list item's paragraph gives the list, the item, and the paragraph, and a node
selection gives the chain to its block. It is what a block handle picks its block from.

`isBlank(document)` says whether a reader would see nothing — no blocks, or a lone paragraph
or heading with no text — which is when an editor shows its placeholder.

`textBefore(document, position)` is the read for a menu: the text of the block the
position addresses, up to that position, across its runs. A query is typed into the
block's text between its start and the caret, so it never spans blocks; an offset
past a run's end clamps to it, a negative one reads as none of it, and a position
that resolves to nothing gives an empty string.

`textRangeBefore(document, position, length)` is its inverse, for a rule that removes
what it matched: the range covering the `length` characters before the position in its
block, or `undefined` when they do not all precede it. An offset past the run's end clamps
to it, as `textBefore` clamps. Endpoints land at run boundaries
at `after` affinity, where a caret that typed that character would sit.

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
that remain, in nested blocks as at the top level; a registry changes which marks
those are, not the rule. At a block's outer edge there is no neighbor, so text typed
there with no stored marks gets a run of its own carrying only the marks that
extend: typing after a link or inline code that ends a paragraph leaves it. Declared
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
says it holds nested blocks. `RichText.block(name)` declares one of the
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

A node block may also accept **nested blocks** in `blocks`, which is how a
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

`apply` validates its input once per block, not once per call. Blocks and
documents are immutable and an edit copies only the blocks it touches, so a
block or document that has passed validation is remembered, and the document's
index is built once per document. Typing into a 4,000-paragraph document
spent about 10 ms of each `apply` decoding the whole document; it now validates
the one block the last edit replaced. The input is still refused exactly as the
`EditorState` schema refuses it.

The collaborative path (`bench/replicated.bench.ts`) types one character into
the middle of a document of `n` paragraphs, as `examples/pages` does:
`RichText.run`, then `Replicated.translate`, `applyOps`, `project` and
`resolve`. The means below were measured back to back on one machine, before
and after four changes:

- `apply` validates by block (above).
- `applyOps` keeps a layered index of which blocks hold each insert, instead of
  scanning every block to find a character or to check an id is free.
- `project` reuses a block's projection while its entry is unchanged.
- `translate` builds its shadow only for the blocks the edit touches.

```text
paragraphs   before     after
100          1.08 ms    0.17 ms
1,000        8.70 ms    1.91 ms
4,000       49.2  ms    9.61 ms
```

What remains grows with the document because each new document gets its own
indexes: `apply`'s block and run paths, and the node index that `translate` and
selection checks read. `project` also rebuilds its run table and walks every
entry to reuse it.

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

Migrations move semantic data forward when a deployment changes its vocabulary — a preserved node that is now implemented, a prop renamed, a kind
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
built with `inertHtml`; the importer, the view, and the editable DOM interpreter
all live in `foldkit-richtext-dom`, because this package stays DOM-free and
framework-free. Nothing parses HTML back into authority without that walk.

## Rendering a declared mark or node kind

Three interpreters need to know which element a declared mark or node kind
produces — this serializer, the read-only view, and the editable DOM interpreter —
and they must not answer that three different ways. `rendering(...)`
is that answer: a vocabulary built *over* a Kit, never inside one, holding per-name
entries that are either fixed data or a function of the mark or block.

```ts
const renderer = RichText.rendering({
  marks: {
    Link: mark => ({
      tag: 'a',
      attributes: { href: String(RichText.markProps(mark)?.href ?? '') },
    }),
  },
  nodes: {
    Callout: block => ({
      tag: 'aside',
      attributes: { 'data-tone': String(block.props.tone ?? '') },
    }),
  },
})

RichText.documentToHtml(document, renderer)
// → '<p><a href="https://example.test/x">docs</a></p>'
```

An entry yields `{ tag, attributes }` — data about an element, not a view — so
this package gains neither a DOM nor a Foldkit dependency. Attribute *values* are
escaped. A tag or attribute *name* that would end the markup (one holding a quote,
a space, or `>`) is refused rather than written, because a name cannot be escaped;
a well-formed but unwise name is the application's decision. A name with no entry
renders the shipped way, and that is also the default (`noRendering`):
`strong`/`em`/`code` for the shipped marks, `p`/`h1`–`h6` and
`<div data-node="Kind">` for blocks, `data-marks` for anything else. Entries nest
outside the shipped marks and in alphabetical order, so the same set of marks
serializes the same way however it was assembled. A rendering that names a void element —
the standard `Image` is an `img`, a `ThematicBreak` an `hr` — is written as one open tag
rather than `<img></img>`. `runRendering(renderer, run)` and
`nodeRendering(renderer, block)` are the lookups, exported so the view and the
interpreter share this one answer.

## Decorations

A decoration is derived, ephemeral presentation over a document range — a search match, a
lint warning, a remote cursor, a syntax token — and never document content:

```ts
const matches: RichText.DecorationSet = [{ from: at(0), to: at(7), kind: 'search' }]

RichText.decorationsIn(document, matches)
// → Map<runId, Array<{ from, to, decoration }>>, each cut at its run's edge
```

`decoration.data` is the renderer's own payload and the core never reads it. A decoration
is not in the codec, not a Transaction, not undo, and not replicated: a caller computes a
set for one render and discards it. `decorationsIn` is the projection every interpreter
shares — a decoration crossing runs is cut at each run's edge, an endpoint that does not
resolve skips the decoration, a backwards range is honoured, and one run's spans come back
in text order.

A producer comes with it. `findMatches(document, query, { caseSensitive })` lists every
occurrence (its block, its offset there, and its ends as positions), case not counting unless
asked: a match across two runs kept whole, and no match across two blocks, because what a
document has between blocks is structure rather than text. `searchDecorations(document, query,
{ caseSensitive, current })` draws them as decorations of kind `search` (`SEARCH_DECORATION`),
the one at index `current` as `search-current`, changing nothing. `Replace` (`{ query,
replacement, caseSensitive, at }`) replaces the match at `at`, or every match without it, as one
transaction, reading each match again where the replacements after it left the text. `positionInBlock(block,
offset)` is the read it shares with `textRangeBefore` — the position a block's own text offset
addresses — and the one any producer of ranges needs.

The outline is a read of the same kind. `outlineOf(document)` lists the headings that have text,
in document order and inside containers too, as `{ node, level, text }`; `sectionAt(document,
selection)` is the heading of the section the selection starts in, the last such heading at or
before its block, and undefined before the first. A table of contents draws the one and marks the
other.

Footnotes are opt-in vocabulary: add `FootnoteRef` to the kit's marks and `FootnoteDefinition` to
its nodes. A reference is the `FootnoteRef` mark (`{ label }`) on the run that shows the label, so
it moves and undoes with the text; a definition is a block of blocks with the same label, so its
note is ordinary editable text. The label is all that ties them. `footnotesOf(document)` lists
every footnote by first reference, as `{ label, definition, references, text }`, then the
definitions nothing refers to; `footnoteAt(document, selection)` is the label of the reference the
caret is in. `InsertFootnote` (`{ text? }`) puts a reference showing `nextFootnoteLabel` at the
caret, its definition after the last block, and the caret in the note; `RenameFootnote` (`{ from,
to }`) relabels the definition and every reference, refusing a label another footnote has.

Media beside `Image` is opt-in the same way: `mediaNodes` declares `Video` and `Audio` (`{ src,
title? }`, a video also `width?`) and `Attachment` (`{ src, name, size?, type? }`), and
`mediaRendering`, laid under a rendering with `renderingOver`, draws them as `video` and `audio`
with the browser's controls and an attachment as a download link showing its name and size.
`mediaBlock(file)` is the block for a file a reader added, by its type. Where the file lives is
the application's. A source must pass the URL policy, or be a `data:` URL of the kind's own
family (`video/…`, `audio/…`); an attachment's may be any `data:` type that cannot run as a page
(not HTML, SVG or XML), since it is only downloaded.

Code highlighting is the second producer. A `CodeBlock` holds its `language` and plain text,
and a `CodeTokenizer` — a pure `(text) => ReadonlyArray<{ from, to, kind }>` over that text —
says what is in it; `codeDecorations(document, tokenizers)` runs the tokenizer registered for
each block's language and returns the tokens as decorations, so the document never holds a
token. The registry is a `Map` keyed by language, and a block whose language nothing is
registered for yields nothing. A token outside its block's text, covering nothing, or at a
fractional offset throws, naming the language: a tokenizer's bug should not become a
highlight over the wrong text. The grammars themselves are not here — they are
format-specific, and belong to `foldkit-richtext-code`.

```ts
const numbers: RichText.CodeTokenizer = text =>
  Array.from(text.matchAll(/\d+/g), match => ({
    from: match.index,
    to: match.index + match[0].length,
    kind: 'syntax-number',
  }))

RichText.codeDecorations(document, new Map([['json', numbers]]))
```

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
splits the caret's block and lands the content between the halves. The first
pasted block joins the text before the caret and the last joins the text after
it, when each can be one block with it, so a copied word or line lands inside the
sentence and several lines keep the sentence's two ends. A block that cannot join
(an image, a table, a list) stands between the halves, and a half left empty goes,
except the line after a pasted image or table, which is where writing goes on.
Into a kind whose text keeps line breaks (code), the paste is its plain text. A
range selection is replaced first, and the caret lands at the end of the pasted
text. `foldkit-richtext-dom` reads the clipboard into a slice (its own payload,
then HTML, then plain text) and sends this command.

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
  marks: [RichText.Bold, RichText.Italic],
})

RichText.validate(document, ArticleKit)
// → [] when the document fits; otherwise a diagnostic the caller decides on
```

`foldkit-richtext` also ships a standard vocabulary — the kinds and marks a document
uses to mean what Markdown and HTML also mean:

```ts
RichText.kit({
  nodes: [...RichText.standardNodes, Callout],
  marks: [...RichText.standardMarks, Highlight],
})
```

`standardNodes` is `Paragraph`, `Heading`, `Quote`, `List`, `ListItem`, `TaskItem`,
`CodeBlock`, `ThematicBreak`, `Image`, `Table`, `TableRow`, `TableCell`; `standardMarks`
is the shipped three plus `Strikethrough` and `Link`. `standardRendering` gives each kind
its element — a `List` an `ol` or `ul`, an `Image` an `img` with its `src`, a `TaskItem` its
`data-task` — and `renderingOver(base, extra)` builds a registry over another, so an
application adds its own kinds beside the standard ones. A `TableRow` that is the header
renders `data-header`, and a `Table`'s rows go in a `tbody` (the entry's `inner`), because an
HTML parser inserts one around bare rows, and markup sent from a server has to parse to the tree
that was rendered. An entry's `adornments` are elements drawn inside the block before its content
that are not content: a task's checkbox, a figure's picture and caption, a callout's icon. They
carry `data-adornment`, hold no position, and an HTML import drops them; one with `toggles: 'open'`
flips that boolean prop when clicked, through the editor's `ChangedProps`, and one with an `action`
(`'copy'`) is reported to the application with its block, for something that is not an edit:

```ts
RichText.renderingOver(RichText.standardRendering, {
  nodes: {
    TaskItem: block => ({
      tag: 'li',
      attributes: {},
      adornments: [
        {
          tag: 'input',
          attributes: { type: 'checkbox', ...(block.props.checked === true ? { checked: '' } : {}) },
          toggles: 'checked',
        },
      ],
    }),
  },
})
```
 A standard `Image` also carries an optional `caption`, a `width` in CSS
pixels, and an `align` (`start`, `center`, `end`); the standard rendering draws the `img`
alone, and a rendering that draws a figure reads the rest. It may carry its `asset` too:
`foldkit-media`'s `ImageAsset`, the size, hash and placeholder of what `src` names, as stored
(`null` for what it lacks). With it, the `img` has `width` and `height` (at the drawn `width`
when there is one), so the page holds its box before the file arrives; a rendering of its own,
such as a figure, spreads `imageBox(block.props)` on its `img` for the same. The rendering
trusts the facts to be `src`'s, so whatever changes `src` (an editor's control, an agent's
`SetProps`) replaces `asset` or clears it in the same change. HTML and Markdown
carry no facts, so a round trip through either leaves them out; they can be read again from
the image. A link's `href` and an image's `src` pass `safeUrl` again as they are
rendered, and one it refuses is left out, so a `javascript:` URL that reached the document
by decoding, sync, or `SetMark` rather than import is drawn inert.

A kind can state rules stricter than its content mode. `blocksOf(...kinds)` accepts only
those block kinds, `marks: 'none'` forbids marks on the kind's own runs, `isolating: true`
makes the kind a boundary a lift never crosses, as a table cell is, `splitProps` names
props an item split off one of this kind starts with (typed from the kind's `Props`), `lineBreaks:
true` makes Enter a newline in the kind's text rather than a split (Enter on an empty last line
leaves it for a paragraph after; the standard `CodeBlock` declares it, and so may a callout of
several lines), `indents: true` makes Tab indent its lines and Enter keep a line's indentation, as
code does (`CodeBlock` declares both; without it, Tab still leaves the editor), and `within`
names the kinds it may stand
in, so a `ListItem` stands only in a `List` and never at the top level:

```ts
RichText.node('List', { children: RichText.blocksOf('ListItem', 'TaskItem') })
RichText.node('CodeBlock', { Props: Language, children: RichText.textContent, marks: 'none' })
RichText.atom('Image', { Props: Schema.Struct({ src: Schema.String }) })
RichText.node('TaskItem', {
  Props: Schema.Struct({ checked: Schema.Boolean }),
  children: RichText.blockContent,
  splitProps: { checked: false },
  within: ['List'],
})
```

`validate` reports those violations as `UnexpectedChild`, `ForbiddenMark`, and
`MisplacedNode` (a kind outside what its `within` names), and checks
an atom's props the same way it checks a node's. `run` refuses the edits that would create
an unexpected child, a forbidden mark, or a misplaced kind (a move, a wrap, or a paste), when it
is given the vocabulary — `nodes: RichText.nodeRegistry(kit.nodes)`, the node
counterpart of the `marks` option:

```ts
RichText.run(state, { type: 'ToggleMark', mark: 'Bold' }, ids, {
  nodes: RichText.nodeRegistry(kit.nodes),
})
// → { ok: false, error: 'ForbiddenMark' } when the caret is inside a CodeBlock
```

The codec keeps a document a Kit would reject, and `apply` takes no vocabulary: a durable
transaction must not depend on a declaration that may have moved. Removing a mark is
always allowed, so a preserved document that already carries one has a way back.

`validate` reads the document and never repairs it: callers decide whether a
diagnostic blocks publishing or shows a placeholder. The Kit does not drive parsing
or `apply`.

## Shared documents

Several replicas can edit one document when the edits are ordered by a server, as
`foldkit-sync` and `foldkit-durable` order any durable Message. The difficulty is only that
an edit written as "insert at offset 12 of run `t`" means something else once another
replica's edit lands first. `RichText.Replicated` gives every character an identity that
outlives the edits around it, and restates each edit in those terms:

```text
shared state --project--> Document --command--> result --translate--> ops
     ^                                                                  |
     +------------------------------ applyOps --------------------------+
```

The editor, its commands and its renderers keep working on a plain `Document`. The state
holds the blocks, every character typed (deleted ones stay, as tombstones, because a later
op may be anchored on them, until a `Collect` removes them), and the marks on each:

```ts
import * as RichText from 'foldkit-richtext'

const { Replicated } = RichText
const seed = RichText.decodeDocument({
  version: 1,
  children: [
    { type: 'Paragraph', id: 'p', children: [{ type: 'Text', id: 't', text: 'hello', marks: [] }] },
  ],
})

let shared = Replicated.fromDocument(seed, 'doc:seed')
const shown = Replicated.project(shared)
const caret = { node: shown.children[0]!.children[0]!.id, offset: 5, affinity: 'after' as const }
const result = RichText.run(
  { document: shown, selection: { type: 'Range', anchor: caret, focus: caret } },
  { type: 'InsertText', text: '!' },
  { mint: () => crypto.randomUUID() },
)
if (result.ok) {
  const { ops, selection } = Replicated.translate(shared, result, 'edit:1')
  shared = Replicated.applyOps(shared, ops)
  const next = { document: Replicated.project(shared), selection: Replicated.resolve(shared, selection) }
}
```

- `fromDocument(document, key)` and `translate(state, result, key)` mint new identities under
  `key`, which has to be unique to that call among everything the state will see, such as a
  random id minted in a Command. The ids the command minted itself are replaced, so its
  `mint` needs no care.
- `translate(state, result, key, { continues })` carries text typed right after the last
  character of an insert that `continues` accepts on that insert, from its next index,
  rather than starting a new one. `coalesce(ops)` then folds a run of such inserts into one
  op, so a burst of typing sent together is one `Insert`. Accept only inserts this replica
  minted: two replicas continuing one insert at once claim the same characters, and the
  later-committed loses its text.
- `translate` is pure and reads nothing but its arguments. The `ops` are what travels: every
  replica applies the same ops in the server's order and projects the same document.
- `applyOps` never throws. An op that no longer fits changes nothing: a block already
  deleted, an id already taken, a move or an `Unjoin` that would put a block inside itself.
  Text typed into a block another replica deleted is gone with it. An insert or split
  anchored on a character that is gone (its insert was refused, or a `Collect` removed it)
  lands at the end of the block it was typed in, or of the block that one was joined into.
- `applyOps` checks structure, not vocabulary: a `Retype` or `SetProps` op takes any node
  kind and any JSON props. An application applying ops from replicas it does not trust
  checks those against its own Kit before committing them.
- A selection travels as anchors (`translate`'s `selection`, or `anchor(state, selection)`),
  and `resolve` places it again after other replicas' ops: after the same character, or the
  nearest one before it still shown.
- Two replicas' concurrent inserts at one place both survive, the later-committed first.
  A mark covers the characters it named, so text another replica typed inside the range
  before the mark arrived stays unmarked.
- A `Collect` op removes deleted text, in two phases so a deletion is kept for one whole
  interval: each removes what the previous one found deleted, then marks what is deleted
  now. Commit it through the log like any op, so every replica removes the same text at
  the same point. An op made by a replica offline across two collections, anchored on
  removed text, takes the lost-anchor fallback, and an undo from before then finds less to
  restore. An insert keeps one deleted character at its end, so its indexes are never
  reused. Block records stay; only their text goes.
- `invert(state, ops)` gives the ops that undo `ops`, computed against `state`, the state
  `ops` were applied to. Applied later, after anything else, they take back only what
  `ops` did:
  - characters it inserted are deleted, and characters it deleted come back
    (`Undelete`);
  - marks, block types and props return to what they were;
  - a split is joined, and a join is split out again (`Unjoin`), with its text and
    nested blocks;
  - a deleted block returns (`UndeleteBlock`), and a moved one goes back beside the
    sibling it followed.

  Everyone else's edits stay. Collaborative undo is applying these as a new edit, which
  converges like any other. The text an undone split joins back goes at the end of the
  first half as it is then (a `Join` with `at: 'end'`), so what was typed there since stays
  before it: split `ab` at its start, type `x` in the empty first half, and undoing the
  split gives `xab`. A redone join goes right after the character its text followed, or at
  the block's end when its text ended the block. A restored mark goes last among its run's marks,
  whose order carries no meaning. A prop an edit added where there was none stays, since `SetProps`
  cannot delete one. Inverting the inverse, against the state it was applied to, gives
  the redo.

Run identities in the projection are the first character's, so they are stable while
text is added after them; block identities are stable for a block's whole life.

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
  says the kind accepts them: a List holds ListItems, a Quote paragraphs.
  Nested content decodes, round-trips byte-equal, is counted by `inspect` and the
  decode limits, survives a deploy that lost its kind, and a selection or
  reference inside it resolves. Commands reach a run wherever it sits, so typing,
  grapheme deletion, marks, stored marks, undo, and the clipboard work inside a
  container — a copy across its children carries the container — and every
  interpreter renders one, with the HTML importer reading a container back.
  Structural placement works at depth too: a split keeps its halves in the block's
  own container, siblings join within theirs, and a move or insert takes an
  optional `parent` to enter or leave a container. A range across containers or
  kinds of block (a selection from a list into the paragraph after it, or the
  whole document) is cleared as an editor clears one: the ends lose what it
  covers, every block wholly between goes, the far end comes up beside the near
  one and joins it when the two can be one (where the near end's container
  takes its kind), and containers left empty go. A range that leaves a table
  cell only loses its text. Typing, Enter or a paste over such a range clears it
  first. What is still refused with `InvalidParent` is a parent that cannot hold
  blocks.
- An atom (an image, a divider) has no text for a caret, so it is selected whole.
  Backspace at the start of the block after it, or Delete at the end of the block
  before it, selects it, taking away the line the caret was on when that line is
  empty; a second press deletes it, and the caret lands where it was. Over a node
  selection, Enter opens an empty paragraph after the block, and typing replaces
  the block with a paragraph of what was typed. `isAtom(nodes, block)` is the test:
  the vocabulary's `atom` declaration, or, without one, a node holding nothing.
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
- `RetypeBlock` changes the type of a block whose content is its runs — to a paragraph,
  a heading at a level, or a node kind with props (`RetypeTarget`) — keeping its run
  values and identities. A node block holding nested blocks retypes only to another node
  kind, keeping them. Same-shape sets are no-ops; retyping such a block to a paragraph or
  heading, or retyping preserved content, is refused (`InvalidRange`).
- `SetProps` sets the props it names on a node block and keeps the others. Setting a
  prop to the value it has is a no-op; a text block or preserved content is refused
  (`InvalidRange`). Props cannot be deleted, only set.
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
  edges stay put rather than swapping formatting. At a block's outer edge, the
  typed text takes its own run with only the marks that extend there. Unknown marks default to
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
decoding untrusted payloads. `Replicated` is the pure core of collaboration;
`examples/pages` wires it to `foldkit-sync` and `foldkit-durable`. Retain rejected
source content for recovery; do not replace it with an empty document.

A transaction validates only the top-level blocks it has not seen validated before,
so a container is checked again whenever anything inside it changes, and indexes its
text runs. Edits copy the affected arrays and preserve untouched nodes. The
performance section records the measured cases, the collaborative path included
(`bench/replicated.bench.ts`).
