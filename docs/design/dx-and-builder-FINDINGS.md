# Findings: developer experience, and what the page builder needs next

Building `examples/cms` into a Ghost-like studio and a full-screen page builder
(September 2026, commits `4945949` to `d68c6ef`) met the packages the way an
application does, day after day. [cms-example-FINDINGS.md](./cms-example-FINDINGS.md)
records the API bugs met on the way. This file records the larger things: what
slows down every change, and what blocks the builder features a user asks for
first. Each item says what happened, with the evidence checked against the code,
then the design proposed, the alternatives weighed, and what it costs.

Status: every item is **proposed** unless it says otherwise. Effort is S (a day
or less), M (a few days), L (a week or more, or an API other packages follow).

## Summary

| # | Item | Costs today | Unlocks | Effort |
| --- | --- | --- | --- | --- |
| D1 | Examples and tests read package source | a rebuild and a server restart per package change; tests that pass against stale code | editing a package and seeing it at once | S |
| D2 | A stylesheet derived from its views | a style missing from `sheet.ts` draws nothing, silently | nothing to forget | M |
| D3 | Fixed declarations in layered rules, never inline | overrides that cannot win | styling packages the way their docs promise | S |
| D4 | A test that every element a package draws is a Slot | unslotted markup found only by review | a checked customization contract | S |
| D5 | Queries for inert views in tests | seven copies of one tree walker; attribute and property confused | shorter, sturdier view tests | S |
| B1 | One command table in the Builder | shortcuts and their labels in two packages; "Ctrl" on a Mac | commands an application adds | M |
| B2 | Drag a new Block from the palette | the palette only inserts where the selection says | drag and drop from the palette | M |
| B3 | Copy, paste and Patterns | none of them exist, though the kernel has `takeTree` and `rekey` | reuse within and across pages, safe templates for agents | M |
| B4 | Editing text on the canvas | every word is edited in the inspector | the most asked-for builder feature | L |
| B5 | A measured selection overlay | a selection is an outline; no label, no quick actions | an on-page toolbar, a name tag, resize handles | M |
| B6 | Hover and geometry out of the Model | a full redraw of editor and page per hovered node | large pages | M |
| B7 | Responsive looks as container queries | the tablet and phone previews show desktop looks | a truthful viewport preview | M |
| B8 | Draw or delete `panel` | Model state no view reads | a builder that works on a narrow screen | S |
| B9 | The drawn Builder in regions | ten siblings a stylist places one by one | layouts that survive a new panel | M |
| B10 | `Option` at the Renderer's edge | `Option.getOrUndefined` at every call | one convention | S |
| X1 | Block words in `foldkit-composition` | the palette has words an agent does not | one description for people and models | M |
| X2 | Slots that take content, not only attributes | icons done as CSS masks keyed on data attributes | icons, badges and counts in any package's markup | L |

The order this file recommends is at the end.

## Developer experience

### D1. Examples and tests read package source

**What happened.** Each package exports only its build (`"import":
"./dist/index.mjs"`). Three things follow:

- The root `vitest.config.ts` maps about sixty package names and subpaths to
  their `src` by hand, and every example's `tsconfig.json` maps them again in
  `paths`. The traps list records the drift twice: an example missing a
  mapping fails only in CI.
- Run from inside `packages/mixins-builder`, vitest does not read the root
  config, resolves the package to its stale `dist`, and 21 tests passed
  against markup the source no longer drew.
- The example's Vite server serves `dist` through its dependency cache.
  After every package change the loop was: build the package, stop the
  server, delete `node_modules/.vite`, restart. A browser tab left open
  across the restart hung, which the traps list now also records.

**Design.** Give every package a private export condition that points at its
source, and turn it on everywhere this repository resolves packages:

```jsonc
// packages/mixins-builder/package.json
"exports": {
  ".": {
    "foldkit-plus:source": "./src/index.ts",
    "types": "./dist/index.d.mts",
    "import": "./dist/index.mjs"
  }
}
```

- Vite and Vitest: `resolve: { conditions: ['foldkit-plus:source'] }`. Workspace
  packages are linked, so Vite serves their source like application code and
  hot-reloads it; nothing is pre-bundled.
- TypeScript: `"customConditions": ["foldkit-plus:source"]` in
  `tsconfig.base.json` (it already uses `moduleResolution: "bundler"`, which
  this needs). The examples' `paths` blocks go.
- Vitest `projects` in the root config, so `vitest` run anywhere uses one
  configuration.

