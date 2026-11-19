# foldkit-mixins-builder

A headless page-builder state machine tracks undo, selection, and forms, but
authors still need a working editor on screen: a block palette, an accessible
layer tree, drag-and-drop drop indicators, inline text editing on the canvas,
and a responsive viewport preview. Wiring those keyboard handlers, ARIA roles,
and pointer drag listeners by hand takes hundreds of lines of DOM code.

`foldkit-mixins-builder` renders a [`foldkit-builder`](../builder/README.md) as
accessible HTML with every element exposed as a
[`foldkit-mixins`](../mixins/README.md) Slot. It connects tree keyboard
navigation, pointer drag-and-drop, inline text editing, and block settings
forms straight to the Builder's Messages while keeping all styling in your theme.

Try the editor live in the [live CMS demo](https://foldkit-cms-demo.pages.dev/).

## Install

```sh
pnpm add effect foldkit foldkit-bundle foldkit-builder foldkit-composition foldkit-form foldkit-mixins foldkit-mixins-builder
```

## A first styled page editor

This defines a `Heading` Block, creates a `PageBuilder`, and turns it into an
accessible editor view ready to attach styles or place in your app:

```ts
import { Schema } from 'effect'
import { Builder } from 'foldkit-builder'
import { Block, Catalog, Content } from 'foldkit-composition'
import { Renderer } from 'foldkit-composition/foldkit'
import { BuilderView } from 'foldkit-mixins-builder'

const Heading = Block.define('Heading', {
  Props: Schema.Struct({ text: Schema.String }),
  provides: [Content.Flow],
})
const Site = Catalog.make({ blocks: [Heading], roots: [Content.Flow] })
const SiteRenderer = Renderer.make(Site, {
  Heading: ({ field, h }) => h.h2([], [field('text')]),
})
const PageBuilder = Builder.make('PageBuilder', {
  catalog: Site,
  renderer: SiteRenderer,
  starters: { Heading: { text: 'New heading' } },
})

const PageEditing = BuilderView.define(PageBuilder)
const DrawnControl = PageBuilder.inputWith(BuilderView.submodel(PageEditing))
```

`PageEditing` renders the full editor (`palette`, `layers`, `inspector`,
`toolbar`, `canvas`, and `live` region) with keyboard navigation and drag
behaviors wired to `PageBuilder`, and `DrawnControl` plugs straight into a
`foldkit-form` field:

- **Palette**: one `aria-disabled`-capable button per Block with starter props
  (grouped by `Block.words`, followed by Catalog patterns), titled with where
  it inserts ("Adds it inside the Section") or why it is unavailable. Style
  `[aria-disabled="true"]` rather than `:disabled` so buttons stay focusable.
- **Layers**: a `role="tree"` of `treeitem` rows with a roving tab stop, Block
  label, truncated text preview, expand/collapse toggle, and hover sync with
  the canvas.
- **Inspector**: the selected node's Block label, description, shortcut-titled
  actions, and settings under Content, Style, Visibility, and Interactions (or
  a getting-started summary and shortcut list when unselected).
- **Toolbar and stage**: undo/redo buttons, selection breadcrumb, viewport
  width picker, `role="alert"` refusal banner, edit-mode canvas frame (with
  `empty` slot when blank), and a `live` announcement region.

## Where editor state, markup, and styles live

| Fact | Owner |
| --- | --- |
| Document, undo, selection, viewport, layers focus | `foldkit-builder` |
| How each Block renders on the page | your `Renderer` (`foldkit-composition/foldkit`) |
| Editor HTML elements and ARIA wiring | `foldkit-mixins-builder` |
| Classes, inline styles, extra attributes, and events | your `Style` and `Behavior` attachments |

Every interactive element dispatches the Builder's own Messages, keeping state
in the Builder's Model so browser interactions, tests, and agents go through
the same `update`.

## How the Builder, Mixins Slots, and Renderer connect

1. `Builder.make(...)` creates the Builder's Model, `update`, and plain view.
2. `BuilderView.define(builder)` builds the accessible SlotView over
   `BuilderSlots` with keyboard and pointer behaviors attached; attach theme
   styles with `.pipe(Style.attach(...))`.
3. `BuilderView.submodel(view)` adapts it into a Submodel view driven by
   `BuilderView.inputs({ data })`.
4. Place it standalone with `builder.bundle.pipe(Bundle.withView(...))` or as a
   form field with `builder.inputWith(...)`.

The canvas draws the page with your site's own `Renderer` in edit mode,
wrapping each node with its id so clicks, hovers, and drops target the node
under the pointer.

## The keyboard and the pointer

Five Behaviors from `foldkit-primitives` wire keyboard and pointer interactions:

| Where | Behavior | What it handles |
| --- | --- | --- |
| `tree`, `row` | `TreeNavigation` | Arrow, Home, and End focus movement; Right/Left expand or collapse rows |
| `layers`, `canvas` | `keyPressed` | Alt+Arrow moves; Mod+D duplicates; Delete removes; Mod+Z/Y undo/redo; Escape clears |
| `canvas` | `Targets` | Hover marking and click-to-select without following links |
| `canvas` | `EditableText` | Double-click or Enter edits text fields inline; Enter commits; Escape cancels |
| `layers`, `canvas` | `KeepInView` | Scrolls newly selected rows and canvas nodes into view |
| `tree`, `canvas` | `PointerDrag` | 4px drag (400ms hold on touch) moves nodes before, inside, or after targets |
| `nodeHandle` | `GripPlace` | Switches handle to `data-grip-place="inside"` when top space is tight |
| `nodeHandle` | `PointerDrag` | Grip drags the selected node; tap or click opens `nodeMenu` popover |
| `dragPreview` | `DragPreview` | Renders floating drag preview following `--fk-drag-x` / `--fk-drag-y` |
| `palette` | `PointerDrag` | Drags Block tiles onto canvas or layer rows; clicks insert at selection |

Key interaction details:

- **Shortcuts scope**: keyboard shortcuts attach to `layers` and `canvas`,
  keeping `Delete` inside inspector inputs for text editing. All action
  buttons, toolbar items, and shortcut hints read `PageBuilder.commands` and
  format keys for `BuilderView.inputs({ platform: 'mac' })`.
- **Grip and touch menu**: `GripPlace` checks scrolling ancestors'
  `scroll-padding-top` so sticky headers never cover `nodeGrip`. Clicking
  `nodeGrip` opens the `nodeMenu` popover (keep `nodeMenu` hidden when closed
  and set `display` only for open state).
- **Drag preview and drops**: `DragPreview` renders in the top layer with
  `aria-hidden` and CSS custom properties `--fk-drag-x` and `--fk-drag-y` so
  pointer moves avoid re-rendering. Dropping on a palette tile's target inserts
  a new Block (catalog patterns insert on press).
- **Announcements**: structural edits announce changes (such as "Moved Heading,
  2 of 3 in Section body") inside the `live` region using the Builder's words.

## Styling

`BuilderSlots` names every element; attach a Style as to any SlotView:

```ts
import { Style } from 'foldkit-mixins'
import { BuilderSlots, BuilderView } from 'foldkit-mixins-builder'

const Styled = BuilderView.define(PageBuilder).pipe(
  Style.attach(
    Style.forSlots(BuilderSlots)({
      root: Style.class('builder'),
      row: Style.class('builder-row'),
      canvas: Style.class('builder-canvas'),
    }),
  ),
)
```

`BuilderView.define` places the editor inside `root` (the `builder` CSS
container) with four structural slots:

- `panelTabs`: compact toggle buttons shown below the narrow breakpoint.
- `regions`: holds four named areas—`start` (`palette`, `layers`), `bar`
  (`toolbar`, `crumbs`, `viewports`, `preview`), `stage` (`alert`, `canvas`),
  and `end` (`inspector`).
- `live`: polite/assertive announcement region.

`root` is a container (`container: builder / inline-size`, the Builder's
default Style), so `@container builder (max-width: 64rem)` lays out panels by
the editor's own width rather than the viewport width. Give `root` an explicit
width (flex grow, grid track, or `100%`) because inline-size containers take zero
intrinsic width from their children. Custom layouts using `assemble` build
their own structure from parts.

A node's props are drawn by its Block's settings form, a `foldkit-mixins-form`
view the Builder makes. Give its Styles to `define` (or `parts`), and they are
attached to every Block's settings form:

```ts
import { FieldSlots, FormSlots } from 'foldkit-mixins-form'

const Configured = BuilderView.define(PageBuilder, {
  settings: {
    field: Style.attach(Style.forSlots(FieldSlots)({ label: Style.class('setting-label') })),
    form: Style.attach(Style.forSlots(FormSlots)({ root: Style.class('settings') })),
  },
})
```

A control kind of the application's own (`Input.kind`) is drawn by the
renderers the application gives, the same ones its form views take. Each
Block's settings form has Messages of its own, so they are given as a
function of the Message, as `foldkit-form-recipes/html`'s `renderers` is:
`BuilderView.define(PageBuilder, { settings: { renderers } })`.
Without one, the inspector says which renderer is missing.

The page on the canvas is the site's own markup, so it is styled by the site's
CSS, and the editor marks it by drawing over it: the `selectionBox` Slot sits
over the selected node, with its Block's label in `selectionLabel`, and the
`hoverBox` Slot over the node under the pointer. They are placed from where
the nodes are measured to be (`Measure`, from `foldkit-primitives/dom`),
scroll with the page, and take no pointer; the Builder places them, and a
Style says how they look:

```ts
Style.forSlots(BuilderSlots)({
  selectionBox: Style.self({ outline: '2px solid Highlight', outlineOffset: '3px' }),
  selectionLabel: Style.self({ background: 'Highlight', color: 'HighlightText', fontSize: '0.75rem' }),
  hoverBox: Style.self({ outline: '1px dashed GrayText', outlineOffset: '3px' }),
})
```

A node's wrapper still carries `data-composition-mark` (`selected`, or
`hovered`; a node that is both is `selected`), which is what the boxes are
measured from, and `data-composition-drop` (`before`, `inside` or `after`) on
the node a drop would land at. A wrapper is `display: contents` and draws
nothing, so style the element inside it. The layer rows carry
`data-builder-drop` and `data-builder-dragging` the same way.

Over a container's own space (the page's, or a Section's padding or the gap
between two of its nodes) a drop lands between its children: before the first
whose middle, along the container's flow (a row, a column, right to left), is
past the pointer, else after the last, decided from where the pointer is when it
moves and again where it lets go. Only that container's children are measured.
Past the last node of the page itself it lands last, which the frame and the
layers' `tree` mark as `data-builder-drop="end"`. While a drag is under
way `dragPreview`, `canvas` and `tree` carry `data-drag-place`: `here` where a
drop would land and `nowhere` where it would be refused or the pointer is over
nothing, so a look can show the one and refuse the other (a dashed preview, a
`not-allowed` cursor).

