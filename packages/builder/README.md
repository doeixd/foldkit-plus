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
| A prop's field while it holds text that does not decode yet | the Builder's Model, as `inspector` |
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
| `Selected({ id })`, `Deselected()`, `Hovered({ id })`, `Unhovered()` | what the inspector and the node actions work on |
| `Undid()`, `Redid()` | a step of the page's undo history |
| `PanelChosen({ panel })`, `ViewportChosen({ viewport })` | the editor's own choices |
| `DragStarted({ id })`, `DraggedOver({ id, zone })`, `DraggedOff()`, `DragDropped()`, `DragCancelled()` | a pointer drag: see below |
| `PreviewChosen({ key, value })`, `PreviewCleared({ key })` | previews the page with one context key set, or unset |
| `Inspected({ id, message })` | a Message of the selected node's settings form: see below |
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

## The inspector is a form

Each Block's props are edited through a `foldkit-form` form made from its props
Schema, once per Block, at the first use, and the input of the action each of
its events runs through one more, once per Block, event and action. A form
edits a value as the Document stores it, so a prop drawn as an `Option` is
chosen as an id or nothing, and checks each value against its whole Schema.
The node owns its values; a form only holds what its fields show:

```text
node props ─► fill ─► field drafts ─► Inspected(Changed) ─► the form decodes each key
   a key the Message changed that decodes, and the node lacks ─► setProp,
                                              or setAction with the input's other keys
   a key that does not decode ─► its error, no edit
```

- **A change that decodes is an edit**, one `setProp` per key the Message
  changed, grouped in history like any other, so typing a word undoes as one.
  A field left alone is never written back, and typing back the value the node
  holds adds no undo step.
- **Text that does not decode** (`"abc"` for a number) stays in its field with
  the form's error, and changes nothing.
- **A node changed another way** (an undo, the canvas, an agent) refills every
  field but one holding text that does not decode. Moving the selection drops
  what was held; the next node's fields fill from its props.
- `PageBuilder.inspecting(model)` is the selected node's forms and their
  Models, for a view to draw: `props`, and `on` by event. A view sends
  `Inspected({ id, form: form.key, message: form.settings.encodeMessage(message) })`;
  one for a node no longer selected, or a form it no longer draws, is ignored.
  Each form's Model is held as JSON, so a saved Builder still is.
- A prop is labelled with its Schema's `title`, else its key spaced
  (`maxItems` is "Max items"). A Block asks for a control where the Schema
  does not say, with `Block.annotate(Builder.controls({ body: Input.multiline() }))`;
  `Input.hidden()` leaves a prop out.
- A control of the application's own, backed by a Bundle (`Input.bundle`, a
  color picker), works as it does in any form, with no Builder code; send its
  Messages with `settings.control(key, message)`. The Builder runs its forms as
  functions and starts nothing, so one with Subscriptions or Resources is
  refused where the Builder is made: every Block's form is made there.

## The keyboard, the layers, and what the editor says

The Builder places two `foldkit-primitives/interaction` bundles in its Model:
`TreeNavigation` for the layers panel (`Layers`, open by default) and
`LiveAnnounce` for a live region (`Announcer`). A view attaches their
Behaviors; `foldkit-mixins-builder` does.