The condition is namespaced so no consumer's toolchain matches it by accident.
`src` is not in the published `files`, and an unnamespaced `"source"` condition
would break a consumer whose bundler sets it.

**To check first, with a spike on two packages.** How `tsc -b` treats an
import resolved to another composite project's source. It should redirect to
that project's output declarations, as it does today through `paths`; if it
instead compiles the file into the importing project, the condition stays off
for `tsc` and only Vite and Vitest use it. Also check that tsdown ignores the
condition when building.

**Rejected.** A Vite `resolve.alias` per example: it is the `paths` list again,
in a third place.

### D2. A stylesheet derived from its views

**What happened.** The example builds its one stylesheet from a list in
`sheet.ts`. The writing layout was attached to the form and left out of the
list: its classes were on the elements, with no rules behind them, and nothing
said why (cms F30). Every new Style is a second edit in another file.

**What the code already knows.** A Style attached with `Style.attach` becomes a
Mixin on the SlotView (`SlotView.mixins`), and a Style's contribution carries
its compiled CSS (`css` and `globalCss` in `contribution.ts`). An `Appearance`
look exposes `.styles`. Everything the sheet needs is reachable from the view,
at definition time.

**Design.** `Style.sheetFor(...roots)` collects, at definition time, the
Styles attached to each SlotView it is given and to the SlotViews those draw,
plus the looks of any Catalog it is given:

```ts
export const stylesheet = Style.stylesheet(
  L.declare,
  L.in('reset', Defaults.reset),
  L.in('tokens', Theme.root(Theme.tokens)),
  ...Style.sheetFor(StudioView, PagesView, SiteView, { catalog: Site }),
)
```

This keeps [mixins-DESIGN.md](./mixins-DESIGN.md)'s rule of no render-time
collector: it walks definitions, not renders. It also keeps
[styleImprovements-DESIGN.md](./styleImprovements-DESIGN.md) §2.5's decision
that the page sheet is composition: the foundations stay explicit, and only the
list of scoped Styles is derived.

The hard part is "the SlotViews those draw". A view calls another view inside
its draw function, which a definition cannot see. Two ways:

- A view declares what it embeds: `SlotView.define(Slots, draw, { embeds: [ListView] })`.
  This is explicit, and a missing entry fails the same silent way.
- A development diagnostic instead of derivation: when the runtime mounts,
  compare the classes in the DOM against the rules in the injected sheets,
  and warn once per missing class (`style:missing-rule`).

**Recommendation.** Build the diagnostic first. It is small, catches F30 in the
browser the first time the view draws, and needs no new API. Add `sheetFor`
only if the diagnostic proves insufficient in practice.

### D3. Fixed declarations in layered rules, never inline

**What happened.** The article body composed `Prose.style` with a
`max-width` and a `line-height`, and neither applied. Prose writes both inline,
and an inline declaration outranks every rule in every layer (cms F31). The
package documentation promises that a later layer overrides an earlier one;
an inline declaration makes that false.

**Evidence.** The inline sites in package source:

| Where | What | Fixed or dynamic |
| --- | --- | --- |
| `mixins/src/prose.ts:91` | `max-inline-size`, `line-height` | fixed, from options |
| `mixins/src/styleValue.ts:241` | a grid's `display`, template areas, columns, rows, gap | fixed |
| `mixins/src/style.ts:113` (`stagger`) | `--fk-index` and a delay formula | the index is dynamic, the formula fixed |
| `composition/src/appearance/index.ts:113` | a token axis's declaration without breakpoints | fixed per choice |
| `composition/src/foldkit/index.ts:194` | the edit wrapper's `display: contents` | fixed |
| `mixins-builder/src/index.ts` (frame) | `max-width` by viewport, `margin: 0 auto` | the width is dynamic |

**Design.** One rule for every package, written into the mixins README and
checked by a test:

- A declaration whose value is fixed when the Style is defined goes in a rule,
  in the layer the Style is placed in (`Style.self`).
- A value known only per element (an index, a measured size, a viewport
  width) is written inline **only as a custom property**, and a rule reads it:
  `inline({ '--fk-index': '3' })` plus a rule with
  `transition-delay: calc(var(--fk-index) * 40ms)`.

For Prose that means `measure` and `leading` become variables its rule reads,
so a later layer can override either. For the frame it means
`--fk-frame-width`. The edit wrapper's `display: contents` moves to one global
rule on `[data-composition-node]` in edit mode.

