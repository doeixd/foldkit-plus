# foldkit-composition

What a page is, as data. A **Catalog** of Blocks says what may exist; a
**Document** says what does: which Blocks, with which props, in which Regions.
The Document is stored like any other field, checked against a Catalog, and
changed by the application's own transitions. This package performs no I/O,
holds no state and draws nothing.

> **Status: in development, not published.** Phases 1 to 3 of the
> [page builder design](../../docs/design/pagebuilder-DESIGN.md) are built: the
> vocabulary, the stored Document, its validation, editing Operations, undo
> history and migrations. A Foldkit renderer and the visual Builder come in
> later phases.

## What it owns

| Fact | Owner |
| --- | --- |
| Which Blocks exist, their props, Regions and Content | `foldkit-composition`, in code |
| Which Blocks a page has, and where | the Document, stored as data |
| Whether a Document fits a Catalog | `Composition.validate`, which reads and never repairs |
| The draft being edited, saving, revisions, publishing | the application: a `foldkit-form` key, `foldkit-cms` |
| How a Block looks and behaves | a view, drawn from the Block by a renderer |

Code decides what *may* exist; data records what *does*. A Document refers to
code only by name, so it outlives the code: a Block removed from a deployment
leaves a node that still loads, still round-trips and is reported, never
dropped.

## Mental model

```text
code, deployed                                data, stored
Block    a name, a props Schema,              Document
         its Regions, the Content it is         roots: [id, ...]
Catalog  the Blocks one context allows,         nodes: { id: { block, props, regions } }
         and which may be a root
                     \                          /
                      Composition.validate(catalog, document) → [] | diagnostics
```

A **Region** is a stored position inside a Block where other Blocks go, such as
a Hero's `actions`. It accepts Blocks by **Content**, what a Block *is*
(`Section`, `Flow`, `Interactive`), not by name, so a Region written today
accepts a Block written next year.

## Install

In this workspace, while it is in development:

```ts
import { Block, Catalog, Composition, Content, Region } from 'foldkit-composition'
```

## Sixty seconds

```ts
import { Schema } from 'effect'
import { Block, Catalog, Composition, Content, Region } from 'foldkit-composition'

const Heading = Block.define('Heading', {
  Props: Schema.Struct({ text: Schema.String, level: Schema.Literals([1, 2, 3]) }),
  provides: [Content.Flow],
})

const Section = Block.define('Section', {
  Props: Schema.Struct({ tone: Schema.Literals(['plain', 'accent']) }),
  regions: { body: Region.many({ accepts: [Content.Flow] }) },
  provides: [Content.Section],
})

const Site = Catalog.make({ blocks: [Heading, Section], roots: [Content.Section] })

const page = Schema.decodeUnknownSync(Composition.Document)({
  format: 1,
  roots: ['intro'],
  nodes: {
    intro: { block: 'Section', props: { tone: 'plain' }, regions: { body: ['title'] } },
    title: { block: 'Heading', props: { text: 'Hello', level: 1 }, regions: {} },
  },
})

Composition.validate(Site, page) // []
Composition.describe(Site, page)
// Section intro {"tone":"plain"}
//   body:
//     Heading title {"level":1,"text":"Hello"}
```

- `Block.define` and `Catalog.make` describe; nothing runs. A Catalog with two
  Blocks of one name, a Region that accepts nothing, or a Block that provides
  nothing throws when it is made.
- `Composition.Document` is a Schema: the Document is plain JSON, stored in a
  column or a field like any other value.
- `validate` returns what is wrong, each finding with a code, the node, a path
  and a sentence. It never changes the Document.

## The Document, and its two schemas

A Document is normalized: `roots` and each Region hold ids, and `nodes` holds
each node once, under its id. A node does not store its own id, so an id and
its key cannot disagree, and a node is in exactly one place.

There are two schemas, on purpose:

```ts
Composition.Document                                 // tolerant: what is stored and read
Composition.Document.check(Composition.valid(Site))  // strict: what may be published
```

