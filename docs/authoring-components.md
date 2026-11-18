# Authoring components

Foldkit Plus gives you finished widgets (`foldkit-mixins-ui`), the interaction
logic they are made of (`foldkit-primitives`), and the contract every view is
drawn through (`foldkit-mixins`). This guide is for the day the catalog does not
have what you need: how the pieces differ, who owns what, which rung of the
ladder to stand on, and a complete component built one concept at a time, with
the tests that prove it.

It assumes a Foldkit application: a Model, a Message union, one `update`, and
views that are functions of the Model. Nothing below adds a second place to keep
state. A component is a view over facts the application owns, decorated from
outside.

## Who owns what

Every later choice follows from six rules. Read them first.

1. **The application's Model owns every fact.** What is drawn, picked, open,
   typed or saved lives in the Model and changes in `update`, normally through
   `modifyFields`. A view never keeps a fact of its own.
2. **A primitive's Bundle owns the interaction state it names**, placed in that
   Model: which item the arrows are on (`ListNavigation`), what is held
   (`Reorder`), how far a row has left (`Presence`). Only its own `update` writes
   that slice; the parent reads it and calls its `helpers`.
3. **A widget's view is stateless, or holds a small Model the application
   places.** `SearchField.view` takes the text and the Messages to send;
   `TagsInput` exports `Model`, `init` and `update` for the application to keep
   and lifts its Messages through `onMessage`. Neither stores anything.
4. **Styles reach only Slots.** A stylist, a Behavior and an accessibility check
   see the elements a view draws through `slots.<name>.attrs(...)` and nothing
   else. Markup drawn outside a Slot is out of everyone's reach.
5. **One owner per event and attribute on an element.** A second `keydown`
   handler on a slot is `mixins:event-conflict`, so a slot's keys are one
   `Behaviors.Keys` owner built from named routes, and an application adds a key
   as another route. Each attribute has one writer too.
6. **One Mount per element, and a Mount reads its arguments once.** The
   resolver composes the Mounts that Mixins contribute to a slot into one; a
   Mount drawn some other way on the same element replaces the first without a
   word. A DOM effect the Model caused (focus this row once it is drawn) is a
   Command from `update`, not a Mount.

## The pieces

```text
Theme tokens ─► Style / Recipe ─┐
                                ├─► Mixins ─► resolver ─► Foldkit attributes
Bundle state ─► Behavior ───────┘                ▲
                                                 │
Slots contract ─────────► SlotView ──────────────┘   (the view draws each slot)
```

- **Slot and Slots** (`foldkit-mixins`). A Slot is a named element of a view's
  anatomy; `Slots.define({ ... })` is the contract. Each Slot states a
  **capability** (`Container`, `Interactive`, `Focusable`, `TextInput`, ...), the
  **events** and **attributes** it publishes, which a Behavior may then require,
  and the ones it **protects**, which no attachment may write. The contract is
  data: declaring it installs nothing.
- **SlotView**. A pure view drawn over a contract: `SlotView.over(Slots)<Input,
  Message>()` names the slots, the input and the Message universe once, and its
  `define((input, slots, h) => ...)` draws each element through `slots.x.attrs(base,
  item?)`. `.pipe(...)` attaches things and returns a new view; the original is
  unchanged.
- **Mixin**. What every attachment compiles to: per slot, classes, inline
  declarations, attributes, handlers and Mounts, plus metadata (`requires`,
  `provides`). The resolver merges a slot's Mixins and refuses two owners of one
  thing.
- **Style**. A Mixin that only styles: `Style.forSlots(Slots)({ slot: piece })`
  compiles pieces (declarations, rules, states) to generated classes placed in a
  layer.
- **Recipe**. Styles selected by axes: `Style.recipeFor(Slots)({ base, variants,
  defaults, compound })` is a function from a selection (`{ size: 'sm' }`) to
  pieces, and `.extend(patch)` adjusts it without a fork.
- **Behavior**. A Mixin of attributes and Mounts computed from the view's
  input: `Behavior.slot({ requires, provides, attributes: ({ input, h, item }) =>
  [...], mount })`. It holds no state. `requires` is checked against the slot when
  the Behavior is made.
