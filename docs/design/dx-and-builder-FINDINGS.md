# Findings: developer experience, and what the page builder needs next

Building `examples/cms` into a Ghost-like studio and a full-screen page builder
(September 2026, commits `4945949` to `d68c6ef`) met the packages the way an
application does, day after day. [cms-example-FINDINGS.md](./cms-example-FINDINGS.md)
records the API bugs met on the way. This file records the larger things: what
slows down every change, and what blocks the builder features a user asks for
first. Each item says what happened, with the evidence checked against the code,
then the design proposed, the alternatives weighed, and what it costs.

Some items overturn a decision in an earlier design document (D2 and B4).
They say which one and why: they come from building with the packages, which
those documents could not draw on. Status: every item is **proposed** unless it
says otherwise. Effort is S (a day
or less), M (a few days), L (a week or more, or an API other packages follow).

## Summary

| # | Item | Costs today | Unlocks | Effort |
| --- | --- | --- | --- | --- |
| D1 | Examples and tests read package source | a rebuild and a server restart per package change; tests that pass against stale code | editing a package and seeing it at once | S |
| D2 | Styles that arrive with what uses them | a style missing from `sheet.ts` draws nothing, silently | code-split views, conditional rules | M |
| D3 | Fixed declarations in layered rules, never inline | overrides that cannot win | styling packages the way their docs promise | S |
| D4 | A test that every element a package draws is a Slot | unslotted markup found only by review | a checked customization contract | S |
| D5 | Queries for inert views in tests | seven copies of one tree walker; attribute and property confused | shorter, sturdier view tests | S |
| B1 | One command table in the Builder | shortcuts and their labels in two packages; "Ctrl" on a Mac | commands an application adds | M |
| B2 | Drag a new Block from the palette | the palette only inserts where the selection says | drag and drop from the palette | M |
| B3 | Copy, paste and Patterns | none of them exist, though the kernel has `takeTree` and `rekey` | reuse within and across pages, safe templates for agents | M |
| B4 | Editing text in place, with `contenteditable` | every word is edited in the inspector | the most asked-for builder feature | M |
| B5 | A measured selection overlay | a selection is an outline; no label, no quick actions | an on-page toolbar, a name tag, resize handles | M |
| B6 | Hover and geometry out of the Model | a full redraw of editor and page per hovered node | large pages | M |
| B7 | Responsive looks as container queries | the tablet and phone previews show desktop looks | a truthful viewport preview | M |
| B8 | Draw or delete `panel` | Model state no view reads | a builder that works on a narrow screen | S |
| B9 | The drawn Builder in regions | ten siblings a stylist places one by one | layouts that survive a new panel | M |
| B10 | `Option` at the Renderer's edge | `Option.getOrUndefined` at every call | one convention | S |
| X1 | Block words in `foldkit-composition` | the palette has words an agent does not | one description for people and models | M |
| X2 | Slots that take content, not only attributes | icons done as CSS masks keyed on data attributes | icons, badges and counts in any package's markup | L |

Beneath these, nine design issues (U1 to U9, after the items) explain why
several of them happen. The order this file recommends is at the end.

## Developer experience

### D1. Examples and tests read package source

**Status: done** (`82fafdb`, `62ca215`), with TypeScript keeping derived
`paths`; see [the plan](./dx-and-builder-PLAN.md), 0a and 0b.

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

### D2. Styles that arrive with what uses them

**What happened.** The example builds its one stylesheet from a list in
`sheet.ts`. The writing layout was attached to the form and left out of the
list: its classes were on the elements, with no rules behind them, and nothing
said why (cms F30). Every new Style is a second edit in another file, and a
view that loads later (a code-split route, a plugin's panel) has no list to
join.

**Why it is this way.** [mixins-DESIGN.md](./mixins-DESIGN.md) rules out
render-time collection. Its reasons are that SSR and the browser must derive
the same classes and rules, and that the application decides where CSS is
injected. Both reasons are sound. Neither needs a hand-kept list: they are met
by keeping CSS as deterministic data, which it already is. This item
contradicts that decision, deliberately.

**What the code already has.** Class names are a hash of the rule's canonical
text, so a class names exactly one piece of CSS, whoever compiled it. A
Style's contribution carries that CSS (`css` and `globalCss` in
`contribution.ts`), and a contribution can already carry mount actions.

**Design: a registry, filled at definition, read at render.**

1. **The registry.** When a Style compiles, which happens at module load as
   now, it records `className → css` (and its global chunks) in one
   module-level map, `Style.registry`. It is pure data, derived
   deterministically, and is the same on the server and in the browser. No DOM
   is touched at import.