A drag under way also writes the pointer's place on the document root, for
the preview and for any style of yours that follows the pointer: `--fk-drag-x`
and `--fk-drag-y` (pixels) and `data-fk-drag="mouse | touch | pen"`, all
removed when the drag ends. `dragPreview` reads them; the defaults put it
beside the pointer, and above a finger.

```css
[data-composition-drop='before'] > * { box-shadow: 0 -3px 0 Highlight; }
[data-composition-drop='after'] > * { box-shadow: 0 3px 0 Highlight; }
[data-composition-drop='inside'] > * { outline: 2px dashed Highlight; }
[data-builder-dragging] { opacity: 0.5; }
```

## Your own layout

`BuilderView.define` places every part of the editor. To leave some out, move
them, or draw your own elements among them, take the parts and assemble them:

```ts
const parts = BuilderView.parts(PageBuilder)
const Compact = BuilderView.assemble((_model, slots, h, draw) =>
  h.div(slots.root.attrs(), [
    h.h1([], ['Home page']),
    draw(parts.Palette),
    draw(parts.Canvas),
    draw(parts.Inspector),
  ]),
)
```

The parts are `Panels`, `Palette`, `Layers`, `Inspector`, `Toolbar`, `Crumbs`,
`Viewports`, `Preview`, `Alert`, `Canvas`, `Carried` (what a drag carries; a
layout without it shows nothing following a drag) and `Live`. Each brings its own
Behaviors: `Layers` its tree keyboard and dragging, `Canvas` the pointer, and
both the shortcuts. A layout without `Layers` has no tree keyboard. Styles
attach to `Compact` as to `define`'s view.