- **Bundle** (`foldkit-bundle`). State and Messages packaged once: a Model, a
  Message union, an `update`, `helpers`, placed in a parent with
  `Bundle.parent(...).at(...)` (or once per key with the bundle's `each`) and folded into the
  parent's `update`.
- **Mount, Command, Subscription**. A Mount turns a DOM fact about one element
  into Messages for that element's lifetime (where focus went, a size). A
  Command does work `update` asked for and answers with a Message (focus this
  id, fetch this). A Subscription observes a stream the Model asks for (a timer, a
  socket, a media query) and ends when the Model stops asking.
- **Primitive, widget, application component**. A primitive
  (`foldkit-primitives`) is one interaction written once: a Bundle and/or a
  Mount and/or a Behavior (`ListNavigation`, `Presence`, `FocusRecovery`). A widget
  (`foldkit-mixins-ui`) is a finished view: a Slots contract, a view function, a
  recipe and an accessibility pattern (`SearchField`, `Toolbar`). An application
  component is a view in your app, assembled from either.

### The pairs people confuse

| | The first | The second | Choose by |
| --- | --- | --- | --- |
| Style vs Recipe | one set of pieces per slot | a function of a selection to pieces, with `.extend` | whether callers choose among looks |
| Mixin vs Behavior | the compiled unit the resolver merges (a Style, a Behavior, an `A11y.base` are all Mixins) | a Mixin built from the input, with `requires` and `provides` | you write Behaviors; you compose and pass Mixins |
| Behavior vs Bundle | writes attributes and Mounts from the input; owns nothing | owns a slice of the Model and its transitions | a Behavior that "needs state" means a Bundle is missing |
| Mount vs Command | a DOM fact as Messages, while the element lives; arguments read once | an effect `update` decided, run once, answered by a Message | who caused it: the DOM (Mount) or the Model (Command) |
| Stateless view vs widget with a Model vs placed Bundle | a function of its options (`SearchField.view`) | exports `Model`, `init`, `update`, `view`; the application stores it in a field and routes its Messages (`TagsInput`) | a Bundle is placed and folded by `foldkit-bundle`, with no hand routing ([Bundle versus Submodel](./bundle-vs-submodel.md)) |
| `resolveFor` adapter vs `SlotView` | names the attribute bundles an upstream `@foldkit/ui` component hands its `toView` as Slots; the markup stays upstream's | a view whose markup you draw | whether someone else draws the element |
| Pattern vs obligations and `support` vs `Conformance` | `A11y.pattern`: the slots, capabilities, events and attributes a widget of that kind must publish (`A11y.validate`) | obligations: what an attachment must say it does there (`A11y.check`, `A11y.conform`); `support`: the catalog's record of who supplies them for a widget with no SlotView to read | `Conformance`: what the page did, in a browser. The first two are structural, the last rendered; none is a WCAG claim |

## Which rung to stand on

Start at the top and step down only when the rung above cannot do the job.

| Rung | When it is right | You write | You get for free | You now owe |
| --- | --- | --- | --- | --- |
| 1. A shipped widget as is | the catalog has it | the options, the Messages, a recipe selection | keys, focus, ARIA, a pattern, a recipe, tests | nothing beyond your own page's tests |
| 2. Customize it | it is right except for a look, a key, an attribute | `Recipes.X.extend(...)`, a Mixin in `mixins`, a `routes` entry, a `words` override | everything above, kept | a test of what you added |
| 3. Assemble one in your app | nothing in the catalog fits, and only this app needs it | Slots, a SlotView, primitives' Bundles and Behaviors, a Style | the primitives' keys, focus and ARIA, the resolver's conflict checks | a pattern and its conformance, browser tests for keys and focus, server markup |
| 4. A reusable widget | several apps need it | rung 3, plus a view function with sibling-shaped options, a recipe in the catalog, a pattern entry | the catalog's gates check it | the checklist below, docs rows, a changelog entry |
| 5. A primitive | an interaction no primitive covers, which widgets would share | a Bundle and/or Mount and/or Behavior, with a `keys` route if it takes keys | composes with every view | unit tests on Effect's clock, browser tests, the subpath README |

Most work lives on rungs 2 and 3. The rest of this guide builds a rung 3
component, then distils rungs 4 and 5 into checklists.

## A worked build: filter chips

A row of filter chips: each chip is picked or not, the arrows move between
them, Space and Enter pick, Delete removes a chip with a short fade, and a
button removes every picked chip. It needs every mechanism above, and the
catalog has no such widget. The full code, with its tests, is
[`packages/mixins-ui/test/authoringGuide.ts`](../packages/mixins-ui/test/authoringGuide.ts);
the snippets below are reduced from it and compile.

### 1. Slots, a style and a view

The first version is a group of toggle buttons. The picks are a field of the
Model, because they are the application's fact:

```ts standalone
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { Capability, Event, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'

const Chip = Schema.Struct({ id: Schema.String, label: Schema.String })
const Model = Schema.Struct({ chips: Schema.Array(Chip), picked: Schema.Array(Schema.String) })
type Model = typeof Model.Type

const Message = defineMessageUnion({ Toggled: { id: Schema.String } })
type Message = typeof Message.Type

const update = (model: Model, message: Message) =>
  Message.match(message, {
    Toggled: ({ id }) => ({
      model: modifyFields(model, {
        picked: picked =>
          picked.includes(id) ? picked.filter(each => each !== id) : [...picked, id],
      }),
    }),
  })

const ChipSlots = Slots.define({
  group: Slot.make({ capability: Capability.Container }),
  chip: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
})

const t = Theme.ref(Theme.standard())

const ChipStyle = Style.forSlots(ChipSlots)(
  {
    group: Style.self({ display: 'flex', flexWrap: 'wrap', gap: t.space.xs }),
    chip: Style.compose(
      Style.self({
        borderRadius: t.radius.full,
        paddingInline: t.space.sm,
        backgroundColor: 'transparent',
      }),
      Style.states({ true: { backgroundColor: t.accent.default } }, 'aria-pressed'),
    ),
  },
  { name: 'ChipStyle' },
)

const Chips = SlotView.over(ChipSlots)<Model, Message>()

export const ToggleChips = Chips.define((model, slots, h) =>
  h.div(
    slots.group.attrs([h.Role('group'), h.AriaLabel('Filters')]),
    model.chips.map(chip =>
      h.button(
        slots.chip.attrs([
          h.Key(chip.id),
          h.Type('button'),
          h.AriaPressed(String(model.picked.includes(chip.id))),
          h.OnClick(Message.Toggled({ id: chip.id })),
        ]),
        [chip.label],
      ),
    ),
  ),
).pipe(Style.attach(ChipStyle))
```

What each part is, and is not:

- `Slots.define` declares the anatomy. `chip` publishes `click`, so a Behavior
  that requires a click may attach there; nothing is installed.
- `Theme.ref(Theme.standard())` reads tokens by name: `t.space.xs` is
  `var(--fk-space-xs)`, never a value, so the page's theme applies, and a token
  the theme lacks is a type error.
- `Style.states(map, 'aria-pressed')` styles a state the DOM already shows
  (`&[aria-pressed="true"]`). State only the view knows would be
  `Style.whenInput(predicate, piece)`.
- `Chips.define` draws every element through a Slot. The view owns `OnClick`, so
  a Behavior adding a second click handler to `chip` is refused at render.
- `update` is the only writer of `picked`. The view sends `Toggled` and decides
  nothing.

This version is already accessible: native buttons are focusable and pressable,
and `aria-pressed` says the state. Its limit is the keyboard: every chip is a
tab stop. A long row wants one stop and the arrows, as a listbox does, and that
needs a fact the view cannot keep: which chip the arrows are on.

### 2. State: a Model field, or a placed Bundle

Decide per fact. The chips are the application's: a Model field. The chip the
arrows are on, and the toggling rule for picks, are interaction state a
primitive already owns, so place its Bundle rather than writing the transitions
again. A removed chip should fade before it goes, and a `Presence` per chip
owns that exit:

```ts standalone
import { Match, Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import * as Update from 'foldkit/update'
import { Bundle, Link } from 'foldkit-bundle'
import { ListNavigation, Presence, Selection } from 'foldkit-primitives/interaction'
import { PresenceMessage } from 'foldkit-primitives/motion'

export const Chip = Schema.Struct({ id: Schema.String, label: Schema.String })
export type Chip = typeof Chip.Type

export const Nav = Bundle.declare(ListNavigation.bundle, 'nav')
export const Picks = Bundle.declare(Selection.bundle, 'picks')
export const GotPresence = Link.keyedWrapper('GotPresence', PresenceMessage)

export const navArgs = {
  orientation: 'horizontal',
  loop: true,
  virtual: false,
  timeoutMs: 500,
  page: 5,
} as const
export const pickArgs = { mode: 'multiple', allowEmpty: true } as const

export const Model = Schema.Struct({
  ...Nav.fields,
  ...Picks.fields,
  id: Schema.String,
  chips: Schema.Array(Chip),
  presence: Schema.Record(Schema.String, Presence.bundle.Model),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ...Nav.cases,
  ...Picks.cases,
  ...GotPresence.cases,
  Removed: { id: Schema.String },
  RemovedPicked: {},
})
export type Message = typeof Message.Type

/** A chip's element id: the instance's, then the chip's, so two filters on a page share none. */
export const chipId = (model: Pick<Model, 'id'>, chip: Chip): string => `${model.id}-${chip.id}`

export const phaseOf = (model: Pick<Model, 'presence'>, id: string): Presence.Phase => {
  const placed = Object.hasOwn(model.presence, id) ? model.presence[id] : undefined
  if (placed === undefined) throw new Error(`chip ${id} is drawn with no Presence placed`)
  return placed.phase
}

const Parent = Bundle.parent({ Model, Message })
const Picked = Parent.at(Picks, { args: pickArgs })

const Exits = Presence.bundle.each(Link.collection<Model>()('presence', GotPresence), {
  args: { durationMs: 150 },
  // A chip is taken out when its exit has run, and out of the picks with it.
  onMessage: (_message: PresenceMessage, id: string) => (model: Model) =>
    phaseOf(model, id) === 'hidden'
      ? Picked.helpers.replace(model.picks.selected.filter(each => each !== id))(
          modifyFields(model, {
            chips: chips => chips.filter(chip => chipId(model, chip) !== id),
            presence: presence =>
              Object.fromEntries(Object.entries(presence).filter(([key]) => key !== id)),
          }),
        )
      : { model },
})

export const assembly = Bundle.assemble<Model, Message>()([
  Parent.at(Nav, { args: navArgs }),
  Picked,
  Exits,
])

/** Hides each shown chip of `ids`; a chip already leaving is left to its exit. */
const hideAll = (model: Model, ids: ReadonlyArray<string>) =>
  Update.combine(
    model,
    ids
      .filter(id => Object.hasOwn(model.presence, id) && phaseOf(model, id) === 'shown')
      .map(id => Exits.helpers.hide(id)),
  )

export const update = assembly.update((model, message) =>
  Match.valueTags(message, {
    Removed: ({ id }) => hideAll(model, [id]),
    RemovedPicked: () => hideAll(model, model.picks.selected),
  }),
)
```

- `Bundle.declare(bundle, 'nav')` names where a primitive's slice lives. Its
  `fields` and `cases` spread into your Model and Message: the Model gains `nav`,
  the union gains its wrapper Message. Nothing runs.
- `Parent.at(...)` places it; a bundle's `each` places one per key, here a `Presence`
  per chip in the `presence` record. `assembly.update(own)` routes each placed
  Bundle's Messages to its own `update` and the rest to yours, so `own` matches
  only `Removed` and `RemovedPicked`.
- The parent never writes `picks` or `presence` itself. It calls helpers
  (`Picked.helpers.replace`, `Exits.helpers.hide`), which run the Bundle's own
  transition and return its Commands; `Update.combine` folds several.
- Removal is a fact decided over time. `Removed` starts the chip's exit;
  `Presence` answers `Hidden` after 150 ms, on Effect's clock; `onMessage` then
  takes the chip out. A `Hidden` from an older exit carries an older generation
  and changes nothing.
- When nothing changes, every branch returns the Model it was given. Foldkit
  redraws only when the Model's identity changes.

Use a plain Model field when the fact is yours and its transitions are a line of
`update`. Place a Bundle when a primitive already owns the transitions, or when
the same state recurs per item.

### 3. Interaction: attach primitives' Behaviors, and keys as routes

The view becomes a listbox. Each primitive that owns state also ships the
Behavior that draws it on Slots:

```ts
import { Attr, Behaviors, Capability, Event, Slot, Slots, SlotView } from 'foldkit-mixins'

const { Keys } = Behaviors

export const ChipSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  list: Slot.make({ capability: Capability.Container, events: [Event.KeyDown] }),
  chip: Slot.make({
    capability: Capability.Focusable,
    events: [Event.KeyDown],
    attributes: [Attr.AriaSelected],
  }),
  remove: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
})

const Filter = SlotView.over(ChipSlots)<Model, Message>()

const chipsByModel = new WeakMap<Model, Behaviors.Collection.Items<Chip>>()

/** The chips as one Collection, built once per Model: every chip a Behavior draws asks for it. */
export const itemsOf = (model: Model): Behaviors.Collection.Items<Chip> => {
  const known = chipsByModel.get(model)
  if (known !== undefined) return known
  const items = Behaviors.Collection.of(model.chips, {
    id: chip => chipId(model, chip),
    // A leaving chip is passed over by the arrows.
    disabled: chip => phaseOf(model, chipId(model, chip)) !== 'shown',
  })
  chipsByModel.set(model, items)
  return items
}

const Navigates = ListNavigation.behavior(Nav, navArgs)(Filter)({
  container: 'list',
  item: 'chip',
  items: itemsOf,
  text: (model, index) => model.chips[index]?.label ?? '',
})

const Picking = Selection.behavior(Picks, pickArgs)(Filter)({
  container: 'list',
  item: 'chip',
  items: itemsOf,
})

const Ids = Behaviors.Collection.behavior(Filter)({ item: 'chip', items: itemsOf })

/** A key the page answers on a chip, beside Space, Enter, Delete and Backspace. */
export type Route = Behaviors.Keys.Route<Model, Message>

const toggles = Keys.route<Model, Message>('Toggle', {
  on: [Keys.chord('Enter'), Keys.chord(' ')],
  handle: ({ key, input, item }) =>
    // Space mid-word belongs to the typeahead.
    item?.id === undefined || (key === ' ' && input.nav.query !== '')
      ? Option.none()
      : Option.some(Picks.wrapper.make(Selection.Message.Activated({ id: item.id }))),
})

const removes = Keys.route<Model, Message>('Remove', {
  on: [Keys.chord('Delete'), Keys.chord('Backspace')],
  handle: ({ item }) =>
    item?.id === undefined ? Option.none() : Option.some(Message.Removed({ id: item.id })),
})

/** One owner of a chip's `keydown`: the filter's own routes, then the page's. */
export const chipKeys = (routes: ReadonlyArray<Route> = []) =>
  Keys.behavior(Filter)({ slot: 'chip', name: 'ChipKeys', routes: [toggles, removes, ...routes] })

/** The markup alone: no keys, no picks, no look. */
export const chipView = (label: string) =>
  Filter.define((model, slots, h) =>
    h.div(slots.root.attrs(), [
      h.ul(
        slots.list.attrs([h.Role('listbox'), h.AriaLabel(label)]),
        model.chips.map((chip, index) =>
          h.li(
            slots.chip.attrs([h.Key(chipId(model, chip)), h.Role('option')], {
              index,
              id: chipId(model, chip),
            }),
            [chip.label],
          ),
        ),
      ),
      ...(model.picks.selected.length === 0
        ? []
        : [
            h.button(slots.remove.attrs([h.Type('button'), h.OnClick(Message.RemovedPicked())]), [
              'Remove picked',
            ]),
          ]),
    ]),
  )
```

- `SlotView.over(...)<Model, Message>()` is the binder. Every factory given
  `Filter` reads the slots, the input and the Messages from it, so nothing below
  is annotated, and a misspelt slot name is a type error.
- `Behaviors.Collection.of` describes the items once: ids, order, which are
  disabled. Navigation, selection and ids all read the same one, cached per
  Model, so they agree and no chip recomputes it.
- `ListNavigation.behavior` owns the list's `keydown` (the arrows of the
  orientation, Home, End, typing to find) and gives each chip its `tabindex` and an
  `OnFocus` that reports it current: one tab stop that follows focus.
  `Selection.behavior` writes `aria-selected` on each chip, `aria-multiselectable`
  on the list, and a click that picks.
