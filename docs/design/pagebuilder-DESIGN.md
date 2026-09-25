# Composition and the Page Builder

**Status:** Proposed. Revised 2026-09-25 against the tree at 0.11.0: it now
builds on `foldkit-richtext`'s document discipline, `foldkit-entity`'s Query
semantics, `foldkit-ssr`, `Bundle.compose` and `Bundle.lazy`, the Mixins recipe
and theme system, and the `foldkit-primitives/interaction` subpath, none of
which the first draft could assume. Phases 0 to 3 are built: `Input.bundle`,
the `foldkit-composition` core, its Operations and History, and migrations.
**Target:** `doeixd/foldkit-plus`
**New packages:** `foldkit-composition`, `foldkit-builder`, `foldkit-mixins-builder`
**Changed packages:** `foldkit-form` (a control backed by a Bundle, shared with
the rich-text design's §44), `foldkit-surface` (a shared Message action, §20)

---

## 0. What the revision changed

The first draft had the right ownership split and five problems. Each is decided
below rather than left open.

| Problem in the first draft | Decision | Where |
| --- | --- | --- |
| One strict, Catalog-derived Schema was both the stored field and the validity check, so a page using a removed Block could not be read, and an old revision could not be restored | Two layers: a tolerant codec stores any Document; `Composition.validate` against a Catalog decides whether it may be published | §6 |
| Its Form change (a structured draft, with the Builder outside the Form) conflicted with the rich-text design's (a control backed by a Bundle), and would send a whole Document through the Form for every keystroke | One Form change for both: `Input.bundle`. The Builder *is* the `document` key's control, and its Messages carry Operations, not Documents | §11 |
| Undo was a stack of inverse Operations the Form could change underneath | History is snapshots in the same Model as the Document, committed in the same transition; anything that replaces the Document from outside clears it | §9 |
| Operations did not say where new ids come from, so they were not deterministic | Every id an Operation creates is in the Operation | §8 |
| It proposed its own `Expr` and waited for Query work that has since shipped | Documents never name a query; a Block does, in code. Persisted conditions are a small data IR with `foldkit-entity`'s operator semantics | §15, §16 |

It also gains what it did not mention: how a page relates to a rich-text
document (§4), how a published page is served through `foldkit-ssr` (§14), URL
safety (§22), and budgets a 1,000-node page must meet (§25).

---

## 1. The decision

Foldkit Plus gains a general **Composition**: a persistent, typed description of
which Blocks make up a page, with which props, in which Regions. The visual
**Builder** is one editor of it.

```text
Composition says what the page is.
The Builder changes it, through Operations.
The Form owns the change: the Builder is the control of one key.
The CMS saves, revises, schedules and publishes it.
Foldkit renders it, on the server through foldkit-ssr and in the browser.
```

Nothing here introduces a page store, a page draft, a page revision, a page
router, a page data source, a page action runtime or a page component framework.
Each of those already has an owner:

| Concern | Owner |
| --- | --- |
| What a page is | `foldkit-composition`: the Document, validated against a Catalog |
| The editable draft, validation, fill, reset, resume | `foldkit-form`, through the `document` key's control |
| Selection, drag, panels, undo | `foldkit-builder`, inside that control's Model |
| Saved drafts, revisions, schedule, publish, audience | `foldkit-cms` and `foldkit-cms-drizzle` |
| Server facts, preview overlays | `foldkit-remote` |
| What a feature observes and may cause | `foldkit-surface` |
| Reusable state machines, lazy code | `foldkit-bundle` |
| Appearance and element behavior | `foldkit-mixins` |
| Serving a published page | `foldkit-ssr` |
| External actors | `foldkit-agent` |

A page is also not only a page. The same Document describes a landing page, a
structured article, an email layout, a dashboard or a report. That is why the
substrate is named Composition and the Builder is only one editor of it.

## 2. Mental model

```text
                         code (deployed)                         data (stored)
  ┌──────────────────────────────────────────────┐     ┌──────────────────────────┐
  │ Block      what may exist, its props, Regions │     │ Document                 │
  │ Catalog    the Blocks one context allows      │◄───►│   roots: [NodeId]        │
  │ Renderer   how a Block becomes Html           │     │   nodes: { id: Node }    │
  │ Migration  how stored data moves forward      │     │ Node: block, props,      │
  └──────────────────────────────────────────────┘     │       regions, when?     │
                                                        └────────────┬─────────────┘
                                                                     │
   Operation ── Composition.apply(catalog, document, op) ──► Document | Diagnostic
```

Code decides what *may* exist; data records what *does*. A Document refers to
code only by name, so it can outlive the code: a Block removed from a
deployment leaves a node that still loads, still round-trips, and is reported,
never dropped.

The one equation mirrors Foldkit's `Model + Message → Model`:

```text
Document + Operation → Document        (pure and deterministic, or a diagnostic
                                        with no partial result)
```

The Document is the state. Operations are transitions, not the storage format,
so the CMS stores a value rather than becoming an event-sourced page store.

## 3. Sixty seconds

A Catalog of two Blocks, one edit, and a check. No view, no editor, no Form.
This is the shape Phase 1 must make true; every name is a proposal.

```ts
import { Schema } from 'effect'
import { Block, Catalog, Composition, Content, NodeId, Region } from 'foldkit-composition'

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

const result = Composition.apply(
  Site,
  Composition.empty(),
  Composition.Op.insert({
    id: NodeId.make('section-1'),
    block: 'Section',
    props: { tone: 'plain' },
    at: Composition.root(0),
  }),
)
// → { document, changed: ['section-1'] } or { diagnostic }

Composition.validate(Site, result.document) // → [] when it fits the Catalog
```

- `Block.define` and `Catalog.make` describe; they perform no work.
- `apply` returns a new Document and what it changed, or a diagnostic. It never
  repairs, never generates an id, and never returns half an edit.
- `validate` reads and reports. Callers decide whether a diagnostic blocks
  publishing or shows a placeholder, exactly as `RichText.validate` does.

## 4. Composition and rich text are two documents, on purpose

`foldkit-richtext` already has persistent documents with stable node ids,
application node kinds with schema-checked props, a Kit as vocabulary,
validation, migrations and a rendering registry. The obvious question is
whether a page is a rich-text document with layout nodes. It is not:

| | Rich text | Composition |
| --- | --- | --- |
| Address of an edit | a position: node, run, text offset | a node and a Region index |
| Children | text runs, sometimes blocks | Blocks in named Regions |
| Editing surface | a `contenteditable` subtree the browser mutates | a canvas the application renders; nothing is `contenteditable` |
| A unit of content | prose | a configured component |

Forcing layout into text positions, or prose into Regions, makes each worse. So
they stay two documents, and they meet in one direction: **a Composition holds
rich text as a prop.**

```ts
const Text = Block.define('Text', {
  Props: Schema.Struct({ body: RichText.Document }),
  kits: { body: ArticleKit },
  provides: [Content.Flow],
})
```

The Text Block names the rich-text Kit its body accepts, so `Composition.validate`
runs `RichText.validate` on the body and reports its findings by path (§6). On
the canvas, the selected Text node's body is edited by `foldkit-richtext-dom`'s
editor Bundle, placed at the selection: one live editor at a time, committing a
`setProp` when the selection leaves it (§13).

What Composition adopts from rich text, because rich text paid for these lessons:

- **Props are JSON at the codec and schema-checked at the vocabulary.** Rich
  text's node props are JSON in the document codec and validated by the Kit.
  That is the tolerant-storage, strict-validation split of §6.
- **Identity survives migration, enforced rather than hoped for.** Rich text
  throws when a migration changes an id, and rejects ids duplicated across
  blocks; its review found the second check missing (R16). Composition's
  migrations run both checks from the start (§17).
- **Unknown content is preserved, and promoted rather than rewritten.** A
  `promoteUnknown` declines when legacy data does not decode.
- **Vocabulary is not state.** Rich text's §122 kept its rendering registry out
  of the Model and out of Bundle args, because a Model holds state and a
  registry holds functions. A Catalog and its Renderer follow the same rule:
  they are module-level values, never Model fields and never args (§11).
- **History is snapshots in the Model, bounded, grouped without a clock.** Rich
  text's `History` is the pattern for §9.

## 5. Blocks, Regions, Content, Catalog

**A Block** is the semantic definition of one composable thing: a stable name,
a props Schema, its Regions, the Content it provides, and metadata. It contains
no view.

```ts
const Hero = Block.define('Hero', {
  Props: Schema.Struct({
    eyebrow: Schema.String,
    title: Schema.String,
    align: Schema.Literals(['start', 'center']),
  }),
  regions: { actions: Region.many({ accepts: [Content.Interactive], max: 3 }) },
  provides: [Content.Section],
}).pipe(Block.annotate(Palette.category('Marketing')))
```

- **The name is the persisted identity.** Renaming a Block is a content
  migration (§17), never a refactor.
- **Props are Effect Schema, and nothing else.** One schema drives decoding,
  inspector controls, agent tool input and documentation. Meaning and editing
  hints are `foldkit-metadata` annotations, as they are on an Entity, owned by
  the package that reads them. Block core knows no annotation's meaning.
- **A Block may name an input per prop** for the inspector:
  `Block.inputs({ title: Input.multiline() })`, the same renderer-neutral
  `Input` control data `foldkit-form` resolves (§12).

**A Region** is a persistent structural position: `Region.one({ accepts, optional? })`
or `Region.many({ accepts, min?, max? })`.

**Content capabilities** decide what a Region accepts, so a Region written
today accepts a Block written next year. Each is a value, not a string, so two
libraries' `Interactive` cannot collide:

```ts
Content.Section, Content.Flow, Content.Inline, Content.Interactive, Content.Media, Content.Data
const Pricing = Content.define('Pricing') // an application's own
```

A Region accepts a Block when the Block provides any capability the Region
lists. The shipped vocabulary stays that small.

**Regions are not Mixins Slots, and Content capabilities are not Mixins
capabilities.** A Slot is a rendered point where Style or Behavior attaches; a
Region is a stored position where a Block is placed. A Hero has one Region,
`actions`, and perhaps four Slots, one of them the element the Region renders
into. The two contracts share no type, and a Renderer maps one to the other.
That keeps DOM extension points from turning into content structure.

**A Catalog** is the vocabulary of one context: its Blocks, which Content may be
a root, the context its conditions read (§16), and the actions its Documents may
reference (§20).

```ts
const Site = Catalog.make({ blocks: [Hero, Section, Text, Image, Button], roots: [Content.Section] })
```

It answers which Blocks exist, what a name resolves to, whether a Block may go
in a Region, and what a Block's props are. It is not an application registry:
queries, routes, auth, services and forms do not go in it. A Block that needs
data declares that in its own code (§15). Two Blocks with one name in one
Catalog throw when the Catalog is made.

## 6. The Document, and its two schemas

```ts
interface Document {
  readonly format: 1                                     // the codec's own version
  readonly roots: ReadonlyArray<NodeId>
  readonly nodes: Readonly<Record<NodeId, Node>>
}

interface Node {
  readonly block: string                                 // a name, resolved by a Catalog
  readonly props: Readonly<Record<string, Json>>
  readonly regions: Readonly<Record<string, ReadonlyArray<NodeId>>>
  readonly when?: Condition                              // §16
  readonly appearance?: Appearance                       // §18
  readonly actions?: Readonly<Record<string, ActionRef>> // §20
}
```

Decisions:

- **Normalized, keyed by id.** Order lives only in `roots` and in each Region's
  array. A node does not also store its own id, so an id and its key cannot
  disagree. `Link.collectionById` now checks that invariant at runtime; here it
  holds by construction.
- **Exactly one parent.** A node appears once, in `roots` or in one Region's
  array. Sharing is a Composite Block (§21), never a second parent. The parent
  index is derived by `Composition.index(document)`, pure and memoized per
  Document value, and never stored.
- **Every field is reserved now.** `when`, `appearance` and `actions` exist in
  the codec from `format: 1` although Phases 1 to 3 write none, so the phases
  that add them need no format migration.
- **`format` is the codec's version, not the Catalog's.** A Catalog changes
  through named migrations (§17), as rich text's vocabulary does.

**Two schemas, never one.** This is the correction that matters most.

```ts
Composition.Document       // tolerant: any well-formed Document, any Block name,
                           // props as JSON. What is stored, read and revised.
Composition.valid(Site)    // strict: a Schema check that runs `validate` against
                           // a Catalog. What an input must satisfy to publish.
```

The Page Entity stores the tolerant one, so any row reads, any revision
restores, and an unknown Block survives. The page's operation input checks the
strict one, so nothing that does not fit the deployed Catalog is published:

```ts
const Page = Entity.define('Page', Schema.Struct({
  id: PageId,
  title: Schema.String.check(Schema.isMinLength(1)),
  slug: Schema.String,
  document: Composition.Document,
  publishedAt: Schema.NullOr(Schema.String),
})).pipe(Cms.roles({ label: 'title', slug: 'slug', published: 'publishedAt' }))

const PageInput = Entity.input(Page, Schema.Struct({
  title: Page.fields.title.schema,
  slug: Page.fields.slug.schema,
  document: Composition.Document.check(Composition.valid(Site)),
}))
```

A saved draft may be invalid; the CMS already keeps a draft that does not decode
through the form's `partial`. Only a publish must be valid. In the database the
column is JSON, read and written only through the tolerant codec.

**Validation** returns diagnostics, never a boolean:

```text
composition:missing-node       a root or Region names an id with no node
composition:orphan             a node no root or Region reaches
composition:second-parent      a node reached twice
composition:cycle
composition:unknown-block      a name the Catalog does not have (preserved, not dropped)
composition:invalid-props      the Block's schema refused them, with the Schema issue
composition:unknown-region
composition:region-cardinality
composition:region-rejects     a child whose Content the Region does not accept
composition:root-rejects
composition:unsafe-url         §22
composition:unknown-action     §20
composition:unknown-context    §16
composition:unknown-token      §18
composition:nested             a rich-text prop's own RichText.validate findings, by path
```

## 7. Operations

Operations are Schema-backed, serializable data: what an agent sends, what a
keyboard command produces, and what Sync might one day carry.

```text
insert         { id, block, props, at }             a new node at a position
insertTree     { nodes: { id: Node }, root, at }    a subtree: a Pattern, a paste
remove         { id }                               the node and its subtree
move           { id, to }                           keeps every id
duplicate      { id, ids: { old: new }, at }        the subtree, with its new ids given
setProp        { id, prop, value }                  one prop, decoded against the Block
unsetProp      { id, prop }                         only an optional prop
setWhen        { id, when | null }
setAppearance  { id, appearance | null }
setAction      { id, name, action | null }
batch          { ops }                              all or nothing
```

`at` and `to` are positions, `Composition.root(index)` or
`Composition.region(parentId, region, index)`. A position is resolved against
the Document it is applied to, so a `move` within one array uses the index after
removal. The docs state that once, and tests pin both ends of an array.

`apply` checks against the Catalog as it goes: a Region's `accepts` and `max`, a
prop's schema, and a cycle a `move` would create. An Operation that would leave
the Document invalid for a reason the Operation caused is refused with that
diagnostic. An Operation on a Document that is already invalid somewhere else,
such as an unknown Block in another section, is allowed, because an author must
be able to keep working around content the deployment no longer knows.

## 8. Ids are minted by the caller

`apply` is pure, so it cannot mint ids, and an Operation that did would not
replay. Every id an Operation creates is in the Operation: `insert` carries
`id`, `insertTree` carries every node's id, and `duplicate` carries the whole
old-to-new map, refused unless it covers the subtree exactly.

The Builder mints ids in a Command (`Composition.mint(count)`, random, answering
with a Message), so `update` stays pure and a replay reproduces the result. An
agent may send its own ids; `apply` refuses one already in the Document
(`composition:id-taken`). A Pattern or a paste is re-keyed through
`Composition.rekey(tree, ids)` before it is inserted, so two pastes of one
clipboard never collide.

## 9. History

Undo is interaction state. It is kept beside the Document in the Builder's
control Model (§11) and committed in the **same transition** as the edit it
records, so the two cannot disagree. The pattern is rich text's `History`:

- **Snapshots, not inverse Operations.** A Document is normalized and shares
  structure, so a snapshot costs roughly the changed nodes. A snapshot cannot be
  applied to the wrong Document; an inverse Operation can.
- **Grouped without a clock.** Consecutive `setProp`s of one prop of one node
  are one step, so typing a title is one undo. Every structural Operation stands
  alone.
- **Bounded**, at 200 steps by default. A new edit after an undo clears redo.
- **Cleared whenever the Document is replaced from outside** the Builder: a
  fill, a reset, a restored revision, a resolved conflict. This is the rule the
  first draft was missing, and it is enforced by `Input.bundle`'s `fill` (§11),
  not left to each application.
- **An agent's edit is undoable,** because it arrives as the same Message a
  human's does.

## 10. Rendering

A Renderer turns a Block into ordinary `Html` with the builder it is given. It
adds no reconciler, no component runtime, and no per-node state.

```ts
import { Renderer } from 'foldkit-composition/foldkit'
import { renderDocument } from 'foldkit-richtext-dom/view'

const SiteRenderer = Renderer.make(Site, {
  Hero: ({ props, regions, h }) => HeroView({ ...props, actions: regions.actions }, h),
  Section: ({ props, regions, h }) =>
    h.section([h.DataAttribute('tone', props.tone)], regions.body),
  Text: ({ props }) => renderDocument(props.body, ArticleRendering),
  // Image, Button …
})

Renderer.render(SiteRenderer, document, h) // Html
```

- **Totality is typed.** `Renderer.make` requires an entry for every Block in
  the Catalog, so a Block added without a view is a type error, not a blank on a
  live page.
- **An unknown or invalid node renders a placeholder,** empty in production and
  labeled in edit mode. Rendering never throws on stored data.
- **Production and the canvas use the same Renderer.** There is no
  `HeroBuilderPreview`. Edit mode adds a marker attribute to each node's root
  for hit testing, and nothing else (§13).
- **The builder is a parameter,** so the same Renderer runs under Foldkit's
  inert builder inside `SSR.static` (§14).
- **It lives in a subpath,** `foldkit-composition/foldkit`, with `foldkit` an
  optional peer, the way `foldkit-primitives/interaction` takes
  `foldkit-mixins`. The core stays pure, and a server-only validator installs no
  view code.

A React component can be a Block's view through `foldkit-react`'s islands. The
Document is unchanged; only that Renderer entry differs.

## 11. The Builder is a Form control: `Input.bundle`

This is the change `foldkit-form` needs, and it is the change the rich-text
design specifies in its §44. That design's spike in `examples/form` (a color
picker with a popover, a Command, a Subscription and a Resource) recorded what
Form cannot carry today:

```text
a draft that is a child Model     Draft is string | boolean | string[]
the control's own Messages        the form's Message union is fixed
the control's Commands            lifted only for validation and submit
the control's Subscriptions       none
the control's Resources           none
fill / partial / settled          expressed over drafts, not over a child Model
```

One primitive serves both consumers:

```ts
const DocumentInput = Input.bundle('Composition', {
  bundle: PageBuilder,                            // an ordinary Bundle
  value: model => model.document,                 // what the key holds, validates and submits
  fill: (model, document) => Builder.replace(model, document), // clears history and selection
  settled: model => Builder.settle(model),        // drag, hover, history and pending mints cleared
})

const PageForm = Form.make('PageForm', PageInput, {
  inputs: { slug: Cms.slug('title'), document: DocumentInput },
})
```

What follows from it:

- **The Builder's Messages are the control's Messages.** An edit is
  `Applied({ op })`, a few bytes, not a `Changed` carrying a whole Document.
  That removes the per-keystroke copy the first draft's bridge would have made,
  and the bridge itself.
- **`authoredChanged` reads `value`,** comparing the Document by reference
  first. CMS autosave already consumes `authoredChanged`, so a selection change
  never triggers a save.
- **Validation still runs on `value(model)`,** so the key's strict schema (§6)
  and the form's checks keep their meaning.