The tolerant codec accepts any well-formed Document, whatever Block names it
uses and with props as JSON. So a stored page always reads, an old revision
always restores, and content the deployment no longer knows survives. The strict
check runs `validate` and fails with every finding at its path. Store the first
in the Entity, and ask the second of the operation that publishes:

```ts
const Page = Entity.define('Page', Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  document: Composition.Document,
}))

const PublishPage = Entity.input(Page, Schema.Struct({
  title: Page.fields.title.schema,
  document: Composition.Document.check(Composition.valid(Site)),
}))
```

`when`, `appearance` and `actions` are reserved on every node, stored as JSON,
for conditions, appearance choices and event actions in later phases.

## What validation finds

| Code | Meaning |
| --- | --- |
| `composition:missing-node` | a root or Region names an id with no node |
| `composition:orphan` | a node that no root or Region reaches |
| `composition:second-parent` | a node placed twice |
| `composition:cycle` | a node that contains itself |
| `composition:unknown-block` | a Block name the Catalog does not have; the node is kept and what it holds is still checked |
| `composition:invalid-props` | props the Block's schema refuses, including a key it does not name |
| `composition:unknown-region` | a Region the Block does not have |
| `composition:region-cardinality` | too few or too many children for the Region |
| `composition:region-rejects` | a child whose Content the Region does not accept |
| `composition:root-rejects` | a root whose Content the Catalog's roots do not accept |

Props are decoded strictly, so a prop an old version left behind is found
rather than silently kept.

## Reading a Document

- `Composition.index(document)` says where each reachable node is: its parent,
  Region and index. It is derived, never stored, and computed once per Document
  value.
- `Composition.describe(catalog, document)` writes the Document as indented
  text, one node per line, with a Block the Catalog does not know marked `?`.
- `Catalog.describe(catalog)` lists each Block's props, Regions, Content and
  metadata, for a person, a tool or an agent.
- `Block.decode(block, props)` decodes stored props to the Block's typed props,
  and `PropsOf<typeof Heading>` is their type.
- `Block.annotate(metadata)` attaches an interpreter's
  [`foldkit-metadata`](../metadata/README.md), such as a palette category. The
  Block knows no annotation's meaning.

## Editing: Operations

A Document changes by Operations, the way a Model changes by Messages:

```text
Document + Operation → Document, or a refusal with no partial result
```

```ts
const { Op, root, region } = Composition

const result = Composition.apply(
  Site,
  page,
  Op.insert({
    id: NodeId.make('subtitle'),
    block: 'Heading',
    props: { text: 'Welcome', level: 2 },
    at: region(NodeId.make('intro'), 'body', 1),
  }),
)
// Result.succeed({ document, changed: ['subtitle', 'intro'], removed: [] })
// or Result.fail({ code: 'composition:region-rejects', message: '…' })
```

| Operation | What it does |
| --- | --- |
| `Op.insert({ id, block, props, at })` | a new node at a position |
| `Op.insertTree({ tree, at })` | a subtree, such as a Pattern or a paste |
| `Op.remove(id)` | the node and everything it holds |
| `Op.move(id, to)` | the node elsewhere, keeping every id |
| `Op.duplicate({ id, ids, at })` | a copy of the subtree under the ids given |
| `Op.setProp(id, prop, value)`, `Op.unsetProp(id, prop)` | one prop, checked against the Block |
| `Op.setWhen`, `Op.setAppearance`, `Op.setAction` | the reserved fields, stored and cleared |
| `Op.batch(ops)` | several, in order, all or none |

- **Positions** are `root(index)` or `region(parent, name, index)`. An index
  counts after the node being moved is taken out, so moving the first of three
  to index 2 puts it last.
- **`apply` checks what the Operation causes:** a Region that would not accept
  the node or has no room, a Region left below its bound, a node put inside
  itself, a taken id, props the Block refuses. It does not refuse an edit for
  something already wrong elsewhere, so an author keeps working beside a Block
  the deployment no longer knows. A prop of such a Block cannot be set, since
  nothing can check it.