- Each chip draws `slots.chip.attrs(base, { index, id })`. The item is how a
  per-item Behavior knows which chip it is drawing; a key route reads it as
  `item`.
- The chip's own keys are one `Keys.behavior`. A route answers a press with
  `Option.some(message)` or declines with `Option.none()`; a handled press is
  default-prevented, a declined one keeps its native effect, and propagation is
  never stopped, so a key the chip declines still reaches the list's
  navigation. A route never writes the Model: `Toggle` answers Selection's own
  `Activated`, and Selection decides what toggling is.
- `chipKeys(routes)` is the extension point. A page that wants a key on a chip
  adds a route; one that claims a gesture the filter takes (Delete, say) throws
  `mixins:key-conflict` naming both routes when the view is made. `Keys.first(a,
  b)` lets two routes share a chord on purpose.
- A Behavior of your own is made on the same binder: `Filter.behavior({ chip:
  Behavior.slot({ provides, attributes: ({ input, h, item }) => [...] }) }, { name
  })`, and its `provides` count toward the pattern of step 6.

### 4. Focus and exits

Two things go wrong when parts leave. Focus on a removed chip drops to the page,
and a chip that vanishes at once gives no sign it went. Two Behaviors cover
them, both drawing from facts the Model already holds:

```ts
import { FocusRecovery } from 'foldkit-primitives/interaction'

const Leaves = Presence.behavior(Filter)({
  content: 'chip',
  phase: (model, item) => phaseOf(model, item?.id ?? ''),
})

const Recovers = FocusRecovery.behavior(Filter)({
  owner: 'root',
  parts: { chip: ['next', 'previous'], remove: ['stop'] },
})
```

