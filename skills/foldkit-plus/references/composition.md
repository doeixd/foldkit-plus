# foldkit-composition, foldkit-builder and foldkit-mixins-builder

**In development, not published.** Phases 1 to 7 of the page builder design are
built: Blocks, Regions, Content, a Catalog, the stored Document, its validation,
editing Operations, migrations, a Foldkit renderer, the headless Builder, the
CMS example's pages, and the drawn editor with pointer drag and drop. Rich
text edited on the canvas is not.

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

## Conditions: `when`

`Catalog.make({ blocks, roots, context: Schema.Struct({ audience: ... }) })`;
a node's `when` is a list of conditions, all must hold:
`Op.setWhen(id, [Composition.when.eq('audience', 'member')])` (also `isNull`,
`isNotNull`, `contains`, with `Expr` semantics: ASCII-folded, absent text
contains nothing). Checked by `validate`/`setWhen`
(`composition:invalid-condition`, `composition:unknown-context`).
`Renderer.render(r, doc, h, { context })` leaves out nodes whose `when` fails;
no context means a node with conditions is hidden (fails closed); edit mode
draws it marked `data-composition-hidden`. `Composition.holds(when, context)`.
Presentation, not authorization.

## Appearance: `foldkit-composition/appearance`

A node stores its look as names (`appearance: { tone: 'accent', gap: 'm' }`),
checked in the core against the Block's axes (`composition:invalid-appearance`,
`composition:unknown-token`), so `validate` and `Op.setAppearance` need no
Mixins.

```ts
import { Appearance } from 'foldkit-composition/appearance'

const HeroLook = Appearance.make(HeroSlots, {
  recipe: Style.recipeFor(HeroSlots)({ base, variants: { tone: { plain: {}, accent } }, defaults }),
  tokens: { gap: Appearance.token(Theme.ref(theme).space, { slot: 'root', property: 'gap' }) },
  layer: Layers.standard.layer('app'), // optional
})
const Hero = Block.define('Hero', { Props, provides }).pipe(Appearance.attach(HeroLook))
// In the Renderer: Hero: ({ props, appearance, h }) => { const slots = HeroLook.draw({ appearance, h }); ... }
// The stylesheet: Style.stylesheet(...HeroLook.styles)
```

- Every piece compiles once; a selection attaches base + chosen values
  (or defaults) + matching compounds + token declarations side by side.
- The Renderer's `appearance` holds only choices the Block offers.
- `Block.withAppearance({ axis: { kind: 'variant' | 'token', values, breakpoints? } })`
  sets axes by hand. A token axis made with
  `Appearance.token(t.space, { slot, property, breakpoints: Theme.tokens.breakpoint })`
  is responsive: stored `{ gap: { base: 'sm', md: 'lg' } }`, drawn as rules
  (no inline value), breakpoints after base. Variants are never responsive.
  A view's `appearance` values are `string | Record<point, string>`.
- The drawn Builder's inspector draws a `select` per axis, blank for default.
- A layout Block: the look's base is `Layout.switcher()` (or `sidebar`), and the
  layout's parameters (`--fk-l-threshold` via `Style.vars`, child `flexGrow`,
  a `gap` token) are its axes.

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
  `hovered`, `panel`, `viewport`, `refused`, `drag`. Messages: `Applied({ op })`, `InsertAsked({ block, at })`,
  `DuplicateAsked({ id, at })`, `Minted` (from its own Command), `Selected`,
  `Hovered`, `Undid`, `Redid`, `PanelChosen`, `ViewportChosen`, and
  `DragStarted({ id })`, `DraggedOver({ over: { id, zone } | null })`,
  `DragDropped()`, `DragCancelled()`: `drag.at` is where a drop lands
  (`dropAt`; inside a node that takes nothing is after it, and `over.zone`
  says so), `null` where the page refuses; a drop is one undoable move.
- Ids are minted in a Command; an edit and its undo step change together;
  a new node is selected; a refusal is kept in `refused` until the next edit.
- As a form key: a change of the Document is an edit (autosaved by CMS), a
  selection is not; fill replaces the page and starts undo over.
- Helpers: `PageBuilder.placeFor(doc, selected, block)`,
  `PageBuilder.moveBy(doc, id, delta)`, `PageBuilder.dropAt(doc, dragged, target, zone)`,
  `PageBuilder.replace`, `PageBuilder.settle`.
- Places `TreeNavigation` (`Layers`, open by default) and `LiveAnnounce`
  (`Announcer`) in its Model; layers focus selects the node. Shortcuts:
  `PageBuilder.keyCommand(model, key, modifiers)` (Alt+arrows move, out of and
  into parents; Mod+D duplicate; Delete remove; Mod+Z / Mod+Shift+Z / Mod+Y) —
  attach to the layers panel. Structural edits, undo and refusals are announced;
  a test that runs Commands in turn skips the `LiveAnnounce.*` timers.
- Its view is plain (palette, layers, text props, undo, the page in edit mode);
  `foldkit-mixins-form` draws it with the form. One node is selected at a time.
  `PageBuilder.inputWith(view)` is the same control drawn by another view.

## The drawn editor: `foldkit-mixins-builder`

```ts
import { BuilderView } from 'foldkit-mixins-builder'

const PageEditing = BuilderView.define(PageBuilder) // a SlotView over BuilderSlots
const Drawn = PageBuilder.bundle.pipe(Bundle.withView(BuilderView.submodel(PageEditing)))
// or, as a form key:
const PageForm = Form.make('PageForm', PageInput, {
  inputs: { document: PageBuilder.inputWith(BuilderView.submodel(PageEditing)) },
})
```

- Draws: palette (`Add <Block>`, disabled with no place), layers as
  `role="tree"` rows (tab stop on the selected row), actions, inspector
  (Boolean: checkbox; literals: select; Number, String: input; else JSON
  shown), undo/redo, viewport frame, refusal as `role="alert"`, live region,
  and the page via the site's Renderer in edit mode.
- Behaviors: `TreeNavigation` on `tree`/`row`; `keyCommand` shortcuts on
  `layers`; `Targets` on `canvas` (hover marks, press selects, a link does not
  navigate). No state, no Messages of its own.
- Inspector labels are the prop Schema's `title`, else the key. A Block asks
  for a control with
  `Block.annotate(BuilderView.controls({ body: Input.multiline(), ref: Input.hidden() }))`.
- `PointerDrag` on `tree` (rows carry `data-builder-row`) and `canvas`.
- With a Catalog `context`: a "Preview as" group (`preview` Slot, the Builder's
  `preview` Model field, `PreviewChosen({ key, value })`, seeded by
  `Builder.make(..., { preview })`); the canvas draws for it, marking hidden
  nodes. The inspector's `when <key>` fields store `eq` conditions.
- Style the marks on the edit wrappers' child (a wrapper is
  `display: contents`): `[data-composition-selected] > *`,
  `[data-composition-hovered] > *`, `[data-composition-drop='before'|'inside'|'after'] > *`;
  rows carry `data-builder-drop` and `data-builder-dragging`.

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
- [Drawn Builder README](https://github.com/doeixd/foldkit-plus/blob/main/packages/mixins-builder/README.md)
- [Page builder design](https://github.com/doeixd/foldkit-plus/blob/main/docs/design/pagebuilder-DESIGN.md)
