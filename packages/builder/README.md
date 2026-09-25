# foldkit-builder

The page builder's state, as an ordinary [Bundle](../bundle/README.md). It
edits a [`foldkit-composition`](../composition/README.md) Document by
Operations, with a selection and undo beside it, and it is designed to be one
form key's control: the page is the key's value, so the form validates it,
submits it, and a CMS autosaves it.

> **Status: in development, not published.** The headless Builder and a plain
> view, from the [page builder design](../../docs/design/pagebuilder-DESIGN.md).
> The drawn editor is [`foldkit-mixins-builder`](../mixins-builder/README.md).

## What it owns

| Fact | Owner |
| --- | --- |
| What a page may hold, and how each Block looks | the application: a Catalog and a Renderer |
| The page being edited | the Builder's Model, as the form key's value |
| Undo | the Builder's Model: the page is kept as a `foldkit-primitives/state` history |
| What is selected, the open panel, the viewport | the Builder's Model, beside the page |
| The layers' keyboard focus and which rows are open | the Builder's Model, as a `TreeNavigation` placement |
| What the editor last said to assistive technology | the Builder's Model, as a `LiveAnnounce` placement |
| Saving, revisions, publishing | the form, and `foldkit-cms` around it |

The Catalog and the Renderer are vocabulary, not state. The Builder closes over
them where it is made; they never enter the Model or a placement's args.

## Mental model

```text
view: a click, a key ─► Builder Message ─► Composition.apply ─► next Document
                                                                     │
                                        History.push(page, document) ◄┘   one transition
Form: Control Message carries it; a change of Document is an edit; the rest is not
```

## Sixty seconds

```ts
import { Builder } from 'foldkit-builder'

const PageBuilder = Builder.make('PageBuilder', {
  catalog: Site,
  renderer: SiteRenderer,
  // What a new node of each Block starts with. The insert panel offers exactly these.
  starters: { Section: {}, Heading: { text: 'New heading' } },
})

const PageForm = Form.make('PageForm', PageInput, {
  inputs: { document: PageBuilder.input },
})
```

- `Builder.make` builds a Bundle (`PageBuilder.bundle`) and the form control that
  places it as a key (`PageBuilder.input`). Nothing runs until it is placed.
- In the form, `PageForm.control('document').field(model).value` is the
  Builder's Model. Its `page` is an undo history whose `present` is the
  Document; `PageBuilder.document(model)` reads it.
- Its view is a plain editor: a palette of the Blocks with starting props, the
  layers with move, duplicate and delete for the selected node, the selected
  node's text props, undo and redo, and the page drawn in edit mode.
  `foldkit-mixins-form` draws it with the rest of the form. For the full
  editor, `PageBuilder.inputWith(BuilderView.submodel(view))` is the same
  control drawn by [`foldkit-mixins-builder`](../mixins-builder/README.md).

## Messages

| Message | What it does |
| --- | --- |
| `Applied({ op })` | applies an Operation; a button, a key, a drag or an agent sends the same |
| `InsertAsked({ block, at })` | a new node with the Block's starting props, once an id is minted |
| `DuplicateAsked({ id, at })` | a copy of a node and what it holds, once ids are minted |
| `Minted({ ids, request })` | the ids a request waited for, answered by a Command |
| `Selected({ id })`, `Hovered({ id })` | what the inspector and the node actions work on |
| `Undid()`, `Redid()` | a step of the page's undo history |
| `PanelChosen({ panel })`, `ViewportChosen({ viewport })` | the editor's own choices |
| `DragStarted({ id })`, `DraggedOver({ over })`, `DragDropped()`, `DragCancelled()` | a pointer drag: see below |
| `Layers.wrapper.make(...)`, `Announcer.wrapper.make(...)` | the placed tree and announcer's own Messages |

- **Ids are minted in a Command** (`Composition.newIds`), so `update` stays pure
  and an Operation always carries the ids it creates. Nothing changes until
  they arrive.
- **An applied Operation and its undo step change together:** the Builder
  pushes the new Document onto its page history, a `foldkit-primitives/state`
  history. Consecutive edits of one prop of one node share a group, so typing a
  heading undoes as a whole.
