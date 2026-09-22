# Foldkit Plus Composition & Page Builder

**Status:** Proposed architecture
**Target:** `doeixd/foldkit-plus`
**Primary new packages:** `foldkit-composition`, `foldkit-builder`
**Primary integrations:** `foldkit-form`, `foldkit-cms`, `foldkit-bundle`, `foldkit-surface`, `foldkit-mixins`, `foldkit-remote`, `foldkit-agent`
**Goal:** Provide a native, typed, inspectable, extensible composition system capable of powering Builder.io-style visual page authoring without creating a second state system, component framework, CMS lifecycle, data layer, or action runtime.

---

# 1. Executive decision

Foldkit Plus should introduce a general **Composition** abstraction and build the visual **Builder** as one editor for it.

The architecture should be:

```text
                       application code

                ┌────────────────────────┐
                │      Catalog           │
                │                        │
                │ Blocks                 │
                │ Regions                │
                │ metadata               │
                └────────────┬───────────┘
                             │
                             ▼
                ┌────────────────────────┐
                │   Composition.Document │
                │                        │
                │ persistent page data   │
                └────────────┬───────────┘
                             │
             ┌───────────────┼────────────────┐
             │               │                │
             ▼               ▼                ▼
        renderer        visual Builder       tooling
                                              AI
                                           migrations
                                              diff
                                              tests


For authored CMS content:

Entity field
    │
    ▼
Form control
    │
    ▼
Composition.Document
    │
    ▼
foldkit-builder
    │ edits through Form Messages
    ▼
Cms.editor
    │
    ├── autosave
    ├── drafts
    ├── revisions
    ├── conflicts
    ├── scheduling
    ├── publish
    └── preview
```

The central rule is:

> **Composition defines what a page is. Builder defines one way to edit it. Foldkit's existing packages continue to own state, persistence, authoring, rendering, effects, and application behavior.**

This means the page builder does **not** introduce:

```text
PageBuilderStore
PageBuilderDraft
PageBuilderRevision
PageBuilderMutation
PageBuilderRouter
PageBuilderDataSource
PageBuilderActionRuntime
PageBuilderComponentFramework
```

Those concerns already have owners.

---

# 2. The core architectural split

The system should distinguish five different things.

```text
Block
    What kind of compositional element may exist?

Document
    Which Blocks exist here, with which props and children?

Renderer
    How does a Block become actual UI?

Editor
    How may a human manipulate a Document?

Authoring lifecycle
    How is that Document saved, previewed, revised and published?
```

Foldkit Plus already has good owners for the latter concerns.

Therefore:

```text
foldkit-composition
    Block
    Region
    Catalog
    Document
    Node
    Value
    Binding
    Operation
    validation
    inspection

foldkit-builder
    canvas
    selection
    drag/drop
    layers
    inspector
    viewport
    undo/redo UI
```

while:

```text
foldkit-form
    owns the editable field draft

foldkit-cms
    owns saved drafts, revisions and publishing

foldkit-bundle
    owns reusable editor state machines

foldkit-surface
    owns feature observation boundaries

foldkit-mixins
    owns view customization

foldkit-remote
    owns server data and preview overlays

foldkit-agent
    owns external typed capabilities that become Messages
```

---

# 3. Why this belongs below “page builder”

The new primitive should not be named after pages.

A page is only one use of structured composition.

The same model could eventually describe:

```text
landing pages
CMS articles with structured sections
email layouts
dashboards
reports
documentation pages
product detail layouts
forms composed from reusable sections
AI-generated interfaces
presentation-like documents
embedded marketing sections
```

Therefore the reusable substrate should be:

```text
foldkit-composition
```

and the Builder should merely edit Composition documents.

This follows the existing Foldkit Plus pattern:

```text
Entity      describes domain structure
Form        describes editing
Crud        composes operations
Cms         adds publishing semantics

Composition describes structural UI/content composition
Builder     adds visual editing
```

---

# 4. `foldkit-composition`

`foldkit-composition` should be a pure package.

It should depend on as little as possible:

```text
effect
foldkit-metadata
```

It should not depend on:

```text
foldkit
foldkit-form
foldkit-cms
foldkit-remote
foldkit-surface
foldkit-bundle
DOM
React
Drizzle
```

Suggested public concepts:

```ts
Composition
Catalog
Block
Region
Content
Document
Node
NodeId
Value
Binding
Expr
Operation
Diagnostic
```

Its values should be:

```text
immutable
typed
inspectable
serializable where persistent
deterministically describable
renderer independent
```

---

# 5. Block

A `Block` is the semantic definition of one composable thing.

For example:

```ts
const Hero = Block.define("Hero", {
  Props: Schema.Struct({
    eyebrow: Schema.String,
    title: Schema.String,
    align: Schema.Literals(["left", "center"]),
  }),

  regions: {
    actions: Region.many({
      accepts: Content.Interactive,
    }),
  },
})
```

This says nothing yet about HTML or Foldkit.

It says:

```text
There is a kind of thing called Hero.

A Hero has:
    eyebrow
    title
    align

A Hero has one structural insertion point:
    actions

That insertion point accepts interactive content.
```

The same Block may later be interpreted by:

```text
a Foldkit renderer
a React renderer
an editor inspector
an AI generation catalog
a static analyzer
a documentation generator
```

---

# 6. Blocks are adapters, not a second component system

A Block must not become another view abstraction.

Existing Foldkit views remain views.

A Block associates composition semantics with an existing implementation.

Conceptually:

```ts
const HeroBlock = Hero.pipe(
  Block.view(HeroView),
)
```

or through a renderer registry:

```ts
Renderer.register(Hero, HeroView)
```

The exact API can be decided experimentally.

The dependency direction matters more:

```text
Block
  semantic composition contract

        interpreted by

Foldkit View
React component
static renderer
email renderer
etc.
```

