# Authoring components

When the shipped `foldkit-mixins-ui` catalog doesn't have the widget you need, you don't have to copy a template or manage DOM state in hooks. Foldkit Plus lets you assemble custom components from the same pieces the catalog uses: `foldkit-mixins` for typed **Slots**, styles, and accessibility contracts; `foldkit-primitives` for reusable interaction state and keyboard/focus Behaviors; and `foldkit-bundle` for packaging repeatable child state.

Every component follows one state rule: your application `Model` owns domain facts, a placed primitive `Bundle` owns interaction state (like which item is highlighted), `Behaviors` attach DOM attributes and mounts to named `Slots`, and every event or attribute on a slot has a single owner.

## Choose the right rung before building

Start at the highest rung that solves your problem:

| Rung | When to use it | What you write |
| --- | --- | --- |
| 1. Shipped widget | `foldkit-mixins-ui` has it | Options, `Messages`, recipe variant |
| 2. Customized widget | Widget fits except a style or key | `Recipes.X.extend`, `mixins`, `routes`, `words` |
| 3. App component | Unique to this app | `Slots`, `SlotView`, primitives, `Style` |
| 4. Reusable widget | Shared across apps | Rung 3 + catalog recipe and `A11y.pattern` |
| 5. Primitive | Reusable interaction pattern | `Bundle`, `Mount`, and/or `Behavior` |

The pieces you assemble on rungs 3–5 fit together as data: a **Slots** contract names the elements (`root`, `list`, `chip`); **SlotView** renders markup through `slots.<name>.attrs(...)`; **Style** and **Recipe** attach theme-token CSS across cascade layers; **Behavior** attaches computed attributes and mounts; and **Bundle** packages child state (`Model`, `Message`, `update`, `helpers`).

## Building filter chips, step by step

Suppose you need a row of filter chips: arrows move focus between chips, Space and Enter toggle selection, Delete removes a chip with an exit fade, and a button removes all selected chips.

### 1. Slots, a style, and a view

Start with a group of toggle buttons whose selected IDs live in your `Model`:

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

- **`Slots.define`** declares the component anatomy (`chip` publishes `Event.Click` so Behaviors can rely on it).
- **`Theme.ref(Theme.standard())`** emits CSS custom property references (`var(--fk-space-xs)`) checked against the theme schema.
- **`Style.states(..., 'aria-pressed')`** matches DOM state (`&[aria-pressed="true"]`); input-only conditions use `Style.whenInput`.
- **`slots.chip.attrs`** gives the view sole ownership of `OnClick`; attaching a second click handler fails loudly at render time.

Native buttons give basic keyboard support, but every chip is a separate tab stop. Turning the row into a listbox with roving arrow navigation and animated exits brings in placed primitive Bundles.

### 2. State: Model fields and placed Bundles

Keep domain data (`chips`) in your `Model`, and place `ListNavigation`, `Selection`, and per-chip `Presence` Bundles for interaction state:

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

- **`Bundle.declare` and `Parent.at` / `.each`:** Spread each primitive's fields and message cases into your parent `Model` and `Message`, then let `assembly.update` route child messages automatically.
- **Helpers over direct mutation:** The parent updates `picks` and `presence` via `Picked.helpers.replace` and `Exits.helpers.hide` so each primitive runs its own transitions and timers (`Update.combine` merges their commands).
- **Identity on no-op:** Unchanged branches return the original `model` reference so Foldkit skips unnecessary redraws.

See [Bundle versus Submodel](./bundle-vs-submodel.md) for how Bundles compare with hand-wired Submodels.

### 3. Interaction: primitive Behaviors and key routes

Wire `ListNavigation.behavior`, `Selection.behavior`, and a `Keys.behavior` onto a `SlotView`:

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