- **Ownership stays single.** The Form owns the key; the key's control Model
  holds the Document and the editor state beside it; nothing else holds either.
- **Outside a Form,** the same Bundle is placed with `Bundle.withChild`, and its
  parent owns the Model. Nothing in the Builder knows about Form.
- **The Catalog and Renderer are in neither the Model nor the args** (§4).
  `PageBuilder` closes over them where it is defined:
  `Builder.make('PageBuilder', Site, SiteRenderer)`.

Constraints known from the rich-text spike, and their answers here: a row of a
nested form is plain data, so a nested form whose control has Subscriptions or
Resources is refused when the outer form is made. A resumed Form Model restores
the control through `settled`, which keeps the Document and the selection and
drops history, drag and pending mints.

> **Built (Phase 0).** `Input.bundle` shipped as specified, with one change:
> the separate `saved` hook folded into `settled`, which Form already applied
> to a stored Model shown again, so one hook says what a resumed control keeps.
> Also as built: the Bundle may have no OutMessage and need no services, and a
> key given such a control takes no `check`.

## 12. The Builder: headless, then drawn

Following `foldkit-form` and `foldkit-mixins-form`, the Builder is split in two.

**`foldkit-builder`** is headless: the Bundle, its Model, its Messages, and pure
helpers.

```ts
interface BuilderModel {
  readonly document: Document
  readonly selected: ReadonlyArray<NodeId>
  readonly anchor: NodeId | null                 // for a Shift range in Layers
  readonly hovered: NodeId | null
  readonly panel: 'insert' | 'layers' | 'properties'
  readonly viewport: 'wide' | 'medium' | 'narrow'
  readonly drag: DragState | null
  readonly history: History
  readonly pendingMint: PendingMint | null
  readonly editingText: { node: NodeId; prop: string } | null // §13
}
```

