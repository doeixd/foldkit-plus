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
BuilderView.submodel(view)           a Submodel view
      |
builder.bundle.pipe(Bundle.withView(...))   placed on its own, or
builder.inputWith(...)                      as a form key whose value is the page
```

The page on the canvas is drawn by the site's Renderer, the same one the public
page uses, in edit mode: each node is wrapped in an element carrying its id, so
a click or hover on the page names the node under it.

## Install

```sh
pnpm add effect foldkit foldkit-bundle foldkit-builder foldkit-composition foldkit-mixins foldkit-mixins-builder
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

- a **palette**: one `Add <Block>` button per Block with starting props, each
  disabled where the selection leaves no place for it;
- the **layers**: a `role="tree"` of the page's nodes, one `treeitem` row each,
  with a roving tab stop on the selected row;
- the selected node's **actions** (move up, down, out and in; duplicate;
  delete) and its props in an **inspector**;
- **undo** and **redo**, a **viewport** picker, and the reason the last edit
  was refused, as a `role="alert"`;
- the **canvas**: the page in edit mode, in a frame as wide as the viewport;
- a **live region** the Builder's announcements are read from.

## The keyboard and the pointer

Four Behaviors are attached, each from `foldkit-primitives`:

| Where | Behavior | What it does |
| --- | --- | --- |
| `tree`, `row` | `TreeNavigation` | Up, Down, Home and End move focus between rows; Right opens a row, then moves to its first child; Left closes it, then moves to its parent. Focus moving selects the row's node. |
| `layers` | the Builder's `keyCommand` | Alt with an arrow moves the selected node; Mod+D duplicates; Delete removes; Mod+Z, Mod+Shift+Z and Mod+Y undo and redo. |
| `canvas` | `Targets` | The pointer over a node marks it hovered; a press selects it and does not follow a link. |
| `tree`, `canvas` | `PointerDrag` | A row or a node pressed and moved 4px is dragged; over another, the drop lands before it, inside it or after it by which third of it the pointer is in; releasing moves it there, and Escape cancels. |

The shortcuts are on the layers panel, not the whole editor, so Delete in a
text box edits the text. The action buttons send the same Messages the
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
`data-composition-selected`, `data-composition-hovered`, and
`data-composition-drop` (`before`, `inside` or `after`) on the node a drop
would land at. A wrapper is `display: contents` and draws nothing, so style
the element inside it. The layer rows carry `data-builder-drop` and
`data-builder-dragging` the same way.

```css
[data-composition-selected] > * { outline: 2px solid Highlight; }
[data-composition-hovered] > * { outline: 1px dashed GrayText; }
[data-composition-drop='before'] > * { box-shadow: 0 -3px 0 Highlight; }
[data-composition-drop='after'] > * { box-shadow: 0 3px 0 Highlight; }
[data-composition-drop='inside'] > * { outline: 2px dashed Highlight; }
[data-builder-dragging] { opacity: 0.5; }
```

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

## What the inspector draws

Each field of the selected Block's props Schema is resolved as a form would
resolve it:

| Prop Schema | Control |
| --- | --- |
| `Schema.Boolean` | `input type="checkbox"` |
| `Schema.Literals([...])` | `select` of the literals |
| `Schema.Number` | `input`; text that is not a number is kept, and the page refuses it |
| `Schema.String`, and a brand of it such as `Url` | `input` |
| anything else | its JSON, shown and not edited |

After the props, each appearance axis the Block offers is a `select` of its
values, with a blank for the default; a choice is one `setAppearance`, and
clearing the last one removes the node's `appearance`.

A field is labelled with its Schema's `title`, else its prop key.

Where the Schema alone does not say, the Block asks for a control through
metadata. `Input.multiline()` draws a `textarea`, and `Input.hidden()` leaves
the prop out:

```ts
import { Block } from 'foldkit-composition'
import { Input } from 'foldkit-form'

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

Each edit is one `setProp`, checked by the Block's Schema; a refused edit shows
in the alert and changes nothing. A node whose Block the Catalog does not know
is shown, with its props, but not edited.

## Limits

- Rich text on the canvas is not edited in place: its Block's props are shown
  in the inspector.
- A drag moves one node, the selected one; there is no multiple selection.
- A drag does not scroll the layers or the canvas when the pointer nears an
  edge.
- The viewport frame sets a width. It does not load the page in an iframe, so
  the page's media queries see the editor's width.