Each part names the Model fields it reads and is drawn again only when one of
them changed: a hover redraws the canvas and nothing else. A Style that reads
the Model (`Style.whenInput`) attached to the whole view makes every part it
reaches redraw on every change. It is still correct, just not cached.

## A narrow editor

Where the editor is narrow, it can show one of its three panels at a time:

```ts
const Narrow = BuilderView.define(PageBuilder).pipe(
  Style.attach(BuilderView.narrow('52rem')),
)
```

- **The width is the editor's own, not the window's.** Below `width` of the
  container `builder`, the Builder's root, the `Panels` part shows: a
  `role="group"` of three buttons (Add, Layers, Settings), the chosen one
  `aria-pressed`, as the viewports are, and only the panel the Builder's
  `panel` names shows. Wider, the buttons are hidden (the Builder's default
  Style) and every panel shows. They are not ARIA tabs, which would promise
  arrow keys and a roving tab stop.
- **The Builder chooses the panel as it always has:** a button sends
  `PanelChosen`, and selecting a node on the page chooses Settings; a row
  clicked in the layers selects its node and keeps the layers showing. Each panel carries its
  `id`, `data-panel` and `data-panel-shown`, and each button `aria-controls`
  it; a layout of your own that draws `Panels` should draw the three panels.
- **It is in the `app` layer**, so it outranks an application's placing of
  the panels in `app` or an earlier layer; an unlayered style outranks every
  layer, and would show a hidden panel. `narrow(width, { layer })` puts it
  elsewhere.