Its Messages include `Selected`, `Hovered`, `DragStarted`, `DragMoved`,
`Dropped`, `Applied({ op })`, `Undid`, `Redid`, `Minted` and `PanelChosen`.
Keyboard commands produce the same Operations as pointer ones: Alt with an
arrow moves, Mod+D duplicates, Delete removes.

**`foldkit-mixins-builder`** draws it, every element a Mixins Slot, with the
interaction primitives that already exist rather than new ones:

| Part | Built from |
| --- | --- |
| Layers tree | `RovingTabindex` and `Selection` (with `Ranged`) from `foldkit-primitives/interaction`, with `aria-level` per depth |
| Insert palette | `Typeahead` for search and `DismissLayer` for the popover, grouped by the `Palette.category` annotation |
| Drag and drop | `Move` for pointer capture; drop targets from `Builder.dropTargets(document, catalog, geometry)`, a pure function |
| Keyboard reorder | the same Operations as the pointer path, announced through `LiveAnnounce` ("Moved Hero to position 2 of 3") |
| Inspector | the Block's props as `Input` controls, drawn by `foldkit-mixins-form`'s renderers, so a custom kind such as `Cents` works unchanged |
| Canvas | the production Renderer inside a frame at the chosen viewport width, with a selection overlay |
| Focus | `FocusScope` in the inspector and palette, returning focus to the node on close |

