Checked against `foldkit-mixins` 0.26.0, `foldkit-mixins-ui` 0.27.0, `foldkit-primitives` 0.21.0 and `foldkit-bundle` 0.13.0.

# Authoring components, widgets, recipes and primitives

How to build UI the catalog lacks. Guide for people:
[`docs/authoring-components.md`](https://github.com/doeixd/foldkit-plus/blob/main/docs/authoring-components.md);
its full running example with tests:
[`packages/mixins-ui/test/authoringGuide.ts`](https://github.com/doeixd/foldkit-plus/blob/main/packages/mixins-ui/test/authoringGuide.ts).
Package detail: [mixins.md](mixins.md), [primitives.md](primitives.md), [bundle.md](bundle.md).

## Ownership (decide everything from these)

- The application's Model owns every fact; `update` writes it (`modifyFields`).
- A primitive's Bundle, placed in the Model, owns the interaction slice it names; only its `update` writes it; the parent calls its `helpers`.
- A widget view is stateless, or exports `Model`/`init`/`update` for the app to place (`TagsInput`).
- Styles reach only Slots: markup outside a Slot is unstylable and unchecked.
- One owner per event and attribute per element: a slot's `keydown` is one `Behaviors.Keys` owner; app keys are routes.
- One Mount per element (slot Mounts compose; a stray `h.OnMount` replaces); a Mount reads its args once; a Model-caused DOM effect is a Command.

## Procedure: which rung

1. Shipped widget as is (`foldkit-mixins-ui`, mixins.md section 5). Done if it fits.
2. Customize: `Recipes.X.extend(patch)` or a selection, a Mixin in `mixins`, a `routes` entry, `words`, `attributes`. Test what you added.
3. Assemble in the app: Slots + `SlotView.over` + primitives' Bundles and Behaviors + Style; `A11y.conform` to a pattern; browser tests for keys and focus; SSR round trip.
4. Reusable widget: rung 3 as `view(options, h)` with sibling-shaped options, a recipe, a `patterns.ts` entry. Checklist below.
5. Primitive: an interaction no primitive covers. Checklist below.

## The pieces

| Piece | Is | Not |
| --- | --- | --- |
| `Slots.define` / `Slot.make` | anatomy: capability, published `events`/`attributes`, `protected` | installs nothing |
| `SlotView.over(S)<I, M>()` | binder: `.define(view)`, `.behavior(spec)`, `.parts` with types fixed | a component instance |
| Mixin | the unit the resolver merges (Style, Behavior, `A11y.base`) | state |
| `Style.forSlots(S)(pieces)` | classes and rules per slot, in a layer | input-aware unless `Style.whenInput` |
| `Style.recipeFor(S)({ base, variants, defaults, compound })` | selection -> pieces; `.extend` | a fork |
| `Behavior.slot({ requires, provides, attributes, mount })` | attributes and Mounts from the input | a holder of state |
| Bundle (`Bundle.make`, `declare`, `parent().at`, `bundle.each`, `assemble`) | Model + Message + `update` + `helpers`, placed | a view |
| Mount | DOM fact -> Messages for an element's life, args read once | a reaction to Model changes |
| Command | effect `update` decided, answered by a Message | a listener |
| Subscription | stream the Model asks for | element-bound |
| `resolveFor(S, mixins, ctx)(base)` | Slots over an upstream `@foldkit/ui` component's `toView` bundles | your markup (that is `SlotView` / `buildersFor`) |
| `A11y.pattern` / `validate` | structural: slots, capabilities, events, attributes | rendered |
| obligations / `A11y.check` / `conform` / catalog `support` | who supplies navigation, focus strategy, activation, state, name | WCAG |
| `Conformance.*` (`foldkit-mixins/testing`) | rendered: keys, focus, a11y tree in Chromium | a type check |

## Checklist: application component (rung 3)

- [ ] Slots for every element drawn; per-item slots drawn with `attrs(base, { index, id })`.
- [ ] Facts in Model fields; interaction state as placed primitive Bundles; per-key state with the bundle's `each` (`Presence.bundle.each(Link.collection<Model>()(field, wrapper), …)`).
- [ ] One `Behaviors.Collection.of` per Model (cache by Model identity in a `WeakMap`), shared by navigation, selection and ids.
- [ ] Keys: one `Keys.behavior` per slot; the primitive's key half (`ListNavigation.keys`) as a route beside yours, or its `behavior` on the container and your routes on the item.
- [ ] Ids prefixed by an instance `id`; no id repeats with two instances on a page.
- [ ] Removal: `Presence.behavior` (inert while leaving) + `FocusRecovery.behavior` (`parts` steps); Message-caused focus by Command.
- [ ] Every no-op returns the given Model (`toBe(model)` test).
- [ ] `A11y.conform(pattern)` last in the pipe; `A11y.base` for the view's own word.
- [ ] Tests: unit (`update`, inert drawing), type test with `@ts-expect-error`, browser (keys, focus, computed style, `Conformance`), SSR round trip, mutation spec.

## Checklist: reusable widget (`foldkit-mixins-ui`)

- [ ] `XSlots` (full anatomy, `protected` structural attributes) and `XPattern` with obligations.
- [ ] `patterns.ts` `entry(name, pattern, slots, tier, roles, floor, support)`; `support` via `drawn(...)`/`native(...)` for each obligation.
- [ ] `view<Message>(options, h)` through `SlotView.buildersFor(XSlots, [style.mixin, keys.mixin, ...mixins], { input, h })`.
- [ ] Options: `id`, `label`, value, Messages typed `NoInfer<Message>`, `disabled`, `words`, `direction`, `routes`, `style?: NamedStyle<typeof XSlots>`, `mixins?: MixinList<Message>`, `name` for forms.
- [ ] No Mount that sends no Message on by default (opt-in option or a Command like `SearchField.Focus`).
- [ ] `update` refuses what a control says it refuses (a disabled `Button.view` still submits).
- [ ] `recipes/x.ts` with `component`/`variant`/`ref` from `recipes/design.ts`, exported in `recipes/index.ts`.
- [ ] Tests: `x.test.ts`, `x.test-d.ts`, `x.browser.test.ts`, `x.ssr.test.ts`, `x.mutations.ts`; `pnpm mutate:check`.
- [ ] Docs: README section and "Finding a widget" row, routes / form tables when they apply, mixins.md, CHANGELOG Unreleased.

## Checklist: primitive (`foldkit-primitives`)

- [ ] Lightest form: function < Command < Mount < entry < Bundle < Bundle + Behavior.
- [ ] `Bundle.make(name, { Model, Message, args, init, update, helpers })`: ids not elements; no-op returns the model; Effect clock; OutMessages need `onOut`.
- [ ] `behavior(declared, args)` overloads (binder, bare slots); `provides` on each slot; `A11y.ProvidedOn` on the binder overload.
- [ ] `keys(declared, args)` -> `Keys.Route`, and an `item` half, for hosts with a router.
- [ ] Messages carry what `update` needs (keys faster than a frame: `InlineEdit`).
- [ ] Unit tests on `TestClock`, browser tests, mutations; subpath README and "Find one by the job" row; primitives.md.

## Checklist: recipe

- [ ] Bases in `components`, axis choices in `variants` (`Layers.standard.in`); app overrides land in `app`.
- [ ] A state that sets a property a variant sets sits beside each variant.
- [ ] Where a base sets a longhand, states set longhands; never shorthand and longhand in one rule.
- [ ] Every value through `Theme.ref`; durations of movement multiply by `knob.travel`.
- [ ] Browser test reads computed style in each state.

## Smallest example of each mechanism

Slots, a state style, a view, keys with an application `routes` option, a placed Bundle's Behavior, focus recovery, a recipe, and a conformed pattern:

```ts
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import {
  A11y,
  Attr,
  Behavior,
  Behaviors,
  Capability,
  Event,
  Layers,
  Slot,
  Slots,
  SlotView,
  Style,
} from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { FocusRecovery, ListNavigation, Selection } from 'foldkit-primitives/interaction'

const { Keys } = Behaviors

const Nav = Bundle.declare(ListNavigation.bundle, 'nav')
const Sel = Bundle.declare(Selection.bundle, 'sel')
const navArgs = { orientation: 'vertical', loop: true, virtual: false, timeoutMs: 500, page: 5 } as const
const selArgs = { mode: 'single', allowEmpty: false } as const

const Model = Schema.Struct({ ...Nav.fields, ...Sel.fields, rows: Schema.Array(Schema.String) })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Nav.cases, ...Sel.cases, Removed: { id: Schema.String } })
type Message = typeof Message.Type

// Anatomy: what a stylist and a Behavior may reach.
const RowSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  list: Slot.make({ capability: Capability.Container, events: [Event.KeyDown] }),
  row: Slot.make({
    capability: Capability.Focusable,
    events: [Event.KeyDown],
    attributes: [Attr.AriaSelected],
  }),
})
const Rows = SlotView.over(RowSlots)<Model, Message>()
const itemsOf = (model: Model) => Behaviors.Collection.of(model.rows, { id: row => row })

// Keys: the widget's routes first, the application's after; a clash throws mixins:key-conflict.
const removes = Keys.route<Model, Message>('Remove', {
  on: [Keys.chord('Delete')],
  handle: ({ item }) =>
    item?.id === undefined ? Option.none() : Option.some(Message.Removed({ id: item.id })),
})
const rowKeys = (routes: ReadonlyArray<Behaviors.Keys.Route<Model, Message>> = []) =>
  Keys.behavior(Rows)({ slot: 'row', routes: [removes, ...routes] })

// A recipe: bases in components, choices in variants, the state beside the variant that sets its property.
const t = Theme.ref(Theme.standard())
const RowRecipe = Style.recipeFor(RowSlots)({
  base: { row: Layers.standard.in('components', Style.self({ padding: t.space.xs })) },
  variants: {
    tone: {
      plain: {
        row: Layers.standard.in(
          'variants',
          Style.compose(
            Style.self({ backgroundColor: 'transparent' }),
            Style.states({ true: { backgroundColor: t.accent.default } }, 'aria-selected'),
          ),
        ),
      },
    },
  },
  defaults: { tone: 'plain' },
})

const RowPattern = A11y.pattern({
  list: { capability: Capability.Container, obligations: [A11y.Navigation, A11y.Name] },
  row: {
    capability: Capability.Focusable,
    obligations: [A11y.FocusStrategy, A11y.Activation, A11y.State(Attr.AriaSelected)],
  },
})

export const rowList = (routes: ReadonlyArray<Behaviors.Keys.Route<Model, Message>> = []) =>
  Rows.define((model, slots, h) =>
    h.div(slots.root.attrs(), [
      h.ul(
        slots.list.attrs([h.Role('listbox'), h.AriaLabel('Rows')]),
        model.rows.map((row, index) =>
          h.li(slots.row.attrs([h.Key(row), h.Role('option')], { index, id: row }), [row]),
        ),
      ),
    ]),
  ).pipe(
    Behavior.attach(
      ListNavigation.behavior(Nav, navArgs)(Rows)({
        container: 'list',
        item: 'row',
        items: itemsOf,
        text: (model, index) => model.rows[index] ?? '',
      }),
    ),
    Behavior.attach(Selection.behavior(Sel, selArgs)(Rows)({ item: 'row', items: itemsOf })),
    Behavior.attach(rowKeys(routes)),
    Behavior.attach(Behaviors.Collection.behavior(Rows)({ item: 'row', items: itemsOf })),
    Behavior.attach(FocusRecovery.behavior(Rows)({ owner: 'root', parts: { row: ['next', 'previous'] } })),
    SlotView.attach(A11y.base({ list: [A11y.Name] })),
    Style.attach(Style.forSlots(RowSlots)(RowRecipe(), { name: 'RowStyle' })),
    A11y.conform(RowPattern),
  )
```

State and its placement (`Bundle.parent({ Model, Message }).at(Nav, { args: navArgs })`, `assemble`, `update`): [bundle.md](bundle.md). A hand-written Behavior on the binder states its obligations from `provides` (attach it with `Selection.behavior(...)({ ..., click: false })`: two click owners on `row` is `mixins:event-conflict`):

```ts
const Clicks = Rows.behavior(
  {
    row: Behavior.slot({
      provides: [A11y.Activation],
      attributes: ({ h, item }) =>
        item?.id === undefined ? [] : [h.OnClick(Message.Removed({ id: item.id }))],
    }),
  },
  { name: 'Clicks' },
)
```

Customizing a shipped widget (rung 2): extend its recipe, add a key through `routes`:

<!-- docs-check
import type { HtmlBuilder } from 'foldkit/html'
const Search = defineMessageUnion({ Typed: { text: Schema.String }, Cleared: {}, Opened: {} })
type Search = typeof Search.Type
-->

```ts
import { Recipes, SearchField, SearchFieldSlots } from 'foldkit-mixins-ui'

const RoundSearch = Style.forSlots(SearchFieldSlots)(
  Recipes.SearchField.extend({ base: { input: Style.self({ borderRadius: t.radius.full }) } })({}),
  { name: 'RoundSearch', layer: Layers.standard.layer('app') },
)

const search = (text: string, h: HtmlBuilder<Search>) =>
  SearchField.view(
    {
      id: 'find',
      label: 'Search',
      value: text,
      onInput: text => Search.Typed({ text }),
      clear: { onClear: Search.Cleared() },
      style: RoundSearch,
      routes: [
        Keys.route('Open', {
          on: [Keys.chord('ArrowDown')],
          handle: () => Option.some(Search.Opened()),
        }),
      ],
    },
    h,
  )
```

The rendered check, in a `*.browser.test.ts` (`cdp`, `userEvent` from `vitest/browser`). It calls `enter` only while no option is drawn, so a list drawn open is focused first.

<!-- docs-check
declare const cdp: Conformance.BrowserTools['cdp']
declare const userEvent: Conformance.BrowserTools['userEvent']
-->

```ts
import { Conformance } from 'foldkit-mixins/testing'

document.getElementById('a')?.focus() // and wait a frame: the Model learns the current row from the focus
const result = await Conformance.listbox(Conformance.harness({ cdp, userEvent }), {
  name: 'Rows',
  options: ['a', 'b', 'c'],
  enter: async () => document.getElementById('a')?.focus(),
})
Conformance.failures(result) // []
```

## Traps

- State rule in the base loses to a variant setting the same property (later layer wins regardless of specificity): put it beside each variant; browser-test computed style.
- A shorthand in a state resets the base's longhand (`background` resets `background-clip`); declarations in a rule are sorted, so shorthand + longhand in one rule may lose.
- Two Mounts on one element: the second `OnMount` silently replaces the first; contribute Mounts through slots.
- A Mount reads its args once: Model-following DOM effects are Commands, or key the element.
- Keys faster than a frame meet the last drawn page: carry state in the Message; read the DOM at the press; tests wait with `Frames.track().settle()`.
- A Mount that sends no Message, on by default in a widget, breaks every page's Scene tests.
- Markup outside a Slot; two Slots on one element (one `Class` survives).
- A member named by `string` instead of the contract's keys.
- A no-op returning `{ ...model }` redraws the page.
- Native `disabled` drops Enter and focus (use `aria-disabled`, decide in `update`); native `required` hands the check to the browser.
- `Conformance.listbox` never calls `enter` when options are already drawn.
