# foldkit-richtext-dom

The browser half of a [`foldkit-richtext`](../richtext) editor: it owns the
`contenteditable` subtree, and gives an application an editor it places like any other
Foldkit Bundle.

A rich-text editor cannot let a virtual DOM own its `contenteditable` subtree: the browser
mutates that subtree directly for typing, selection, IME, and the clipboard, and rebuilding
it on every keystroke fights that native behavior. This package owns the subtree instead. It
renders a semantic `Document` into real DOM once, patches only the nodes a `ChangeSet` names,
and turns the browser events it understands into Messages.

## Who owns what

```text
foldkit-richtext         the semantics: Document, commands, transactions, validation
foldkit-richtext-dom     the contenteditable subtree and its events       (this package)
your application         the document in its Model, and everything around the editor
foldkit-mixins-richtext  that everything, drawn as styleable views: toolbars, menus, handle
```

The document is never read back from the DOM. It lives in the application's Model, and the
DOM is consulted only to map a browser selection to a position. Only `Document`, `ChangeSet`,
and `Selection` values, commands, and Messages cross the boundary.

## The loop

```text
browser event → Message → update runs the command → Model holds the new document
                                                   → patch Command → DOM patched to match
```

An edit is a transition like any other: `update` decides, the Model commits, and rendering
follows through a Command that patches what the `ChangeSet` names. Nothing edits the DOM
first and reports later; an event the adapter cannot honor is prevented, not let through.

## Install

This package is **early**: 0.x, and its API may change between minor versions.

```bash
pnpm add foldkit-richtext-dom foldkit-richtext foldkit-bundle foldkit effect
```

## Sixty seconds: an editor on a page

```ts
import { Bundle } from 'foldkit-bundle'
import * as RichText from 'foldkit-richtext'
import * as Runtime from 'foldkit/runtime'
import { editorAt, Model, type ParentMessage } from 'foldkit-richtext-dom/editor-bundle'

// One editor, placed at the host id its view renders, with what it draws and allows.
const body = editorAt('body', {
  rendering: RichText.standardRendering,
  vocabulary: {
    marks: RichText.markRegistry(RichText.standardMarks),
    nodes: RichText.nodeRegistry(RichText.standardNodes),
  },
  placeholder: 'Write something…',
})
const app = Bundle.assemble<Model, ParentMessage>()([body])

const document = RichText.decodeDocument({
  version: 1,
  children: [
    { type: 'Paragraph', id: 'p', children: [{ type: 'Text', id: 't', text: 'Hello', marks: [] }] },
  ],
})

Runtime.embed(
  Runtime.makeElement({
    Model,
    container: window.document.getElementById('app')!,
    init: () => app.initial({ document }),
    update: app.update(),
    view: (model, h) => h.main([], [body.view(model, h)]),
  }),
)
```

What each part does, and does not do:

- **`editorAt(hostId, placement)`** records, under `hostId`, how this editor renders, which
  marks and kinds its edits may use, and what a blank document shows. It performs no I/O and
  renders nothing yet. The placement is recorded rather than passed as an arg because it holds
  functions and schemas, which a Bundle's schema-decoded args cannot carry.