The inspector reuses Form's control vocabulary without becoming a Form. It
resolves an `Input` control per prop the way `Form.make` does: `Block.inputs`
first, then metadata, then the schema's shape, and a throw naming the prop when
none applies. Each change becomes a `setProp`.

The Builder is placed through `Bundle.lazy`, so the editor's code loads only for
authors. A visitor's page never includes it.

## 13. The canvas

The canvas renders the real Renderer and learns geometry through Mounts, not a
second renderer:

- In edit mode, each node's root element carries
  `data-composition-node="<id>"`. That is the only change edit mode makes to a
  Block's output.
- One Mount on the canvas reports hover by walking
  `closest('[data-composition-node]')`, and measures the selected node and the
  current drop candidates with `getBoundingClientRect`, answering with a
  Message. Geometry is transient and never stored in the Document.
- A Block whose view has no single root element gets a `display: contents`
  wrapper in edit mode only, so hit testing always has an element.
- **Rich text on the canvas.** Double-clicking a Text node sets `editingText`
  and places `foldkit-richtext-dom`'s editor Bundle on that node's host, with
  the Text Block's rendering registry through `editorAt(hostId, rendering)`.
  Leaving the node commits one `setProp` of the body. Exactly one rich-text
  editor is live at a time, so no per-node editor state exists.

## 14. Serving a published page

A visitor's page is ordinary Foldkit rendered through `foldkit-ssr`, and a
composed page is its best case:

- **Static Blocks render inside `SSR.static`.** A region no Message changes
  renders once on the server, with the inert builder, and the browser adopts its
  markup without the data it came from. So for a page of static Blocks, **the
  Document is not sent to the browser at all**, only the markup.
- **Interactive Blocks** (§15, §19) are the part the browser owns. They are in
  the resume plan like any other feature, and the plan check still verifies what
  the browser reads.
- **Code for interactive Blocks** loads through `Bundle.lazy`, listed in the
  SSR configuration's `lazy`, so a Catalog of fifty Blocks does not put fifty
  views in the boot chunk.