- **`apply` never mints an id.** Every id an Operation creates is in it, so a
  replay creates the same nodes. `Composition.newIds(count)` is an Effect that
  makes random ones, to run in a Command.
- **`Applied`** says which nodes were added or changed, a parent whose Region
  changed included, and which were removed, so a view can redraw only those.
- Operations are data: `Composition.Operation` is their Schema, for a log, an
  agent's tool or a replay.
- `Composition.takeTree(document, id)` takes a subtree, and
  `Composition.rekey(tree, ids)` renames every id in it, which is how a paste
  is inserted twice without a collision.

## Undo: History

`History` keeps snapshots of the Document an edit started from, beside the
Document in the same Model, committed in the same transition as the edit:

```ts
let history = History.empty() // bounded at 200 steps
history = History.commit(history, before, History.groupFor(op))
const back = History.undo(history, current) // { history, document } | undefined
const forward = back && History.redo(back.history, back.document)
```

Consecutive `setProp`s of one prop of one node are one step, so typing a title
undoes as a whole; every other Operation stands alone, and a new edit after an
undo clears redo. A snapshot shares everything the edit did not touch. Whatever
replaces the Document from outside the editor, such as a fill, a reset or a
restored revision, should start a new `History.empty()`.

## Migrations and unknown Blocks

A Block that a deployment no longer has does not make its pages unreadable. Its
nodes load, round-trip, render as a placeholder once a renderer exists, and can
be reordered where they are or removed. `validate` reports them, so the strict
check refuses to publish until they are dealt with. Migrations deal with them:

```ts
const { document, applied, unused } = Composition.migrate(stored, [
  Composition.renameBlock('OldHeading', 'Heading'),
  Composition.renameProp('Heading', 'alignment', 'align'),
  Composition.promoteUnknown('LegacyVideo to Embed', 'LegacyVideo', Embed),
  Composition.migration('DangerToCritical', 'Callout', node =>
    node.props['tone'] === 'danger' ? { ...node, props: { ...node.props, tone: 'critical' } } : undefined,
  ),
])
// applied: [{ name, node }] in the order made; unused: names that rewrote nothing
```

- **The list is the chain.** A later migration sees what an earlier one made.
- **A migration rewrites a node, never its id,** and the Document's structure is
  checked after each one that changed something: a Region pointing at nothing, a
  node placed twice, a cycle or a stranded node throws, naming the migration.
  What was already wrong before it ran is not held against it.
- **The result is still content.** A rewritten node must decode as a Node.
- **Declining is allowed.** Returning `undefined` keeps the node.
  `promoteUnknown` declines for a node whose props do not decode as the target
  Block's, so it stays as it was rather than half converted.
- **They run where you choose,** such as on load, before a publish, or as an
  explicit upgrade, never on every read.

A Block the Catalog does not know can be reordered within the Region or the
roots it is in, and removed. It cannot be moved elsewhere, and its props cannot
be set, since nothing could check either.

## Performance

`pnpm bench` measures a page of 1,000 nodes (`bench/operations.bench.ts`). On
the machine the design's budgets were checked on, as means:

```text
apply one setProp                  0.40 ms    budget 1 ms
apply one move between sections    0.39 ms    budget 1 ms
validate the whole page            1.14 ms    budget 10 ms
index a page not seen before       0.09 ms    budget 5 ms
```

`apply` shares every node it does not change, and copies the record of nodes
once per Operation, which is most of its cost at this size.

## Relationship to rich text

A page and a rich-text document are two documents on purpose: rich text
addresses edits by text position, a page by node and Region. They meet in one
direction, with rich text held as a Block's prop. This package follows
[`foldkit-richtext`](../richtext/README.md)'s rules where they apply: props are
JSON when stored and checked by the vocabulary, content a deployment does not
know is kept, and the vocabulary is a module-level value, never Model state.

## Limits

- No renderer yet: drawing a Document is Phase 4 of the design.

- Conditions, appearance and actions are stored but not interpreted.