## As a form key

`builder.inputWith(view)` wraps the Builder's form control (`builder.input`)
with your custom `BuilderView` so the form draws it through that Bundle view.
Continuing with `PageBuilder` and `PageEditing` (see
[the Builder guide](../builder/README.md#a-first-page-builder)):

```ts
import { Composition } from 'foldkit-composition'
import { Entity } from 'foldkit-entity'
import { Form } from 'foldkit-form'

const Page = Entity.define('Page', Schema.Struct({ id: Schema.String, document: Composition.Document }))
const PageInput = Entity.input(
  Page,
  Schema.Struct({ document: Composition.Document.check(Composition.valid(Site)) }),
)
const PageForm = Form.make('PageForm', PageInput, {
  inputs: { document: PageBuilder.inputWith(BuilderView.submodel(PageEditing)) },
})
```

The CMS example places its page form this way.

## The canvas and the page's data

A Query or Surface Block draws from its node's read, which belongs to your
application rather than the Builder. The page's parent reads those inputs (for
preview and publishing) and passes them to the canvas as view inputs:

<!-- docs-check
import type { HtmlBuilder } from 'foldkit/html'
import type { Message } from 'foldkit-builder'
declare const model: object
declare const h: HtmlBuilder<Message>
declare const reads: { data: (model: object) => Parameters<typeof BuilderView.inputs>[0] extends infer I ? (I extends { data: infer D } ? D : never) : never }
declare const EditorSlot: {
  view: (
    model: object,
    h: HtmlBuilder<Message>,
    inputs: { controls: { document: ReturnType<typeof BuilderView.inputs> } },
  ) => unknown
}
-->
```ts
EditorSlot.view(model, h, {
  controls: {
    document: BuilderView.inputs({ data: reads.data(model) }),
  },
})
```

`reads` is `QueryBlock.active(...)` (or `SurfaceBlock.active(...)`), the same
active Surface that fetches them. Placed on its own, the drawn Builder takes
the same inputs: `placed.view(model, h, BuilderView.inputs({ data }))`. The
canvas draws with `Renderer.make`, so a Block's actions do not run there.

## What the inspector draws

The selected node's props are its Block's settings form, a `foldkit-form` form
that `foldkit-builder` makes (see its README), drawn by `foldkit-mixins-form`'s
`FormView`. So each prop gets the control a form would give it, and its fields
are styled through `FieldSlots` and `FormSlots`, as any form's are:

| Prop Schema | Control |
| --- | --- |
| `Schema.Boolean` | `input type="checkbox"` |
| `Schema.Literals([...])` | `select` of the literals, text or numbers; a number is stored as a number |
| `Schema.Number` | `input type="text"`, so "1." is kept while it is typed |
| `Schema.String`, and a brand of it such as `Url` | `input type="text"` |
| anything else | its JSON, shown and not edited |

A control of the application's own, such as a color picker given with
`Builder.controls({ tint: Input.bundle(...) })`, is drawn with its Bundle's
view, as any form draws it. A field is labelled with its Schema's `title`,
else its prop key, spaced. A change that decodes is one `setProp`, and typing
a word is one undo step. One that does not (`abc` for a number, an address its
brand refuses) shows its error at its field and changes nothing.

Where the Schema alone does not say, the Block asks for a control through
metadata. `Input.multiline()` draws a `textarea`, and `Input.hidden()` leaves
the prop out:

```ts
import { Schema } from 'effect'
import { Block, Content } from 'foldkit-composition'
import { Builder } from 'foldkit-builder'
import { Input } from 'foldkit-form'

const Quote = Block.define('Quote', {
  Props: Schema.Struct({
    text: Schema.String.annotate({ title: 'Quotation' }),
    ref: Schema.String,
  }),
  provides: [Content.Flow],
}).pipe(Block.annotate(Builder.controls({ text: Input.multiline(), ref: Input.hidden() })))
```

The hint is `foldkit-builder`'s, kept on the Block beside any other package's
metadata; `foldkit-composition` does not read it. A later annotation's prop
replaces an earlier one's.

### What the editor calls a Block

A Block's `label`, `description` and palette `group` are its words, from
`foldkit-composition`, which an agent's tool reads too:

```ts
const Described = Quote.pipe(Block.words({ group: 'Text', description: 'Words someone said' }))
```

The label defaults to the Block's name spaced (`PostList` is "Post list"), and
Blocks given no group share one, "Blocks"; a group is headed only when there is
more than one. The palette shows the label and the description, and a layer row
the label and the node's first text prop, cut to forty characters. Palette
buttons and layer rows carry `data-block` with the Block's name, so a Style can
give each an icon; a pattern's button carries `data-pattern` with its name.

### A prop that points at the application's things

A prop holding an id, such as the category a list shows, asks for a picker:
`Input.relationOne(Category)` draws a `select`, and `Input.relationMany(Tag)`
a group of checkboxes over a prop that is an array of ids. What they choose
from is the application's rows, loaded by its own query as a form's picker
options are; the page's parent gives them in the Builder's view inputs, keyed
`'Block.prop'`:

<!-- docs-check
const Category = Entity.define('Category', Schema.Struct({ id: Schema.String, name: Schema.String }))
declare const categories: ReadonlyArray<{ readonly id: string; readonly name: string }>
-->
```ts
const Featured = Block.define('Featured', {
  Props: Schema.Struct({ category: Schema.NullOr(Schema.String) }),
  provides: [Content.Flow],
}).pipe(Block.annotate(Builder.controls({ category: Input.relationOne(Category) })))

EditorSlot.view(model, h, {
  controls: {
    document: BuilderView.inputs({
      options: { 'Featured.category': categories.map(c => ({ value: c.id, label: c.name })) },
    }),
  },
})
```

A `relationOne` always offers "none", stored as `null` where the Schema admits
it; choosing it for a prop that needs an id says so at the field. A chosen id
the choices lack (a row since deleted, or choices not loaded yet) is shown as
`? id`; in a `relationMany` it stays chosen until it is unchecked. The
inspector lists the choices it is given and has no search box.

A node whose Block the Catalog does not know is shown, with its props, but not
edited. A stored value a `select` does not offer, such as a choice an older
version made, is shown as `? value` and chosen, with its error, rather than as
the blank.

The props are under Content, labelled by their Schema's `title`, else their
key spaced (`text` is "Text"). Under Style, each appearance axis the Block
offers: one of up to four values is a row of buttons, "Default" and each value,
the chosen one pressed (a stored value the axis lacks is shown pressed as
`? value`); one with more values is a `select`, with a blank for the default. A
choice is one `setAppearance`, and choosing the default for the last one
removes the node's `appearance`. A responsive token axis is a `select` per
breakpoint (`Space at md`), blank for unchanged; with only the base chosen, one
name is stored.

Then, under Visibility, when the Catalog declares a `context`, one field per
context key says when the node shows: `Shown when audience is` is a `select` of
the key's literals (a
flag's is `true` and `false`, other keys are typed in), with a blank for
always. A choice is one `setWhen` holding an `eq` condition for that key;
conditions of other kinds are kept as they are, and clearing the last removes
the node's `when`.

Last, under Interactions, each event the Block names says what it runs:
`On press` is a `select`
of the Catalog's actions, blank for nothing, and under it the chosen action's
input as a form of its own, drawn and styled as the props are; its ids are
`<Block>-<event>-<action>-<key>`. Choosing an action starts its input from
each field's empty value as stored (`''`, `null`, `false`), else zero or a
select's first choice (`inputOf(block, event, action).seed()` in
`foldkit-builder`); a start the action's Schema still refuses is refused and
shown in the alert. Each change to the input is one
`setAction` with the changed keys over the rest, and choosing nothing removes
it.

