# foldkit-composition

**In development, not published.** Phases 1 and 2 of the page builder design are
built: Blocks, Regions, Content, a Catalog, the stored Document, its validation,
editing Operations and undo History. A renderer and the visual Builder are
later phases.

## What it owns

What a page is, as data. A **Catalog** of Blocks (code, deployed) says what may
exist; a **Document** (data, stored) says what does. It performs no I/O, holds
no state and draws nothing. The draft being edited is a `foldkit-form` key;
saving, revisions and publishing are `foldkit-cms`'s.

## Basic use

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
Composition.validate(Site, page) // [] or diagnostics { code, node, path, message }
```

## Common tasks

- **Store a page:** the Entity's field is `Composition.Document`, the tolerant
  codec: any Block name, props as JSON, so old rows and revisions always read.
- **Refuse an invalid publish:** the operation's input uses
  `Composition.Document.check(Composition.valid(Site))`, which fails with every
  finding at its path.
- **Where is a node:** `Composition.index(document).get(id)` gives
  `{ parent, region, index }`, memoized per Document value.
- **Show a page as text** (tests, agent context): `Composition.describe(Site, doc)`.
- **List the vocabulary:** `Catalog.describe(Site)`; attach metadata with
  `Block.annotate(key.of(value))`.
- **Typed props:** `Block.decode(Heading, node.props)` and `PropsOf<typeof Heading>`.
- **Edit:** `Composition.apply(Site, doc, op)` gives `Result<{ document, changed, removed }, { code, message }>`.
  Ops: `Op.insert({ id, block, props, at })`, `Op.insertTree({ tree, at })`,
  `Op.remove(id)`, `Op.move(id, to)`, `Op.duplicate({ id, ids, at })`,
  `Op.setProp(id, prop, value)`, `Op.unsetProp`, `Op.setWhen`, `Op.setAppearance`,
  `Op.setAction`, `Op.batch(ops)` (all or none). Positions: `Composition.root(i)`,
  `Composition.region(parent, name, i)`; a move's index counts after the node is
  taken out. `Composition.Operation` is their Schema.
- **New ids:** `Composition.newIds(n)` is an Effect: run it in a Command and put
  the ids in the Operation; `apply` never mints one. Copy and paste:
  `Composition.rekey(Composition.takeTree(doc, id), ids)`.
- **Undo:** `History.empty()`, `History.commit(history, before, History.groupFor(op))`,
  `History.undo(history, current)`, `History.redo(...)`: snapshots, bounded at
  200; consecutive `setProp`s of one prop of one node are one step. Start a new
  History when the Document is replaced from outside (fill, reset, restore).

## Gotchas

- A Region accepts by **Content** (`Content.Flow`), compared by identity:
  `Content.define('Pricing')` twice gives two capabilities.
- Props decode strictly: a key the Block's schema does not name is
  `composition:invalid-props`.
- An unknown Block is reported (`composition:unknown-block`), kept, and what it
  holds is still checked; `describe` marks it `?`.
- A node is in exactly one place; a second parent, a cycle, an orphan and a
  missing id are each their own diagnostic.
- Regions are not Mixins Slots, and Content is not a Mixins capability.
- `when`, `appearance` and `actions` are stored as JSON and not yet interpreted.
- `apply` refuses only what the Operation causes; it keeps working beside an
  unknown Block, but cannot set that Block's props.

## See also

- [Package README](https://github.com/doeixd/foldkit-plus/blob/main/packages/composition/README.md)
- [Page builder design](https://github.com/doeixd/foldkit-plus/blob/main/docs/design/pagebuilder-DESIGN.md)