export const itemsOf = (model: Model): Behaviors.Collection.Items<Chip> => {
  const known = chipsByModel.get(model)
  if (known !== undefined) return known
  const items = Behaviors.Collection.of(model.chips, {
    id: chip => chipId(model, chip),
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

export type Route = Behaviors.Keys.Route<Model, Message>

const toggles = Keys.route<Model, Message>('Toggle', {
  on: [Keys.chord('Enter'), Keys.chord(' ')],
  handle: ({ key, input, item }) =>
    item?.id === undefined || (key === ' ' && input.nav.query !== '')
      ? Option.none()
      : Option.some(Picks.wrapper.make(Selection.Message.Activated({ id: item.id }))),
})

const removes = Keys.route<Model, Message>('Remove', {
  on: [Keys.chord('Delete'), Keys.chord('Backspace')],
  handle: ({ item }) =>
    item?.id === undefined ? Option.none() : Option.some(Message.Removed({ id: item.id })),
})

export const chipKeys = (routes: ReadonlyArray<Route> = []) =>
  Keys.behavior(Filter)({ slot: 'chip', name: 'ChipKeys', routes: [toggles, removes, ...routes] })

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

- **`SlotView.over(ChipSlots)`** binds slot names, input type, and Message type so misspelled slots fail at compile time.
- **`Behaviors.Collection.of`** computes item IDs and disabled states once per `Model` (memoized via `WeakMap`).
- **One `keydown` owner via `Keys.behavior`:** Adding a duplicate chord in `routes` throws `mixins:key-conflict` (or resolves explicitly with `Keys.first`). Returning `Option.none()` preserves native key behavior and lets keys bubble to list navigation.

### 4. Focus recovery and exit animations

Attach `Presence.behavior` to apply `inert` and `data-presence` during exits, and `FocusRecovery.behavior` so focus moves to the next or previous chip when the focused chip leaves:

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

- **`Presence.behavior`** adds `data-presence="hiding"` for CSS transitions and `inert` on exiting items so focus and clicks skip them.
- **`FocusRecovery.behavior`** installs one `Mount` on `root` that moves focus along `parts` when a focused element becomes `inert` or disappears, leaving focus alone if moved elsewhere.

For programmatic focus triggered by a `Message` (such as focusing a newly opened editor), issue a Focus Command from `update` (see [`examples/authoring`](../examples/authoring/README.md)). For overlays, use `Overlay.nonModal` or `Dialog.focusReturn`. Because `FocusRecovery` emits no `Message`, reusable widgets make it opt-in (like `recoveryPart` on `Alert`) or use a Command so Scene tests can settle cleanly.

### 5. Recipes, axes, states, and CSS layers

Define appearance with `Style.recipeFor`, placing base rules in `components` and axis choices in `variants` from `Layers.standard`:

```ts
import { Layers, Style, type StyleValue } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'

const t = Theme.ref(Theme.standard())
const base = (...pieces: ReadonlyArray<StyleValue>) =>
  Layers.standard.in('components', Style.compose(...pieces))
const pick = (...pieces: ReadonlyArray<StyleValue>) =>
  Layers.standard.in('variants', Style.compose(...pieces))

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

Remember two cascade rules in `Layers.standard` (`reset, tokens, theme, defaults, components, layouts, variants, utilities, app`):

- **Place state rules beside the variants that set the same properties:** `picked` sets `backgroundColor`, which `look` variants also set in `variants`. Placing `picked` in `variants` alongside each look ensures it wins over the variant's default fill.
- **Extend rather than fork:** Adjust a shipped look with `ChipRecipe.extend(...)`, and render the final page stylesheet with `Style.stylesheet(...)` (see [`foldkit-mixins`](../packages/mixins/README.md#style-appearance-as-data)). Reserve `Style.inline` for dynamic values that must override the `app` layer.

### 6. Accessibility patterns and obligations

Declare required roles, states, and interactions with `A11y.pattern` and verify with `A11y.conform`:

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
  readonly label: string
  readonly routes?: ReadonlyArray<Route>
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
    SlotView.attach(A11y.base({ list: [A11y.Name] })),
    Style.attach(options.style ?? ChipStyle),
    A11y.conform(ChipPattern),
  )

export const escapeClears = Keys.route<Model, Message>('ClearPicks', {
  on: [Keys.chord('Escape')],
  handle: ({ input }) =>
    input.picks.selected.length === 0
      ? Option.none()
      : Option.some(Picks.wrapper.make(Selection.Message.Cleared())),
})

export const FilterChips = chipFilter({ label: 'Filters', routes: [escapeClears] })
```

Omitting `Picking` triggers both a compile-time type error naming `'chip/activation' | 'chip/state:aria-selected'` and a runtime `a11y:unsatisfied-obligation` error. Because `A11y.conform` verifies structural declarations, verify live keyboard focus and accessibility-tree roles in a browser test next.

### 7. Testing update logic, types, browser focus, and SSR

Match each guarantee to the test environment that can observe it:

**Pure `update` transitions and no-op identity:**

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

**Type-level contract checks (`*.test-d.ts`):**

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

**Browser focus and keyboard conformance:** Wait for pending animation frames (`Frames.track().settle()`) between rapid key presses so DOM state reflects the latest draw:

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

Run `Conformance.listbox` in the same browser test to verify accessibility roles and keyboard behavior against Chromium's accessibility tree:

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

**Server-rendered markup:** Render to HTML, parse with `DOMParser`, and assert `Conformance.server` passes before client scripts load:

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

## Checklist for reusable widgets and primitives

When turning a custom component into a reusable widget (`foldkit-mixins-ui`) or shared interaction (`foldkit-primitives`), verify:

- **Explicit Slots and Pattern:** Every customizable element is a Slot with `protected` structural roles (`role`), an `A11y.pattern`, and `A11y.conform` or catalog `support` coverage.
- **Consistent options:** Support `id` prefixing, `label`, `NoInfer<Message>` callbacks, `disabled` via `aria-disabled` (refusing in `update`), `words`, `direction` (`'rtl'` arrow swapping), `routes`, `style`, `mixins`, and `name` for form controls.
- **State and timing:** Stateful widgets export `Model`, `Message`, `init`, `update`, and `onMessage`; primitives run timers on Effect's clock and report settled results as `OutMessage`.
- **Tests that can fail:** Include unit tests for `update` identity and timing (`TestClock`), `.test-d.ts` negative type checks, browser tests for focus/keys/computed style/conformance, and SSR HTML assertions.

## Common pitfalls when authoring components

- **State rule beaten by a variant:** A rule in `variants` overrides `components`; put state styles (`aria-selected`) inside each variant that sets the same property.
- **Shorthand resetting a longhand:** Writing `background` in a hover rule clears `background-clip` from the base; use matching longhands across base and states.
- **Two Mounts on one element:** Foldkit keeps one `OnMount` per element; pass mounts through Slots so the resolver composes them, or place a custom mount on its own element.
- **Mount reading stale inputs:** Mounts run on element creation and removal; use a `Command` or key the element when an effect depends on changing `Model` fields.
- **Rapid keypresses outrunning frames:** Carry needed context in `Message` or read `document.activeElement` at press time, and call `Frames.track().settle()` in tests.
- **Markup outside Slots:** Bare elements cannot be styled or checked from outside; render through Slots with CSS custom properties or data attributes for structural hints.
- **No-op returning `{ ...model }`:** Returning a fresh object triggers unnecessary renders; return the exact `model` reference on no-ops.
- **Native `disabled` vs. `aria-disabled`:** Native `disabled` drops focus and Enter submission; use `aria-disabled` on buttons and enforce disabled checks in `update`.
- **Two Slots on one element:** Placing two `slots.*.attrs(...)` calls on one element overwrites `Class`; give each Slot its own element.

## Next

- Learn how Slots, Styles, and Behaviors compose in [Inside-out view composition](./mixins.md).
- Explore working examples of custom assemblies in [`examples/authoring`](../examples/authoring/README.md).
- Browse the APIs in [`foldkit-mixins`](../packages/mixins/README.md), [`foldkit-primitives`](../packages/primitives/README.md), [`foldkit-mixins-ui`](../packages/mixins-ui/README.md), and [`foldkit-bundle`](../packages/bundle/README.md).
