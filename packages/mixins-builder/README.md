# foldkit-mixins-builder

Draws a [`foldkit-builder`](../builder/README.md) page Builder as accessible
HTML, with every element published as a [`foldkit-mixins`](../mixins/README.md)
Slot. The Builder owns the page being edited and the editor's state; this
package decides which elements show it and wires the keyboard and pointer to
the Builder's own Messages; your Style and Behavior attachments decide how it
looks.

## What it owns

| Fact | Owner |
| --- | --- |
| The Document, undo, the selection, the viewport, the layers' focus | `foldkit-builder` |
| How a Block looks on the page | the site's `Renderer` (`foldkit-composition/foldkit`) |
| Which element draws each part of the editor, and its accessibility wiring | `foldkit-mixins-builder` |
| Classes, inline style, extra attributes and events | your `Style` / `Behavior` attachments |

It holds no state and adds no Messages. Every event it installs dispatches one
of the Builder's own, so a Builder drawn this way and a Builder driven by a
test or an agent go through the same `update`.

## Mental model

```text
Builder.make(...)                    the Builder: Model, update, a plain view
      |
BuilderView.define(builder)          the editor, as a SlotView over BuilderSlots,
      |   .pipe(Style.attach(...))   with its keyboard and pointer Behaviors
BuilderView.submodel(view)           a Submodel view, drawn with BuilderView.inputs({ data })
      |
builder.bundle.pipe(Bundle.withView(...))   placed on its own, or
builder.inputWith(...)                      as a form key whose value is the page
```

The page on the canvas is drawn by the site's Renderer, the same one the public
page uses, in edit mode: each node is wrapped in an element carrying its id, so
a click or hover on the page names the node under it.

## Install

```sh
pnpm add effect foldkit foldkit-bundle foldkit-builder foldkit-composition foldkit-form foldkit-mixins foldkit-mixins-builder
```

## Start without customization