- `Presence.behavior` draws the phase: `data-presence="hiding"` for a style to
  fade, and `inert` for every phase but `shown`, so a leaving chip takes no
  press, Tab or focus and leaves the accessibility tree while it stays drawn.
  It sends nothing and mounts nothing.
- `FocusRecovery.behavior` marks the parts and puts one Mount on the owner.
  When the element holding focus is removed, hidden, made `inert` or `disabled`,
  focus goes to the first step that can take it: the next chip, else the
  previous one. A leaving chip turns `inert` in the frame `Removed` is drawn, so
  focus moves then, before the chip is gone. When the last pick goes, the
  remove button goes with it, and focus goes to the list's tab stop (`stop`).
  Focus that was moved elsewhere is never taken.

Focus that a Message causes (opening an editor, then focusing it) is a Command
from `update`, as the list in
[`examples/authoring`](../examples/authoring/README.md) does with `FocusById`.
Focus that returns when an overlay closes is the overlay's: `Overlay.nonModal`
returns it to the trigger in that example's popup, and `Dialog.focusReturn`,
`Tour.focusReturn` and `FloatingPanel.focusReturn` do it for the shipped ones.

`FocusRecovery` sends no Message, and a Scene test resolves every Mount a page
draws with a Message, so it cannot resolve one that sends none. That is fine in
your own component, whose Scene tests you write. A reusable widget ships such a
Mount as an option the application turns on (`recoveryPart` on `Alert`), or
replaces it with a Command (`SearchField.Focus`).