2. **In the browser, injection on insert.** A Style's contribution adds an
   insert hook to the element it styles. The hook ensures the element's
   classes are present in one constructed stylesheet
   (`document.adoptedStyleSheets`). Each rule is inserted inside its
   `@layer` block, and the layer order is declared first, so cascade order
   does not depend on insertion order. The check is one Set lookup per class,
   and it runs only when an element is inserted. The hook runs in the same
   task as the patch, before the browser paints, so nothing flashes unstyled.
3. **On the server, extraction after render.** `foldkit-ssr` walks the
   rendered tree's classes, looks each up in the registry, and emits one
   `<style>` in the head, marked with the classes it holds. The browser seeds
   its Set from that marker, so hydration inserts nothing twice.
4. **The static sheet becomes an optimization.** `Style.stylesheet(...)` stays
   for foundations (layers, reset, tokens, theme) and for preloading styles a
   first paint needs. Forgetting a Style in it no longer breaks anything.

**What this unlocks.**

- F30 cannot happen.
- Code-split views and plugins bring their styles with them.
- **Conditional rules.** `Style.whenInput(predicate, piece)` today refuses a
  piece that has rules (`style:conditional-rules-unsupported`), because the
  one static class cannot switch its rules. With registration by class, each
  branch compiles to its own class, and the condition picks the class at
  render. The refusal goes away.
- A development warning comes free: a class with no registry entry is a bug.

**Limits and risks.**

- **Only code-defined Styles register.** A value from stored data (an author's
  custom color, a typed padding) must not become a class per distinct value.
  The class count would grow with the data, and a stored string would become
  CSS text. Stored values stay what they are today: a validated value in an
  inline custom property, read by a static rule.
- **The registry holds every Style ever compiled** in the process. That is
  bounded by the code, not the data, so it needs no eviction. On a long-lived
  server it is shared across requests, which is fine for the same reason.
- **Cost of a hook per styled element.** Insert hooks already run for Mounts.
  Measure a 1,000-row list before and after, and batch the check per patch if
  it shows.

**Rejected.** A runtime that collects classes on every render and diffs a
sheet. It works, but it costs per render instead of per insert, and it makes
the CSS depend on render history.

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

### B4. Editing text on the page, in place

**What happened.** Every word on the page is edited in the inspector's text
boxes, away from where it reads. This is the first thing an author reaches
for.

**What is planned, and why this departs from it.**
[pagebuilder-DESIGN.md](./pagebuilder-DESIGN.md) §4 says the canvas is never
`contenteditable`, so that the browser and the application never own the same
text. Its Phase 7c-2 then places `foldkit-richtext-dom`'s editor on a Text
node, and that editor is itself `contenteditable`. The rule is already bent
where it matters most. The real rule is narrower, and it is enough:
**one editable field at a time, whose text the view stops drawing while it is
edited, and which reports through Messages.** Under that rule
`contenteditable` is safe, and it beats every alternative on the thing authors
notice first: the text they type is the page's own text, in its own font,
reflowing its own layout.

**Where it fits.**

| Text | Edited with |
| --- | --- |
| A string prop drawn as text (a Heading, a Hero's title, a Button's label) | `contenteditable="plaintext-only"`, in place |
| A multiline string prop (a lead, a quote) | the same, with line breaks allowed |
| A rich-text prop | `foldkit-richtext-dom`'s editor, in place (7c-2) |
| A value that is not text (a count, a choice, an id, an image) | the inspector |
| Text elsewhere: a page title in a list, a layer row's name, a table cell in `foldkit-crud` | the same primitive, where an application wants it |

**A primitive: `EditableText`, in `foldkit-primitives/dom`.** It is not the
Builder's. Anything that lets a person edit a short text where it is drawn
needs it, so it is a Behavior attached to a Slot:

```ts
EditableText.behavior(Slots)<Input, Message>({
  slot: 'title',
  editing: input => input.editing,          // Option<{ initial: string }>
  multiline: false,
  onInput: text => Message.TextEdited({ text }),
  onCommit: () => Message.TextCommitted(),
  onCancel: () => Message.TextCancelled(),
})
```

It owns the browser's side of editing, and nothing else:

- **Attributes while editing.** `contenteditable="plaintext-only"`,
  `role="textbox"`, `aria-multiline`, `spellcheck`. With nothing being edited,
  none of them: the element is ordinary text.
- **Freezing.** While editing, the owner draws the text as it was when editing
  began (`initial`), not the live value, so the virtual DOM sees no change and
  never rewrites the element under the caret. This is the whole trick, and the
  one thing an owner must get right. The primitive's test proves a redraw
  during editing leaves the caret where it was.