Do not put actual component functions into persisted Documents.

A Document stores:

```text
block identity
props
regions
optional semantic expressions
```

not executable component implementations.

---

# 7. Props use Effect Schema

A Block's props are defined by Effect Schema.

Example:

```ts
const Image = Block.define("Image", {
  Props: Schema.Struct({
    src: Schema.String,
    alt: Schema.String,
    width: Schema.optional(Schema.Number),
    fit: Schema.Literals(["cover", "contain"]),
  }),
})
```

This gives the system one validation truth.

The same Schema can drive:

```text
document decoding
editor inputs
AI tool schemas
migration checking
runtime validation
documentation
JSON Schema output
```

Do not introduce another property type system.

The same rule used by Entity applies here:

```text
Schema
    validity

metadata
    meaning and editing hints
```

---

# 8. Regions

A `Region` is a structural insertion point.

Example:

```ts
const Columns = Block.define("Columns", {
  Props: Schema.Struct({
    ratio: Schema.Literals([
      "1:1",
      "1:2",
      "2:1",
    ]),
  }),

  regions: {
    left: Region.many({
      accepts: Content.Flow,
    }),

    right: Region.many({
      accepts: Content.Flow,
    }),
  },
})
```

Regions answer:

> Which Blocks may be structurally inserted here?

They should support at least:

```ts
Region.one(...)
Region.many(...)
```

Potential options:

```ts
Region.one({
  accepts,
  optional: true,
})

Region.many({
  accepts,
  min: 0,
  max: 6,
})
```

---

# 9. Regions are not Mixins Slots

This distinction must remain explicit.

A Mixins Slot is:

> A rendered extension point where Style or Behavior may attach.

A Composition Region is:

> A persistent structural position where another Block may be placed.

Example:

```text
Hero

Composition Regions:
    actions

Mixins Slots:
    root
    eyebrow
    title
    actionsContainer
```

The renderer might choose to render:

```text
Region actions
    inside
Mixin Slot actionsContainer
```

but those are separate contracts.

This preserves the meaning of the current Mixins architecture and prevents the page builder from turning DOM extension points into content-model structure.

---

# 10. Content capabilities

Regions should not rely only on explicit block allowlists.

A small semantic capability system makes composition substantially more flexible.

For example:

```ts
const Heading = Block.define(...).pipe(
  Block.provides(Content.Flow),
)

const Button = Block.define(...).pipe(
  Block.provides(
    Content.Flow,
    Content.Interactive,
  ),
)

const Hero = Block.define(...).pipe(
  Block.provides(Content.Section),
)
```

Then:

```ts
Region.many({
  accepts: Content.Interactive,
})
```

allows future Button-like Blocks automatically.

Suggested initial vocabulary:

```text
Content.Root
Content.Section
Content.Flow
Content.Inline
Content.Interactive
Content.Media
Content.Form
Content.Data
```

This vocabulary should remain deliberately small.

Applications may define their own capabilities.

Do not conflate these with Mixins element capabilities.

```text
Content capability
    where may this Block be structurally inserted?

Mixin capability
    what kind of rendered element is this attachment point?
```

---

# 11. Catalog

A `Catalog` defines the composition vocabulary available in one context.

```ts
const Site = Catalog.make({
  blocks: [
    Hero,
    Columns,
    RichText,
    Image,
    Button,
    ProductGrid,
  ],
})
```

A Catalog should primarily answer:

```text
Which Blocks exist here?

Given a stable Block name/id:
    what is its descriptor?

Can this Block go into this Region?

What Schema describes its props?
```

The Catalog should not become another application registry.

Avoid:

```ts
Catalog.make({
  blocks,
  queries,
  routes,
  auth,
  database,
  mutations,
  navigation,
  forms,
  services,
})
```

That would recreate the Gen-style monolith the rest of Foldkit Plus deliberately avoided.

Additional concerns should attach through metadata or adapter packages.

---

# 12. Stable Block identity

Persisted Documents need stable identities.

A Block should have:

```ts
interface BlockIdentity<Name extends string> {
  readonly name: Name
  readonly token: symbol
}
```

At runtime, identity can preserve semantic equality across decorators.

Persisted representation uses the stable public name:

```text
"Hero"
```

The Catalog is the namespace in which that name resolves.

Applications should treat changing the persisted Block name as a content migration.

---

# 13. Document

The canonical persistent value should be a normalized `Document`.

Conceptually:

```ts
interface Document {
  readonly version: number
  readonly roots: ReadonlyArray<NodeId>
  readonly nodes: Readonly<Record<NodeId, Node>>
}
```

A Node:

```ts
interface Node {
  readonly id: NodeId
  readonly block: string

  readonly props: Readonly<
    Record<string, Value<unknown>>
  >

  readonly regions: Readonly<
    Record<string, ReadonlyArray<NodeId>>
  >

  readonly visibility?: Expr<boolean>
}
```

The exact encoded shape should be defined with Effect Schema.

---

# 14. Why normalized rather than recursively nested

Visually, a page may be:

```text
Page
 ├─ Hero
 │   └─ actions
 │      ├─ Button
 │      └─ Button
 │
 ├─ FeatureGrid
 │   └─ items
 │      ├─ Feature
 │      └─ Feature
 │
 └─ Footer
```

But persistence should be closer to:

```text
roots:
    hero-1
    grid-1
    footer-1

nodes:
    hero-1
    cta-1
    cta-2
    grid-1
    feature-1
    feature-2
    footer-1
```

This makes common editor operations much cleaner:

```text
move
insert
delete
duplicate
select
diff
patch
undo
redo
migrate
merge
AI edits
collaboration
```

It also means Node identity survives reordering.

---

# 15. Document validity

A Document is valid relative to a Catalog.

Validation should check at least:

```text
root ids exist
node ids are unique
all referenced nodes exist
no node has multiple structural parents unless explicitly supported
no structural cycle exists
block identity resolves
props decode against Block Props schema
every Region exists on the Block
region cardinality is satisfied
children satisfy Region capabilities
unknown props are handled according to migration/version policy
expressions type-check
```

API:

```ts
Composition.validate(Site, document)
```

should return structured diagnostics rather than booleans.

Example diagnostics:

```text
composition:unknown-block
composition:missing-node
composition:cycle
composition:unknown-region
composition:region-cardinality
composition:region-rejects-block
composition:invalid-prop
composition:unknown-prop
composition:binding-type-mismatch
composition:expression-type-mismatch
```

---

# 16. Documents should be schema-backed values

A Catalog should be able to produce or expose a Schema capable of validating its Documents.

Conceptually:

```ts
Site.Document
```

or:

```ts
Composition.schema(Site)
```

This is important because the Document can then simply be an Entity field:

```ts
const Page = Entity.define(
  "Page",
  Schema.Struct({
    id: PageId,
    title: Schema.String,
    slug: Schema.String,
    document: Composition.schema(Site),
  }),
)
```

This connection is central to the architecture.

---

# 17. Operations

Editing should happen through a small semantic operation algebra.

For example:

```ts
Composition.Op.insert(...)
Composition.Op.remove(...)
Composition.Op.move(...)
Composition.Op.duplicate(...)
Composition.Op.setProp(...)
Composition.Op.unsetProp(...)
Composition.Op.setVisibility(...)
```

Possibly:

```ts
Composition.Op.batch(...)
```

All operations should themselves be Schema-backed serializable data.

Example:

```ts
Composition.Op.setProp({
  node: "hero-1",
  prop: "title",
  value: Value.literal("Build what comes next"),
})
```

And:

```ts
Composition.apply(
  catalog,
  document,
  operation,
)
```

is pure.

---

# 18. Document is state; Operations are transitions

The system should not store the operation stream as the canonical page.

The relationship is:

```text
Document
   +
Operation
   ↓
Document
```

not:

```text
Operations
   ↓
page exists only by replay
```

That mirrors Foldkit itself:

```text
Model
   +
Message
   ↓
Model
```

The Model is still the state.

This gives the best of both:

```text
simple persistence
simple reads
semantic editing operations
possible undo history
possible Sync later
possible AI tools
```

without turning the CMS into an event-sourced page store.

---

# 19. Undo and redo

The Builder may keep local undo history as editor state.

For initial implementation:

```text
past Documents or inverse Operations
current Document is still Form-owned
```

The Builder's undo system must not become the authority over the Document.

Possible model:

```ts
interface BuilderModel {
  readonly selected: NodeId | null
  readonly hovered: NodeId | null
  readonly viewport: Viewport
  readonly panel: Panel
  readonly drag: DragState | null

  readonly undo: ReadonlyArray<Operation>
  readonly redo: ReadonlyArray<Operation>
}
```

or store inverse Operations.

The Builder still emits:

```text
ApplyOperation(op)
```

to its parent.

---

# 20. `Value<A>`

Initially, Block props may simply be literal values.

But the persistent model should leave room for props that derive from something else.

A minimal architecture:

```ts
type Value<A> =
  | Literal<A>
  | Binding<A>
  | Computed<A>
```

Initial release may support only:

```ts
Value.literal(...)
```

while reserving the semantic boundary.

That is preferable to storing arbitrary JavaScript.

---

# 21. No persisted arbitrary code

Do not allow:

```ts
{
  value: "product.price * 0.8"
}
```

or:

```ts
{
  onClick: "fetch('/admin/delete')"
}
```

or persisted arbitrary JS functions.

Persistent composition should remain:

```text
data
typed references
small expression IR
declared capabilities
```

This enables:

```text
inspection
validation
security review
migration
AI generation
alternative rendering
SSR
static analysis
```

---

# 22. Expressions

A tiny expression layer may eventually support:

```text
literal
binding
boolean operators
comparison
conditional
registered pure computation
```

For example:

```ts
Expr.eq(...)
Expr.and(...)
Expr.when(...)
```

Do not build a general programming language.

The initial page builder does not need:

```text
loops
arbitrary lambdas
user-defined runtime code
general mutation
```

Structural repetition should be its own concept if and when needed.

---

# 23. Repetition

Dynamic list rendering is useful enough to deserve first-class semantics eventually.

Conceptually:

```ts
Repeat.make({
  source: ProductsQuery,
  key: Product.fields.id,
  template: ProductCardDocument,
})
```

or a Node-level structural construct.

But this should wait until the ongoing Query/Expr work has produced a stable source-neutral query abstraction.

Do not create:

```text
BuilderDataSource
BuilderQuery
BuilderFetch
```

in parallel with Foldkit's data architecture.

---

# 24. Data binding: wait for Query semantics

The existing design direction for Foldkit data distinguishes:

```text
Query
    which rows?

Selection
    which facts?

ReadContract
    how does a consumer require them?
```

Composition should eventually consume those concepts rather than invent its own data layer.

A future binding might look conceptually like:

```ts
Binding.from(CurrentProduct)
  .field(Product.fields.title)
```

But this should come after the general Query/Binding substrate exists.

Version 1 should focus on content composition, not become a second query framework.

---

# 25. Rendering

Composition rendering should be an interpreter.

Conceptually:

```ts
Composition.render({
  catalog: Site,
  document,
  renderer: FoldkitRenderer,
  context,
})
```

or:

```ts
FoldkitComposition.render(
  Site,
  document,
  h,
)
```

The exact packaging can be determined after a spike.

Important invariant:

> Production rendering and editor preview rendering must use the same Block implementations.

There should not be:

```text
HeroProduction
HeroBuilderPreview
```

unless an application explicitly supplies a preview substitute.