- **A refused edit** leaves the page as it was and says why in `refused`, until
  the next edit goes through.
- **A new node is selected**, and a removed one is no longer.

## The keyboard, the layers, and what the editor says

The Builder places two `foldkit-primitives/interaction` bundles in its Model:
`TreeNavigation` for the layers panel (`Layers`, open by default) and
`LiveAnnounce` for a live region (`Announcer`). A view attaches their
Behaviors; `foldkit-mixins-builder` does.

- **Moving keyboard focus in the layers selects the node** it lands on.
- **`PageBuilder.keyCommand(model, key, modifiers)`** is the editor's shortcuts
  as the Message they send, or `undefined`:

  | Keys | What they do to the selected node |
  | --- | --- |
  | Alt+Up, Alt+Down | move it among its siblings |
  | Alt+Left | move it out of its parent, to just after it |
  | Alt+Right | move it into the node above it, last in the first Region that takes it |
  | Mod+D | duplicate it, just after it |
  | Delete, Backspace | remove it |
  | Mod+Z; Mod+Shift+Z or Mod+Y | undo; redo |

  Attach it to the layers panel, not the whole editor, so Delete in a text box
  edits the text. A move the page refuses is refused as any edit is.
- **Every structural edit is announced**, such as "Moved Heading, 2 of 3 in
  Section body", and so are undo, redo, and a refusal, assertively. A prop
  edit is not: the field being typed in already says it.

The announcer debounces and clears on Effect's clock through Commands named
`LiveAnnounce.read` and `LiveAnnounce.clear`. A runtime runs them beside
everything else; a test that follows each Command in turn should leave them
out, as it has no clock to wait on.

## As a form key

`PageBuilder.input` is an `Input.bundle` control:

- the key's **value** is the Document, so the key's schema validates it, such as
  `Composition.Document.check(Composition.valid(Site))`, and the form submits it;
- a Message that changes the Document is an **edit**, and one that does not,
  such as a selection, is not, so a CMS autosaves only real changes;
- **filling** the key with a stored page replaces the Document and starts undo
  over, and a stored form shown again is **settled**: no hover, no undo, no
  refusal.

`PageBuilder.inputWith(view)` is the same control drawn by another view.

Placed alone, with `Bundle.withChild`, the same Bundle is a page editor whose
parent owns the Model.

## Dragging

A pointer drag is four Messages, the facts `foldkit-primitives`' `PointerDrag`
reports:

- **`DragStarted({ id })`** selects the node and puts `{ id, over: null, at:
  null }` in the Model's `drag`. Nothing moves yet.
- **`DraggedOver({ over })`** says which node the pointer is over and in which
  zone of it, `before`, `inside` or `after`. The Builder works out where a drop
  would land, `drag.at`: before or after that node among its siblings, or last
  in the first of its Regions that accepts the dragged Block. Inside a node
  that takes nothing is after it, and `drag.over.zone` says so. Where the page
  would refuse the move, such as into the node itself, `at` is `null`.
- **`DragDropped()`** applies the move to `drag.at` as one edit, undone and
  announced like a key's; with no `at`, nothing moves and "Not moved" is
  announced. **`DragCancelled()`** ends the drag the same way.

A drawing marks `drag.over` only while `drag.at` is set, so the mark is where
the node will go. The keyboard's way to move a node is `keyCommand`.

## Helpers

- `PageBuilder.placeFor(document, selected, block)` is where the palette puts a
  new node: inside the selection when a Region there accepts it, else after the
  selection, else last among the roots.
- `PageBuilder.moveBy(document, id, delta)` is the Operation that moves a node
  among its siblings, or `undefined` at an end.
- `PageBuilder.dropAt(document, dragged, target, zone)` is where a drag over
  `target` would put `dragged`, or `undefined` where the page refuses it.
- `PageBuilder.replace(model, document)` and `PageBuilder.settle(model)` are what
  the form control's fill and settle do.

## Limits

- One node is selected at a time.
- The plain view is plain. The drawn editor is `foldkit-mixins-builder`.
- A starting props value must encode with its Block's Schema.
