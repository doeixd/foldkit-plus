# foldkit-composition

When marketing or editorial teams need to reorder sections, swap a hero callout,
or assemble a landing page without waiting on a code deploy, teams usually end
up choosing between hardcoded JSX components or storing raw HTML in the
database. Raw HTML breaks layout guarantees and opens XSS holes, while hardcoded
components stall every content tweak on an engineering release.

`foldkit-composition` represents each page as a plain JSON **Document** made
from typed **Blocks** you define in code. Your code declares each Block's prop
schema and the child **Regions** it exposes; the database stores only Block
names, ids, and props, validated against your **Catalog** before publishing.

See pages of Blocks edited and rendered live in the
[live CMS demo](https://foldkit-cms-demo.pages.dev/).

## Install

```bash
pnpm add foldkit-composition
```

## A first page of Blocks

This defines a `Heading` and a `Section` Block, combines them into a `Catalog`,
decodes a JSON page `Document`, and validates it:

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

const findings = Composition.validate(Site, page)
const outline = Composition.describe(Site, page)
```

`findings` is `[]` (every node fits the Catalog), and `outline` returns the
readable tree:

```text
Section intro {"tone":"plain"}
  body:
    Heading title {"level":1,"text":"Hello"}
```

- `Block.define` and `Catalog.make` describe your vocabulary. A Catalog with
  duplicate Block names, an empty Region acceptance list, or a Block that
  provides no Content throws when defined.
- `Composition.Document` is an Effect Schema for plain JSON, ready for a
  database column or form field.
- `Composition.validate` returns a finding for each issue—code, node id, path,
  and message—while leaving `page` untouched.

## Where blocks, pages, and edits live

| Fact | Owner |
| --- | --- |
| Which Blocks exist, their props, Regions and Content | `foldkit-composition`, in code |
| Which Blocks a page has, and where | the Document, stored as data |
| Whether a Document fits a Catalog | `Composition.validate`, reporting every finding |
| The draft being edited, saving, revisions, publishing | the application (`foldkit-form`, `foldkit-cms`) |
| How a Block looks and behaves | a view, drawn from the Block by a renderer |

Code decides what *may* exist; data records what *does*. A Document refers to
Blocks only by name, so stored pages outlive deployments: removing a Block from
code leaves a node that still loads, round-trips, and reports an unknown-block
finding without dropping data.

## How Blocks, Regions, and Documents fit together

In code, a **Block** pairs a name, a prop Schema, its child Regions, and the
**Content** roles it provides (such as `Section`, `Flow`, or `Interactive`). A
**Catalog** lists the Blocks available in one context and which Content roles may
appear as page roots.

In storage, a **Document** holds `roots: [id, ...]` and
`nodes: { id: { block, props, regions } }`. A **Region** is a named slot inside
a Block (such as a Hero's `actions`) that accepts children by Content role rather
than Block name, so Regions written today automatically accept new Blocks added
later.

## The Document, and its two schemas

A Document is normalized: `roots` and each Region hold node ids, and `nodes`
stores each node once under its id. Because the node omits its own id field, a
node's key and identity stay in sync and each node occupies a single place.

There are two schemas, on purpose:

```ts
Composition.Document                                 // tolerant: what is stored and read
Composition.Document.check(Composition.valid(Site))  // strict: what may be published
```

The tolerant codec accepts any well-formed Document, whatever Block names it
uses and with props as JSON. So a stored page always reads, an old revision
always restores, and content the deployment lacks survives. The strict check
runs `validate` and fails with every finding at its path. Store the first in
the Entity, and ask the second of the operation that publishes:

```ts
import { Entity } from 'foldkit-entity'

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

`appearance` holds a node's look as names, such as `{ tone: 'accent' }`,
checked against the axes its Block offers ([Appearance](#appearance-foldkit-compositionappearance)).
`when` lists the conditions a node shows under ([Conditions](#conditions)),
and `actions` what its events run ([Actions](#actions)), as names and literal
input.

## What validation finds

| Code | Meaning |
| --- | --- |
| `composition:missing-node` | a root or Region names an id missing from `nodes` |
| `composition:orphan` | a node unreachable from any root or Region |
| `composition:second-parent` | a node placed twice |
| `composition:cycle` | a node that contains itself |
| `composition:unknown-block` | a Block missing from the Catalog (kept and still checked) |
| `composition:invalid-props` | props the Block's schema refuses, including extra keys |
| `composition:unknown-region` | a Region missing from the Block |
| `composition:region-cardinality` | too few or too many children for the Region |
| `composition:region-rejects` | a child whose Content the Region rejects |
| `composition:root-rejects` | a root whose Content the Catalog's roots reject |
| `composition:invalid-appearance` | non-record appearance, unknown axis, or invalid axis value |
| `composition:unknown-token` | a token axis naming a token missing from the theme |
| `composition:invalid-condition` | a `when` that is not a list of conditions |
| `composition:unknown-context` | a condition key or value unsupported by the Catalog's `context` |
| `composition:invalid-action` | unknown event, malformed `{ action, input }`, or invalid input |
| `composition:unknown-action` | an action missing from the Catalog |

Props are decoded strictly, so an obsolete prop left by an older schema is
surfaced rather than silently kept.

## Conditions

A node shows only when its `when` holds over the page's **context**: what the
page is drawn for, such as an audience, a locale or a feature flag. The Catalog
declares the context as a Schema, and the application supplies its values when
it draws:

<!-- docs-check standalone
import { Schema, Option } from 'effect'
import { Block, Catalog, Composition, Content, NodeId, Region, Url } from 'foldkit-composition'
import { Renderer } from 'foldkit-composition/foldkit'
import { inertHtml } from 'foldkit/html'
const Heading = Block.define('Heading', {
  Props: Schema.Struct({ text: Schema.String, level: Schema.Literals([1, 2, 3]) }),
  provides: [Content.Flow],
})
const Section = Block.define('Section', {
  Props: Schema.Struct({ tone: Schema.Literals(['plain', 'accent']) }),
  regions: { body: Region.many({ accepts: [Content.Flow] }) },
  provides: [Content.Section],
})
const page = Schema.decodeUnknownSync(Composition.Document)({
  format: 1,
  roots: ['intro'],
  nodes: {
    intro: { block: 'Section', props: { tone: 'plain' }, regions: { body: ['title'] } },
    title: { block: 'Heading', props: { text: 'Hello', level: 1 }, regions: {} },
  },
})
const h = inertHtml
declare const id: NodeId
declare const SiteRenderer: Renderer<typeof Heading | typeof Section, never>
-->

```ts
const Site = Catalog.make({
  blocks: [Heading, Section],
  roots: [Content.Section],
  context: Schema.Struct({ audience: Schema.Literals(['guest', 'member']) }),
})

Composition.Op.setWhen(id, [Composition.when.eq('audience', 'member')])
Renderer.render(SiteRenderer, page, h, { context: { audience: 'guest' } })
```

- **A `when` is a list, and every condition must hold:** `when.eq(key, value)`,
  `when.isNull(key)`, `when.isNotNull(key)` and `when.contains(key, text)`.
  They mean what `foldkit-entity`'s `Expr` means: `contains` ignores case,
  folding ASCII only, and absent text contains nothing.
- **Checked against the context,** by `validate` and by `setWhen`: a key the
  context does not declare, or a value its Schema refuses, is
  `composition:unknown-context`, never a node that silently never shows. A
  value is what the application gives, the field's decoded side: over
  `Schema.NumberFromString`, a condition names a number. A condition naming two
  operations is `composition:invalid-condition`.
- **Drawn without its context, a page fails closed:** a node with conditions
  does not show. In edit mode it is drawn anyway, marked
  `data-composition-hidden`, so an author sees what a visitor would not.
  `Composition.holds(when, context)` is the same test.
- **`when` is presentation, not authorization.** A member-only section hidden
  from guests is still in the Document a guest's page was drawn from. Content a
  guest must not receive belongs behind the CMS audience boundary or a
  server-authorized read.
- Viewport is not a condition: the server cannot know it. A node hidden on
  narrow screens is an appearance.

## Actions

A Button must eventually do something, and a capability ends in an existing
Message. A Block names its events, a Catalog lists the actions its pages may
reference, each a `foldkit-surface` Action, and a node stores only which action
an event runs, with its input as literals:

<!-- docs-check standalone
import { Schema, Option } from 'effect'
import { Block, Catalog, Composition, Content, NodeId, Region, Url } from 'foldkit-composition'
import { Renderer } from 'foldkit-composition/foldkit'
import { inertHtml } from 'foldkit/html'
const Heading = Block.define('Heading', {
  Props: Schema.Struct({ text: Schema.String, level: Schema.Literals([1, 2, 3]) }),
  provides: [Content.Flow],
})
const Section = Block.define('Section', {
  Props: Schema.Struct({ tone: Schema.Literals(['plain', 'accent']) }),
  regions: { body: Region.many({ accepts: [Content.Flow] }) },
  provides: [Content.Section],
})
const page = Schema.decodeUnknownSync(Composition.Document)({
  format: 1,
  roots: ['intro'],
  nodes: {
    intro: { block: 'Section', props: { tone: 'plain' }, regions: { body: ['title'] } },
    title: { block: 'Heading', props: { text: 'Hello', level: 1 }, regions: {} },
  },
})
const h = inertHtml
declare const id: NodeId
import { defineMessageUnion } from 'foldkit/message'
import { Action } from 'foldkit-surface'
const Message = defineMessageUnion({ AddedToCart: { productId: Schema.String } })
const AddToCart = Action.define({
  name: 'addToCart',
  description: 'Add a product to the cart',
  input: Schema.Struct({ productId: Schema.String }),
  toMessage: input => Message.AddedToCart(input),
})
type Message = typeof Message.Type
-->

```ts
const Button = Block.define('Button', {
  Props: Schema.Struct({ label: Schema.String }),
  provides: [Content.Flow],
  events: ['press'],
})
const Site = Catalog.make({ blocks: [Section, Button], roots: [Content.Section], actions: [AddToCart] })

Composition.Op.setAction(id, 'press', { action: 'addToCart', input: { productId: 'p1' } })

const SiteRenderer = Renderer.forMessages<Message>().make(Site, {
  Section: ({ regions, h }) => h.section([], [...regions.body]),
  Button: ({ props, on, h }) => {
    const pressed = on('press') // the Message addToCart makes, or none
    return h.button(Option.match(pressed, { onNone: () => [], onSome: sent => [h.OnClick(sent)] }), [
      props.label,
    ])
  },
})
```

- **Checked,** by `validate` and by `setAction`: an event the Block does not
  have or input the action's Schema refuses is `composition:invalid-action`,
  and an action the Catalog lacks is `composition:unknown-action`.
- **Nothing stored runs.** `on(event)` decodes the stored input by the action's
  Schema and makes its Message, an `Option`, none when there is none; `update` stays the only
  place a Message has effects.
- The same Action is an agent's capability through `Agent.action`, declared
  once for both.

## Agents

An agent edits a page through the same path a person does: it sends the
Builder's own `Applied` Message, so its edit is checked, undoable, autosaved and
revisioned like any other. `Composition.operationSchema(Site)` is the tool's
input, generated from the Catalog:

<!-- docs-check standalone
import { Schema, Option } from 'effect'
import { Block, Catalog, Composition, Content, NodeId, Region, Url } from 'foldkit-composition'
import { Renderer } from 'foldkit-composition/foldkit'
import { inertHtml } from 'foldkit/html'
const Heading = Block.define('Heading', {
  Props: Schema.Struct({ text: Schema.String, level: Schema.Literals([1, 2, 3]) }),
  provides: [Content.Flow],
})
const Section = Block.define('Section', {
  Props: Schema.Struct({ tone: Schema.Literals(['plain', 'accent']) }),
  regions: { body: Region.many({ accepts: [Content.Flow] }) },
  provides: [Content.Section],
})
const page = Schema.decodeUnknownSync(Composition.Document)({
  format: 1,
  roots: ['intro'],
  nodes: {
    intro: { block: 'Section', props: { tone: 'plain' }, regions: { body: ['title'] } },
    title: { block: 'Heading', props: { text: 'Hello', level: 1 }, regions: {} },
  },
})
const h = inertHtml
declare const id: NodeId
import { Agent } from 'foldkit-agent'
import { Bundle } from 'foldkit-bundle'
import { Message as BuilderMessage, Builder } from 'foldkit-builder'
import { Entity } from 'foldkit-entity'
import { Form } from 'foldkit-form'
import { defineMessageUnion } from 'foldkit/message'
const Site = Catalog.make({ blocks: [Heading, Section], roots: [Content.Section] })
const SiteRenderer = Renderer.make(Site, {
  Heading: ({ field, h }) => h.h2([], [field('text')]),
  Section: ({ regions, h }) => h.section([], [...regions.body]),
})
const Page = Entity.define('Page', Schema.Struct({ id: Schema.String, document: Composition.Document }))
const PageForm = Form.make(
  'PageForm',
  Entity.input(
    Page,
    Schema.Struct({ document: Composition.Document.check(Composition.valid(Site)) }),
  ),
  {
    inputs: {
      document: Builder.make('PageBuilder', {
        catalog: Site,
        renderer: SiteRenderer,
        starters: { Section: { tone: 'plain' } },
      }).input,
    },
  },
)
const Editor = Bundle.declare(PageForm.bundle, 'editor')
const Message = defineMessageUnion({ ...Editor.cases })
-->

```ts
Agent.expose(Message, {
  GotEditorMessage: Agent.variant({
    name: 'edit_page',
    description: 'Insert, move, remove or configure blocks on the page',
    input: Composition.operationSchema(Site),
    toMessage: op => ({ message: PageForm.control('document').send(BuilderMessage.Applied({ op })) }),
  }),
})
```

- An insert names one of the Catalog's Blocks, as a literal, with that Block's
  props as they are stored, so a Block outside the Catalog is refused by the
  tool's own input schema before `apply` sees it. `apply` checks the rest.
- Each insert carries its Block's description, when it has one
  (`Block.words`), so the tool's schema says what each Block is for.
- The agent mints the ids of what it adds (`composition:id-taken` for one in
  use), and reads the page as `Composition.describe(Site, document)`, ids and
  props included.
- A pattern (see [Patterns](#patterns)) goes in by `UsePattern`, whose `ids`
  name exactly the pattern's nodes.
- `examples/cms` has one, `pageAgent.ts`.

## Reading a Document

- `Composition.index(document)` says where each reachable node is: its parent,
  Region and index. It is derived, never stored, and computed once per Document
  value.
- `Composition.nodeAt(document, id)` is the node an id names, or `undefined`.
  It reads the Document's own keys, so an id from a URL or a Message such as
  `constructor` names no node, where `document.nodes[id]` reads `Object`'s.
- `Composition.describe(catalog, document)` writes the Document as indented
  text, one node per line, with a Block the Catalog does not know marked `?`
  and a label that says more than the name after it (`Banner "Promo banner"`).
- `Catalog.describe(catalog)` lists each Block's words, props, Regions, Content
  and metadata, for a person, a tool or an agent.
- `Block.words({ label, description, group })` says what a Block is called and
  what it is for, each word in place of the one before; the label defaults to
  the name spaced (`PostList` is "Post list"). It is a pipe step, so an
  application words a Block another package defined:
  `Text.pipe(Block.words({ group: 'Text' }))`. An editor's palette and an
  agent's tool both read it. An appearance axis names its values the same
  way, with `labels: { lg: 'Large' }`.
- `Block.decode(block, props)` decodes stored props to the Block's typed props,
  and `PropsOf<typeof Heading>` is their type.
- `Block.annotate(metadata)` attaches an interpreter's
  [`foldkit-metadata`](../metadata/README.md), such as the control an editor
  draws a prop with. The Block knows no annotation's meaning.

## Editing: Operations

`Composition.apply(catalog, document, op)` applies an Operation to a Document
and returns `Result.succeed({ document, changed, removed })`, or `Result.fail`
with an error code and message leaving the Document unchanged:

<!-- docs-check standalone
import { Schema, Option } from 'effect'
import { Block, Catalog, Composition, Content, NodeId, Region, Url } from 'foldkit-composition'
import { Renderer } from 'foldkit-composition/foldkit'
import { inertHtml } from 'foldkit/html'
const Heading = Block.define('Heading', {
  Props: Schema.Struct({ text: Schema.String, level: Schema.Literals([1, 2, 3]) }),
  provides: [Content.Flow],
})
const Section = Block.define('Section', {
  Props: Schema.Struct({ tone: Schema.Literals(['plain', 'accent']) }),
  regions: { body: Region.many({ accepts: [Content.Flow] }) },
  provides: [Content.Section],
})
const page = Schema.decodeUnknownSync(Composition.Document)({
  format: 1,
  roots: ['intro'],
  nodes: {
    intro: { block: 'Section', props: { tone: 'plain' }, regions: { body: ['title'] } },
    title: { block: 'Heading', props: { text: 'Hello', level: 1 }, regions: {} },
  },
})
const h = inertHtml
declare const id: NodeId
const Site = Catalog.make({ blocks: [Heading, Section], roots: [Content.Section] })
-->

```ts
const { Op, region } = Composition

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
- **`apply` checks what the Operation causes:** a Region that rejects the node
  or lacks room, a Region left below its bound, a node placed inside itself, a
  taken id, or invalid props. Existing errors elsewhere on the page (such as an
  unknown Block left by an older deployment) are preserved so authors can keep
  editing around them.
- **Operations supply their own ids.** Every id an Operation creates is passed
  in explicitly so replays produce identical nodes. Call
  `Composition.newIds(count)` in a Command to generate random ids.
- **`Applied`** says which nodes were added or changed, a parent whose Region
  changed included, and which were removed, so a view can redraw only those.
- Operations are data: `Composition.Operation` is their Schema, for a log, an
  agent's tool or a replay.
- `Composition.takeTree(document, id)` takes a subtree, and
  `Composition.rekey(tree, ids)` renames every id in it, which is how a paste
  is inserted twice without a collision. A reference to a node the tree does
  not hold is kept as it is, for `apply` to refuse by name.
  `Composition.treeRefusal(catalog, tree)` checks a tree alone, by its own ids,
  before it is rekeyed: what a paste should say is wrong with it.
- **Any text is an id,** `constructor` and `__proto__` included: `apply`,
  `validate`, `index` and the Renderer read nodes by own key only, so a stored
  Document naming one it lacks is `composition:missing-node`, not a crash.

## Patterns

A pattern is an arrangement of Blocks an author inserts as one: a section that
opens with a heading, a hero with its button. The Catalog holds it as a tree,
in the form a Document stores, under ids of its own:

<!-- docs-check standalone
import { Schema, Option } from 'effect'
import { Block, Catalog, Composition, Content, NodeId, Region, Url } from 'foldkit-composition'
import { Renderer } from 'foldkit-composition/foldkit'
import { inertHtml } from 'foldkit/html'
const Heading = Block.define('Heading', {
  Props: Schema.Struct({ text: Schema.String, level: Schema.Literals([1, 2, 3]) }),
  provides: [Content.Flow],
})
const Section = Block.define('Section', {
  Props: Schema.Struct({ tone: Schema.Literals(['plain', 'accent']) }),
  regions: { body: Region.many({ accepts: [Content.Flow] }) },
  provides: [Content.Section],
})
const page = Schema.decodeUnknownSync(Composition.Document)({
  format: 1,
  roots: ['intro'],
  nodes: {
    intro: { block: 'Section', props: { tone: 'plain' }, regions: { body: ['title'] } },
    title: { block: 'Heading', props: { text: 'Hello', level: 1 }, regions: {} },
  },
})
const h = inertHtml
declare const id: NodeId
-->

```ts
const Site = Catalog.make({
  blocks: [Heading, Section],
  roots: [Content.Section],
  patterns: [
    {
      name: 'Intro',
      description: 'A section that opens with a heading',
      tree: {
        root: 'intro',
        nodes: {
          intro: { block: 'Section', props: { tone: 'plain' }, regions: { body: ['title'] } },
          title: { block: 'Heading', props: { text: 'Welcome', level: 1 }, regions: {} },
        },
      },
    },
  ],
})

const { Op, root } = Composition
Composition.apply(
  Site,
  page,
  Op.usePattern({
    pattern: 'Intro',
    ids: {
      [NodeId.make('intro')]: NodeId.make('intro-2'),
      [NodeId.make('title')]: NodeId.make('title-2'),
    },
    at: root(1),
  }),
)
```

- **Checked where the Catalog is made:** a tree that does not decode, does
  not hold together, or names a Block, a prop or a Region the Catalog refuses
  throws there, not when an author first uses it. Where it may go is checked
  by each use, as any insert is.
- **`usePattern` carries a new id for each of its nodes**, by the id it has in
  the pattern, like `duplicate`, so a replay makes the same nodes. A pattern
  the Catalog lacks is `composition:unknown-pattern`.
- **An agent's tool takes it too.** `operationSchema` has one `UsePattern` per
  pattern, its name a literal and its `ids` a struct of exactly its nodes'
  ids, described by its label and description: an agent inserts structure
  the Catalog vouches for without being trusted with an arbitrary tree.
- `Catalog.pattern(catalog, name)` finds one (an `Option`); its `words` are
  its label, by default its name spaced, and its description.

## Undo

Undo is the editor's state, not the page's, so this package has none. The
[Builder](../builder/README.md) keeps the page in an undo history from
`foldkit-primitives/state`, whose present is the Document, and records each
applied Operation in the same transition that makes it. A snapshot shares every
node the edit did not change.

## Drawing a page: `foldkit-composition/foldkit`

A Renderer is one ordinary Foldkit view per Block, from the Block's decoded
props and its Regions' drawn children to `Html`:

<!-- docs-check standalone
import { Schema, Option } from 'effect'
import { Block, Catalog, Composition, Content, NodeId, Region, Url } from 'foldkit-composition'
import { Renderer } from 'foldkit-composition/foldkit'
import { inertHtml } from 'foldkit/html'
const Heading = Block.define('Heading', {
  Props: Schema.Struct({ text: Schema.String, level: Schema.Literals([1, 2, 3]) }),
  provides: [Content.Flow],
})
const Section = Block.define('Section', {
  Props: Schema.Struct({ tone: Schema.Literals(['plain', 'accent']) }),
  regions: { body: Region.many({ accepts: [Content.Flow] }) },
  provides: [Content.Section],
})
const page = Schema.decodeUnknownSync(Composition.Document)({
  format: 1,
  roots: ['intro'],
  nodes: {
    intro: { block: 'Section', props: { tone: 'plain' }, regions: { body: ['title'] } },
    title: { block: 'Heading', props: { text: 'Hello', level: 1 }, regions: {} },
  },
})
const h = inertHtml
declare const id: NodeId
const Site = Catalog.make({ blocks: [Heading, Section], roots: [Content.Section] })
-->

```ts
import { Renderer } from 'foldkit-composition/foldkit'

const SiteRenderer = Renderer.make(Site, {
  // `field` draws a text prop: the text for a visitor, editable in place for an author.
  Heading: ({ field, h }) => h.h2([], [field('text')]),
  Section: ({ props, regions, h }) =>
    h.section([h.DataAttribute('tone', props.tone)], [...regions.body]),
})

Renderer.render(SiteRenderer, page, h) // ReadonlyArray<Html>, one per root
```

- **Every Block needs a view.** Missing a Block view in `Renderer.make` is a type
  error and throws at runtime naming the missing Block.
- **Stored mismatches render placeholders instead of throwing.** A node whose
  Block is missing from the Catalog, whose props fail to decode, that is missing
  or reached twice, or whose view throws renders nothing for a visitor and a
  labelled box in edit mode.
- **The builder is a parameter,** so one Renderer draws in the browser, in a
  test with `inertHtml`, and on the server. `Renderer.make` takes any
  application's `h` builder without dispatching Messages;
  `Renderer.forMessages<Message>()` binds to builders of `Message`.
- **Edit mode** (`{ mode: 'edit' }`) wraps each node in a `display: contents`
  element carrying `data-composition-node`, so an editor's canvas draws the
  page a visitor sees. The wrapper also carries the editor's marks, from the
  options `selected`, `hovered` and `drop`, each an `Option` as the editor's
  Model holds it: `data-composition-mark` is
  `selected` or `hovered` (a node that is both is `selected`), and
  `data-composition-drop` says where a drop lands. A node whose `when` fails is
  drawn anyway, marked `data-composition-hidden`. An empty Region is drawn as
  one element holding its name spaced (`Right`), marked
  `data-composition-region` with the Region's name and `data-composition-node`
  with its node's id, so an author sees where a child can go and can drop into
  it; a `drop` with `region: Option.some(name)` marks that element `inside`
  instead of the node. A view that tests a Region's length sees one child
  there in edit mode.
- **Text edited in place.** A view draws a text prop with `field(key)`, which
  takes only a prop whose type is exactly `string`: one of a few names
  (`'plain' | 'accent'`), a branded string or one that may be absent is no
  field, since typing could not keep it valid. For a visitor it is the text. In edit
  mode it is a span marked `data-composition-field`, whose value names the node
  and the prop as JSON (`fieldOf(value)` reads it back). While the option
  `editing` (an `Option` of `{ id, key, initial }`) names it, the span is
  `contenteditable="plaintext-only"`, a `textbox` named by `label` (default: the
  prop's name spaced), multiline when asked, and it shows `initial`, the text
  when editing began, however the page has changed since. That freezing is what
  keeps a redraw from rewriting the element under the author's caret; the span
  is keyed apart from the one drawn otherwise, so the element the browser
  changed is replaced when editing ends. The Renderer draws; reading what is
  typed is `EditableText` in `foldkit-primitives`, and what it changes is the
  editor's `update`. `Renderer.fields(renderer, document, id)` says which text
  props a node's view draws as fields, in order, by drawing it inert: what an
  editor may offer to edit. It draws with no data and no context, so a view
  that draws a field only once its data has arrived lists none.
- **The other options** are what the page is drawn for: `context`, which
  conditions read ([Conditions](#conditions)), and `data`, each node's read by
  id, which Query, Surface and stateful Blocks draw from. A page with all three
  spreads them into one record:
  `{ ...queries.read(model), ...features.read(model), ...Stateful.views(...) }`.
- **`Renderer.make`'s views dispatch nothing**, so their `on(event)` gives
  none: an editor's canvas draws a page without running its actions.
  `Renderer.forMessages<Message>()` requires every Message the Catalog's
  actions make to be one of `Message`.
- **A node redraws only when its inputs change.** Inside a runtime-driven render,
  each node's drawing is memoized with Foldkit's `createKeyedLazy` on its node
  object, drawn children, data read, visibility, marks, and active inline field.
  `apply` structurally shares unchanged nodes, so an edit redraws only the
  touched node and its ancestors. Outside a runtime (`inertHtml` tests, first
  SSR pass), rendering runs unmemoized straight to Foldkit `Html`.
- Rendering requires `foldkit` installed as a peer; the core `foldkit-composition`
  entry works without `foldkit`.

### URLs

A Document is untrusted, so a URL is a type. `Url` accepts `http:`, `https:`,
`mailto:`, `tel:` and relative URLs, and refuses every other scheme,
`javascript:` and `data:` included, read the way a browser reads it (control
characters dropped, case folded):

```ts
const Image = Block.define('Image', {
  Props: Schema.Struct({ src: Url, alt: Schema.String }),
  provides: [Content.Flow, Content.Media],
})
```

An unsafe URL is `composition:invalid-props` in `validate`, refused by `apply`,
and drawn as a placeholder.

### Rich text as a Block: `foldkit-composition/richtext`

<!-- docs-check
import * as RichText from 'foldkit-richtext'
const ArticleKit = RichText.kit({ nodes: [RichText.block('Paragraph')], marks: [] })
-->

```ts
import { RichTextBlock } from 'foldkit-composition/richtext'

const Text = RichTextBlock.define('Text', { kit: ArticleKit, provides: [Content.Flow] })
// Draw its body with foldkit-richtext-dom: Text: ({ props }) => renderDocument(props.body)
```

The Block's one prop is `body`, a `foldkit-richtext` Document. Validating the
page validates the body against the Kit, each finding reported as
`composition:nested` at its path, and `apply` refuses a body the Kit does not
accept. Any Block can do the same for its own content with `check`:
`Block.define(name, { Props, provides, check: props => [{ path, message }] })`.

### Appearance: `foldkit-composition/appearance`

A node's look is **choices within a design system**, not CSS. A look is a
[`foldkit-mixins`](../mixins/README.md) slot recipe, whose variant axes are the
choices, and token axes, whose choices are a theme's token names. The Document
stores only the names:

<!-- docs-check standalone
import { Schema, Option } from 'effect'
import { Block, Catalog, Composition, Content, NodeId, Region, Url } from 'foldkit-composition'
import { Renderer } from 'foldkit-composition/foldkit'
import { inertHtml } from 'foldkit/html'
const Heading = Block.define('Heading', {
  Props: Schema.Struct({ text: Schema.String, level: Schema.Literals([1, 2, 3]) }),
  provides: [Content.Flow],
})
const Section = Block.define('Section', {
  Props: Schema.Struct({ tone: Schema.Literals(['plain', 'accent']) }),
  regions: { body: Region.many({ accepts: [Content.Flow] }) },
  provides: [Content.Section],
})
const page = Schema.decodeUnknownSync(Composition.Document)({
  format: 1,
  roots: ['intro'],
  nodes: {
    intro: { block: 'Section', props: { tone: 'plain' }, regions: { body: ['title'] } },
    title: { block: 'Heading', props: { text: 'Hello', level: 1 }, regions: {} },
  },
})
const h = inertHtml
declare const id: NodeId
import { Capability, Slot, Slots } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
const HeroSlots = Slots.define({ root: Slot.make({ capability: Capability.Container }) })
const t = Theme.ref(Theme.tokens)
-->

```ts
import { Style } from 'foldkit-mixins'
import { Appearance } from 'foldkit-composition/appearance'

const HeroLook = Appearance.make(HeroSlots, {
  recipe: Style.recipeFor(HeroSlots)({
    base: { root: Style.class('hero') },
    variants: { tone: { plain: {}, accent: { root: Style.class('accent') } } },
    defaults: { tone: 'plain' },
  }),
  tokens: { gap: Appearance.token(t.space, { slot: 'root', property: 'gap' }) }, // t = Theme.ref(Theme.tokens)
})

const Hero = Block.define('Hero', {
  Props: Schema.Struct({ title: Schema.String }),
  provides: [Content.Section],
}).pipe(Appearance.attach(HeroLook))

const Site = Catalog.make({ blocks: [Hero], roots: [Content.Section] })

const SiteRenderer = Renderer.make(Site, {
  Hero: ({ props, appearance, h }) => {
    const slots = HeroLook.draw({ appearance, h })
    return h.section(slots.root.attrs(), [props.title])
  },
})
```

- **`Appearance.attach(look)`** gives the Block its appearance axes (`tone:
  plain | accent`, `gap:` the token names), which are plain data in the core:
  `validate` and `Op.setAppearance` check a node's names against them, with no
  Mixins involved. `Block.withAppearance(axes)` sets them by hand.
- **`look.draw({ appearance, h })`** is the Block's Slots with the chosen Style
  attached: the base, each chosen value (or the recipe's default), each
  matching compound, and a token's declaration. A Renderer hands each view
  `appearance`, the node's choices its Block offers; a stored name it does not
  offer is left out, not drawn.
- **A Block with its own interaction** attaches its Behaviors after the look:
  `look.draw({ appearance, h, with: [Carousel.mixin] })`. A style property a
  Behavior owns that a choice also sets is `mixins:style-property-conflict`,
  thrown when the slot is drawn, never a silent winner.
- **Each piece is compiled once,** when the look is made, and a selection
  attaches the ones it picks side by side. `Style.stylesheet(...look.styles)`
  holds every rule any node can use; pass `layer` to `Appearance.make` to
  compile them in a cascade layer, such as `Layers.standard.layer('app')`.
- Arbitrary CSS, class names and selectors are not in the Document. An escape
  hatch is a Block written for it, visibly outside the typed path.
- **A token choice may change at breakpoints.** Given `breakpoints` (such as
  `Theme.tokens.breakpoint`, smallest first), a node stores one name for every
  viewport or a name per point, `{ gap: { base: 'sm', md: 'lg' } }`. Each is a
  rule, the breakpoints' after the base's in `look.styles`, so the widest that
  matches wins; a view's `appearance` then holds the record. A variant is one
  value for every viewport: its pieces may be classes, which no media query
  can hold.
- **Measure the page, not the window.** Breakpoints written
  `Theme.inContainer(PAGE_CONTAINER, Theme.tokens.breakpoint)` are container
  queries on the page (`PAGE_CONTAINER`, from `foldkit-composition/foldkit`),
  and `cqi` units in a look are its width: an editor's narrow preview then
  draws a look as a phone would, in a wide window. The Renderer draws no
  container; the page's host is one (`containerType: 'inline-size',
  containerName: PAGE_CONTAINER`), as the Builder's frame is.
- **A layout Block is a Mixins layout.** Its look's base is the layout, and
  the layout's parameters are its axes:

  <!-- docs-check
  import { Layout } from 'foldkit-mixins/layout'
  const ColumnsSlots = Slots.define({
    root: Slot.make({ capability: Capability.Container }),
    left: Slot.make({ capability: Capability.Container }),
    right: Slot.make({ capability: Capability.Container }),
  })
  -->

  ```ts
  const grow = (left: string, right: string) => ({
    left: Style.inline({ flexGrow: left }),
    right: Style.inline({ flexGrow: right }),
  })
  const ColumnsLook = Appearance.make(ColumnsSlots, {
    recipe: Style.recipeFor(ColumnsSlots)({
      base: { root: Layout.switcher() },
      variants: {
        ratio: { '1:1': grow('1', '1'), '2:1': grow('2', '1') },
        stack: { early: { root: Style.vars({ '--fk-l-threshold': '48rem' }) }, late: {} },
      },
    }),
    tokens: { gap: Appearance.token(t.space, { slot: 'root', property: 'gap' }) },
  })
  ```

  A layout writes its parameters as custom properties, so every Columns on a
  page shares one rule, and choosing `{ ratio: '2:1', gap: 'lg' }` requires zero
  extra CSS rules.

This subpath requires `foldkit-mixins`; the core package works standalone.

### Blocks with state of their own

Most Blocks are pure rendering. One that truly has state, such as a carousel
or an accordion, is marked `stateful` and backed by an ordinary Bundle, which
the page's parent places once per node, keyed by its id. Each instance is an
ordinary child Model in the application's Model; nothing keeps per-node state
anywhere else:

<!-- docs-check standalone
import { Schema, Option } from 'effect'
import { Block, Catalog, Composition, Content, NodeId, Region, Url } from 'foldkit-composition'
import { Renderer } from 'foldkit-composition/foldkit'
import { inertHtml } from 'foldkit/html'
const Heading = Block.define('Heading', {
  Props: Schema.Struct({ text: Schema.String, level: Schema.Literals([1, 2, 3]) }),
  provides: [Content.Flow],
})
const Section = Block.define('Section', {
  Props: Schema.Struct({ tone: Schema.Literals(['plain', 'accent']) }),
  regions: { body: Region.many({ accepts: [Content.Flow] }) },
  provides: [Content.Section],
})
const page = Schema.decodeUnknownSync(Composition.Document)({
  format: 1,
  roots: ['intro'],
  nodes: {
    intro: { block: 'Section', props: { tone: 'plain' }, regions: { body: ['title'] } },
    title: { block: 'Heading', props: { text: 'Hello', level: 1 }, regions: {} },
  },
})
const h = inertHtml
declare const id: NodeId
import { Bundle } from 'foldkit-bundle'
import { Stateful } from 'foldkit-composition/foldkit'
import { defineMessageUnion } from 'foldkit/message'
import * as Submodel from 'foldkit/submodel'
import type { Document } from 'foldkit-composition'
import type { HtmlBuilder } from 'foldkit/html'
const CarouselModel = Schema.Struct({ interval: Schema.Number, at: Schema.Number })
const CarouselMessage = defineMessageUnion({ Advanced: {} })
const CarouselBundle = Bundle.make('Carousel', {
  Model: CarouselModel,
  Message: CarouselMessage,
  init: () => ({ model: { interval: 5, at: 0 } }),
  update: model => ({ model: { ...model, at: model.at + 1 } }),
  view: Submodel.defineView<typeof CarouselModel.Type, typeof CarouselMessage.Type>((model, h) =>
    h.p([], [String(model.at)]),
  ),
})
declare const before: Document | undefined
declare const after: Document
-->

```ts
const Carousel = Block.define('Carousel', {
  Props: Schema.Struct({ interval: Schema.Number }),
  provides: [Content.Flow],
  stateful: true,
})
const Site = Catalog.make({ blocks: [Section, Carousel], roots: [Content.Section] })

const Carousels = Bundle.declareEach(CarouselBundle, 'carousels')
const PageModel = Schema.Struct({ ...Carousels.fields }) // each node's item lives in the parent's Model
const PageMessage = defineMessageUnion({ ...Carousels.cases })
const Page = Bundle.parent({ Model: PageModel, Message: PageMessage })
const Placed = Page.each(Carousels)

const SiteRenderer = Renderer.forMessages<typeof PageMessage.Type>().make(Site, {
  Section: ({ regions, h }) => h.section([], [...regions.body]),
  Carousel: ({ data }) => Stateful.html(data),
})

// When the page shown changes, keep the collection in step with it:
Stateful.sync(Placed, Site, Carousel, { before, after }, (model, props) => ({
  ...model,
  interval: props.interval,
}))

// Drawing, each node is drawn by its own item:
const draw = (model: typeof PageModel.Type, h: HtmlBuilder<typeof PageMessage.Type>) =>
  Renderer.render(SiteRenderer, after, h, {
    data: Stateful.views(Placed, Site, Carousel, after, model, h),
  })
```

- **`Composition.statefulNodes(catalog, document, block?)`** lists the stateful
  nodes a page draws, with their decoded props.
- **`Stateful.sync`** (in `/foldkit`) is the Step that adds a new node's item,
  its Model prepared from its props, removes a gone node's, and starts again
  one whose props changed; props are compared by value, so a page loaded again
  keeps what its nodes hold.
- A Bundle placed per key cannot have Managed Resources: a Block that needs one
  is not stateful this way.

### Blocks that read data: `foldkit-composition/remote`

A Query Block names a [`foldkit-remote`](../remote/README.md) query and maps its
props to the query's input. Authors pick options like a count or a category;
your code owns the query itself, and the Document stores only the chosen props.
From the CMS example's `site.ts`:

<!-- docs-check standalone
import { Schema, Option } from 'effect'
import { Block, Catalog, Composition, Content, NodeId, Region, Url } from 'foldkit-composition'
import { Renderer } from 'foldkit-composition/foldkit'
import { inertHtml } from 'foldkit/html'
const Heading = Block.define('Heading', {
  Props: Schema.Struct({ text: Schema.String, level: Schema.Literals([1, 2, 3]) }),
  provides: [Content.Flow],
})
const Section = Block.define('Section', {
  Props: Schema.Struct({ tone: Schema.Literals(['plain', 'accent']) }),
  regions: { body: Region.many({ accepts: [Content.Flow] }) },
  provides: [Content.Section],
})
const page = Schema.decodeUnknownSync(Composition.Document)({
  format: 1,
  roots: ['intro'],
  nodes: {
    intro: { block: 'Section', props: { tone: 'plain' }, regions: { body: ['title'] } },
    title: { block: 'Heading', props: { text: 'Hello', level: 1 }, regions: {} },
  },
})
const h = inertHtml
declare const id: NodeId
-->

```ts
import { Entity } from 'foldkit-entity'
import { Cms } from 'foldkit-cms'
import { QueryBlock } from 'foldkit-composition/remote'

const LatestPages = QueryBlock.define('LatestPages', {
  Props: Schema.Struct({ count: Schema.Literals([3, 5]) }),
  provides: [Content.Flow],
  query: Cms.Entries,
  input: () => ({ type: 'pages', search: '', archived: false }),
  select: Entity.select(Cms.Entities.Entry, { label: true }),
  first: props => props.count,
})

const Site = Catalog.make({ blocks: [LatestPages], roots: [Content.Flow] })

const SiteRenderer = Renderer.make(Site, {
  LatestPages: ({ data, h }) => {
    const rows = LatestPages.rows(data) // RemoteData<Page<{ label: string }>>
    return rows._tag === 'Ready'
      ? h.ul([], rows.value.items.map(row => h.li([], [row.label])))
      : h.p([], ['Loading'])
  },
})
```

- **`QueryBlock.reads(Data, catalog, document)`** is every Query Block on the
  page as one Projection over the application's Model, keyed by node id, an
  `Option`: none when the page has none. A node whose props do not decode
  reads nothing.
- **`QueryBlock.active(name, App.owner, Data, catalog, model => Option.some(document))`**
  is that read as an active Surface, for `Data.wiring`, `Data.subscriptions` or
  an SSR plan's `surfaces`: Remote fetches, caches and authorizes it like any
  read, and `Remote.resume(Data)` carries exactly what it selected into a
  server-rendered page. `documentOf` returns none while there is no page.
  **`reads.data(model)`** is each node's value, as a Renderer's `data` takes
  it, and `{}` while there is nothing to read. **`reads.answered(model)`** is
  whether every one of those reads has an answer, true while there is nothing
  to read: what a page waits for before it is shown (`SSR.hydrate`'s `until`).
- **`Renderer.render(..., { data: reads.read(model) })`** hands each node its
  value as `data`, and **`LatestPages.rows(data)`** reads it typed by what the
  Block selects, `Initial` while there is nothing.
- The Block's type depends on the query, not on `Data`, so a Catalog stays
  independent of the Model that the Builder's form is part of.

This subpath requires `foldkit-remote` and `foldkit-surface`; the core package
works standalone.

### Blocks that show a feature: `foldkit-composition/surface`

A Surface Block places a `foldkit-surface` Surface, such as a cart summary,
where an author puts it, with params its props give. The Surface still owns
what it reads and which Messages it may send:

<!-- docs-check standalone
import { Schema, Option } from 'effect'
import { Block, Catalog, Composition, Content, NodeId, Region, Url } from 'foldkit-composition'
import { Renderer } from 'foldkit-composition/foldkit'
import { inertHtml } from 'foldkit/html'
const Heading = Block.define('Heading', {
  Props: Schema.Struct({ text: Schema.String, level: Schema.Literals([1, 2, 3]) }),
  provides: [Content.Flow],
})
const Section = Block.define('Section', {
  Props: Schema.Struct({ tone: Schema.Literals(['plain', 'accent']) }),
  regions: { body: Region.many({ accepts: [Content.Flow] }) },
  provides: [Content.Section],
})
const page = Schema.decodeUnknownSync(Composition.Document)({
  format: 1,
  roots: ['intro'],
  nodes: {
    intro: { block: 'Section', props: { tone: 'plain' }, regions: { body: ['title'] } },
    title: { block: 'Heading', props: { text: 'Hello', level: 1 }, regions: {} },
  },
})
const h = inertHtml
declare const id: NodeId
import { defineMessageUnion } from 'foldkit/message'
import { Projection, Surface } from 'foldkit-surface'
import { Remote } from 'foldkit-remote'
const Model = Schema.Struct({
  cartCount: Schema.Number,
  page: Schema.Struct({ document: Composition.Document }),
  remote: Remote.Model,
})
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const CartSummary = App.surface('CartSummary', {
  params: { caption: Schema.String },
  model: ({ model }) => ({ count: model.cartCount }),
})
const Data = Remote.make({ model: App.model.remote, entities: [] })
const Page = App.surface('Page', {
  model: ({ model }) => Projection.struct({ page: model.page }),
})
const CmsPage = Surface.at(Page, undefined)
-->

```ts
import { SurfaceBlock } from 'foldkit-composition/surface'

const Cart = SurfaceBlock.define('Cart', {
  Props: Schema.Struct({ caption: Schema.String }),
  provides: [Content.Flow],
  surface: CartSummary,
  params: props => ({ caption: props.caption }),
})
// In the Renderer: Cart: ({ data, h }) => Option.match(Cart.value(data), { ... })
```

`SurfaceBlock.reads(catalog, document)` and `SurfaceBlock.active(name,
App.owner, catalog, model => Option.some(document))` are the page's Surface Blocks as one
Projection, or an active Surface, exactly as a Query Block's are, and their
values reach the Renderer the same way, through `data`. The active Surface may
send what each placed Surface lists in its `messages`, and refuses a Surface of
another application when it is made. The Block holds its
Surface, whose type carries the application's Model: where the Catalog is part
of that Model, as it is when a form places the page Builder, a Block names what
it reads instead, as a Query Block does.

`SurfaceBlock.families(catalog, { from, document })` is the same Blocks as one
`Surface.each` family per Block, keyed by Block name with each instance keyed
by its node id, for `Data.wiring`, `Data.subscriptions`, `Data.satisfy`, or an
SSR plan's `surfaces` — wherever per-node requirements, retention, and
coverage matter rather than one combined read:

<!-- docs-check
const Site = Catalog.make({ blocks: [Section, Cart], roots: [Content.Section] })
-->

```ts
const Blocks = SurfaceBlock.families(Site, {
  from: CmsPage,
  document: ({ page }) => page.document,
})
const subscriptions = Data.subscriptions({ page: CmsPage, ...Blocks })
```

A node whose props do not decode, or whose Block the Catalog lacks, resolves
to no instance. Rendering still reads through `reads` and `data`.

### Serving a published page

Most of a composed page is static content, so you can render it once on the
server with `foldkit-ssr`'s `SSR.static('page', ih => Renderer.render(SiteRenderer, model.page, ih))`.
The browser adopts the server markup directly, and leaving `page` out of the
resume plan sends only HTML without shipping the JSON Document.

## Migrations and unknown Blocks

Pages containing a Block removed from your Catalog remain readable: their nodes
load, round-trip, render as placeholders, and can be reordered or deleted.
`validate` reports unknown blocks so the strict publish schema blocks publishing
until migrations update or remove them:

<!-- docs-check standalone
import { Schema, Option } from 'effect'
import { Block, Catalog, Composition, Content, NodeId, Region, Url } from 'foldkit-composition'
import { Renderer } from 'foldkit-composition/foldkit'
import { inertHtml } from 'foldkit/html'
const Heading = Block.define('Heading', {
  Props: Schema.Struct({ text: Schema.String, level: Schema.Literals([1, 2, 3]) }),
  provides: [Content.Flow],
})
const Section = Block.define('Section', {
  Props: Schema.Struct({ tone: Schema.Literals(['plain', 'accent']) }),
  regions: { body: Region.many({ accepts: [Content.Flow] }) },
  provides: [Content.Section],
})
const page = Schema.decodeUnknownSync(Composition.Document)({
  format: 1,
  roots: ['intro'],
  nodes: {
    intro: { block: 'Section', props: { tone: 'plain' }, regions: { body: ['title'] } },
    title: { block: 'Heading', props: { text: 'Hello', level: 1 }, regions: {} },
  },
})
const h = inertHtml
declare const id: NodeId
import * as RichText from 'foldkit-richtext'
const Embed = Block.define('Embed', {
  Props: Schema.Struct({ url: Schema.String, height: Schema.Number }),
  provides: [Content.Flow, Content.Media],
})
const stored = page
-->

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
- **A migration rewrites a node in place under its existing id,** and the Document's structure is
  checked after each one that changed something: a Region pointing at nothing, a
  node placed twice, a cycle or a stranded node throws, naming the migration.
  What was already wrong before it ran is preserved.
- **The result is still content.** A rewritten node must decode as a Node.
- **Declining is allowed.** Returning `undefined` keeps the node.
  `promoteUnknown` declines when a node's props fail to decode under the target
  Block, keeping it intact rather than half-converted.
- **Run migrations at explicit boundaries,** such as on load, before a publish,
  or in a backfill script.

An unknown Block can still be reordered within its current Region or roots, and
removed; moving it across Regions or editing its props waits until a migration
promotes it.

## Performance

Measured across a 1,000-node page in the package benchmark suite:

| Operation | Measured mean | Budget |
| --- | --- | --- |
| `apply` one `setProp` | 0.40 ms | 1 ms |
| `apply` one `move` between sections | 0.39 ms | 1 ms |
| `validate` the whole page | 1.14 ms | 10 ms |
| `index` a page | 0.09 ms | 5 ms |

`apply` shares every unchanged node and copies the `nodes` record once per
Operation, which accounts for most of its cost at this size.

## Relationship to rich text

A page and a rich-text document serve different granularity: rich text edits by
character position, while a page edits by Block and Region. You can embed rich
text inside a Block prop with `foldkit-composition/richtext`, keeping the
vocabulary at module scope and stored props as JSON.

## Limits

- A condition is one of four operations over one context key; `or` and `not`
  combinators are omitted, matching `Expr`.
- Only a token choice is responsive; a variant keeps one value across viewports.

## Next

- Build an interactive page editor with undo, selection, and clipboard:
  [`foldkit-builder`](../builder/README.md).
- Render the full page editor UI with accessible keyboard and drag support:
  [`foldkit-mixins-builder`](../mixins-builder/README.md).
- Add drafts, revisions, and scheduled publishing to pages:
  [`foldkit-cms`](../cms/README.md).