---

# 26. Foldkit Block renderer

A Foldkit adapter should bind Blocks to ordinary Foldkit views.

For example:

```ts
const Hero = Block.define(...)

const HeroRenderer = FoldkitBlock.render(
  Hero,
  (node, regions, h) =>
    HeroView(
      {
        ...node.props,
        actions: regions.actions,
      },
      h,
    ),
)
```

A renderer receives:

```text
decoded props
rendered Region children
composition context
HtmlBuilder
```

and returns ordinary `Html`.

No new reconciler.

No new component runtime.

---

# 27. Surface-backed Blocks

Some Blocks should represent actual application features.

For example:

```text
ProductGrid
ShoppingCartSummary
UserProfile
NewsletterSignup
SearchResults
```

These already exist as Foldkit features with explicit data requirements and Messages.

A future adapter can expose a Surface-backed feature as a Block:

```ts
Block.fromSurface(ProductGridSurface, {
  Props: ProductGridProps,
  params: props => ({
    category: props.category,
  }),
})
```

The Surface continues to own:

```text
what the feature observes
what Messages it may cause
```

The Composition Document only chooses:

```text
that the feature exists here
its configuration
```

This is one of the most important synergies.

The page builder can visually compose real application features without getting access to the entire root Model.

---

# 28. React-backed Blocks

`foldkit-react` makes third-party components practical.

A React component may be adapted into a Block renderer:

```ts
const MapIsland = ReactComponent.define(
  MapComponent,
  {
    events: ["onMarkerSelected"],
  },
)
```

and then:

```ts
const Map = Block.define("Map", {
  Props: MapProps,
}).pipe(
  Block.renderWith(
    ReactBlock.of(MapIsland),
  ),
)
```

The Composition model remains identical.

This is useful for complex authoring controls and application Blocks backed by existing React ecosystems.

---

# 29. Stateful Blocks

Stateful Blocks should not introduce:

```text
nodeState: Record<NodeId, unknown>
```

inside a secret Composition runtime.

The current `foldkit-bundle` provides the right eventual foundation.

Suppose:

```text
Carousel
Accordion
Configurator
InteractiveCalculator
```

truly need state.

They should be backed by ordinary Bundles.

Conceptually:

```ts
Block.fromBundle(Carousel, {
  Props: CarouselProps,
})
```

The application can then place instances through a keyed:

```text
Bundle.each
```

using:

```text
NodeId
```

as the key.

Conceptually:

```text
Composition nodes
      │
      ▼
stateful nodes by Block kind
      │
      ▼
Bundle collection keyed by NodeId
      │
      ▼
ordinary child Models in parent Model
```

The application remains the only state owner.

This feature should not be part of the initial implementation.

Static and Surface-backed Blocks should be proven first.

---

# 30. Form integration

This is the most important integration.

A composition document should be editable as an ordinary Form key.

Example:

```ts
const PageInput = Entity.input(
  Page,
  Schema.Struct({
    title: Page.fields.title.schema,
    slug: Page.fields.slug.schema,
    document: Page.fields.document.schema,
  }),
)
```

Then:

```ts
const PageForm = Form.make(
  "PageForm",
  PageInput,
  {
    inputs: {
      slug: Cms.slug("title"),
      document: Composition.input(Site),
    },
  },
)
```

The page builder is therefore an editor for:

```text
one Form control
```

not a replacement for Form.

---

# 31. Form needs structured custom drafts

The existing Form control primitive is excellent, but its draft shapes are currently optimized for:

```text
text
boolean
lists of ids
nested forms
```

Composition needs a structured draft.

The general solution should be broader than a special `Blocks` control.

Form should support an arbitrary Schema-backed Draft type.

Conceptually:

```ts
Input.kind("Composition", {
  Draft: Composition.Document,
  initial: Composition.empty(),
  toValue: draft => draft,
  fromValue: value => value,
})
```

or a lower-level primitive:

```ts
Input.structured("Composition", {
  Draft: Composition.Document,
  empty: () => Composition.empty(),
})
```

Existing controls can conceptually become specialized versions of the same idea:

```text
Text
    Draft = string

Toggle
    Draft = boolean

RelationMany
    Draft = string[]

Composition
    Draft = Document
```

The exact generic Form API needs a prototype because this affects the Form model and message schema.

---

# 32. A structured draft must still follow Form semantics

A Composition control should receive all the same guarantees as any other Form control:

```text
fill
reset
dirty editing
validation
partial
submit
saved Form Model
resume
whole-input validation
```

The Form continues to decide:

> Is the operation's input valid?

Composition decides:

> Is this Document structurally valid for this Catalog?

The Page's field Schema ties those together.

---

# 33. Builder integration with Form

The Builder should never own the authoritative Document.

Instead:

```text
Form
    owns Document draft

Builder
    owns editor-only state
```

Builder state may include:

```ts
interface BuilderModel {
  readonly selected: NodeId | null
  readonly hovered: NodeId | null

  readonly viewport:
    | "desktop"
    | "tablet"
    | "mobile"

  readonly panel:
    | "insert"
    | "layers"
    | "properties"
    | "data"

  readonly drag: DragState | null
}
```

The Document is passed as view input.

---

# 34. Builder as a Bundle

`foldkit-builder` should expose an ordinary Bundle.

Conceptually:

```ts
const PageBuilder = Builder.make(
  "PageBuilder",
  {
    catalog: Site,
  },
)
```

Its Bundle owns only editor interaction state.

Its OutMessages might include:

```ts
{
  _tag: "OperationRequested"
  operation: Composition.Operation
}
```

The parent maps that to a Form update.

This makes the Builder reusable outside CMS.

---

# 35. Form ↔ Builder bridge

A small integration package or helper can remove boilerplate.

Conceptually:

```ts
Builder.field({
  form: PageForm,
  key: "document",
  builder: PageBuilder,
})
```

or:

```ts
CompositionForm.bind(
  PageForm,
  "document",
  PageBuilder,
)
```

Its responsibility is tiny:

```text
read current Document from Form
      │
      ▼
render Builder
      │
      ▼
Builder emits Operation
      │
      ▼
Composition.apply
      │
      ▼
Form.Message.Changed
```

It should own no state itself.

---

# 36. CMS integration

Once Page is an Entity and the Page Form contains the composition field, existing CMS machinery should work unchanged.

Example:

```ts
const Pages = Cms.content(
  "pages",
  {
    entity: Page,

    form: PageForm,

    publish: {
      create: CreatePage,
      update: UpdatePage,
    },

    words: {
      one: "Page",
      many: "Pages",
    },

    preview: (value, id) => [
      {
        entity: "Page",
        id,
        values: value,
      },
    ],
  },
)
```

Then the page builder inherits:

```text
autosave
saved drafts
partial invalid drafts
conflict detection
revision history
restore
scheduling
publishing
unpublishing
archiving
audience boundaries
preview
```

No page-builder-specific implementation of those features is necessary.

---

# 37. Preview

The existing CMS preview design should remain the authoring preview.

When preview is active:

```text
Form partial value
      │
      ▼
Cms.content.preview
      │
      ▼
Remote overlay
      │
      ▼
application's normal page view
```

This means the preview is the actual application.

The page builder does not need its own parallel page renderer.

Editor-specific overlays such as:

```text
hover outlines
selection rectangles
drop indicators
node labels
```

may wrap the production renderer during authoring.

But the actual content rendering should remain the same.

---

# 38. Canvas/editor bridge

A visual editor often needs geometry information that ordinary rendering does not expose.

The Builder may therefore need a small editor bridge.

Conceptually:

```text
Production renderer
      │
      ├── renders Block output
      │
      └── in edit mode:
             marks root with NodeId
             reports geometry
             reports pointer hover
```

This should not alter Block semantics.

Potential low-level capabilities:

```text
node root marker
measure node
hit testing
drop zone geometry
scroll into view
```

Most of this can be implemented with Foldkit Mounts / browser primitives.

---

# 39. Builder UI

A Builder.io-style authoring interface can be composed from four major views:

```text
Insert palette

    available Blocks
    categories
    search


Canvas

    production rendering
    selection overlay
    drop targets


Layers

    Document topology
    reorder
    selection


Inspector

    selected Block props
    Region information
    eventually bindings / styles / events
```

These are ordinary Foldkit views over Builder state and the current Document.

---

# 40. Property inspector

Because every Block has a Props Schema, a generic inspector can derive simple editors.

It should use the same principle as Form:

```text
explicit metadata
    first

semantic/schema inference
    second

unknown complex value
    diagnostic / custom renderer
```

The system should not over-guess.

Eventually, Block prop metadata could reuse Form `Input` concepts.

For example:

```ts
Block.props({
  title: Input.text(),
  body: Input.multiline(),
})
```

or attach metadata to the Schema/Block prop descriptor.

Avoid embedding concrete React/Foldkit components.

---

# 41. Builder inspector and Form should share control vocabulary where useful

A Page Form edits the whole Page.

The Builder inspector edits one Block's props inside the Document.

Those are different ownership boundaries, but they need similar controls.

The preferred direction is to reuse:

```text
Input control descriptions
renderer registries
```

rather than duplicate:

```text
Form.TextInput
Builder.TextInput
```

A Block prop inspector may interpret the same `Input.Control` values without becoming a Form itself.

This is a good example of why `Input.kind` was correctly designed as renderer-neutral data.

---

# 42. Metadata

`foldkit-metadata` should be the extension mechanism for Blocks and Catalog entries.

Possible independent metadata packages can attach:

```text
palette category
palette icon
AI description
documentation
editor grouping
authoring visibility
design-system classification
analytics name
migration hints
SEO semantics
```

Example:

```ts
const Hero = HeroBase.pipe(
  Block.annotate(
    Palette.category("Marketing"),
  ),

  Block.annotate(
    Palette.icon("layout-template"),
  ),

  Block.annotate(
    Ai.describe(
      "Large introductory section with heading and call-to-action content",
    ),
  ),
)
```

Block core should know none of these meanings.

---

# 43. Appearance editing

Visual builders commonly expose:

```text
spacing
background
typography
alignment
border
radius
layout
```

Foldkit should not invent another CSS system for this.

The correct target is current Mixins `Style`.

A Block renderer can declare which existing Slots are author-styleable.

Conceptually:

```ts
Appearance.forBlock(Hero, HeroSlots, {
  root: Appearance.box(),
  title: Appearance.typography(),
  eyebrow: Appearance.typography(),
})
```

The persistent page stores renderer-neutral appearance values.

The Foldkit interpreter converts those values into:

```ts
Style.forSlots(...)
```

attachments.

This preserves existing Mixins guarantees:

```text
hidden slots remain inaccessible
protected style properties remain protected
theme tokens remain typed
event ownership remains unchanged
slot capabilities remain checked
```

---

# 44. Appearance should be constrained, not arbitrary CSS

A visual builder should not automatically expose every CSS property on every Block.

The component author declares the authoring surface.

Example:

```text
Hero.root
    background
    spacing

Hero.title
    typography
    alignment

Hero.actions
    gap
    alignment
```

Not:

```text
arbitrary selector
arbitrary CSS text
!important
DOM traversal
```

Applications may deliberately provide an escape hatch, but it should be visibly outside the typed path.

---

# 45. Events and actions

A page builder eventually needs:

```text
Button pressed
Form submitted
Card clicked
```

to cause application behavior.

Foldkit Plus already has a powerful rule:

> Capabilities should ultimately dispatch existing Messages.

