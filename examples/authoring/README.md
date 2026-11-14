# Authoring a UI from primitives (`foldkit-example-authoring`)

Five small interfaces, each assembled from the primitives in this repository
and nothing else: a search field, an editable list, a popup with a selection, a
sortable listbox and an editor an agent can save. Each is a Foldkit
application of its own. None draws a widget from a library, so everything a
person sees, and everything an agent is told, traces to a line in `src/`.

The example answers one question: when you build a control from parts, who
decides what? The answer is the same in every section.

| Fact | Owner | Where it lives here |
| --- | --- | --- |
| What is typed, picked, held, open, saved | the application's Model | `src/*/app.ts` |
| What a primitive keeps (the current result, what is held, a leaving row's phase) | a placement of that primitive's Bundle, written only by its own `update` | the `Nav`, `Rows`, `GotPresence` placements |
| The attributes and handlers on an element | one Behavior per attribute, refused at once when two claim one | `src/*/view.ts` |
| Where DOM focus goes when the element that had it leaves | `FocusRecovery`, a Mount that sends no Message | `Recovers` in `search/view.ts` and `list/view.ts` |
| Whether a save happened | Remote's ledger, from the writer's answer | `src/save/app.ts` |

A Behavior owns no state, a Mount owns an element's lifetime, and `update` owns
every transition. What an agent may do is a contract over the same Messages, not
a second implementation (`src/save/agent.ts`).

## The idea in one equation

```text
view   =  SlotView.over(slots)<Input, Message>()  +  attachments  (one writer per attribute)
widget =  view  +  the Model's facts  +  placements of the primitives' Bundles
```

A SlotView names its slots, its input and its Message universe once. Each
attachment (a Style, or a Behavior from a primitive or your own) writes the
attributes of the slots it was made for, and the resolver refuses a second
writer. What a view is made of is then data: `SlotView.describe` reads it
without drawing anything.

## Run it

```bash
pnpm --filter foldkit-example-authoring dev       # the page: every section live
pnpm --filter foldkit-example-authoring demo      # a text trace of each section's update
pnpm --filter foldkit-example-authoring build
npx vitest run examples/authoring --project unit
npx vitest run examples/authoring --project browser --fsModuleCache=false
```

The browser tests drive Chromium. Every claim about focus, the keyboard or what
a person can press is one of them; the unit tests read the Model and the
inert drawing.

## A search field in sixty seconds

`src/search/view.ts` is the whole assembly. The binder names the slots, the
input and the Messages once:

```ts
// examples/authoring/src/search/view.ts
const Search = SlotView.over(SearchSlots)<Model, Message>()
```

Everything made through it infers its types from it. The input's `keydown` is
one owner built from three routes, because a second attachment writing
`keydown` would be refused:

```ts
// examples/authoring/src/search/view.ts
export const SearchKeys = Keys.behavior(Search)({
  slot: 'input',
  name: 'SearchKeys',
  routes: [escapeClears, enterPicks, arrows],
})
```

`arrows` is `ListNavigation.keys(...)`: the primitive's key half, as a route,
listed beside two of the view's own. Escape clears the query and Enter picks
the result the keyboard is on. The view then attaches it:

```ts
// examples/authoring/src/search/view.ts
).pipe(
  Behavior.attach(SearchKeys),
  Behavior.attach(Pointing),
  Behavior.attach(Ids),
  Behavior.attach(Recovers),
  Style.attach(SearchStyle),
)
```

What each call means, and does not:

- `SlotView.over` declares. It runs nothing and holds no state; it is the
  place the three types are written once.
- `Keys.behavior` reads a press and answers a Message or nothing. It never
  writes the Model: a route returns `Message.Cleared()`, and `update` decides
  what clearing is. A handled press is default-prevented, an unhandled one is
  untouched, and no route sees a key of an IME composition.
- `Pointing` writes `aria-activedescendant` on the input once the keyboard has
  a result (before the first arrow nothing is current, so none is announced)
  and marks that result `data-active`. DOM focus never leaves the input.
- `Ids` is `Behaviors.Collection.behavior`: it writes each option's `id`, from
  one description of the results that the keys and `Pointing` share.
- `Recovers` is `FocusRecovery`. Clear the text and the clear button leaves with
  it; focus was on it, so the Mount moves it to the input in the same task,
  before the browser would drop it to `body`. It sends no Message.
- `Style.attach(SearchStyle)` is the recipe's default selection. The field also
  exists as `CompactSearchField`, which lays the recipe's `compact` selection
  over it: an application's override of a recipe, with no fork. The page draws
  both.

The two instances on the page are two runtimes whose Models carry an `id`
(`search-a`, `search-b`). Every id a view draws starts with it
(`search-a:input`, `search-b:list`), so no id is drawn twice; a test reads
every id on a page with two fields and asserts none repeats.

### What the view is, as data

`SlotView.describe(SearchField)`, with the class tokens (hashes of the rules
they carry) elided. A test prints it here and fails if this block and the view
drift apart:

<!-- authoring:describe-search:start -->

```markdown
## Slots

- `root` — Container
- `input` — TextInput (events: keydown)
- `clear` — Interactive (events: click)
- `list` — Container
- `option` — Focusable
- `status` — Container

## Attachments

1. `SearchKeys` (behavior)
   - `input`: requires events keydown; depends on the input
2. `Pointing` (behavior)
   - `input`: depends on the input
   - `option`: depends on the input
3. `Collection` (behavior)
   - `option`: depends on the input
4. `FocusRecovery` (behavior)
   - `input`: depends on the input
   - `clear`: depends on the input
   - `option`: depends on the input
   - `root`: depends on the input
5. `SearchStyle` (style)
   - `root`: classes `style-…`
   - `input`: classes `style-…`
   - `clear`: classes `style-…`
   - `list`: classes `style-…`
   - `option`: classes `style-…`
   - `status`: classes `style-…`
```

<!-- authoring:describe-search:end -->

`describe` is static: it reads the value, runs no Mount and calls no
contribution (an attachment that depends on the input says so). To see what one
input resolves to, `SlotView.resolution(view, input)` names every attribute,
event and Mount with the attachment that owns it, and reports a clash as a
finding where drawing would throw. The conflict fixture in
`test/describe.test.ts` attaches a second owner of `keydown` and asserts the
finding names both: `SearchKeys` and `Stray`.

## The sections

| Section | Primitives | What it shows |
| --- | --- | --- |
| Search field (`src/search`) | `Keys`, `ListNavigation` (keys), `Collection`, `FocusRecovery`, a `Style.recipeFor` recipe | the binder; one `keydown` owner; focus that survives the clear button; two instances; a recipe override |
| List (`src/list`) | `Presence` per row, `FocusRecovery`, `Reorder`, `LiveAnnounce`, a `Keys` owner on the editor | dismiss, rename in place, reorder by keys and by pointer |
| Popup (`src/popup`) | `Overlay.nonModal` (`DismissLayer`, `FocusScope`), `ListNavigation`, `Selection`, `Keys`, `A11y.conform` | a popup that closes on Escape and an outside press, returns focus to its trigger, and conforms to the listbox pattern |
| Sortable listbox (`src/sortable`) | `Reorder.routed`, `ListNavigation`, `Selection`, `Keys.first` | reorder beside a roving stop, with a grab chord of its own |
| Editor (`src/save`) | Remote (`Mutation`, `Data.mutate`), `foldkit-agent` parts and completion | one save, driven by a person and by an agent |

### List: leaving, recovering, reordering

A row dismissed is not removed at once. Its `Presence` placement goes `hiding`
for a duration, and the Model removes the row only when that placement says
`hidden`: removal is the view ceasing to draw it, decided by the fact, not by a
`transitionend` listener. While it leaves, `Presence.behavior` draws it `inert`,
so it takes no click, Tab or focus. `FocusRecovery` moves focus off the
dismiss button in the frame the row turns inert (the next row's button, else
the previous, else Add), so by the time the row is removed focus is already
elsewhere and removal moves nothing. A row shown again before the duration ends
wins: the late `Hidden` fact carries an older generation and is refused
(`updates.test.ts`).

`Reorder` takes the grip as its handle. Space picks a row up, the arrows walk
the places, Space drops, Escape puts it back; the same Messages come from a
pointer drag. Nothing moves while a row is held (the view draws a drop line
from `data-reorder-over`), `update` applies the `Moved` fact with
`Reorder.apply` and reads it out through `LiveAnnounce` with the titles. The
keyed move takes the row out and back, which drops its focus in the browser, so
the grip is a `FocusRecovery` part that finds itself again (`'same'`).

Renaming in place is the Model's: `StartedEdit` records the id and draft and
focuses the editor by a Command, and Enter or Escape (one `Keys` owner) end it
and focus the row's Edit button by a Command. Focus that a Message causes is a
Command from `update`; `FocusRecovery` acts only on focus that was lost.

### Popup: assembled, conformed, then run

The popup's view is conformed to a pattern naming what a listbox owes:

```ts
// examples/authoring/src/popup/view.ts
export const Listbox = A11y.pattern({
  listbox: { capability: Capability.Interactive, obligations: [A11y.Navigation, A11y.Name] },
  option: {
    capability: Capability.Focusable,
    obligations: [A11y.FocusStrategy, A11y.Activation, A11y.State(Attr.AriaSelected)],
  },
})
```

`ListNavigation` and `Selection` state what they supply, and the view's own
word covers what no Behavior states (`A11y.base`: the listbox's name, and the
click on each option). Leave `Selection` out and `A11y.conform(Listbox)` is a type
error (`a11y:unsatisfied-obligation`). That is a **structural** claim:
declarations fit together. The **rendered** claim is a browser test:
`Conformance.listbox` from `foldkit-mixins/testing` drives the real popup with
the keyboard and a press, reads roles and names from Chromium's accessibility
tree, and asserts the arrows skip the disabled option, Enter and Space pick,
`aria-selected` always has a value, and a click on the disabled option picks
nothing. It runs here over the popup assembled in this directory and runs in
`foldkit-mixins-ui` over the shipped listbox: one behaviour, two widgets. Neither
is a claim of WCAG conformance.

The popup's keys are a trap worth knowing: a key meets the page as last drawn,
so two arrows pressed faster than a frame each start from the same current
option. The tests wait for the frame between presses (`Frames.track()` and
`settle`), as a person pressing at a human pace does.

### Sortable listbox: sharing the arrows

`ListNavigation` owns a container's `keydown`; so does a held `Reorder`.
`Reorder.routed` hands back `{ behavior, keys }`, and `keys` goes first in the
container's single router. Before a grab the route answers only its grab chord
(Alt+Enter here, since Space selects and Enter is free for a drop), so the
arrows navigate; while a row is held it takes the arrows, and Space or Enter
drops it. The router holds only keys, so the rows' tab stop is
`ListNavigation.item`, the item half of the same placement, and Space answers
the list's own `Selected({ id })`, which `update` applies with `Selection`'s
`activate` helper. The listbox is conformed to nothing; it exists to show the
seam.

### Editor: one save, three drivers

```text
click / agent call  ->  RequestedSave  ->  Data.mutate  ->  the writer decides
                                                              |
state the application already holds  <-  Remote's ledger  <---+
```

`src/save/server.ts` is the writer, in process: a blank title is refused with a
reason; the page shows that reason and no other. The client carries no rule.
`test/outcomes.ts` is one module of assertions over a driver (`edit`, `save`,
`state`): a save is pending before the writer has decided and applied when it
accepts; a refused save fails with the writer's reason and keeps what was typed;
an unreachable writer fails with no reason; two overlapping saves each end on
their own answer, in the order asked. Everything it reads back is the Model's
draft and Remote's ledger (`stateOf`), never the driver's own bookkeeping. Three
drivers run it:

| Driver | Where | How it saves |
| --- | --- | --- |
| a person | `test/save.browser.test.ts` | types in the field and clicks Save in Chromium |
| the agent, in the page | `test/save.browser.test.ts` | `Agent.host` on the same runtime; `messages.dispatch` |
| the agent, headless | `test/save.test.ts` | `Agent.headless` over the same `update`, with no view |

The agent's `save` capability completes on Remote's fact (`MutationSucceeded`
or `MutationFailed`), correlated by the invocation's id (`toMessage` hands the
invocation id to Remote as the request id), so its call resolves on the
writer's answer and not on the dispatch; `outcomes` asserts that the call is
still pending while the writer holds the answer. `Parts` say which control is
which: `title` sets the draft, `save` invokes the capability; a part gives no
authority and acting on one is `dispatch`. In the page each control carries
`data-fk-part`, and a test asserts the marks name the same parts the agent's
listing does.