- **Reading.** It reads `innerText`, never `innerHTML`, so pasted markup
  cannot reach the page. A single-line field drops line breaks.
- **IME.** Input between `compositionstart` and `compositionend` is not
  reported. The composed text is reported once, at the end.
- **Keys.** Enter commits a single-line field, and Shift+Enter breaks a line
  in a multiline one. Escape cancels and restores `initial` in the DOM
  itself, because the frozen view will not. Leaving the field commits.
- **Fallback.** Where `plaintext-only` is missing, it sets `true` and handles
  paste itself, inserting text only. Check the support table when building:
  current engines have `plaintext-only`, Firefox the latest of them.

**In the Builder.**

- **Marking fields.** A Block's view says where a prop is drawn, through the
  render context: `field('title', props.title)`. In view mode this is the
  text. In edit mode it is a span with `data-composition-field="title"`, and
  while that field is being edited, the frozen text with `EditableText`
  attached. Only the Block's view knows where its text is, so the opt-in is
  there, not in the Schema.
- **Starting.** A double-click on a field, or Enter on a selected node that
  has one, starts editing. The Model gains
  `editing: Option<{ id, key, initial }>`.
- **Typing is live.** Each `TextEdited` applies a `setProp` in one history
  group per editing session, so the inspector and any other drawing of the
  prop follow as the author types, and the session is one undo step. Escape
  applies `initial` back into the same group. A group that ends where it began
  should record nothing: `History` gains that rule, rather than keeping a
  no-op step.
- **Everything else stands aside while editing.** `Targets` does not
  `preventDefault` a press inside the editing field, or the caret could not be
  placed. `PointerDrag` does not start from it, or selecting text would drag
  the block. `keyCommand` returns none while `editing` is set, except Escape,
  or Backspace would delete the block instead of a letter. Each of these is a
  check on `model.editing`, not on the event's target.
- **Announced.** "Editing the Heading's text. Enter to finish, Escape to
  cancel." Both keys go in B1's command table.

**Rejected: a text box over the field.** An earlier draft of this file
proposed it, to keep the canvas free of `contenteditable`. It means copying
the field's font, size, spacing and wrapping onto another element, and
re-measuring while the page reflows around a longer title. It is always
slightly wrong, and it does not become the page's text. In-place editing gets
all of that right for free, and the freezing rule is what makes it safe.

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
2. The expensive parts become boundaries that redraw only when what they read
   changes (U2): the canvas, each Renderer node keyed by its node object and
   its marks, and each layer row keyed by its node, open state and selection.
   A keystroke in the inspector then redraws one row and one node, not the
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

## Underlying design issues

The items above are what the work ran into. Several share a cause one level
down, in how the packages are built rather than in any one of them. These are
the causes. Each is a larger change than the items it would dissolve, and each
says which items it dissolves.

### U1. Ephemeral presentation state has no home

**The pattern.** Hover, measured boxes, scroll position, a drag's ghost, the
caret while editing, whether a tooltip is open: in this architecture each
one either becomes a Message and a Model field, or is not had at all. As
Messages they cost a full redraw each (B6), and they fill the Model with facts
no one replays, stores or tests. As nothing, the Builder draws its selection
as an outline because a measured box had no place to live (B5), and hover
marks by Model because there was no other way to mark.

**The cause.** The Model is right to be the only owner of anything that
matters: what is replayed, stored, sent, or decides a Message. The
architecture has no second, explicitly lesser tier for what matters only to
the pixels for a moment.

**The design.** Name the tier and give it rules:

- **Presentation state** lives in a Behavior, on the DOM, and nowhere else:
  as custom properties, data attributes on elements the Behavior owns, or a
  Behavior-local variable.