- **Preview is the application's own route,** fed by the CMS preview overlay
  (`Cms.content`'s `preview`), so an author sees what a visitor will.

## 15. Data: Blocks name queries, Documents do not

`foldkit-entity` now has `Expr` and `Query`, and `foldkit-remote` has
`Query.define`, whose body a server compiles. Composition consumes them in code
and never persists one. A Document holds a Block's props; the **Block** says how
its props become a query's input.

```ts
const ProductGrid = Block.fromQuery(ProductsByCategory, {
  Props: Schema.Struct({ category: CategoryId, columns: Schema.Literals([2, 3, 4]) }),
  input: props => ({ category: props.category }),
  selection: ProductCard, // an Entity.select
  provides: [Content.Data],
})
```

- The author chooses a category; the author never writes a query. Dropping a
  grid on a page never means reading every product.
- The read goes through Remote like any other: cached, normalized, authorized on
  the server, and carried to the browser by `Remote.resume` under SSR.
- **Surface-backed Blocks** do the same for a whole feature:
  `Block.fromSurface(CartSummary, { Props, params: props => ({ … }) })`.
  Surfaces already take `params`, so the Block chooses where the feature appears
  and with which params, and the Surface still owns what it reads and which
  Messages it may cause.
- The first draft's `Value<A>` (literal, binding, computed) is dropped. A prop
  is a literal; a binding is a Block written in code. Nothing executable and
  nothing query-like is left in stored data.
- **Repetition,** a template per row, is a Query-backed Block whose Renderer
  maps rows. A Document-level `Repeat` waits for a case a Block cannot express.

## 16. Conditions

`when` hides a node unless a condition over the page's **context** holds.
Context is a Schema the Catalog declares, and the application supplies its
values, such as audience, locale, a feature flag or a date.

```ts
const Site = Catalog.make({
  blocks,
  roots: [Content.Section],
  context: Schema.Struct({
    audience: Schema.Literals(['guest', 'member']),
    locale: Schema.String,
  }),
})
```

A Condition is a small data IR rather than `foldkit-entity`'s `Expr` itself,
because an `Expr`'s inputs carry Schemas and are built in code, while a
Condition is stored. It follows `Expr`'s semantics deliberately:

- the operations are `eq`, `isNull`, `isNotNull` and `contains`, which is
  case-insensitive and ASCII-folded, as `Expr.contains` defines it;
- a list is a conjunction, and there is no `not` and no branch;
- a key the context does not declare, or a value of the wrong type, is a
  diagnostic when validated (`composition:unknown-context`), not a node that
  silently never shows.

**Viewport is not a Condition.** The server cannot know the viewport, so a node
hidden on narrow screens is an appearance (§18), compiled to a
`Style.responsive` rule. The SSR markup and the browser's then agree.

**`when` is presentation, not authorization.** A member-only section hidden from
guests is still in the Document a guest could fetch. Content a guest must not
receive belongs behind the CMS audience boundary or a server-authorized read,
and the docs say so where `when` is introduced.

## 17. Migrations and unknown Blocks

Migrations follow `RichText.migrate`, and are enforced the same way:

```ts
Composition.migrate(document, [
  Composition.renameBlock('OldHero', 'Hero'),
  Composition.migration('AlignmentToAlign', 'Hero', node =>
    'alignment' in node.props
      ? { ...node, props: renameKey(node.props, 'alignment', 'align') }
      : undefined,
  ),
  Composition.promoteUnknown('LegacyEmbed', 'Embed', EmbedProps),
])
// → { document, applied: [{ name, node }], unused: ['…'] }
```

- **Named and chained.** The list order is the chain; a later migration sees
  what an earlier one produced.
- **Run at a boundary the application chooses,** such as load, publish or an
  explicit upgrade, and never on every read.
- **Identity survives.** A migration that changes an id, or introduces one
  already present, throws.
- **The result is still content.** It is decoded and validated after each
  changed pass.
- **Declining is allowed.** Returning `undefined` keeps the node, which is what
  `promoteUnknown` does when legacy props do not decode.

**An unknown Block** is a node whose name the Catalog lacks. It loads,
round-trips unchanged through every Operation that does not touch it, renders a
placeholder, is labeled in the Layers panel ("This Block is not in this version
of the application"), can be moved or removed, and blocks publishing through the
strict schema. It is never dropped.

## 18. Appearance

Visual builders expose spacing, color, type and alignment. Foldkit already has a
typed system for all of it, so the Document stores **choices within that
system**, not CSS:

- **Recipe axes.** A Block's author declares its author-styleable Slots as a
  `Style.recipeFor(Slots)` recipe whose variant axes are the choices, such as
  `{ tone: 'accent', space: 'roomy' }`. The Document stores the selection, a
  record of literals, and the inspector draws each axis as a `Select`.
- **Tokens.** Where an axis would have one variant per token, the choice is a
  token name checked against the theme, such as `{ gap: 'space.m' }`, resolved
  through `Theme.ref(theme)`. A missing token is `composition:unknown-token`,
  not a broken `var()`.
- **Responsive choices** are keyed by the theme's breakpoint names and compile to
  `Style.responsive`, which is also how viewport visibility works.

```ts
const t = Theme.ref(theme)

const HeroLook = Appearance.forBlock(Hero, HeroSlots, Style.recipeFor(HeroSlots)({
  base: { root: Style.class('hero') },
  variants: {
    tone: { plain: {}, accent: { root: Style.inline({ background: t.accent.base }) } },
    space: {
      snug: { root: Style.inline({ paddingBlock: t.space.s }) },
      roomy: { root: Style.inline({ paddingBlock: t.space.xl }) },
    },
  },
  defaults: { tone: 'plain', space: 'snug' },
}))
```

The Renderer compiles a node's stored selection with that recipe and attaches it
through `Style.forSlots`, in the `app` layer of `Layers.standard`. Every Mixins
guarantee holds: hidden Slots stay unreachable, a property a Behavior owns
conflicts with an author's choice (`mixins:style-property-conflict`) rather than
silently losing, and tokens stay typed. Arbitrary CSS, selectors, class names and
`!important` are not in the Document. An application that wants an escape hatch
writes a Block for it, visibly outside the typed path.

**Layout Blocks are Mixins layouts.** A `Columns` Block's view is
`Layout.switcher` or `Layout.sidebar`, and its axes are that layout's
parameters.

## 19. Stateful Blocks

Most Blocks are pure rendering. A Block that truly has state, such as a carousel,
an accordion or a configurator, is backed by an ordinary Bundle:

```ts
const Carousel = Block.fromBundle(CarouselBundle, {
  Props: CarouselProps,
  args: props => ({ interval: props.interval }),
})
```

The page's parent places those Bundles with `Bundle.withEach`, keyed by NodeId,
for the stateful nodes `Composition.statefulNodes(Site, document)` lists. Each
instance is an ordinary child Model in the application's Model. There is no
`nodeState: Record<NodeId, unknown>` anywhere. The constraint that `withEach`
refuses Managed Resources applies, and each such Block documents it.

## 20. Actions

A Button must eventually do something. The rule from `foldkit-agent` holds: a
capability ends in an existing Message.

The shared shape is extracted now, because Composition is its second consumer,
and it goes into `foldkit-surface`, which already owns what a consumer may cause:

```ts
const AddToCart = Action.define({
  name: 'addToCart',
  description: 'Add a product to the cart',
  Input: Schema.Struct({ productId: ProductId }),
  toMessage: input => Message.AddedToCart(input),
})
```

`Agent.variant` is re-expressed over it without changing its public API. A
Catalog lists the actions its Documents may reference, and a node stores only
`{ action: 'addToCart', input: { productId: '…' } }`, as literals. The Renderer
dispatches `toMessage(input)` through the Block's handler. A name the Catalog
lacks is `composition:unknown-action`. No stored value executes, and `update`
stays the only place a Message has effects.

## 21. Patterns, Composite Blocks, templates

- **A Pattern** is a stored subtree inserted by copy (`insertTree`, re-keyed).
  After insertion its nodes are independent.
- **A Composite Block** is a Document exposed as a Block, with some inner props
  surfaced as its own. It is how content is shared between pages, and why §6
  never needs a second parent. It is deferred until after Phase 7.
- **A template** is a function returning a Document. Creating from one copies it.

## 22. Security

A Document is untrusted input, possibly written by a less-trusted author or an
agent. The invariants:

- Block implementations come from deployed code. A Document names Blocks; it
  never carries code, JSX, HTML or selectors.
- Props decode through the Block's schema before any Renderer sees them.
- **URLs are a type, not a string.** `Composition.Url` accepts `https:`, `http:`,
  `mailto:`, `tel:` and relative URLs, and refuses `javascript:`, `data:` and
  `vbscript:` after the whitespace and case folding browsers apply. The Image
  and Link Blocks use it, and so should rich text's Link mark renderer. Rich
  text's registry already refuses malformed tag and attribute names; this is the
  same class of rule for values.
- Actions reference only Catalog-listed actions, with schema-checked input.
- Data Blocks read only through Remote, which the server authorizes.
- `when` hides; it does not protect (§16).
- An agent's Operation passes through the same `apply` and `validate` as a
  human's, so a hallucinated Block, prop or position is a diagnostic it is
  shown, never a change.

## 23. Agents

`foldkit-agent` exposes the Builder's own Message, so an agent edits through the
same path a human does:

```ts
const PageAgent = AgentBuilder.make({
  context: PageOutline, // a Surface projecting Composition.describe(document)
  messages: AgentBuilder.expose(BuilderMessage, {
    Applied: Agent.variant({
      name: 'edit_page',
      description: 'Insert, move, remove or configure blocks on the page',
      input: Composition.operationSchema(Site), // Block names and props from the Catalog
      toMessage: op => ({ op }),
    }),
  }),
})
```

- `operationSchema(Site)` is generated from the Catalog, with Block names as
  literals and each Block's props schema, so the tool's own input schema already
  rejects an unknown Block before `apply` sees it.
- The agent mints its own ids (§8), and a taken id is refused.
- A Block's description for an agent is a `foldkit-metadata` annotation the
  application attaches; Composition core knows no annotation's meaning.
- The edit is undoable, autosaved and revisioned like any other.

## 24. Everything else, briefly

| Package | Role here |
| --- | --- |
| `foldkit-crud` | The page list is `Crud.list`; nothing about pages is special there |
| `foldkit-mirror` | The selected node and panel can mirror into the URL with `Mirror.url`, so a link opens the editor on a Block |
| `foldkit-sync` | Later. Operations are good Sync payloads because they carry intent. v1 keeps CMS conflict detection, which is single-author |
| `foldkit-durable` | Not involved. CMS revisions stay CMS revisions |
| `foldkit-react-codegen` | Later, as an interpreter: a Document and a Catalog of Foldkit views compiled to static React |
| `foldkit-metadata` | Palette category and icon, agent description and docs, as annotations owned by the package that reads them |

## 25. Budgets

"A deep page of 1,000 nodes" becomes numbers, measured by a benchmark in
`packages/composition/bench`, as `packages/richtext/bench` measures rich text.
They are targets for Phase 2 to confirm or revise, on the CI runner:

| On a 1,000-node Document | Target |
| --- | --- |
| `apply` of one `setProp` or `move` | under 1 ms, touching only the changed nodes |
| `validate` of the whole Document | under 10 ms |
| `Composition.index` | under 5 ms, computed once per Document value |
| Re-rendering the Layers tree after one edit | only the changed rows, by `createKeyedLazy` per node |
| An undo snapshot | proportional to the changed nodes, not to the page |

A result that misses a target is recorded here with its number, as rich text's
R9 remainder is, rather than silently accepted.

> **Measured (Phase 2),** means on the development machine: `apply` of a
> `setProp` 0.40 ms and of a `move` 0.39 ms, `validate` 1.14 ms, `index` of an
> unseen Document 0.09 ms. All within budget. `apply` shares every node it does
> not change but copies the record of nodes once per Operation, which is most
> of its cost; if pages grow past what that allows, a persistent map is the
> next step. The Layers row is Phase 7's to measure.

## 26. Packages

```text
packages/
  composition/        pure: Block, Region, Content, Catalog, Document, Operations,
                      apply, validate, index, migrate, Condition, Url, describe
    ./foldkit         subpath: Renderer and Appearance compilation
                      (optional peers foldkit and foldkit-mixins)
    ./richtext        subpath: the Text Block and nested validation
                      (optional peer foldkit-richtext)
  builder/            the headless Builder Bundle and its Input.bundle control
  mixins-builder/     the Builder's views, every element a Slot
```

`foldkit-composition` depends on `effect` and `foldkit-metadata` only.
`foldkit-builder` depends on `foldkit-composition`, `foldkit-bundle` and
`foldkit-form`. `foldkit-mixins-builder` adds `foldkit-mixins`,
`foldkit-mixins-form` and `foldkit-primitives`.

Not created: `page`, `page-builder-runtime`, `builder-cms`, `builder-remote`,
`builder-storage`. An integration starts as a small adapter in its closest
consumer and becomes a package only when a real boundary appears.

## 27. Rejected

- **A page builder as its own state framework.** A `createPageBuilder({ state,
  actions, dataSources, components, routes, persistence })` is the parallel
  architecture this repository exists to avoid.
- **Storing JSX, HTML, virtual DOM or functions.** Stored data must re-render,
  restyle, migrate, validate and be edited by an agent.
- **Nested JSON as the canonical form.** It may be an export format; canonical
  storage is normalized for identity and cheap edits.
- **One schema for storage and validity.** It makes unknown content unreadable
  (§6).
- **The Builder outside Form, bridged by whole-Document `Changed` Messages**
  (§11).
- **Inverse-Operation undo** (§9).
- **Stored bindings and expressions.** Code names data; data names choices
  (§15, §16).
- **Arbitrary CSS as the appearance model** (§18).
- **A Block implies interactivity.** State is opt-in through a Bundle (§19).
- **Builder-specific actions or fetches.** Actions end in Messages (§20); data
  goes through Remote (§15).

## 28. Phases

Each phase ends with its tests green, mutation-checked, its docs written to the
repository's standard, and the skill reference updated if it adds public API.

**Phase 0: `Input.bundle` in `foldkit-form`. Done.** Shared with the rich-text design's
§44 and built once for both. Acceptance: the `examples/form` color picker and a
small structured control each work as a Form key, with fill, reset, partial,
submit, resume through `settled`, `authoredChanged`, validation on
`value`, and the control's own Messages, Commands and Subscriptions routed. CMS
autosaves the color key without knowing its Messages. Nothing in the primitive
mentions pages.

**Phase 1: the core. Done.** Block, Region, Content, Catalog, the tolerant codec,
`valid`, `validate` with every diagnostic in §6, `index` and `describe`.
Documents are built by hand in tests.

> **As built.** The diagnostics that belong to later phases (`unsafe-url`,
> `unknown-action`, `unknown-context`, `unknown-token`, `nested`) arrive with
> them. Props decode strictly, so a stale prop is `invalid-props`. `Block.inputs`
> moves out of the core: inspector hints are the Builder's, attached through
> `Block.annotate` as `foldkit-metadata`, since the core knows no annotation's
> meaning.

**Phase 2: Operations and history. Done.** Every Operation in §7, `apply`, the id rules
of §8, `rekey`, History (§9), and the benchmark (§25).

> **As built.** `apply` returns an Effect `Result` of `{ document, changed, removed }`
> or a refusal `{ code, message }`. Setting a prop of a Block the Catalog does not
> know is refused, since nothing can check it; moving or removing it is not.
> `Composition.newIds` mints ids as an Effect for the Builder's Command, and
> `takeTree` and `rekey` carry a copy and paste.

**Phase 3: migrations and unknown Blocks. Done.** `migrate`, `renameBlock`, `migration`
and `promoteUnknown` with the enforced rules, and a restored old revision proving
an unknown Block survives.

> **As built.** A migration is given the node, not its id, so identity cannot
> change; the structure is checked after each migration that rewrote something,
> and only faults it introduced throw. `renameProp` joins the helpers. An
> unknown Block can be reordered within the Region or roots it is in and
> removed; moving it elsewhere is refused, since nothing can say the new place
> accepts it.

**Phase 4: the Foldkit renderer.** Hero, Section, Text, Image, Button and Columns
through ordinary views; `Composition.Url`; placeholders; and a published route
through `foldkit-ssr` with static Blocks in `SSR.static`, proving the Document
is not in the page's resume envelope.

**Phase 5: the headless Builder as the `document` control.** A crude view (add a
Hero, select, move up and down, edit props, undo) is enough. It proves a
Document is edited entirely through the control's Messages, and that a fill
clears history.

**Phase 6: the CMS proof, in `examples/cms`.** Create a page, add Blocks,
autosave, reload, resume the draft, preview through the application route,
publish, see it as a visitor, edit again, find the revision, restore it, schedule
it, and meet a conflicting author. The Builder adds no CMS state.

**Phase 7: `foldkit-mixins-builder`.** Canvas, Layers, palette, inspector, drag
and drop, keyboard reorder with announcements, viewport frames, and rich-text
editing on the canvas, with `A11y.validate` run for each Slot contract.

**Phase 8: appearance.** Recipe axes, token choices, responsive choices, and a
test that a property a Behavior owns conflicts with an author's choice.

**Phase 9: data and state.** One Query-backed Block, one Surface-backed Block and
one Bundle-backed Block on one page, served by SSR with the data Block in the
resume plan.

**Phase 10: actions and agents.** `Action` in `foldkit-surface`, with
`Agent.variant` re-expressed over it; the Catalog's actions; the `edit_page`
tool. "Add a hero above the feature grid" produces one valid `insert`, and an
agent's Block outside the Catalog is refused by the tool's own schema.

**Later, on a concrete need:** Composite Blocks, a Document-level `Repeat`, Sync
of Operations, and React codegen export.

## 29. Tests that must exist before the model is called stable

```text
nested Columns three deep                   a move into an incompatible Region, refused
an empty Region and a required one          a move that would create a cycle, refused
a duplicated subtree, with its id map       a duplicate whose map misses a node, refused
a removed subtree                           an insert with a taken id, refused
malformed input: a cycle, an orphan, a second parent, one id in two Regions
an unknown Block that loads, moves, round-trips and blocks publishing
a prop schema evolved by a migration        a migration that changes an id, thrown
a renamed Block                             an old revision restored with a removed Block
1,000 nodes within §25's budgets            undo after a move, and undo cleared by a fill
preview of a partially edited page          a publish refused by the strict schema
javascript: in an Image src, refused        a when over an undeclared context key, reported
an agent Operation refused by a Region      a Surface Block beside a static one
a React Block beside a Foldkit Block        a static page whose envelope has no Document
```

## 30. Open questions

Each is answered by building, not by debate, and none changes the ownership model.

- When a Block wants a Region's `max` to be configurable, does it belong in the
  Region or in the Block's props as a refinement?
- For a large page, should `Composition.describe` give an agent every node's
  props, or an outline plus reading a node on demand?
- When `Action` moves into `foldkit-surface`, does `MessageSet` become a set of
  Actions, or stay separate?