Given `PageBuilder`, a `Builder.make` result from the
[Builder's example](../builder/README.md#sixty-seconds):

```ts
import { Bundle } from 'foldkit-bundle'
import { BuilderView } from 'foldkit-mixins-builder'

const PageEditing = BuilderView.define(PageBuilder)
const Drawn = PageBuilder.bundle.pipe(Bundle.withView(BuilderView.submodel(PageEditing)))
```

Place `Drawn` as you would any Bundle. Its view draws:

- a **palette**: one button per Block with starting props, named
  "Add <label>" and grouped, each titled with where it would go ("Adds it
  inside the Section") or disabled, saying why, where the selection leaves no
  place for it;
- the **layers**: a `role="tree"` of the page's nodes, one `treeitem` row each,
  with a roving tab stop on the selected row; a row shows its Block's label and
  the node's first text in brief, and one that holds others has a toggle that
  opens and closes it; pointing at a row marks its node on the page, as
  pointing at the page does;
- an **inspector**: the selected node's Block, what it is for, and its
  **actions** (move up, down, out and in; duplicate; delete; each titled with
  its shortcut), then its settings under Content, Style, Visibility and
  Interactions; with nothing selected, how to begin and the shortcuts;
- **undo** and **redo**, a **breadcrumb** of where the selection is (the
  page, then each node holding it; a press selects that one), a **viewport**
  picker, and the reason the last edit was refused, as a `role="alert"`;
- the **canvas**: the page in edit mode, in a frame as wide as the viewport,
  saying how to begin (the `empty` Slot) while the page holds nothing;
- a **live region** the Builder's announcements are read from.

## The keyboard and the pointer

Five Behaviors are attached, each from `foldkit-primitives`:

| Where | Behavior | What it does |
| --- | --- | --- |
| `tree`, `row` | `TreeNavigation` | Up, Down, Home and End move focus between rows; Right opens a row, then moves to its first child; Left closes it, then moves to its parent. Focus moving selects the row's node. |
| `layers`, `canvas` | the Builder's `keyCommand` | Alt with an arrow moves the selected node; Mod+D duplicates; Delete removes; Mod+Z, Mod+Shift+Z and Mod+Y undo and redo; Escape deselects. |
| `canvas` | `Targets` | The pointer over a node marks it hovered; a press selects it and does not follow a link. |
| `layers`, `canvas` | `KeepInView` | Whatever became selected (a click, a shortcut, an insert, the address) is scrolled into view, its row in the layers and its element on the page. |
| `tree`, `canvas` | `PointerDrag` | A row or a node pressed and moved 4px is dragged; over another, the drop lands before it, inside it or after it by which third of it the pointer is in; releasing moves it there, and Escape cancels. |

The shortcuts are on the layers panel and the canvas, not the whole editor,
so Delete in a text box edits the text. The canvas is focusable, so a press on
the page leaves focus where the shortcuts are. The action buttons send the same Messages the
shortcuts do. A drag is the pointer's way to do what Alt with an arrow does;
it adds no roles or keys to the tree, and a drop is announced like a key's
move.

A structural edit is announced, such as "Moved Heading, 2 of 3 in Section
body". The Builder owns the words; this package draws the region.

## Styling

`BuilderSlots` names every element; attach a Style as to any SlotView:

```ts
import { Style } from 'foldkit-mixins'
import { BuilderSlots, BuilderView } from 'foldkit-mixins-builder'

const PageEditing = BuilderView.define(PageBuilder).pipe(
  Style.attach(
    Style.forSlots(BuilderSlots)({
      root: Style.class('builder'),
      row: Style.class('builder-row'),
      canvas: Style.class('builder-canvas'),
    }),
  ),
)
```

The page on the canvas is the site's own markup, so it is styled by the site's
CSS. The editor's marks are data attributes on each node's wrapper:
`data-composition-mark` (`selected`, or `hovered`; a node that is both is
`selected`), and `data-composition-drop` (`before`, `inside` or `after`) on the node a drop
would land at. A wrapper is `display: contents` and draws nothing, so style
the element inside it. The layer rows carry `data-builder-drop` and
`data-builder-dragging` the same way.

```css
[data-composition-mark='selected'] > * { outline: 2px solid Highlight; }
[data-composition-mark='hovered'] > * { outline: 1px dashed GrayText; }
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

The parts are `Palette`, `Layers`, `Inspector`, `History`, `Crumbs`,
`Viewports`, `Preview`, `Alert`, `Canvas` and `Live`. Each brings its own
Behaviors: `Layers` its tree keyboard and dragging, `Canvas` the pointer, and
both the shortcuts. A layout without `Layers` has no tree keyboard. Styles
attach to `Compact` as to `define`'s view.

Each part names the Model fields it reads and is drawn again only when one of
them changed: a hover redraws the canvas and nothing else. A Style that reads
the Model (`Style.whenInput`) attached to the whole view makes every part it
reaches redraw on every change. It is still correct, just not cached.

## As a form key

`builder.inputWith(view)` is the Builder's form control, `builder.input`, drawn
by another view. The form draws a Bundle-backed control with the Bundle's own
view, so no renderer is needed. With `PageInput` from the
[Builder's example](../builder/README.md#sixty-seconds):

```ts
import { Form } from 'foldkit-form'

const PageForm = Form.make('PageForm', PageInput, {
  inputs: { document: PageBuilder.inputWith(BuilderView.submodel(PageEditing)) },
})
```

The CMS example (`examples/cms`) places its page form this way.

## The canvas and the page's data

A Query or Surface Block draws from its node's read, which is the
application's, not the Builder's. The page's parent reads them, as it must to
preview or publish the page, and gives them to the canvas as the Builder's view
inputs; the Builder keeps no copy:

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

Each field of the selected Block's props Schema is resolved as a form would
resolve it:

| Prop Schema | Control |
| --- | --- |
| `Schema.Boolean` | `input type="checkbox"` |
| `Schema.Literals([...])` | `select` of the literals, text or numbers; a number is stored as a number |
| `Schema.Number` | `input`; text that is not a number is kept, and the page refuses it |
| `Schema.String`, and a brand of it such as `Url` | `input` |
| anything else | its JSON, shown and not edited |

A field is labelled with its Schema's `title`, else its prop key.

Where the Schema alone does not say, the Block asks for a control through
metadata. `Input.multiline()` draws a `textarea`, and `Input.hidden()` leaves
the prop out:

```ts
import { Schema } from 'effect'
import { Block, Content } from 'foldkit-composition'
import { Input } from 'foldkit-form'
import { BuilderView } from 'foldkit-mixins-builder'

const Quote = Block.define('Quote', {
  Props: Schema.Struct({
    text: Schema.String.annotate({ title: 'Quotation' }),
    ref: Schema.String,
  }),
  provides: [Content.Flow],
}).pipe(Block.annotate(BuilderView.controls({ text: Input.multiline(), ref: Input.hidden() })))
```

The hint is the inspector's, kept on the Block beside any other package's
metadata; `foldkit-composition` does not read it. A later annotation's prop
replaces an earlier one's.

### What the editor calls a Block

A Block's `label`, `description` and palette `group` are metadata too:

```ts
const Described = Quote.pipe(
  Block.annotate(BuilderView.describe({ group: 'Text', description: 'Words someone said' })),
)
```

The label defaults to the Block's name spaced (`PostList` is "Post list"), and
Blocks given no group share one, "Blocks"; a group is headed only when there is
more than one. The palette shows the label and the description, and a layer row
the label and the node's first text prop, cut to forty characters. Palette
buttons and layer rows carry `data-block` with the Block's name, so a Style can
give each an icon.

### A prop that points at the application's things

A prop holding an id, such as the category a list shows, asks for a picker:
`Input.relationOne(Category)` draws a `select`, and `Input.relationMany(Tag)`
a group of checkboxes over a prop that is an array of ids. What they choose
from is the application's rows, loaded by its own query as a form's picker
options are; the page's parent gives them in the Builder's view inputs, keyed
`'Block.prop'`:

```ts
const Featured = Block.define('Featured', {
  Props: Schema.Struct({ category: Schema.NullOr(Schema.String) }),
  provides: [Content.Flow],
}).pipe(Block.annotate(BuilderView.controls({ category: Input.relationOne(Category) })))

EditorSlot.view(model, h, {
  controls: {
    document: BuilderView.inputs({
      options: { 'Featured.category': categories.map(c => ({ value: c.id, label: c.name })) },
    }),
  },
})
```

A `relationOne` offers a blank, stored as `null`, when its Schema admits
`null`, and otherwise only while nothing is chosen. A chosen id the choices lack
(a row since deleted, or choices not loaded yet) is shown as `? id`; in a
`relationMany` it stays chosen until it is unchecked. The inspector lists the
choices it is given and has no search box.

Each edit is one `setProp`, checked by the Block's Schema; a refused edit shows
in the alert and changes nothing. A node whose Block the Catalog does not know
is shown, with its props, but not edited. A stored value a `select` does not
offer, such as a choice an older version made, is shown as `? value` and
chosen, rather than as the blank.

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
input, one field each, drawn as a prop would be. Choosing an action starts its
input from empty values (the first choice of a select); a start the action's
Schema still refuses is refused and shown in the alert. Each change is one
`setAction`, and choosing nothing removes it.

## Previewing a context

With a Catalog `context`, a `role="group"` labelled "Preview as" (the
`preview` Slot) holds one field per key, a blank for unset. The canvas draws
the page for that context: a node hidden there is still drawn, marked
`data-composition-hidden`, which the site's CSS can dim:

```css
[data-composition-hidden] > * { opacity: 0.4; }
```

## Limits

- Rich text on the canvas is not edited in place: its Block's props are shown
  in the inspector.
- A drag moves one node, the selected one; there is no multiple selection.
- A drag does not scroll the layers or the canvas when the pointer nears an
  edge.
- The viewport frame sets a width: `--fk-frame-width` on the frame, read by
  the Builder's one default rule (in `components`, so any application style
  overrides it). It does not load the page in an iframe, so the page's media
  queries see the editor's width.