The looks and the conditions stay the Builder's own controls, drawn through
`BuilderSlots`: each is a choice from a fixed list, which a form would draw no
better.

## The editor's words

Every word the editor shows of its own, from "Add a block" to the shortcut
list's headings, is one of `BuilderWords`, English by default
(`builderWords`). Give any of them as a view input:

```ts
BuilderView.inputs({
  words: { palette: 'Bloque nuevo', addBlock: 'Añadir {label}' },
})
```

Keep the words in one value made once, not built in the view: each part that
draws words is drawn again when the object it is given is another one.

Words are text: a word that takes a value names it as a blank (`'Add {label}'`),
so a translation puts it where its language does. They are not functions,
because they are a view input, and Foldkit throws on a function nested in
one; being text, one object can hold a form's words and these. The Catalog's
words (a Block's label and description, its group) and the command table's
labels are the application's already, and are not among them; so are key
names, but for the named keys (Enter, Delete), which `keyNames` words. A test draws the editor with every word replaced by a marker
and finds nothing else of its own left.

## Previewing a context

With a Catalog `context`, a `role="group"` labelled "Preview as" (the
`preview` Slot) holds one field per key, a blank for unset. The canvas draws
the page for that context: a node hidden there is still drawn, marked
`data-composition-hidden`, which the site's CSS can dim:

```css
[data-composition-hidden] > * { opacity: 0.4; }
```

## Limits

- Rich text on the canvas is edited in the inspector rather than inline.
- A drag moves one selected node at a time.
- Two Builders on one page need different names: the inspector's form is placed
  under the Builder's name, and one drawn twice crashes naming the duplicate.
  Its fields' ids are `<Block>Settings-<prop>`, so two Builders over one Catalog
  showing the same Block also share ids.
- The grip sits above the selected node's top edge, so a page whose first node
  touches the top of the canvas needs top padding for it. Its menu uses CSS
  anchor positioning and falls back to the window center in unsupported
  browsers. Touch users hold the grip to drag or tap it to open the menu.
- The viewport frame sets `--fk-frame-width` on the frame, read by the
  Builder's default rule (in `components`, so any application style overrides
  it). Because the frame renders inline rather than in an iframe, media queries
  see the editor's width; write responsive block rules with container queries or
  `cqi` units against `PAGE_CONTAINER` (`Theme.inContainer`).

## Next

- Inspect Builder Messages, undo grouping, and URL selection syncing:
  [`foldkit-builder`](../builder/README.md).
- Define Blocks, Regions, Conditions, Actions, and Appearance tokens:
  [`foldkit-composition`](../composition/README.md).
- Run the full page editor inside a CMS workflow:
  [the CMS example](../../examples/cms/README.md).