- It **never decides a Message**. When it must (a drag's drop point), the
  Behavior reports a Message once, at the moment it matters, which is what
  `PointerDrag` already does for a drop.
- The virtual DOM must not own what the Behavior writes: a custom property on
  the canvas, not a class the view also draws.
- A test of presentation state is a browser test (U7), because it is about
  pixels.

`KeepInView`, `PointerDrag`'s measuring, B5's `Measure` and B4's
`EditableText` are all already this. Writing the rule down stops the next
feature from putting hover in the Model.

**Dissolves** B5 and B6, and B4's caret handling.

### U2. Every change redraws everything

**The pattern.** A Model change redraws the whole application: every panel
of the Builder, every layer row, and the page through its Renderer. A
keystroke in the inspector redraws a thousand rows that did not change.
Foldkit has `createLazy` and `createKeyedLazy`. No package view uses them,
and none has a place to say what its drawing depends on.

**The cause.** Memoization is opt-in per call site, and the package views
are one large function (U3), so there is no call site to opt in at.

**The design.** A view boundary declares what it reads and is given only
that: a Projection for an application view, a typed pick of keys for a
package part. A cache hit through `createLazy` skips the view, its VNodes and
their diff. Because the selection is the view's input, it cannot drift from
what the view reads. A dependency list kept beside a view that still gets the
whole input can drift, and proxy read-tracking was also weighed and rejected.
Per-item Slots and Renderer nodes are keyed boundaries of the same kind. The
details are [dx-and-builder-PLAN.md](./dx-and-builder-PLAN.md) §3c, which is
[reactivity-DESIGN.md](./reactivity-DESIGN.md)'s Phase 1.

**Dissolves** B6's second half, and the §25 row target the page builder
design set and deferred.

### U3. Package views are closed monoliths

**The pattern.** `BuilderView.define` is one 1,284-line module whose draw
function returns the whole editor. An application can style every element and
attach Behaviors to it, but it cannot:

- add a panel (an "Assets" panel, a comments panel);
- remove one, or reorder the toolbar;
- put the page's title in the Builder's toolbar;
- give one prop a different control, such as a color picker for a tone.

The CMS editor screen and the CRUD list have the same shape. Everything this
work did to the Builder's look went through Slots. Everything it wanted to do
to its structure needed a package change: the breadcrumb, the empty state, the
row summary.

**The cause.** Slots made the package views open to styling and closed to
composition.

**The design: parts and an assembly.** Each package view exports its parts as
SlotViews over the same input (`BuilderView.Palette`, `Layers`, `Inspector`,
`Canvas`, `Toolbar`, `Crumbs`), and `BuilderView.define` becomes one assembly
of them, a dozen lines an application can copy and change:

```ts
const Editor = BuilderView.assemble(PageBuilder, parts => [
  parts.Toolbar({ extra: [PageTitle] }),
  parts.Palette(),
  parts.Layers(),
  parts.Canvas(),
  AssetsPanel,
  parts.Inspector(),
])
```

This is the "headless plus parts" shape many component libraries have landed
on. Styling through Slots is unchanged. B9's regions become the default
assembly's markup rather than a fixed contract.

**Dissolves** B9, and most future requests to change a package's markup.

### U4. The inspector is a second form system

**The pattern.** The Builder's inspector draws each prop by its Input kind
(`valueField`: text, multiline, number, select, toggle, relation-one,
relation-many, else JSON). `foldkit-mixins-form` does the same for forms, and
`foldkit-crud` a third time for its filters and displays. Three switches over
the same kinds, three places a new kind must be added. The results show it:

- The inspector has no color picker, date input, image picker or rich text,
  though forms can have any of them through `Input.bundle`.
- A prop refused by its Schema is only reported by `apply`'s alert, where a
  form shows the error at the field.
- `BuilderView.controls` restates `Input` hints in a Builder-only annotation.

**The cause.** The inspector was built before `Input.bundle` made a form able
to hold any control.

**The design.** The inspector is a form: `foldkit-form` over the selected
Block's `Props` Schema, with the node's props as its draft, drawn by
`foldkit-mixins-form`. A valid change of a field commits one `setProp`, and an
invalid one shows at the field and commits nothing. Controls come from one
registry shared by forms, the inspector and CRUD, keyed by Input kind, and an
application adds kinds to it once. A color picker written for a settings form
then works in the inspector unchanged. `BuilderView.controls` becomes form
input hints, which is what it already is.

This is the largest item in this file, and the most valuable. It removes a
duplicated subsystem and gives the page builder every control the form system
has or will have.

### U5. Package UI has no words seam

**The pattern.** The Builder's strings are English literals in its source:
"Select a block that can hold it", "Adds it inside the …", "Move up", the
shortcut descriptions. `foldkit-crud` takes `ViewWords`, and the CMS takes
words for its states, so the other packages each invented a different seam.
A German studio cannot translate the Builder today without forking it.

**The design.** One convention for every package that draws text: a `Words`
record type per package, with English defaults, passed as a view input and
typed so a missing word is a compile error. Words that take values are
functions (`addsInside: (label: string) => string`), because sentence order
differs between languages. X1's Block words are the content half of the same
seam, and they already travel as metadata.

### U6. Views have no standard environment

**The pattern.** B1 needs the platform to name the ⌘ key. The view cannot read
`navigator`, because a view is a function of its input, so each package would
add its own input. Locale (U5), reduced motion, and pointer type (touch
targets) are the same kind of fact.

**The design.** One `Environment` value an application builds once at its edge,
from `navigator` and `matchMedia`, keeps in its Model, and passes to every
package view that needs it. The packages declare which fields they read. A
test builds one by hand, so a test of the Mac labels needs no Mac.

### U7. There is no browser test tier

**The pattern.** Everything here that is about pixels is untestable in jsdom:
B5's measurement, B4's caret staying put, B7's container queries, the
full-height layout, IME. The first browser check of this work found the live
region showing its announcement on screen, which no test could have. Browser
checks were done by hand through a browser extension, which fails in its own
ways: a hidden tab never renders past its first frame, and a tab open across
a dev-server restart hangs.

**The design.** A small tier of Vitest browser-mode tests (the Playwright
provider, headless Chromium in CI) for interactions that need layout. A dozen
tests, not a second suite: the caret survives a redraw, the overlay follows a
scroll, the frame's container query applies, nothing visible overflows the
editor. They run in CI beside `test`.

One related fix is upstream: Foldkit renders on `requestAnimationFrame`, which a
hidden tab never runs. A runtime option to render on a timer while
`document.hidden` would make every automated browser check reliable. It
belongs in Foldkit, and is worth proposing there.

### U8. Strings couple packages to applications

**The pattern.** Between the packages and the applications that use them, much
of the coupling is by string: styles select `[data-block="Hero"]` and
`[data-action="delete"]`, tests find elements by `aria-label` text ("Where the
selection is", "Properties"), and the example's toggle style reaches its row
through `[aria-expanded="true"] > &`. Each one type-checks whatever it names,
and breaks silently when the label is reworded (U5 will reword them all).

**The design.** Let what a Slot already knows be typed, all the way to the
stylist and the test. A per-item Slot's item carries typed data
(`attrs(base, { key, data: { block } })`). Style conditions read it:
`Style.whenItem(item => item.data.block === 'Hero', piece)`, compiled to a
class per branch by D2's registry. Tests query by Slot (`Inert.bySlot(root,
'paletteItem')`) instead of by visible text. Data attributes remain for the
DOM, but nobody has to spell them.

**Dissolves** X2's icon case: an icon per Block becomes a typed Style
condition, or Slot content keyed by the same data.

### U9. Many packages, much configuration

**The pattern.** The workspace has 37 packages. Many are pairs: a headless
package and its drawn one (`builder` and `mixins-builder`, `form` and
`mixins-form`, `crud` and `mixins-crud`, `richtext` and `richtext-dom`). Each
package is a `package.json`, two tsconfigs, a build, an alias in the root
Vitest config and a `paths` entry in every example that uses it. The traps list
has three entries for this configuration alone.

**The design, to consider rather than adopt.** Fold the drawn half into a
subpath of its package (`foldkit-builder/view`), as `foldkit-composition`
already does with `/foldkit` and `/appearance`. That halves the pairs, and
optional peer dependencies keep a headless user from installing the view's.
The cost is a breaking rename for every user of a drawn package. D1 removes
most of the configuration pain without it, so do D1 first and decide this
with its result in hand.

## Order of work

The detailed plan, with designs, spikes and acceptance per phase, is
[dx-and-builder-PLAN.md](./dx-and-builder-PLAN.md).


1. **D1**, the source condition, starting with the two-package spike. It
   removes most of the day-to-day friction and three traps.
2. **D3, D4 and D5** together: one helper renders views inert, and the tests
   that use it enforce the Slot and inline rules. Add U7's browser tier in the
   same stretch, since B4 and B5 need it.
3. **D2**, the style registry: it ends F30, and U8's typed conditions build on
   it.
4. **B1**, which pays the debt `5d72112` added and is where B3's and B4's
   commands go. Build it on U6's `Environment` for the key names.
5. **U4**, the inspector as a form, before anything else is added to the
   inspector. It is the largest change and the one that makes the most later
   work unnecessary.
6. **B2, then B3**: palette drag, then clipboard and Patterns, on kernel pieces
   that exist.
7. **B4 with `EditableText`**, the feature authors notice most.
8. **U3** (parts and an assembly), which subsumes B9, together with **B10**,
   before anyone else writes a Builder style against today's shape.
9. **U1 and U2** as rules, then **B5 and B6** under them.
10. **B7 and B8**, the narrow and responsive story.
11. **X1 with U5**, words for content and for the package UI, with the agent's
    tool input as the first new reader.
12. **X2**, only if U8's typed item data does not already cover it. Decide
    **U9** once D1 has landed.