### 5. A recipe: axes, states and layers

The look becomes a recipe with a `size` and a `look` axis, the picked state
styled from `aria-selected`, every value a token:

```ts
import { Layers, Style, type StyleValue } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'

const t = Theme.ref(Theme.standard())
const base = (...pieces: ReadonlyArray<StyleValue>) =>
  Layers.standard.in('components', Style.compose(...pieces))
const pick = (...pieces: ReadonlyArray<StyleValue>) =>
  Layers.standard.in('variants', Style.compose(...pieces))

/** The picked look, written beside each look that sets the same properties, so it wins in that layer. */
const picked = Style.states(
  {
    true: {
      backgroundColor: t.accent.default,
      borderColor: t.accent.default,
      color: t.accent['on-fill'],
    },
  },
  'aria-selected',
)

export const ChipRecipe = Style.recipeFor(ChipSlots)({
  base: {
    root: base(Style.self({ display: 'grid', gap: t.space.xs, justifyItems: 'start' })),
    list: base(
      Style.self({
        display: 'flex',
        flexWrap: 'wrap',
        gap: t.space.xs,
        margin: '0',
        padding: '0',
        listStyle: 'none',
      }),
    ),
    chip: base(
      Style.self({
        borderRadius: t.radius.full,
        borderWidth: t.border.thin,
        borderStyle: 'solid',
        cursor: 'pointer',
        userSelect: 'none',
        transitionProperty: 'opacity',
        transitionDuration: t.motion.fast,
      }),
      Style.pseudo(':focus-visible', {
        outline: `${t.border.thick} solid ${t.outline.focus}`,
        outlineOffset: '2px',
      }),
      Style.pseudo('[data-presence="hiding"]', { opacity: '0' }),
    ),
  },
  variants: {
    size: {
      sm: { chip: pick(Style.self({ paddingBlock: t.space['3xs'], paddingInline: t.space.xs })) },
      md: { chip: pick(Style.self({ paddingBlock: t.space['2xs'], paddingInline: t.space.sm })) },
    },
    look: {
      outline: {
        chip: pick(
          Style.self({
            backgroundColor: 'transparent',
            borderColor: t.outline.default,
            color: t.text.default,
          }),
          picked,
        ),
      },
      soft: {
        chip: pick(
          Style.self({
            backgroundColor: t.state.tint,
            borderColor: 'transparent',
            color: t.text.default,
          }),
          picked,
        ),
      },
    },
  },
  defaults: { size: 'md', look: 'outline' },
})

export const ChipStyle = Style.forSlots(ChipSlots)(ChipRecipe(), { name: 'ChipStyle' })
export const SoftSmallChips = Style.forSlots(ChipSlots)(ChipRecipe({ size: 'sm', look: 'soft' }), {
  name: 'SoftSmallChips',
})
```

The layer a rule lands in decides more than its selector does. The shipped
order (`Layers.standard`) is `reset, tokens, theme, defaults, components,
layouts, variants, utilities, app`, and a rule in a later layer beats any rule
in an earlier one, whatever its specificity. So:

- the base goes in `components` and each axis's choice in `variants`, so a
  chosen size or look beats the base;
- the picked state sets `backgroundColor`, which every look also sets in
  `variants`. Written once in the base, it would lose to the look on every chip
  and no picked chip would show it. It sits beside each look instead, in the same
  layer, where the attribute selector wins;
- an application's own rules land in `app`, last, so a page can override the
  recipe without `!important`; `Style.inline` sits outside every layer and beats
  even `app`, so keep it for values no theme may touch;
- an adjustment is `ChipRecipe.extend({ variants: { look: { soft: { chip: ... } } } })`,
  never a copy.