`foldkit-agent` already represents roughly:

```text
description
input Schema
map input to Message
```

Composition should converge with that model rather than create a parallel action runtime.

A future shared abstraction may look like:

```ts
MessageCapability.define({
  name: "addToCart",
  description: "Add the selected product to the cart",
  Input: Schema.Struct({
    productId: ProductId,
  }),
  toMessage: input =>
    Message.AddedToCart(input),
})
```

Both:

```text
Agent
Composition event binding
command palette
automation
```

could use it.

Do not extract this until Composition becomes the second proven consumer.

---

# 46. Event bindings

A future Node may hold:

```ts
events: {
  press: {
    capability: "addToCart",
    input: {
      productId: Binding.from(...)
    }
  }
}
```

At runtime:

```text
Block event
     │
     ▼
MessageCapability
     │
     ▼
existing application Message
     │
     ▼
update
```

The page document never executes an arbitrary mutation.

---

# 47. AI generation

Composition should be exceptionally agent-friendly.

A Catalog can be transformed into an allowed vocabulary:

```text
Available Blocks

Hero
  props...
  regions...

Button
  props...

Columns
  props...
  regions...
```

The agent can then manipulate the page through the same Operations used by the human editor.

For example:

```text
insertBlock
moveBlock
removeBlock
setBlockProp
```

This is preferable to asking the model to rewrite raw JSON or JSX.

Flow:

```text
human drag
property inspector
keyboard command
AI agent
migration tool
        │
        ▼
Composition.Operation
        │
        ▼
Composition.apply
        │
        ▼
Form change
        │
        ▼
Cms.editor
```

One semantic path.

---

# 48. AI must be Catalog constrained

An agent should not be allowed to hallucinate:

```text
unknown Block names
unknown props
invalid child placement
arbitrary actions
arbitrary data sources
```

Agent tools should be generated or validated against the Catalog.

The Catalog is therefore both:

```text
editor vocabulary
AI safety boundary
```

without becoming the application itself.

---

# 49. Reusable compositions

A composition system should eventually support reusable groups.

Two useful concepts should remain distinct.

## Pattern

A Pattern is copied on insertion.

```text
"Pricing section"
    ↓
insert its nodes into this Document
```

After insertion, the nodes are independent.

## Composite Block

A reusable Composition exposed as a Block.

For example:

```ts
const Callout = Composite.define(
  "Callout",
  {
    Props: Schema.Struct({
      title: Schema.String,
      tone: Schema.Literals([
        "info",
        "warning",
      ]),
    }),

    document: CalloutDocument,
  },
)
```

A Composite Block may expose some inner values as props.

This yields a useful recursive property:

```text
code-defined Block
        and
composition-defined Block

both become Blocks to the parent
```

---

# 50. Templates

Templates should be ordinary values or functions that create Documents.

For example:

```ts
Template.make("LandingPage", () =>
  Composition.document(...)
)
```

Creating from a template copies a Document.

Templates do not require special runtime behavior.

---

# 51. Versioning and migrations

Documents are persistent data and need migration support.

The Document should carry:

```ts
version
```

The Catalog and/or Blocks may expose migrations.

Examples:

```text
Hero prop:
    "alignment"
        renamed to
    "align"

Gallery:
    removed "columns"
    replaced by layout mode

Block:
    "OldHero"
        migrated to
    "Hero"
```

A migration system should operate on plain Document data.

Conceptually:

```ts
Composition.migrate(
  catalog,
  document,
)
```

Migrations should be:

```text
deterministic
pure where possible
inspectable
versioned
testable
```

---

# 52. Unknown Blocks

A CMS must not destroy content merely because an application deployment no longer knows a Block.

Decoding policy should distinguish:

```text
invalid Document
unknown future/deprecated Block
```

The system may need an `UnknownNode` representation during migration/recovery.

The authoring UI can then say:

```text
This block type is not available in this version of the application.
```

rather than dropping it.

This deserves explicit design during persistence implementation.

---

# 53. Introspection

Every major descriptor should expose deterministic structural descriptions.

For example:

```ts
Block.inspect(Hero)
Catalog.inspect(Site)
Composition.inspect(document)
Composition.describe(document)
```

Useful output:

```text
block names
prop schemas
Regions
capabilities
metadata summaries
document topology
bindings
events
validation findings
```

This can feed:

```text
DevTools
docs
tests
agents
CI
migration tooling
architecture manifests
```

This aligns strongly with existing Surface/Module/Mixins introspection.

---

# 54. Security model

Persistent Composition is not trusted executable code.

The system should preserve these invariants:

```text
Block implementation comes from application code.

Document may only reference Blocks in the Catalog.

Props decode through Schema.

Children must satisfy declared Regions.

Actions may only reference explicitly exposed capabilities.

Bindings may only reference explicitly exposed sources.

No arbitrary persisted JavaScript executes.

Client visibility is never server authorization.

CMS audience rules remain server enforced.
```

This makes Composition suitable for content edited by less-trusted users or agents.

---

# 55. CMS Page example

A complete Page domain might look like:

```ts
const Page = Entity.define(
  "Page",
  Schema.Struct({
    id: PageId,

    title: Schema.String
      .check(Schema.isMinLength(1)),

    slug: Schema.String,

    document: Composition.schema(Site),

    publishedAt:
      Schema.NullOr(Schema.String),
  }),
).pipe(
  Cms.roles({
    label: "title",
    slug: "slug",
    published: "publishedAt",
  }),
)
```

Input:

```ts
const PageInput = Entity.input(
  Page,
  Schema.Struct({
    title: Page.fields.title.schema,
    slug: Page.fields.slug.schema,
    document: Page.fields.document.schema,
  }),
)
```

Form:

```ts
const PageForm = Form.make(
  "PageForm",
  PageInput,
  {
    inputs: {
      slug: Cms.slug("title"),

      document:
        Composition.input(Site),
    },
  },
)
```

