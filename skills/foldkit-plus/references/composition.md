# foldkit-composition and foldkit-builder

**In development, not published.** Phases 1 to 4 of the page builder design are
built: Blocks, Regions, Content, a Catalog, the stored Document, its validation,
editing Operations, migrations, and a Foldkit renderer. The visual
Builder is a later phase.

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
- **Undo** is not here: the Builder keeps the page in `foldkit-primitives/state`'s `history`.
- **Migrate stored pages:** `Composition.migrate(doc, [Composition.renameBlock(from, to),
  Composition.renameProp(block, from, to), Composition.promoteUnknown(name, from, ToBlock),
  Composition.migration(name, block, node => node | undefined)])` gives
  `{ document, applied, unused }`. Run it on load, before publish or as an
  upgrade. A migration that breaks the structure throws.
- **Draw a page:** `import { Renderer } from 'foldkit-composition/foldkit'`;
  `Renderer.make(Site, { Block: ({ props, regions, h, id, mode }) => Html, ... })`
  (every Block needs a view), `Renderer.render(renderer, doc, h, { mode })` gives
  one `Html` per root. `Renderer.forMessages<M>().make` for views that dispatch.
  Edit mode wraps each node with `data-composition-node`.
- **Serve it:** `SSR.static('page', ih => Renderer.render(SiteRenderer, model.page, ih))`
  and leave the page out of the resume plan's state: the Document is not sent.
- **URLs:** use `Url` for any `href` or `src` prop: http, https, mailto, tel and
  relative only.
- **Rich text:** `RichTextBlock.define('Text', { kit, provides })` from
  `foldkit-composition/richtext`; the body is checked against the Kit
  (`composition:nested`). Any Block may add `check: props => [{ path, message }]`.

## The Builder: `foldkit-builder`

The page editor's state, as a Bundle, designed as one form key's control
(`Input.bundle`): the Document is the key's value.

```ts
import { Builder } from 'foldkit-builder'

const PageBuilder = Builder.make('PageBuilder', {
  catalog: Site,
  renderer: SiteRenderer,
  starters: { Section: {}, Heading: { text: 'New heading' } }, // the palette offers exactly these
})
const PageForm = Form.make('PageForm', PageInput, { inputs: { document: PageBuilder.input } })
```

- Model: `page` (an undo history from `foldkit-primitives/state`; `page.present`
  is the Document; `PageBuilder.document(model)` reads it), `selected`,
  `hovered`, `panel`, `viewport`, `refused`. Messages: `Applied({ op })`, `InsertAsked({ block, at })`,
  `DuplicateAsked({ id, at })`, `Minted` (from its own Command), `Selected`,
  `Hovered`, `Undid`, `Redid`, `PanelChosen`, `ViewportChosen`.
- Ids are minted in a Command; an edit and its undo step change together;
  a new node is selected; a refusal is kept in `refused` until the next edit.
- As a form key: a change of the Document is an edit (autosaved by CMS), a
  selection is not; fill replaces the page and starts undo over.
- Helpers: `PageBuilder.placeFor(doc, selected, block)`,
  `PageBuilder.moveBy(doc, id, delta)`, `PageBuilder.replace`, `PageBuilder.settle`.
- Its view is plain (palette, layers, text props, undo, the page in edit mode);
  `foldkit-mixins-form` draws it with the form. One node is selected at a time.

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
  unknown Block, which can be reordered where it is or removed, but not moved
  elsewhere or have its props set.

## See also

- [Package README](https://github.com/doeixd/foldkit-plus/blob/main/packages/composition/README.md)
- [Builder README](https://github.com/doeixd/foldkit-plus/blob/main/packages/builder/README.md)
- [Page builder design](https://github.com/doeixd/foldkit-plus/blob/main/docs/design/pagebuilder-DESIGN.md)