`Style.stylesheet(...)` collects the rules for the page, after the layer order
and `Theme.root` of the theme (see [`foldkit-mixins`](../packages/mixins/README.md#style-appearance-as-data)).

### 6. Accessibility: a pattern, its obligations, and a rendered check

A listbox owes more than its markup. The pattern names what, slot by slot, and
the assembly says who supplies it:

```ts
import { A11y, Behavior, type NamedStyle } from 'foldkit-mixins'

export const ChipPattern = A11y.pattern({
  list: { capability: Capability.Container, obligations: [A11y.Navigation, A11y.Name] },
  chip: {
    capability: Capability.Focusable,
    obligations: [A11y.FocusStrategy, A11y.Activation, A11y.State(Attr.AriaSelected)],
  },
})

export interface ChipFilterOptions {
  /** The listbox's accessible name. */
  readonly label: string
  /** Keys the page answers on a chip; a route on a gesture the filter takes is `mixins:key-conflict`. */
  readonly routes?: ReadonlyArray<Route>
  /** A style of `ChipSlots`; default `ChipStyle`. */
  readonly style?: NamedStyle<typeof ChipSlots>
}

export const chipFilter = (options: ChipFilterOptions) =>
  chipView(options.label).pipe(
    Behavior.attach(Navigates),
    Behavior.attach(Picking),
    Behavior.attach(chipKeys(options.routes)),
    Behavior.attach(Ids),
    Behavior.attach(Leaves),
    Behavior.attach(Recovers),
    // The list's name is the view's own `aria-label`: its word, as no Behavior states it.
    SlotView.attach(A11y.base({ list: [A11y.Name] })),
    Style.attach(options.style ?? ChipStyle),
    A11y.conform(ChipPattern),
  )

/** The page's own key: Escape on a chip lets go of every pick. */
export const escapeClears = Keys.route<Model, Message>('ClearPicks', {
  on: [Keys.chord('Escape')],
  handle: ({ input }) =>
    input.picks.selected.length === 0
      ? Option.none()
      : Option.some(Picks.wrapper.make(Selection.Message.Cleared())),
})

export const FilterChips = chipFilter({ label: 'Filters', routes: [escapeClears] })
```

- `ListNavigation` states that it supplies `list/navigation` and
  `chip/focus-strategy`; `Selection`, `chip/activation` and
  `chip/state:aria-selected`; `A11y.base` is the view's own word for the name.
  Leave `Picking` out and the `A11y.conform` line is a type error naming
  `'chip/activation' | 'chip/state:aria-selected'`, and at run time `chipFilter`
  throws `a11y:unsatisfied-obligation` when called (a view conformed at a
  module's top level throws where the module loads).
- `A11y.conform` is structural: the declarations fit together. It draws
  nothing, runs no Mount and says nothing about WCAG.
- `escapeClears` is a page's route on Escape, an extension through `routes`:
  with nothing picked it declines, so Escape reaches whatever encloses the
  filter.

The rendered claim is a browser test: `Conformance.listbox` drives the real
page with keys and presses and reads names and roles from Chromium's
accessibility tree (step 7).

### 7. Tests that can fail

Each claim gets the test that can see it. jsdom lays nothing out and moves no
focus, so focus, keys and computed style are browser tests.

**What `update` decides**, with no page. Return the given Model on a no-op, and
assert that by identity:

<!-- docs-check
import * as Runtime from 'foldkit/runtime'
import type { HtmlBuilder } from 'foldkit/html'
export const initialOf = (id: string, chips: ReadonlyArray<Chip>) =>
  assembly.initial({
    id,
    chips,
    presence: Object.fromEntries(
      chips.map(chip => [chipId({ id }, chip), { phase: 'shown', generation: 0 } as const]),
    ),
  })
const CHIPS: ReadonlyArray<Chip> = [
  { id: 'open', label: 'Open' },
  { id: 'mine', label: 'Mine' },
]
export const mountFilter = (container: HTMLElement, id: string) =>
  Runtime.embed(
    Runtime.makeElement(
      assembly.complete({
        Model,
        container,
        init: () => initialOf(id, CHIPS),
        update,
        view: (model: Model, h: HtmlBuilder<Message>) => FilterChips(model, h),
        subscriptions: assembly.subscriptions(),
      }),
    ),
  )
-->

```ts
import { expect, test } from 'vitest'

test('a removed chip leaves before it goes, and a stale Hidden keeps it', () => {
  const start = initialOf('f', CHIPS).model
  const leaving = update(start, Message.Removed({ id: 'f-mine' })).model
  expect(leaving.presence['f-mine']?.phase).toBe('hiding')
  const stale = update(leaving, GotPresence.make('f-mine', PresenceMessage.Hidden({ generation: 0 })))
  expect(stale.model.chips).toHaveLength(2)
  expect(update(start, Message.Removed({ id: 'elsewhere' })).model).toBe(start)
})
```

**The contract**, in a type test (`*.test-d.ts`, checked, not run). Prove each
constraint rejects, not only that the right call compiles:

```ts
import { defineMessageUnion } from 'foldkit/message'

const Foreign = defineMessageUnion({ SentElsewhere: {} })

export const foreignRoute = chipFilter({
  label: 'Filters',
  routes: [
    // @ts-expect-error a page route cannot send a Message the filter does not
    Keys.route('Elsewhere', {
      on: [Keys.chord('x')],
      handle: () => Option.some(Foreign.SentElsewhere()),
    }),
  ],
})
```

**Keys and focus**, in a browser test. Wait for the frame a key asked for
before the next: a key meets the page as last drawn, so two keys faster than a
frame start from the same chip.

<!-- docs-check
declare const userEvent: { readonly keyboard: (text: string) => Promise<unknown> }
-->

```ts
import { vi } from 'vitest'
import { Frames } from 'foldkit-mixins/testing'

test('Delete hands focus to the next chip at once', async () => {
  const frames = Frames.track()
  const container = document.createElement('div')
  container.id = 'host'
  document.body.append(container)
  const filter = mountFilter(container, 'f')
  await vi.waitFor(() => expect(document.getElementById('f-open')).not.toBeNull())
  document.getElementById('f-open')!.focus()
  await frames.settle()
  await userEvent.keyboard('{Delete}')
  await vi.waitFor(() => expect(document.activeElement?.id).toBe('f-mine'))
  filter.dispose()
  frames.dispose()
})
```

The same file runs the rendered scenario. It reads no Model and no Slot, so it
holds a shipped listbox and this one to one behaviour:

<!-- docs-check
declare const cdp: Conformance.BrowserTools['cdp']
-->

```ts
import { Conformance } from 'foldkit-mixins/testing'

test('the filter conforms to the listbox scenario', async () => {
  const result = await Conformance.listbox(Conformance.harness({ cdp, userEvent }), {
    name: 'Filters',
    options: ['Open', 'Mine'],
    orientation: 'horizontal',
    enter: async () => document.getElementById('f-open')?.focus(),
  })
  expect(Conformance.failures(result)).toEqual([])
})
```

`Conformance.listbox` calls `enter` only while no option is drawn, so a list
that is drawn open must have the keyboard before the scenario starts: focus a
chip first, as the fixture's test does.

**Server markup.** Render the view to a string, parse it back as a browser
would, and read what a visitor gets before any script runs. Foldkit refuses a
view whose parse differs from what it drew, so this also proves the markup
survives a parser:

```ts
import { Effect } from 'effect'
import { injectIntoTemplate, renderToString } from 'foldkit/experimental/server'

test('a served filter is a named listbox with its chips', async () => {
  const served = await Effect.runPromise(
    renderToString(
      {
        init: () => initialOf('f', CHIPS),
        view: (model: Model, h: HtmlBuilder<Message>) => ({ title: 'Served', body: FilterChips(model, h) }),
      },
      { buildId: 'b' },
    ),
  )
  const page = new DOMParser().parseFromString(
    injectIntoTemplate('<!doctype html><html><head><title></title></head><body></body></html>', served),
    'text/html',
  )
  const found = Conformance.server('listbox', page.body, [
    { role: 'listbox', name: 'Filters', attributes: { 'aria-multiselectable': 'true' } },
    { role: 'option', name: 'Open', attributes: { 'aria-selected': 'false', tabindex: '0' } },
  ])
  expect(Conformance.failures(found)).toEqual([])
})
```

**Mutations.** A test that passes against broken code proves nothing. Declare
the edits that must turn each claim red beside the tests and run `pnpm mutate
<spec>`; it applies each edit in memory, never to the file:

```ts
export default [
  {
    name: 'focus falls to the previous chip first',
    edits: [{ file: './authoringGuide.ts', find: "chip: ['next', 'previous']", replace: "chip: ['previous']" }],
    tests: ['packages/mixins-ui/test/authoringGuide.browser.test.ts'],
  },
]
```

The fixture's
[`authoringGuide.mutations.ts`](../packages/mixins-ui/test/authoringGuide.mutations.ts)
holds twelve, one of them the layer trap of step 5: move the picked state into
the base and a browser test that reads the picked chip's computed fill goes
red, while every test that reads the CSS text stays green.

## Authoring a reusable widget

A widget in `foldkit-mixins-ui` is rung 3 made public. Distilled from how
`SearchField` and `Toolbar` were built (`searchField.ts`, `toolbar.ts` and their
tests):

**The contract**

- [ ] `XSlots = Slots.define(...)`, the full anatomy: every element a stylist
      or a Behavior may need is a Slot, with its capability, the events and
      attributes it publishes, and `protected` for what no attachment may write
      (a structural `role`).
- [ ] `XPattern = A11y.pattern(...)` with its obligations, and a `catalog` entry
      in `patterns.ts`: `entry(name, pattern, slots, tier, roles, floor,
      support)`. `support` names who supplies each obligation
      (`drawn('X.view: ... (x.ts)', slot, Navigation)`, `native('input', ...)`),
      because the view draws through `SlotView.buildersFor`, with no SlotView whose
      attachments `A11y.check` could read. The gates (`patterns.test.ts`,
      `catalogComplete.test.ts`, `declaredAttributes.test.ts`) then hold it.

**The view**

- [ ] `view<Message>(options: XView<Message>, h)`, stateless, drawing every
      element through `SlotView.buildersFor(XSlots, [style.mixin, keys.mixin,
      ...mixins], { input, h })`.
- [ ] Options shaped like the siblings': `id` (prefixes every id the widget
      draws, unique on the page), `label`, the value and the Messages it sends
      typed `NoInfer<Message>`, `disabled`, `words` (every visible or spoken
      string, English by default), `direction` where arrows run along a line
      (swap ArrowLeft and ArrowRight under `'rtl'` before building the Message),
      `routes` (`Behaviors.Keys.Route`s listed after the widget's own, one owner),
      `style?: NamedStyle<typeof XSlots>`, `mixins?: MixinList<Message>`, and `name`
      where it holds a value a form submits.
- [ ] With state, export `Model`, `Message`, `init` and `update` for the
      application to place, and take `onMessage` to lift its Messages
      (`TagsInput`).
- [ ] No Mount that sends no Message on by default: make it an option or a
      Command (`SearchField.Focus`, `recoveryPart`).
- [ ] Refuse in `update` what a control says it refuses: a disabled `Button.view`
      is `aria-disabled` and still submits.

**The look**

- [ ] `recipes/x.ts`: `Style.recipeFor(XSlots)` with `component(...)` for bases
      and `variant(...)` for axes from `recipes/design.ts`, every value through its
      `ref`; exported from `recipes/index.ts`. A state that sets a property a
      variant sets is written beside each variant, and its longhands match the
      base's (`backgroundColor`, not `background`).

**The tests**, each able to fail

- [ ] `x.test.ts`: the inert drawing (`Inert.byTag`, `Inert.value`), what each
      interaction sends (`Scene`), `A11y.validate(XPattern, XSlots)`.
- [ ] `x.test-d.ts`: `@ts-expect-error` for a foreign Message in a route or
      callback, and an unknown slot in a Behavior or Style.
- [ ] `x.browser.test.ts`: keys and focus with `userEvent`, computed style in
      each state, and the `Conformance` scenario where one exists.
- [ ] `x.ssr.test.ts`: rendered to a string and parsed back.
- [ ] `x.mutations.ts`, with `pnpm mutate:check` before committing.

**The docs**

- [ ] A section in the package README and a row in its "Finding a widget"
      table; a row in the routes table if it takes `routes`, in the form
      participation table if it takes `name`; the skill's `mixins.md`; an entry
      under Unreleased in the changelog.

## Authoring a primitive

A primitive in `foldkit-primitives` is one interaction no widget should write
twice. Distilled from `InlineEdit` (`inline-edit.ts`) and `SpatialNavigation`:

- [ ] Choose the lightest form that holds what it must own: a function, a
      Command, a Mount, an entry, a Bundle, or a Bundle with a Behavior (the
      table in [`foldkit-primitives`](../packages/primitives/README.md#which-form-a-primitive-takes)).
- [ ] `Bundle.make(name, { Model, Message, args, init, update, helpers })`:
      the Model holds ids and values, never elements; a Message that changes
      nothing returns the Model it was given; everything timed runs on Effect's
      clock; a settled value the parent must handle is an OutMessage, which
      placement refuses to drop without `onOut`.
- [ ] `behavior(declared, args)` overloaded for a binder and for bare slots,
      each `Behavior.slot` stating its `provides`, and the binder overload its
      `A11y.ProvidedOn` names, so a view's `A11y.conform` sees them.
- [ ] A key half as a route (`keys(declared, args)` returning a
      `Behaviors.Keys.Route`), and an item half (`item`), so a host whose element
      already has a key owner lists the route beside its own.
- [ ] Carry in the Message what `update` needs to continue: `InlineEdit` reads
      nothing back from its field, so keys typed before the field is drawn are
      kept.
- [ ] Tests in `packages/primitives/test/`: unit tests on `TestClock`, browser
      tests for focus and keys, a mutation spec; a section in the subpath README
      and a row in "Find one by the job"; the skill's `primitives.md`.

## What goes wrong

Each of these cost real time in this repository.

- **A state rule in the base loses to a variant.** A rule in `variants` beats
  one in `components` whatever its selector. Write the state beside each
  variant that sets its property, and check computed style in a browser.
- **A shorthand resets a longhand.** A hover rule writing `background` resets
  the `background-clip` the base set. Where a base sets a longhand, its states
  write longhands. In one rule, write the shorthand or the longhands, never both:
  declarations are sorted, so the shorthand may land last.
- **Two Mounts on one element.** Foldkit's `OnMount` replaces the element's
  insert hook, so a second one drops the first silently. Contribute Mounts
  through slots, where the resolver composes them; give a Mount of your own an
  element of its own.
- **A Mount reads its arguments once.** It runs on insert and destroy only. A
  DOM effect that should follow the Model is a Command from the Message that
  changed it, or key the element by what the arguments depend on.
- **Keys faster than a frame.** A key meets the page as last drawn. Let the
  Message carry enough for `update` to continue what is open, read the DOM at
  the press where only it knows (as `Toolbar` reads `document.activeElement`), and
  wait a frame between keys in tests (`Frames.track().settle()`).
- **A Mount that sends no Message, on by default, breaks Scene tests** of every
  page that draws the widget. Ship it as an opt-in Mixin or use a Command.
- **Markup outside a Slot** is out of reach of every stylist and check: a bare
  `span` leaves a data-attribute selector into your package as the only handle.
  Draw it through a Slot; put a structural fact on a Slot as a custom property or
  a data attribute.
- **A member named by a `string`.** An option naming a slot, field or Message
  as `string` fails at run time or silently. Type it by the contract's keys, as
  every factory here types `container` and `item`.
- **A no-op returning a new Model.** `{ ...model }` redraws the page. Return
  the Model you were given, and test it with `toBe(model)`.
- **Native `required` or `disabled` changes who handles the form or the
  focus.** A natively `disabled` button drops Enter and focus, so a form's
  submit is `aria-disabled` and `update` decides. A native `required` hands the
  message and the timing of the check to the browser. Choose it on purpose.
- **Two Slots' attributes on one element keep one class.** The later list's
  `Class` replaces the earlier's. Give each Slot an element of its own.
- **A positioned sibling drawn later paints over an overlay.** Test a press at
  the covered spot in a browser, not the markup.

## Reference

- [`foldkit-mixins`](../packages/mixins/README.md): Slots, Style, Behavior,
  `Behaviors.Keys`, SlotView parts and regions, obligations, `Conformance`.
- [`foldkit-primitives`](../packages/primitives/README.md) and its
  [interaction](../packages/primitives/interaction/README.md) subpath: every
  primitive's Model, Messages and Behavior.
- [`foldkit-mixins-ui`](../packages/mixins-ui/README.md): the widgets, the
  mechanisms they share (routes, focus after removal, form participation, right
  to left, exits) and the recipes.
- [`foldkit-bundle`](../packages/bundle/README.md): declaring, placing and
  folding Bundles.
- [`examples/authoring`](../examples/authoring/README.md): more assemblies from
  primitives (a search field, an editable list, a popup, a sortable listbox).
- [View composition](./mixins.md) and [UI architecture](./ui-architecture.md):
  the model behind Slots and the shared vocabulary.