CMS:

```ts
const Pages = Cms.content(
  "pages",
  {
    entity: Page,

    form: PageForm,

    publish: {
      create: CreatePage,
      update: UpdatePage,
    },

    words: {
      one: "Page",
      many: "Pages",
    },

    preview: (value, id) => [
      {
        entity: "Page",
        id,
        values: value,
      },
    ],
  },
)
```

Builder:

```ts
const PageBuilder = Builder.make(
  "PageBuilder",
  {
    catalog: Site,
  },
)
```

The Builder is attached to the `document` control.

Nothing else about the CMS lifecycle changes.

---

# 56. Relationship with Crud

A Page remains an ordinary Entity.

Therefore:

```text
Page list
    Crud.list

Page detail
    Crud.detail

Page metadata editor
    Form / Crud.editor if desired

Page authoring lifecycle
    Cms.editor

Page document editing
    Builder control inside the CMS editor
```

The visual page builder should not replace generic Crud.

---

# 57. Relationship with Bundle

Builder itself should be a Bundle.

Stateful Block instances may later compile to Bundle collections.

These are different uses.

```text
Builder Bundle
    owns editor chrome state

Block Bundle
    owns runtime state of one compositional feature
```

Both remain ordinary Bundle placements and therefore participate in the same ownership checks.

---

# 58. Relationship with Surface

Surface remains the feature/read boundary.

Composition should not become a replacement.

A Surface-backed Block adapts:

```text
static composition placement
        │
        ▼
Surface params
        │
        ▼
normal Surface observation / Messages
```

The Block chooses where the feature appears.

The Surface continues to define what it may observe and cause.

---

# 59. Relationship with Remote

Composition core knows nothing about Remote.

Remote may appear in three places:

```text
CMS published Page Entity
CMS draft preview overlay
Surface-backed Blocks requiring server data
```

All through existing APIs.

No `CompositionRemoteStore` should exist.

---

# 60. Relationship with Sync

Initial page authoring should continue using current CMS conflict semantics.

Two authors editing one page simultaneously is a different product.

Later, Composition Operations are promising Sync payloads:

```text
MoveNode
SetProp
InsertNode
DeleteNode
```

because they express author intent more cleanly than replacing an entire Document.

But simultaneous editing should be designed when there is a concrete requirement.

Do not make CRDT concerns distort v1.

---

# 61. Relationship with Durable

CMS revisions should remain CMS revisions.

Composition Operations should not automatically become a Durable journal.

Durable may eventually record composition actions for an application that wants:

```text
audit history
workflow replay
event-sourced collaboration
```

but the core Composition Document must not depend on Durable.

---

# 62. Relationship with React codegen

Composition does not need React codegen to work.

A Block rendered through ordinary Foldkit views may separately be eligible for `foldkit-react-codegen`.

That provides an interesting future target:

```text
Composition Document
    +
Catalog of Foldkit views
    ↓
static React output
```

but this should remain an interpreter/tooling feature, not core design.

---

# 63. Suggested package layout

Initial:

```text
packages/
  composition/
  builder/
```

Potential integration package if needed:

```text
  composition-form/
```

Avoid introducing:

```text
page/
page-builder-runtime/
builder-cms/
builder-remote/
builder-storage/
```

until a real package boundary appears.

Most integrations should initially be tiny adapters inside the closest consumer.

---

# 64. `foldkit-composition` responsibilities

It should own:

```text
Block
Region
Content capabilities
Catalog
Node
Document
Value
Operation
pure apply
pure validation
schema generation
inspection
diff
migration primitives
```

It should not own:

```text
editor state
form state
saving
publishing
network requests
DOM geometry
drag and drop
routing
authentication
database
application state
```

---

# 65. `foldkit-builder` responsibilities

It should own:

```text
selected node
hovered node
viewport
open editor panel
drag state
drop targeting
layers UI
insert palette UI
property inspector UI
local undo/redo interaction
canvas editor chrome
```

It should not own:

```text
Document authority
CMS drafts
CMS revisions
publish state
application Remote data
authorization
Block runtime state
```

---

# 66. Rejected: page builder as its own state framework

Reject:

```ts
createPageBuilder({
  state: ...,
  actions: ...,
  dataSources: ...,
  components: ...,
  routes: ...,
  persistence: ...,
})
```

That would reproduce the exact kind of parallel application architecture Foldkit Plus has worked to avoid.

---

# 67. Rejected: storing JSX or HTML

Do not store:

```text
JSX source
rendered HTML
serialized virtual DOM
component functions
```

Store semantic composition values.

A stored Document can then be:

```text
re-rendered
restyled
migrated
validated
AI-edited
rendered differently
```

---

# 68. Rejected: recursively nested canonical JSON

A recursive export format may be convenient for interoperability.

It should not be canonical internal structure.

Normalized identity makes editor operations and tooling substantially simpler.

---

# 69. Rejected: arbitrary CSS as core appearance model

Do not make the system's default authoring API:

```text
className
style string
CSS selector
```

Appearance should target explicitly exposed Mixins Slots and semantic property groups.

---

# 70. Rejected: automatic access to application data

Dropping a ProductGrid onto a page should not magically mean:

```sql
SELECT * FROM products
```

A Surface-backed or later Query-backed Block must explicitly state how its configuration becomes existing application requirements.

---

# 71. Rejected: Block implies interactivity

A Block is not automatically a stateful component.

Most Blocks should remain pure structural rendering.

State is opt-in through existing Foldkit constructs.

---

# 72. Rejected: Builder-specific action implementation

Do not implement:

```ts
Builder.action("deleteSomething", async () => ...)
```

Application effects continue to follow:

```text
Message
  ↓
update
  ↓
Command
```