## The type cost of `SlotView.over`

The binder is not free of cost to the compiler, so it was measured. The search
field is written twice over the same slots, Collection and recipe
(`src/search/slots.ts`): bound in `view.ts`, and without the binder in
`explicit.ts`, where every factory and the view name `Model` and `Message`
again. `tsc -p` over one file at a time (TypeScript 7.0.2, `--extendedDiagnostics`,
the example's own `paths`), 2026-11-14:

| | instantiations | own cost over `slots.ts` alone | check time (three runs) |
| --- | --- | --- | --- |
| `slots.ts` alone | 2,212,732 | | 2.1 to 2.6 s |
| `view.ts` (bound) | 2,333,559 | 120,827 | 2.0 to 2.3 s |
| `explicit.ts` | 2,334,844 | 122,112 | 2.0 to 3.2 s |

The bound form costs no more than the explicit one: 1,285 fewer instantiations
(1.1%), and its check time is inside the noise between runs. It is the form the
sections use. Both forms are drawn in `test/views.test.ts` to the same inert
tree.

## What the tests prove

| Test | Claim |
| --- | --- |
| `search.browser.test.ts` | typing lists matches; arrows move the current result without moving focus; Enter picks; Escape and the clear button clear and leave focus in the input; two fields share no id |
| `list.browser.test.ts` | dismiss hands focus on at once and the leaving row takes no click; renaming returns focus to Edit; reordering by keys and by pointer; the drop is spoken |
| `popup.browser.test.ts` | open, arrow past a disabled option, pick, Escape, outside press, focus back on the trigger; `Conformance.listbox` |
| `sortable.browser.test.ts` | Alt+Enter grabs, an arrow carries, Enter drops with focus on the row; Space selects while nothing is held |
| `save.browser.test.ts`, `save.test.ts` | `outcomes` for a person, an agent in the page and an agent headless; parts marks match the listing |
| `views.test.ts` | every view draws only Slots, reads no missing token, with and without the binder |
| `describe.test.ts` | the description printed above is the view; a clash names both owners |
| `updates.test.ts` | what each `update` decides, and the Model it returns when nothing changes |
| `bundle.test.ts` | the page's brotli budget |

`*.mutations.ts` declare the edits that must turn each claim red; run
`pnpm mutate examples/authoring/test/<name>.mutations.ts`.

## Limits, said plainly

- **The lint rules of the scaffold are not run here.** The example follows the
  rule that matters most for a parent (a control or a key route a parent draws
  sends a Message of the parent's own, and `update` applies it through the
  child's helpers: `Presences.helpers.hide(id)` for a dismiss,
  `Picked.helpers.activate(id)` for Space), but `@foldkit/oxlint-plugin` is
  not installed in this workspace, so no linter confirms it.
- **The writer is not a declared write.** `SaveNote` is a `Mutation.make` with
  an in-process writer, so the example runs in a page with no server. A declared
  write that the client reads with `Data.can` and a SQL writer decides is
  `examples/chirp` and `examples/kitchen-sink`.
- **Keys faster than a frame.** A route reads the input as last drawn. The
  search field's tests and the popup's wait a frame between presses; see the
  popup section.
- **The page carries Remote and the agent for the editor**, about 64 kB brotli
  of its 207 kB, though only one section uses them. `bundle.test.ts` says so.

## Files

- `src/search/` — `app.ts` (Model, Bundle placement, update), `slots.ts` (slots,
  Collection, recipe), `view.ts` (the bound assembly), `explicit.ts` (the
  same, unbound), `mount.ts`.
- `src/list/` — `app.ts` (three placements and the rename), `view.ts`, `mount.ts`.
- `src/popup/` — `app.ts` (three placements), `view.ts` (the conformed view), `mount.ts`.
- `src/sortable/` — `app.ts`, `view.ts` (the routed Reorder), `mount.ts`.
- `src/save/` — `app.ts` (the mutation and its ledger), `server.ts` (the writer),
  `agent.ts` (contract and parts), `view.ts`, `mount.ts` (`Agent.host`).
- `src/style.ts` — the page sheet and the pieces every section shares.
- `src/entry.ts`, `index.html` — the page; `src/demo.ts` — the trace.
- `test/outcomes.ts`, `test/drivers.ts` — the save assertions and the agent's driver.