**The check.** Render each package's recipes and views with the inert builder
and fail on any inline `style` property that is not a custom property. It is
the same helper D4 needs.

### D4. A test that every element a package draws is a Slot

**What happened.** The Builder drew its field labels and a many-choice
picker's choices as bare elements. A stylist could reach them only with a
selector into the package's markup, which the project's own rule forbids. Jev
found it in review, and `5d72112` fixed it. The same pattern remains in
`builder/src/index.ts:754` (the headless Builder's plain view) and
`richtext-dom/src/view.ts:97`.

**Design.** `SlotView.assertSlotted(view, input)` renders the view with the
inert builder and lists every element whose attributes did not come from a
Slot builder's `attrs`. The Slot builder already knows when it runs, so it can
mark what it produced. Each package's view test calls it once per
representative input. Elements a package draws deliberately without a Slot
(the canvas's page, which is the site's markup) are passed as an allowlist by
Slot name: "inside `frame`, anything".

**Alternative.** A lint rule on `h.<tag>([` with a literal array. It is
cheaper but misses markup built through helpers, which is where the Builder's
labels were.

### D5. Queries for inert views in tests

**What happened.** Seven test files define the same recursive `all(node)` walker
over inert HTML, and sixteen define their own `text`, `attr` or `prop`. The
palette test failed for a while because `title` is written as a DOM property,
not an attribute, and the helper read attributes.

**Design.** A `foldkit-mixins/testing` subpath, shaped after Testing Library
but over inert `Html`:

```ts
import { Inert } from 'foldkit-mixins/testing'

const root = PageView(model, h)
Inert.byRole(root, 'treeitem')              // ReadonlyArray<Node>
Inert.byLabel(root, 'Add Promo banner')     // aria-label, <label for>, then text
Inert.text(node)                            // all descendant text
Inert.value(node, 'title')                  // property or attribute, whichever is set
Inert.pressed(node)                         // aria-pressed as a boolean
Inert.handler(node, 'click')                // the Message a click sends, if any
```

`Inert.handler` also removes the need to reach into `Attributes.find` to test
that a Behavior installed a handler. The seven copies are replaced in one
commit, which is itself the test that the queries cover what the suites need.

## The page builder

### B1. One command table

**What happened.** The Builder's `keyCommand` (`builder/src/index.ts:865`)
decides what each key does. The drawn Builder's `ACTIONS` and `SHORTCUTS`
tables (`mixins-builder/src/index.ts:313`, added in `5d72112`) restate the same
keys to label buttons and list shortcuts. The two agree only because the same
person wrote both on the same day. The labels also say "Ctrl" on a Mac, where
the key is ⌘.

**Design.** The Builder owns one table of commands, and everything else is
derived from it:

```ts
interface Command {
  readonly id: string                   // 'duplicate'
  readonly label: string                // 'Duplicate'
  readonly keys: ReadonlyArray<Keys>    // [{ key: 'd', mod: true }]
  readonly run: (model: Model) => Option.Option<Message>
}

PageBuilder.commands            // the table, in menu order
PageBuilder.keyCommand          // derived: the first command whose keys match
```

- The drawn Builder draws action buttons, their titles and the shortcut list
  from `builder.commands`, and forgets its own tables.
- Key names are formatted by the view from a `platform` view input
  (`BuilderView.inputs({ platform: 'mac' })`). The application reads
  `navigator` once, at its edge. The view does not, because a view that reads
  the browser is not a function of its input.
- `Builder.make(..., { commands: extra => [...extra, publish] })` lets an
  application add commands such as Publish or Preview, which then appear in
  the shortcut list and take their keys like the rest.
- The same table is the natural source for a command palette (Ctrl+K), which
  is then only a view.

### B2. Drag a new Block from the palette

**What happened.** A palette tile inserts where the selection says (inside it,
after it, or last). An author who wants a Heading between two others must
select the one above first. Every page builder in use lets the author drag
from the palette to the spot.

**What exists.** `PointerDrag` already drags layer rows and canvas nodes, and
`Builder.dropAt` already works out where a drop over a node in a zone lands,
by dry-running the move through `apply`.

**Design.** The drag's subject becomes a union:

```ts
const DragSource = Schema.Union([
  Schema.TaggedStruct('Existing', { id: NodeId }),
  Schema.TaggedStruct('New', { block: Schema.String }),
])
// Drag: { source, over, at }. DragStarted takes a source.
```

- `at` for a `New` source is found the way it is for a move, by a dry run of an
  `insert` with a throwaway id. A mark still never promises a refused drop.
- `DragDropped` of a `New` source sends `InsertAsked({ block, at })`, which
  mints the id as now and selects the new node.
- The drawn Builder attaches `PointerDrag` to the palette too, with
  `data-block` as its attribute, and the canvas and layers already report
  where the pointer is.
- Keyboard: the palette tile stays the way in; nothing about the keyboard
  path changes.

### B3. Copy, paste and Patterns

**What happened.** None of the three exist in the Builder. The kernel is
ready: `Composition.takeTree` lifts a subtree, `rekey` gives it fresh ids, and
`insertTree` inserts it. [pagebuilder-DESIGN.md](./pagebuilder-DESIGN.md) §8
and §21 designed exactly this and deferred it.

**Design.**

- **Commands** (B1): Copy (Mod+C), Cut (Mod+X), Paste (Mod+V), in the table.
  Copy takes the selected subtree. Paste mints ids for it, `rekey`s it, and
  inserts it where an insert would go (`placeFor` by its root's Block).
- **Where the copy lives.** In the Builder's Model as `clipboard:
  Option<Tree>`, for pasting within the page. With a Command writing it to the
  system clipboard as JSON under a format tag too, so a copy crosses pages and
  tabs.
- **A pasted tree is untrusted input.** It is decoded through `Composition.Tree`
  and checked by `apply` against the Catalog, like an agent's Operation. A
  paste of a Block the Catalog lacks, or of a prop its Schema refuses, is
  refused with the usual alert, and nothing is half inserted.
- **Patterns.** `Catalog.make({ patterns: [{ name, words, tree }] })`: a named
  subtree, offered as a palette group. Inserting one is a paste of a stored
  tree. A Pattern is also the safe way to let an agent insert a whole
  structure: `operationSchema` leaves `insertTree` to code today, and a
  `usePattern` Operation naming one of the Catalog's Patterns can be offered
  to an agent without offering arbitrary trees.
- **Templates.** A new page starts from a Pattern chosen in a picker. That is
  the application's, since the page is a form value.

### B4. Editing text on the canvas

**What happened.** Every word on the page is edited in the inspector's text
boxes, away from where it reads. This is the first thing an author reaches
for.

**What is planned.** [pagebuilder-DESIGN.md](./pagebuilder-DESIGN.md) §13 and
Phase 7c-2 plan it for rich text: double-click a Text node and
`foldkit-richtext-dom`'s editor is placed on its host. Leaving commits one
`setProp`, one undo step. The canvas is otherwise never `contenteditable`
(§4). The Renderer gains an edit-mode hook to put the editor's host in place.
It is not built.

**Design, extending 7c-2 to plain text.** Most text on a page is a string prop
(a Hero's title, a Button's label, a Heading), not a rich-text document, and it
should edit the same way without making the canvas `contenteditable`.

- A Block's view marks where a prop's text is drawn, through the render
  context: `field('title', props.title)`. In view mode it is the text. In edit
  mode it is the text inside a span with `data-composition-field="title"`.
- Double-click on a field, or Enter on a selected node with one, starts editing
  it: the Builder's Model gains `editing: Option<{ id, key }>`.
- The drawn Builder draws a text box **over** the field, placed by the
  measured overlay of B5, with the field's font copied from its computed
  style. Typing edits the box, not the canvas. Enter or leaving commits one
  `setProp`, and Escape cancels.
- `Input.multiline()` props get a growing textarea. A rich-text prop uses 7c-2's
  editor in the same place.

This keeps §4's decision (no `contenteditable` canvas) and gives the author
what they expect. The hard parts are copying typography onto the box and
keeping it aligned while the page reflows around a longer title. Both are B5's
measurement.

**Rejected.** `contenteditable="plaintext-only"` on the field itself. It is
less code, but the browser then owns the text between keystrokes, which is the
two-owner problem §4 exists to avoid. Its support also varies.

### B5. A measured selection overlay

**What happened.** The selection is drawn as a CSS outline on the element
inside each node's `display: contents` wrapper. An outline can say nothing:
there is no place for the Block's name, quick actions, a drag handle or resize
handles, because the wrapper has no box and the Block's markup is the site's.
§13 planned to measure the selected node; "as built" chose CSS.

**Design.** A `Measure` Behavior in `foldkit-primitives/dom`, attached to the
canvas. It measures the selected and hovered nodes' boxes relative to the
canvas's scroll container, on selection, scroll, resize and a
`ResizeObserver`. It writes them **as custom properties on the canvas
element**, not as Messages:

```css
--fk-selected-x --fk-selected-y --fk-selected-w --fk-selected-h
--fk-hovered-x  --fk-hovered-y  --fk-hovered-w  --fk-hovered-h
```

The drawn Builder adds an `overlay` Slot inside the canvas, positioned
absolutely from those properties, holding the selected Block's name tag and
its quick actions (from B1's table). A second box follows hover. Geometry never
enters the Model, so a scroll costs no redraw. The design already says
"Geometry is transient and never stored in the Document"; this keeps it out
of the Model as well.

### B6. Hover and geometry out of the Model

**What happened.** Hover is a Message (`Hovered`, `Unhovered`) and a Model
field. Every pointer move onto another node changes the Model, which redraws
the whole editor: the palette, every layer row, the inspector, and the page
through its Renderer. Nothing in the render path is memoized. `rowsOf` is
cached per Document, but no view is lazy, although Foldkit has `createLazy`
and `createKeyedLazy` and §25 names "only the changed rows, by
`createKeyedLazy` per node" as a target. Phase 7 measured a 1,000-node draw
and deferred laziness until a running application asked for it. Hovering a
large page is that ask.

**Design, in two steps.**

1. Hover leaves the Model. B5's `Measure` marks the hovered box from the
   pointer, and a layer row's hover sets the same custom properties through a
   small Behavior that looks the node up by `data-composition-node`.
   `Hovered`, `Unhovered` and `model.hovered` are removed. Nothing else reads
   them, and the change is breaking but allowed at 0.x.
2. The expensive parts become lazy: the canvas as
   `createLazy(drawPage, [document, selected, drop, viewport, preview, data])`,
   and each layer row as `createKeyedLazy(id, drawRow, [node, selected, open, drop])`.
   A keystroke in the inspector then redraws one row and the page, not the
   editor.

Measure the 1,000-node page before and after, in a running application, and
record it in §25 as the design asks.

### B7. Responsive looks as container queries

**What happened.** The Builder previews a page at 768px or 375px by narrowing a
frame. The page's responsive looks compile to `@media`
(`Style.responsive`, used by `Appearance` for token axes with breakpoints), and
a media query sees the browser's width, not the frame's. So the phone preview
shows the desktop layout, and a responsive choice ("Space at md") can be made
and never seen. The README lists it as a limit.

**Design.** Container queries, which `foldkit-mixins` already has
(`Style.container`):

- The public page's root and the Builder's frame are both a named container,
  `container: page / inline-size`.
- A theme's breakpoints can be container breakpoints:
  `Theme.tokens.breakpoint` gains a container form, and `Style.responsive`
  emits `@container page (min-width: …)` for them instead of `@media`.
  Appearance passes breakpoints through unchanged, so its looks follow.
- Block looks written by hand use `Style.container` the same way. The example's
  do. The rule for Block authors is short: the page's width, not the window's.

**Rejected.** Rendering the canvas in an iframe. Media queries would then be
true, but the canvas would lose the application's stylesheet, event
delegation and Behaviors, and every Message would cross a frame. A container
is one CSS property.

### B8. Draw `panel`, or delete it

**What happened.** The Builder's Model has `panel: 'insert' | 'layers' |
'properties'` and a `PanelChosen` Message. `Selected` sets it to
`'properties'` (`builder/src/index.ts:514`), and no view reads it. Below 64rem
the example stacks all five panels in one long column.

**Design.** Draw it: below a width the stylist chooses, the drawn Builder shows
one panel at a time behind a `role="tablist"` of Add, Layers and Settings, and
`panel` says which. Selecting a node already switches to Settings, which is
what a phone wants. The tabs are a Slot, the breakpoint is the stylist's (a
container query from B7), and the panels stay in the DOM so the layers keep
their focus state. If nobody wants a narrow builder, delete `panel` instead.
State no view reads is a promise the runtime does not keep.

### B9. The drawn Builder in regions

**What happened.** The drawn Builder emits its panels as about ten siblings
in a fixed order (palette, layers, inspector, history, crumbs, viewports,
preview, alert, canvas, live). The example places each one on a five-column
grid by its Slot, with row spans worked out by hand. Adding the breadcrumb
meant renumbering the columns, and the live region had to be taken out of the
grid.

**Design.** The Builder draws four region Slots, and the panels inside them:

```text
root
├── start     palette, layers
├── toolbar   history, crumbs, viewports, preview
├── stage     alert, canvas (with B5's overlay)
└── end       inspector
live
```

A stylist lays out four regions, usually as a three-column grid with the
toolbar over the stage, and a new panel lands in its region without touching
the layout. The CMS editor screen (bar, canvas, aside) would follow the same
shape. This is a breaking change to every Builder style. Do it before other
applications write one.

### B10. `Option` at the Renderer's edge

**What happened.** `Renderer.render`'s edit options are `selected?: NodeId |
undefined`, `hovered?` and `drop?` (`composition/src/foldkit/index.ts:116`),
so the drawn Builder converts with `Option.getOrUndefined` at each call. The
project's rule is that a value that may be absent is an `Option`, and an
optional config field is fine. These are values, not config.

**Design.** Take `Option`s. `hovered` goes with B6. It is small and breaking,
so fold it into B6's change.

## Across packages

### X1. Block words in `foldkit-composition`

**What happened.** `BuilderView.describe({ label, description, group })` (added
in `b3ce438`) gives a Block its words for the palette, the layers and the
inspector. It lives in the drawn Builder, so nothing else sees it. The agent
path cannot: `Composition.operationSchema` gives a model one insert variant
per Block, named and typed but with no description, so a model chooses a
"FeaturedPost" by its name alone. The `Block.metadata` doc comment already
names both uses ("a palette category, an agent description"), which today
would be two annotations saying the same thing.

The appearance values have the same gap. The inspector turns `accent` into
"Accent" by spacing the code name, which is wrong as soon as a value is `lg`.

**Design.**

- `Block.define(name, { ..., words: { label, description, group } })` in
  `foldkit-composition`, read with `Words.of(block)`, the same function that
  reads a Schema's `title`.
- `operationSchema` annotates each insert variant with the Block's
  description, so an agent's tool input carries it. `Composition.describe`
  prints labels where they differ from names.
- Appearance values take words:
  `values: ['plain', { value: 'lg', label: 'Large' }]`.
- `BuilderView.describe` is removed, and the drawn Builder reads `Words.of`.
  Breaking, at 0.x, and the example is the only caller.

### X2. Slots that take content, not only attributes

**What happened.** The builder's icons (a Block's icon on its palette tile and
layer row, an action's icon, a viewport's) could not be added as elements. A
Style or Behavior contribution can add classes, inline style, attributes,
mount actions and CSS (`contribution.ts`), but no children. The example drew
each icon as a CSS mask over `::before`, keyed on `data-block`, `data-action`
and `data-viewport`, with the SVG in a data URL. It works, but it is a trick
every application would repeat, and it cannot do a count badge ("3 errors"),
an avatar, or anything with text.

**Design.** A contribution may add content before or after a Slot's
children:

```ts
Slot.content('paletteItem', {
  before: ({ item, h }) => blockIcon(h, item.block),
})
```

- It is message-free: content added this way cannot dispatch, which keeps the
  Slot's owner the only source of its Messages. Mind the trap already in
  AGENTS.md, where a message-free Mixin does not widen by `never`: name the
  message-free case in the accepted union.
- Several contributions concatenate in attach order.
- The `item` is what the view gave the Slot (`attrs(base, item)`). The drawn
  Builder passes `{ block }` for palette items and rows, which is the reason
  it carries `data-block` today.
- Content is decorative by default (`aria-hidden`) unless the contribution
  says it names something.

This is the largest change here and touches `foldkit-mixins`' core. Write it
as its own design before building, starting from the icon, badge and avatar
cases above.

## Order of work

1. **D1**, the source condition, starting with the two-package spike. It
   removes most of the day-to-day friction and three traps.
2. **D3, D4 and D5** together: one helper renders views inert, and the tests
   that use it enforce the Slot and inline rules.
3. **D2's diagnostic**, which turns F30 into a warning.
4. **B1**, which pays the debt `5d72112` added and is where B3's commands go.
5. **B2, then B3**: the largest visible gains for the least new design, on
   kernel pieces that exist.
6. **B9 and B10**, before anyone else writes a Builder style against today's
   shape.
7. **B5 and B6** together (one Behavior measures for both), then **B4** on
   top of B5's overlay.
8. **B7 and B8**, the narrow and responsive story.
9. **X1**, with the agent's tool input as its first new reader.
10. **X2**, after its own design document.
