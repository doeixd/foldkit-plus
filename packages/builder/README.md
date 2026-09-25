# foldkit-builder

The page builder's state, as an ordinary [Bundle](../bundle/README.md). It
edits a [`foldkit-composition`](../composition/README.md) Document by
Operations, with a selection and undo beside it, and it is designed to be one
form key's control: the page is the key's value, so the form validates it,
submits it, and a CMS autosaves it.

> **Status: in development, not published.** Phase 5 of the
> [page builder design](../../docs/design/pagebuilder-DESIGN.md): the headless
> Builder and a plain view. The drawn editor, with a canvas you drag on, is
> Phase 7.

## What it owns

| Fact | Owner |
| --- | --- |
| What a page may hold, and how each Block looks | the application: a Catalog and a Renderer |
| The page being edited | the Builder's Model, as the form key's value |
| Undo | the Builder's Model: the page is kept as a `foldkit-primitives/state` history |
| What is selected, the open panel, the viewport | the Builder's Model, beside the page |
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
  `foldkit-mixins-form` draws it with the rest of the form.

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

## As a form key

`PageBuilder.input` is an `Input.bundle` control:

- the key's **value** is the Document, so the key's schema validates it, such as
  `Composition.Document.check(Composition.valid(Site))`, and the form submits it;
- a Message that changes the Document is an **edit**, and one that does not,
  such as a selection, is not, so a CMS autosaves only real changes;
- **filling** the key with a stored page replaces the Document and starts undo
  over, and a stored form shown again is **settled**: no hover, no undo, no
  refusal.

Placed alone, with `Bundle.withChild`, the same Bundle is a page editor whose
parent owns the Model.

## Helpers

- `PageBuilder.placeFor(document, selected, block)` is where the palette puts a
  new node: inside the selection when a Region there accepts it, else after the
  selection, else last among the roots.
- `PageBuilder.moveBy(document, id, delta)` is the Operation that moves a node
  among its siblings, or `undefined` at an end.
- `PageBuilder.replace(model, document)` and `PageBuilder.settle(model)` are what
  the form control's fill and settle do.

## Limits

- One node is selected at a time.
- The canvas does not yet report the node under the pointer or accept a drop;
  that, keyboard reordering, and an inspector that draws every kind of prop are
  Phase 7.
- A starting props value must encode with its Block's Schema.