- **Moving keyboard focus in the layers selects the node** it lands on.
- **`PageBuilder.commands`** is the editor's commands, one table: each has an
  `id`, a `label`, its `keys`, where a drawn Builder offers it (`placement`:
  the node's actions, the toolbar, or by key only), and `run(model)`, the
  Message it sends now, or none while it has nothing to do. A view draws the
  node's actions, the toolbar, their titles and the list of shortcuts from it,
  and `PageBuilder.keyCommand(model, key, modifiers)` is derived from it: the
  first command one of whose keys is pressed. The built table:

  | Keys | What they do to the selected node |
  | --- | --- |
  | Alt+Up, Alt+Down | move it among its siblings |
  | Alt+Left | move it out of its parent, to just after it |
  | Alt+Right | move it into the node above it, last in the first Region that takes it |
  | Mod+D | duplicate it, just after it |
  | Delete, Backspace | remove it |
  | Mod+Z; Mod+Shift+Z or Mod+Y | undo; redo |
  | Escape | deselect it |

  Attach `keyCommand` to the layers panel and the canvas, not the whole editor,
  so Delete in a text box edits the text. A move the page refuses is refused
  as any edit is. A key's `mod` is Ctrl, or ⌘ on a Mac; `mod` and `alt` must be
  as given, and `shift` only where given, so Delete takes Shift+Delete too.
- **`Builder.make(name, { commands: built => ... })`** changes the table: another
  key for a command, one left out, one moved to the toolbar. What runs a key,
  the node's actions and the toolbar all follow it.
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

`PageBuilder.inputWith(view)` is the same control drawn by another view, with
whatever inputs that view takes, given through the form view's `controls`.

Placed alone, with `Bundle.withChild`, the same Bundle is a page editor whose
parent owns the Model.

## The selection in the URL

A link that opens the editor on a Block is the Builder's selection mirrored
into the URL. The Builder owns the selection, and a selection does more than
set a field (the layers' focus moves, the rows above it open), so the URL
never writes it directly: a navigation becomes a `Selected` Message, and the
selection is read back out into the URL.

In, from the parent's own `update`, for a form key named `document` placed as
`page`:

```ts
const blockIn = (url: Url): Option.Option<NodeId> =>
  Option.map(
    Option.filter(
      Option.fromNullOr(new URLSearchParams(Option.getOrElse(url.search, () => '')).get('block')),
      id => id !== '',
    ),
    NodeId.make,
  )

const selectFrom = (url: Url) =>
  Message.GotPageMessage({
    message: PageForm.control('document').send(
      Option.match(blockIn(url), {
        onNone: () => BuilderMessage.Deselected(),
        onSome: id => BuilderMessage.Selected({ id }),
      }),
    ),
  })

const update = placements.update((model, message) =>
  message._tag === 'UrlChanged'
    ? {
        model,
        commands: [{ name: 'SelectFromUrl', effect: Effect.succeed(selectFrom(message.url)) }],
      }
    : { model },
)
```

Out, as one of the parent's own Subscriptions, given to
`placements.subscriptions(selectionUrl)`:

```ts
const selectionUrl = Subscription.make<Model, Message>()(entry => ({
  selectionUrl: entry(
    { block: Schema.Option(Schema.String) },
    {
      modelToDependencies: model => ({
        block: PageForm.control('document').field(model.page).value.selected,
      }),
      dependenciesToStream: ({ block }) =>
        Option.match(block, {
          onNone: () => Stream.empty,
          onSome: id => Stream.fromEffect(Navigation.replaceUrl(`?block=${id}`)).pipe(Stream.drain),
        }),
    },
  ),
}))
```

The Builder refuses an id its page lacks, so a link opened before the page is
loaded selects nothing: send `selectFrom` again once the form is filled.
Nothing selected leaves the URL as it is, so that link is not lost while the
page loads. An application with other query parameters builds the URL with
them. `test/url.test.ts` runs this recipe, and the CMS example's page editor
(`examples/cms`, at `/pages`) routes this way, with the page and the Block both in
the address.

## Previewing a context

A page whose Catalog declares a `context` shows some nodes only under
conditions ([Conditions](../composition/README.md#conditions)). The Builder
keeps what the author previews the page as in `preview`, by context key,
starting from the `preview` it was made with:

```ts
Builder.make('PageBuilder', { catalog: Site, renderer, starters, preview: { audience: 'guest' } })
```

The page is drawn in edit mode with `preview` as its context, so a node hidden
for it is still drawn, marked `data-composition-hidden`. Previewing changes
nothing in the page and is not an edit.

## Dragging

A pointer drag is four Messages, the facts `foldkit-primitives`' `PointerDrag`
reports:

- **`DragStarted({ id })`** selects the node and puts the drag in the Model's
  `drag`, an `Option`, with `over` and `at` both none. Nothing moves yet.
- **`DraggedOver({ id, zone })`** says which node the pointer is over and in
  which zone of it, `before`, `inside` or `after`; **`DraggedOff()`** that it is
  over none. The Builder works out where a drop would land, `drag.at`: before
  or after that node among its siblings, or last in the first of its Regions
  that accepts the dragged Block. Inside a node that takes nothing is after it,
  and `drag.over`'s zone says so. Where the page would refuse the move, such as
  into the node itself, `at` is none.
- **`DragDropped()`** applies the move to `drag.at` as one edit, undone and
  announced like a key's; with no `at`, nothing moves and "Not moved" is
  announced. **`DragCancelled()`** ends the drag the same way.

A drawing marks `drag.over` only while `drag.at` is set, so the mark is where
the node will go. The keyboard's way to move a node is `keyCommand`.

## Helpers

Each helper that may have no answer returns an `Option`, as the Model's
`selected`, `hovered`, `refused` and `drag` are. The Model stores them as `null`
(`Schema.OptionFromNullOr`), so a saved Builder, such as a CMS draft, is JSON.

- `PageBuilder.placeFor(document, selected, block)` is where the palette puts a
  new node: inside the selection when a Region there accepts it, else after the
  selection, else last among the roots; none where the Block cannot go.
- `PageBuilder.moveBy(document, id, delta)` is the Operation that moves a node
  among its siblings; none at an end.
- `PageBuilder.dropAt(document, dragged, target, zone)` is where a drag over
  `target` would put `dragged`; none where the page refuses it.
- `PageBuilder.keyCommand(model, key, modifiers)` is the Message a shortcut
  sends; none for a key it does not handle, which is what Foldkit's
  `OnKeyDownPreventDefault` takes.
- `PageBuilder.replace(model, document)` and `PageBuilder.settle(model)` are what
  the form control's fill and settle do.

## Limits

- One node is selected at a time.
- The plain view is plain. The drawn editor is `foldkit-mixins-builder`.
- A starting props value must encode with its Block's Schema.