The Builder eventually binds events to existing Message capabilities.

---

# 73. Rejected: Builder-specific data fetches

Do not implement:

```ts
Builder.source({
  fetch: async ...
})
```

Wait for general Foldkit Query semantics and adapt those.

---

# 74. Implementation sequence

## Phase 1 — structured Form drafts

Before Composition, prove Form can support a structured custom draft whose Schema is not one of:

```text
string
boolean
string[]
nested rows
```

Acceptance case:

```text
one Form key holds a small structured JSON value
a custom renderer edits it
fill works
partial works
submit works
resume works
CMS saves its Model
```

Do not mention page building in the primitive if the generalization is clean.

---

## Phase 2 — `foldkit-composition` core

Implement:

```text
Block
Region
Content capabilities
Catalog
Document
Node
NodeId
literal props
Document Schema
validation
inspect
```

No visual editor yet.

Build Documents by hand in tests.

Render a basic document with a test interpreter.

---

## Phase 3 — Operations

Add:

```text
Insert
Remove
Move
Duplicate
SetProp
```

and:

```ts
Composition.apply
```

Tests should prove:

```text
stable Node IDs
Region constraints
no cycles
correct reorder semantics
deterministic results
```

---

## Phase 4 — Foldkit renderer

Render:

```text
Hero
Text
Image
Columns
Button
```

through ordinary Foldkit views.

No editor chrome yet.

Use the same renderer in a normal application route.

---

## Phase 5 — Form adapter

Implement:

```text
Composition Input kind
Form renderer adapter
```

A crude interface with:

```text
Add Hero
Delete selected
Move up/down
edit props
```

is enough.

Prove the Document can be edited entirely through normal Form Messages.

---

## Phase 6 — CMS proof

Add Page to `examples/cms`.

Demonstrate:

```text
create page
add blocks
autosave
reload
resume draft
preview through application route
publish
visitor sees page
edit again
revision exists
restore revision
schedule page
conflicting author
```

The Page Builder itself should add no CMS-specific state during this phase.

---

## Phase 7 — `foldkit-builder`

Build the actual visual editing Bundle:

```text
canvas
selection
layers
insert palette
inspector
drag/drop
viewport
undo/redo
```

It emits Composition Operations.

The Form remains Document owner.

---

## Phase 8 — Mixins appearance integration

Add:

```text
author-styleable Slot declarations
appearance descriptors
inspector controls
Style compilation
```

Prove protected/hidden Mixins rules still apply.

---

## Phase 9 — Surface Blocks

Adapt one real feature:

```text
ProductGrid
```

or another small Surface.

Prove that:

```text
Block config
    → Surface params

Surface still owns reads/Messages
Composition owns only placement
```

---

## Phase 10 — AI operations

Expose Catalog and Composition Operations to `foldkit-agent`.

Prove:

```text
"Add a hero above the feature grid"
```

results in valid Operations, not raw JSON replacement.

---

# 75. Tests that should exist before declaring the model stable

The design should be exercised against difficult cases:

```text
nested columns
empty Regions
required one Region
moving between compatible Regions
moving to incompatible Region
duplicating a subtree
deleting a subtree
cyclic malformed input
unknown Block
Block prop schema evolution
renamed Block
deep page
1000 nodes
undo after move
CMS restore of older Document
preview of partially edited page
AI operation rejected by Region constraint
Surface Block beside static Block
React Block beside Foldkit Block
```

---

# 76. Important open questions

The first implementation should deliberately answer these through prototypes rather than abstract debate:

```text
What exact Form API supports structured Draft types cleanly?

Should Block renderer association live on Block metadata,
or in a separate renderer registry?

Should `Document.nodes` be Record<NodeId, Node>
or an ordered map-like encoded structure?

How should Unknown Blocks survive decoding and migration?

Should Region constraints use a generic capability substrate
shared with Mixins internally, while preserving separate vocabularies?

What minimum appearance IR compiles naturally to Mixins?

When Query lands, what is the smallest typed Binding IR
that can point from QueryRef + Selection into a Block prop?

When Composition becomes the second Message-capability consumer,
what exactly should be extracted from Agent?
```

None of these require changing the core ownership model.

---

# 77. Success criteria

The design is successful if all of these are true.

A developer can declare:

```text
Block semantics once
```

and use the same Block in:

```text
production rendering
visual editor
AI editing
inspection
validation
documentation
```

A Page is:

```text
an ordinary Entity
```

whose Document is:

```text
an ordinary Form field
```

whose authoring lifecycle is:

```text
ordinary Cms.editor
```

whose preview uses:

```text
ordinary application views and Remote overlay
```

whose feature Blocks use:

```text
ordinary Surfaces
```

whose stateful Blocks eventually use:

```text
ordinary Bundles
```

whose appearance uses:

```text
ordinary Mixins
```

whose actions eventually dispatch:

```text
ordinary Messages
```

and whose external AI editor uses:

```text
the same Operations as the human editor.
```

---

# 78. Final conceptual model

The entire architecture can be summarized as:

```text
Effect Schema
    defines valid props and Documents

Block
    defines compositional meaning

Region
    defines structural topology

Catalog
    defines the allowed vocabulary

Document
    is the persistent composition

Operation
    describes a semantic edit

Form
    owns the editable Document draft

Builder
    owns editor interaction state

CMS
    owns authoring lifecycle

Renderer
    interprets Blocks as real views

Surface
    connects Blocks to application facts

Bundle
    owns reusable stateful machinery

Mixins
    owns appearance/customization

Remote
    owns server facts and preview overlays

Agent
    gives external actors typed access
    to the same semantic transitions
```

Or, more compactly:

```text
Composition says what the page is.

Builder changes it.

Form owns the change.

CMS saves and publishes it.

Foldkit renders and runs it.
```

That should be the guiding constraint for every API decision in this feature.