- **`Model`** is `{ document, editor }`: the document, and the editor's interaction state
  beside it (selection, stored marks, undo history, the slash menu's highlight). The document
  is the parent's; the editor reads it through its Link and never keeps a copy.
- **`body.view`** renders one element, `<foldkit-richtext id="body">`, and mounts the
  interpreter into it once. Everything inside belongs to this package.
- **An edit** arrives as a Message, `update` runs the command against the vocabulary, the new
  document lands in `model.document` in the same transition, and a patch Command then updates
  the DOM. An edit the vocabulary forbids is refused and changes nothing.

## Configuring a placement

`editorAt(hostId, placement)` takes, each optional:

- **`rendering`**: how marks and node kinds become elements (§121); the default renders the
  core's own names. A mark renders *inside* its run element, so the run stays outermost and a
  selection still maps.
- **`vocabulary`**: `{ marks, nodes }` registries. The editor refuses an edit a declaration
  forbids, rather than only letting `validate` report it later (§125).
- **`inputRules`**: rules applied to what is typed, so a marker turns into a block change as it
  is completed (§128), such as `foldkit-richtext-markdown`'s `markdownInputRules`. A rule the
  vocabulary refuses does not cost the keystroke: the text is inserted on its own.
- **`decorate`**: `document => DecorationSet`, drawn over the document on the mount and every
  patch (§129), code highlighting for one. It sees the document only. A highlight derived
  from application state, such as a search query or other people's carets, goes through
  the `overlay(hostId, decorations)` Command instead. It draws them after the placement's
  own and leaves the caret where it is. Its positions name the document shown, so set it
  again when that changes; placing the host id again starts it with none.
- **`placeholder`**: what a blank document shows (`RichText.isBlank`). It is put on the block as
  `data-placeholder`, and the root, a `role="textbox"`, carries it as `aria-placeholder`.
  Drawing it is the stylesheet's, so the text never enters the content:

  ```css
  [data-placeholder]::before {
    content: attr(data-placeholder);
    float: left;
    height: 0;
    pointer-events: none;
    color: GrayText;
  }
  ```

- **`serverRendered`**: whether a render is the server's; see "On a server-rendered page".

Each has a record at `foldkit-richtext-dom/host` (`placeRendering`/`renderingFor`,
`placeVocabulary`/`vocabularyFor`, and so on) that `editorAt` writes. It is kept for the host
id, not for one mount, so a host that unmounts and mounts again renders the same way. One host
id is one editor on the page: the patch Command finds its host by id.

The assembled parent's `update` handles every editor Message. Build them with `edited` and the
helpers beside it: `typed`, `pressed`, `toggled`, `applied`, `cleared`, `retyped`, `wrapped`,
`converted`, `lifted`, `moved`, `selected`, `undone`, `redone`, and `patched`.

### When the document changes from outside

A document the parent puts in the Model any other way than an edit (an entry opened, a
revision restored, a form's `fill` or `Reset`) gets a fresh host. The host's Mount reads its
document once, so the view keys the host by the document it shows: each committed edit hands
its key on to the next document, and a document that did not come from an edit here has none
yet. The first document a host id shows is drawn without a key, as the server draws it.

So commit the document an edit returns as it is. A parent that puts its own copy in the Model
after each edit (normalized, say) gets a fresh host, and a lost caret, on every keystroke.

When the new document continues the old one (another replica's change arriving, or the
document a collaborative edit projects to), return `patchTo(hostId, previous, next)` from the
same transition that puts it in the Model. It hands the host's key on from `previous` to
`next.document`, which have to be the very objects the view rendered and will render, and
patches the editor from the latest state it holds (what it has drawn, or a state waiting for an
IME to finish) to `next`, so the host and every run the change
did not touch keep their elements. `next.selection` becomes the browser selection, so pass
the caret carried across the change (`Replicated.resolve` of an anchored one), or the caret
is lost. A replacement that changes nothing drawn, as an exchange that only confirms edits
already shown does, leaves the DOM and its selection alone. `replaceChangeSet(previous, next)` is the patch, in a transaction's terms: the runs
whose text or marks differ and the blocks holding them, blocks whose runs moved in or out or
changed order, blocks whose own fields changed, the
nodes that came and went, and whether any block moved. An `Edited` OutMessage also carries
the `transactions` the edit applied, which is what `RichText.Replicated.translate` reads.

## As a form control

`foldkit-richtext-dom/input` puts the editor in a `foldkit-form` form: a key whose value is a
`RichText.Document`. It is the one entry that imports `foldkit-form`, an optional peer.

```ts
import { Form } from 'foldkit-form'
import { richTextInput } from 'foldkit-richtext-dom/input'

// PostInput is an `Entity.input(...)` whose `body` field is a `RichText.Document`.
const PostForm = Form.make('PostForm', PostInput, {
  inputs: { body: richTextInput('post-body', { placeholder: 'Write the post…' }) },
})
```

Here there is no parent to hold the document: a form key has nothing to report an edit to,
and `Input.bundle` refuses a Bundle with an OutMessage. So `EditorInput` is the same editor
holding its document in its own Model, with each committed edit and undo folded back in. The
form owns that Model as the key's draft; the document is the key's value, validated,
submitted, and reported by `authoredChanged` like any other.

- **Placement:** `richTextInput(hostId, placement)` places what `editorAt` places, under that
  host id. Since one host id is one editor, a key repeated in a form's rows cannot be a
  rich-text control yet.
- **Nothing entered:** a new record starts on one empty paragraph, which is where a caret can
  go. A blank document reads as no value, so a required key refuses it.
- **Filling:** `fill` shows a given document with a history of its own and no selection, since
  the caret was in runs the given document does not have.
- **Resuming:** `settled`, for a stored draft shown again, keeps the caret, the stored marks,
  and the history, clears only the slash menu's highlight, and takes this placement's host id
  in case the draft was stored under another.

## Chrome around the editor

The editor renders its host and nothing else (§29). A toolbar, a menu, a handle: each is the
application's chrome, drawn beside the host from the Model, sending the editor's Messages.
This package ships the plain versions below; `foldkit-mixins-richtext` draws the same chrome
as slot views an application restyles.

### The marks toolbar

`marksToolbar({ state, toMessage, marks? })` returns a view, `(h) => Html`, of one button per
mark, dispatching the Message a chord would. `state` is what the editor projects (`document`,
`selection`, `storedMarks`), and `marks` defaults to the three the package ships. A mark is
active when the caret carries it, or, with no stored format, when every run the selection
covers does. `markActive(state, mark)` is that rule alone, for a renderer drawing its own
buttons.

### The floating toolbar

The same buttons, in an element `selectionAnchor` places over the selection:

```ts
import * as RichText from 'foldkit-richtext'
import { marksToolbar, selectionAnchor } from 'foldkit-richtext-dom/toolbar'

RichText.coversText(model.editor.selection)
  ? h.div(
      [h.OnMount(selectionAnchor({ hostId: 'body', gap: 8 }))],
      [
        marksToolbar({
          state: { ...model.editor, document: model.document },
          toMessage: mark => edited(Message.ToggledMark({ mark })),
        })(h),
      ],
    )
  : h.empty
```

Whether it is drawn is the view's, from the Model: `RichText.coversText` is a range that is not
a caret. The Mount only moves it. It places the element `gap` pixels above the page's
selection, centred and kept inside the window's width, or below when there is no room above,
and again on `selectionchange`, any scroll, and resize; a selection outside the host is
ignored. It writes `position: fixed`, `top`, `left`, and `data-placement` (`top` or `bottom`)
on the element, so a style there must leave those alone.

### The block handle: anchor and drag

`blockAnchor({ hostId, node, gap })` places an element `gap` pixels left of block `node`, level
with its top edge and never past the window's left edge. It places it again when the editor's
subtree changes (a patch can move a block without the page scrolling), on scroll, and on
resize, and it finds a host drawn after it, or drawn again in the same parent.

`blockDrag({ hostId, node })` drags block `node` by the element it is mounted on, to any block
`RichText.moveTargets` allows under the placed vocabulary, so an item can go into another list
but not to the top level:

- The pointer picks the nearest edge of those blocks: before one at its top, after one at its
  bottom. Where a container's edge meets its first or last block's, the block's is picked while
  the pointer is inside it, and the container's once the pointer is past it.
- A line, `[data-richtext-drop]`, is fixed at that edge, outside the editable subtree, for a
  stylesheet to draw. The place is read again on a scroll and on release, where the blocks are
  then, and release sends `MovedBlock` there.
- Escape, a cancelled pointer, a move with the button up (a release the page never heard, over
  a frame say), or a place where the block already is ends it with nothing sent.
- Only the pointer that pressed steers or ends it. The page is listened to only during a drag,
  in the capture phase, so a handler that stops a release does not hide it, and the element
  gets `touch-action: none` while mounted, or a touch would pan the page instead.

Both are Mounts, and a Mount reads its args once, when its element is inserted. Key the element
by the block (`h.Key(node)`) when the block it stands for can change.

### The slash menu

The editor owns the slash menu's vocabulary, because an entry is one of its own Messages and
the Bundle resolves Enter by handling the chosen entry as that Message (§123):

```ts
import { slashEntries, slashMenu, slashQuery } from 'foldkit-richtext-dom/editor'

slashQuery('see /head') // 'head': opens at a block's start or after whitespace
slashMenu(slashEntries, 'see /head', 0)?.highlighted?.label // 'Heading 1'
```

- **`slashEntries`** leads with the text blocks a caret can become (`Paragraph`,
  `Heading 1`–`3`), then the standard containers (`Quote`, `Bulleted list`, `Numbered list`,
  `Code block`, whose id is `code-block` because `code` is the Code mark's), then the marks.
  Each has a stable `id`, a `label`, the words a query may also match, and its Message.
- **`slashMenu(entries, textBefore, index)`** is the one value a view and `update` share:
  whether a query is open, what matches, and what Enter would send. A stale index falls back to
  the first match. `textBefore` is a read (`RichText.textBefore(document, position)`), not
  stored state, so there is no switch that opens or closes the menu.
- **`EditorState.menuIndex`** is the one thing a menu owns. The application moves it (with
  `slashMove` from `foldkit-mixins-richtext`), and on `Entered` the Bundle treats the
  highlighted entry as the Message a click would send. Choosing an entry also removes the
  query typed for it, as one action (§124 §5): one transition and one undo step.

`matchingEntries` filters, and it, `slashQuery`, and `slashMenu` work over any entries carrying
a `message`, so an application's own catalogue reuses them.

## Showing a document: the read-only renderer

`foldkit-richtext-dom/view` renders a document as ordinary Foldkit `Html` through `inertHtml`:
it dispatches nothing and owns no DOM, so it serves a visitor's page, a preview, or an email as
it is.

```ts
const html = renderDocument(document) // a div of block elements
renderBlocks(slice.blocks) // one element per block
renderDocument(document, renderer) // a declared Link as a real <a href>
renderDocument(document, renderer, decorations) // a decoration overlaid on the runs it covers
```

It takes the same `rendering(...)` registry as the HTML serializer and the editor (§121), so a
declared mark or kind becomes the same element everywhere, custom elements included. Without
one, blocks become `p`/`h1`–`h6`, marks nest as `strong`/`em`/`code` in the serializer's order,
an undeclared mark rides on a `span` with `data-marks`, and an unknown block renders as an
inert `div data-unknown="Type"` placeholder. A tag Foldkit cannot build is reported, never
swapped for another element.

A decoration set (§64, §126) is projected with `RichText.decorationsIn`: each covered piece of
a run becomes a `span[data-decoration=<kind>]` with the run's marks inside it, which is also how
the editor draws one, so one stylesheet serves both. Each string field of the decoration's
`data` whose name is lowercase letters, digits, and hyphens is drawn as
`data-decoration-<name>` on that span (`data: { name: 'Ada' }` is `data-decoration-name="Ada"`,
for a stylesheet's `attr()`); any other field is not drawn. A decoration that starts or ends in
an empty run, such as another person's caret on an empty line, is drawn as an empty span in it,
where the core's `decorationsIn` has no text to cover. `renderBlocks` takes no set, since a
slice's positions cannot be resolved without its document. Text holding a NUL, which markup
cannot carry, is written as the U+FFFD a parser would make of it.

`h.DataAttribute` prefixes `data-` itself, so it takes the bare name
(`DataAttribute('unknown', …)` is `data-unknown`).

## On a server-rendered page

The editor's host is a custom element, `<foldkit-richtext>`, drawn `display: block` by an
inline style (so a stylesheet's `display` needs `!important` to override it). Hydration leaves
a custom element's contents alone, so markup the server sent there survives until the editor
mounts, and the editor adopts it rather than drawing the document again. The server sends it
when the placement says the render is the server's:

```ts
import { SSR } from 'foldkit-ssr'

editorAt('body', { rendering: RichText.standardRendering, serverRendered: SSR.serving })
```

While `serverRendered()` is true, the host holds `renderEditable` of the document, with the
placement's rendering and decorations: exactly what `mount` would build. Without the option the
host is empty until the editor mounts. The browser's Model must hold the same document the
server rendered, or the markup is not what `mount` would build and is replaced.

## The editor's Messages

`foldkit-richtext-dom/editor` holds the vocabulary an editor's `update` handles. `Message`'s
cases (each built as `Message.Typed({ text })` and so on, not exported one by one):

```text
Typed, Backspace, DeletedForward, Entered, ToggledMark, AppliedMark, ClearedMark,
RetypedBlock, WrappedBlock, ConvertedBlock, LiftedBlock, MovedBlock, Selected, Pasted, Undone,
Redone, Patched
```

The adapter reports what the browser did as commands, a caret, and history chords, and
`toMessage` turns each into a Message. It refuses what the vocabulary cannot carry rather than
dropping a detail: an insertion carrying marks, or a mark value with props, comes back
`undefined`. The rest are the application's to send, because no browser event means them:

- `RetypedBlock`, `WrappedBlock` (`{ containers }`), `ConvertedBlock` (`{ to }`), and
  `LiftedBlock` for the core's block commands;
- `MovedBlock` (`{ node, to }`, `to` a `RichText.Beside`), which a block handle sends and which
  needs no selection;
- `AppliedMark` (`{ mark }`, a name or a `{ name, props }` value) and `ClearedMark` (`{ mark }`)
  for `SetMark` and `ClearMark`: what a link editor sends, which at a caret changes or removes
  the whole link the caret is in.

`Patched` is the patch Command's own completion, because a Foldkit Command must return a
Message.

## Lower level: the interpreter

Everything above is built from these. Reach for them to embed the editable subtree without
the Bundle, or to write another host.

```ts
import { mount } from 'foldkit-richtext-dom'
import { attach } from 'foldkit-richtext-dom/events'
import * as RichText from 'foldkit-richtext'

let dom = mount(ownerDocument, content) // render once
host.append(dom.root) // the host element is yours

// Events become intent; your update decides and commits.
const attachment = attach(dom, {
  onIntent: command => dispatch({ type: 'Edited', command }),
})

// In the resulting transition, after RichText.run returns a new state:
attachment.sync(next, result.changeSet)
dom = attachment.current()
```

This is the shape, not a copyable module: `ownerDocument`, `content`, `host`, `dispatch`,
`next`, and `result` come from the surrounding application, and `next` is the `EditorState`
that transition committed.

- **`mount(ownerDocument, content, renderer?, decorations?)`** builds the subtree and the
  identity index it is patched through: `data-block` on a block, `data-run` on a run. It
  listens to nothing and runs nothing. A mark renders as an element inside its run element, so
  the text node stays deepest and a selection still maps; a mark no entry renders stays on
  `data-marks`. A node entry renders a node block as its element, nested blocks inside, and a
  kind no entry renders keeps a `div`. The registry is kept on the `EditorDom`, so every later
  patch renders the same way. Decorations are drawn as the read-only renderer draws them, and
  the position mapping reads across the text nodes they split.
- **`attach(dom, { onIntent, onSelection?, keymap? })`** listens for `beforeinput`, `keydown`,
  composition, copy, cut, and paste, and reports each one it understands as intent. Everything
  it understands it prevents, so the browser never mutates the DOM behind the document; an
  event it cannot honor yet is prevented with no intent rather than allowed to drift.
  `onSelection` reports a caret or range inside the editor that the application did not just
  commit, and nothing while an IME owns the caret. A selection elsewhere on the page is not
  reported, so the editor keeps its own caret (or selected block) while another field has
  focus. A keystroke, a composition start, a cut, or a paste reads the live selection first and
  reports it before its intent, because `selectionchange` is asynchronous and a click just
  before would otherwise be missed. `keymap` adds or overrides chord bindings, checked
  before the built-in ones. `attachment.sync(state, changeSet)` patches and restores the
  selection in one call, but only while the browser's selection is inside the editor: a sync
  never takes the caret from another editor or an input. While an IME is composing, the latest
  state waits and is drawn when composition ends, so another person's edit never rewrites the
  text under the IME.
  `detach()` removes the listeners.
- **`patch(dom, content, changeSet, decorations?)`** removes what the change set removed,
  re-renders what it marked dirty, and places inserted or moved elements in document order.
  `decorations` is the next render's whole set, so a run whose share of it changed is redrawn,
  and a patch without one clears what was drawn. An element that is no longer what its block
  renders as (a heading re-leveled to `h3`, say) is re-rendered rather than kept.
- **`repair(dom, content)`** is recovery, not domain state (§31): it drops what the subtree
  holds that the document does not, re-renders blocks whose rendering drifted, and returns the
  same `EditorDom` when nothing was wrong. Call it after a cancelled IME.
- **`positionToRange` and `rangeToPosition`** translate between a semantic `Position` and a DOM
  `Range`. A DOM caret carries no affinity, so mapping back derives it (`after` at a run's end,
  `before` elsewhere) rather than pretending to round-trip it.

### Mounting into a view's element

A Foldkit view owns the host element; the interpreter owns what goes inside it. `mountInto`
renders into the host and records the attachment there, so a patch Command that has only the
element can find it (§118):

```ts
import { attachmentIn, mountInto, releaseMount } from 'foldkit-richtext-dom/host'

// The mount: once, when the host element enters the DOM. The registry is optional.
const attachment = mountInto(host, content, { onIntent, onSelection }, renderer)

// The patch Command: after the transition committed, given the host element.
attachmentIn(host)?.sync(state, changeSet)

// Unmount.
releaseMount(host)
```

If the host already holds exactly the subtree `mount` would build (server markup the browser
parsed, say), `mountInto` keeps those elements and indexes them. `adopt(existing, content,
rendering?, decorations?)` is that check alone. It compares the trees ignoring empty text
nodes, which markup cannot carry, and gives an empty run back the text node a caret needs.
Anything else in the host is replaced, so it ends with one subtree either way.
`renderEditable(document, renderer?, decorations?)` is the same subtree as `Html`, which is
what a server sends.

`attachEditor(host, content, emit, { rendering?, decorate?, placeholder? })` attaches the
translation to Messages to a host element; `events({ content })` wraps it as the Mount the
editor's view uses; `patchEditor(hostId, state, changeSet)` is what the patch Command runs,
reporting whether it patched. A missing host is an editor that went away while the transition
was in flight, not an error.

### Pasting HTML

`parseHtml(html, { kit, mint })` at `foldkit-richtext-dom/html` is the clipboard fallback: a
whitelist walk over a `DOMParser` tree that mints fresh identities. It maps the standard
vocabulary's elements (`blockquote`, `pre` with its language from `data-language` or a
`language-…` class, `hr`, `img`, `table`/`tr`/`td`/`th` with a row of `th`s as the header,
`s`/`del`, `a`) and reads a fixed few attributes, each URL through `safeUrl`. That refuses a
scheme outside http/https/mailto/tel *after* removing control characters, so
`java\tscript:` cannot walk past it. A `style`, an `onclick`, or a `javascript:` URL cannot
survive as anything executable, and an element it cannot map keeps its text and reports a
diagnostic.

## What it does not do

- It does not run commands or hold domain state. A caller runs the command and hands the result
  here; `attach` reports intent and stops.
- It does not patch a container's items one by one: a container whose item list changed is
  re-rendered where it stood, so its surviving items are rebuilt rather than kept. Correct, and
  a follow-up for identity preservation.
- One host id is one editor on the page, so repeated rows of a form cannot each hold one yet.

## Reference

```text
foldkit-richtext-dom                the interpreter: mount, adopt, patch, repair, position mapping
foldkit-richtext-dom/editor-bundle  Editor, editorAt, application, update, the Message helpers
foldkit-richtext-dom/input          richTextInput, EditorInput: the editor as a foldkit-form key
foldkit-richtext-dom/toolbar        marksToolbar, markActive, selectionAnchor, blockAnchor, blockDrag
foldkit-richtext-dom/editor         Message, toMessage, attachEditor, events, patchEditor, slash menu
foldkit-richtext-dom/view           renderDocument, renderBlocks, renderEditable
foldkit-richtext-dom/host           mountInto, attachmentIn, releaseMount, the place*/…For records
foldkit-richtext-dom/events         attach, intentFor, selection read and restore
foldkit-richtext-dom/html           parseHtml
```

```bash
pnpm --filter foldkit-richtext-dom typecheck
pnpm vitest run packages/richtext-dom/test
```
