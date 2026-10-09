# Mixins: `foldkit-mixins`, `foldkit-mixins-surface`, `foldkit-mixins-ui`

## 1. Purpose

Inside-out view composition. A view **declares once** where it may be customized (typed
*slots*); callers **attach** appearance (`Style`) and element-level interaction (`Behavior`)
from outside. Everything resolves to ordinary Foldkit attributes. No new runtime, no state.

| Package | Owns |
| --- | --- |
| `foldkit-mixins` | Slot contracts, Style, Behavior, SlotView, the resolver, diagnostics |
| `foldkit-mixins-surface` | Binds a `foldkit-surface` projection + Message subset to a SlotView |
| `foldkit-mixins-ui` | Names `@foldkit/ui` components' attribute bundles as Slots (`resolve`) |

**Use when** a view should be restyled/decorated where it is *used*, with checks: design-system
styling of a feature view, tooltips, analytics, ARIA decoration, focus/resize Mounts, variants.

**Do not use for state.** Open/selected/value belong in the Model or a Submodel; transitions in
`update`; I/O is Message -> Command; element effects are a `Mount`. A Behavior that "needs
state" means you need a Submodel. For a one-off component with no external customizers, plain
attributes are simpler.

## 2. Mental model

```text
Slots.define({ name: Slot.make({ capability, events, attributes, hidden, protected }) })
      |                                   (public contract, pure metadata)
      +-- Style.forSlots(S)({ name: StyleValue })            -> { mixin, css, ... }
      +-- Behavior.forSlots(S)<Input, Message>({ name: Behavior.slot({...}) })
      |
SlotView.define(S, (input, slots, h) => h.x(slots.name.attrs(base), ...))
      .pipe(Style.attach(style), Behavior.attach(behavior))  -> new view (original unchanged)
      |
resolver: base attrs + contributions -> Foldkit attributes (or DiagnosticError)
```

- **Capability** hierarchy: `Base -> Interactive -> { Container, Focusable -> TextInput, Draggable }`,
  `Base -> Collection`; extend with `Capability.make(name, { extends })`. A behavior requiring
  `Interactive` fits a `TextInput` slot.
- **Event / Attr** tokens (`Event.Click`, `Attr.AriaInvalid`, `Event.make`, `Attr.make`) are
  metadata; declaring them installs nothing.
- `Behavior.slot({ requires, attributes: ({ input, h }) => [...], mount })` — `requires`
  (capability/events/attributes) is checked against the slot **when `forSlots` runs**.
- **Parts** cut a big view so each piece redraws only when what it reads changes:
  `const P = SlotView.parts(S)<Input, Message>()`, `P.part(name, { reads: ['k'], behaviors },
  (input, slots, h) => …)` (input is `Pick<Input, 'k'>`), `P.assemble((input, slots, h, draw) =>
  … draw(Part) …)` is a SlotView; a part may be drawn in more than one place. A whole-view Mixin
  that reads input makes parts redraw every time.
  Per item: `slots.row.lazy(item, drawRow, { ...args })` with `drawRow(slots, h, args)` defined once;
  an item redraws when an arg changes or what Mixins give its Slots changes (a static Style by
  identity). The memo is one per `drawRow`, shared by every view drawing it.
- `hidden: true` slots are omitted from public Style/Behavior spec keys.
- **Styling pipeline:** `tokens -> ref -> pieces -> slots -> sheet`. `Theme.tokens`
  (+ an `oklch` palette, joined by `Theme.compose`) are the only values; read them
  through `Theme.ref` — a misspelled group/name is a type error, and it emits
  `var(--fk-…)`, never a literal. `Style.self` is a rule on a generated class
  (layerable, overridable); `Style.inline` sits outside every layer and beats
  everything, so only for values no theme may touch. Bases go in `components`,
  selections in `variants`, the page's own rules in `app` (always last).
- `protected: { events, attributes, style }` forbids attachments from supplying those.
- **Resolver rules:** classes additive + deduped into one `Class`; Style pieces' inline style
  merged per property (later wins) over the base, but a property a Behavior sets via `h.Style`
  has one owner (`mixins:style-property-conflict` otherwise); each event / scalar attribute has
  exactly one owner (base or one mixin);
  `ChildAttribute` preserved by identity and reserves its event; `Key`/`InnerHTML` cannot come
  from a mixin; all mounts compose into one `OnMount`.
- Diagnostics you will hit (`Diagnostics.DiagnosticError`, `.diagnostic.code`):
  `mixins:unknown-slot`, `mixins:capability-mismatch`, `mixins:event-conflict`,
  `mixins:attribute-conflict`, `mixins:style-property-conflict`.

## 3. Minimal example (`foldkit-mixins` alone)

```ts
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Attr, Behavior, Capability, Event, Slot, Slots, SlotView, Style } from 'foldkit-mixins'

const Message = defineMessageUnion({ ChangedValue: { value: Schema.String } })
type Message = typeof Message.Type
type FieldInput = { readonly value: string; readonly invalid: boolean }

const FieldSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  input: Slot.make({
    capability: Capability.TextInput,
    events: [Event.Input],
    attributes: [Attr.AriaInvalid],
    protected: { attributes: [Attr.Role] },
  }),
})

const FieldStyle = Style.forSlots(FieldSlots)({
  root: Style.compose(Style.class('field'), Style.inline({ display: 'grid' })),
  input: Style.class('field-input'),
})

const Validation = Behavior.forSlots(FieldSlots)<FieldInput, Message>({
  input: Behavior.slot({
    requires: { capability: Capability.TextInput, attributes: [Attr.AriaInvalid] },
    attributes: ({ input, h }) => [h.AriaInvalid(input.invalid)],
  }),
})

const Field = SlotView.forMessages<Message>()
  .define(FieldSlots, (input: FieldInput, slots, h) =>
    h.label(slots.root.attrs(), [
      h.input(
        slots.input.attrs([
          h.Value(input.value),
          h.OnInput(value => Message.ChangedValue({ value })),
        ]),
      ),
    ]),
  )
  .pipe(Style.attach(FieldStyle), Behavior.attach(Validation))
```

`Field` is still a pure `(input, h) => Html` view. `slots.input.attrs(base)` returns base
attributes plus resolved contributions; the view owns `OnInput`, so a Behavior adding a second
`OnInput` would throw `mixins:event-conflict` at render.

Build outward: `Style.when`, `Style.whenInput(pred, piece)`, `Style.recipe({ base, variants,
defaults, compound })`, rule-based `Style.self/pseudo/media/supports/container/nest/keyframes/global` (`self` is `&{…}`: the element's own declarations as a rule, so a layer can hold them; inline style is unlayered); `pseudo` and `nest` scope every selector of a comma list, and a selector that writes `&` places the class itself
(compiled to a deterministic hashed class; read `FieldStyle.css` or
`Style.stylesheet(...styles)`), `Theme.define`, and `Theme.ref(theme)` (every token as a typed
`var(--fk-group-name)`: `Theme.ref(theme).surface.base`; a missing group or name is a type error;
it replaced `Theme.variable`). Every piece's declarations are typed
`Declarations` (csstype camelCase properties plus `--custom` ones, string values): a misspelled
or kebab-case key in a literal is a type error; a value typed as a plain string record is not
checked. For a slot rendered once per item (tabs, rows)
pass the item as the second argument, `slots.row.attrs(base, { index, id, count })`; a Behavior
reads it as `item` in `attributes` and as the second argument of `mount`, and it is `undefined`
for a slot rendered once. Introspect with `Slots.describe(contract)`; combine with `Mixin.compose`.

Ready-made stateless Behaviors live under `Behaviors`. `Behaviors.Collection.of(items, { id,
disabled? })` describes the parent's array once (`ids`, `size`, `at`, `indexOf`, `isDisabled`,
`enabled`, `slotItem(index)`), refusing duplicate ids with `mixins:duplicate-item-id`;
`Behaviors.Collection.behavior(Slots)<Input, Message>({ item: 'row', items: input => ...,
posInSet? })` writes `id`, `aria-disabled`, and optionally `aria-posinset`/`aria-setsize` on each
item from the item context. Also stateless: `Behaviors.Disclosure.behavior(Slots)({ trigger,
content, open, id })` (`aria-expanded`, `aria-controls`, `hidden`);
`Behaviors.ToggleState.behavior(Slots)({ control, state, as: 'checked' | 'pressed' })`;
`Behaviors.FieldAssociation.behavior(Slots)({ control, label, description?, error?, id, invalid?,
required? })` deriving `<id>-label`/`-description`/`-error` and the `aria-*` links;
`Behaviors.SpinValue.behavior(Slots)({ control, value, onChange, min?, max?, step?, page? })` for
the spinbutton role, values, and arrow/Page/Home/End stepping. Stateful Behaviors (roving
tabindex, press, dismiss layers) are Bundles in `foldkit-primitives/interaction`.

### 3b. An application's own look

An application styling its own markup declares the Slots by their style and fixes theme, layer
and sheet once (`forSlots` stays for a contract someone else published, such as `ButtonSlots`):

```ts
import { Event, Style, SlotView } from 'foldkit-mixins'
import { AppStyle } from 'foldkit-mixins/app'
import { Theme } from 'foldkit-mixins/theme'
import { Utilities as U } from 'foldkit-mixins/utilities'
import { ButtonSlots, Recipes } from 'foldkit-mixins-ui'

const { t, slots, forSlots, stylesheet } = AppStyle.make({
  palette: Theme.oklch({ accent: { h: 260, c: 0.21, l: '62%' } }),
  colorScheme: 'light',
})
export const Page = slots({
  root: [U.p('lg'), U.bg('surface.base')],
  count: [U.textCenter, U.font('bold'), { fontSize: '3.75rem', color: t.text.default }],
  form: Style.slot({ events: [Event.Submit] }, [U.flex, U.gap('sm')]),
})
export const ButtonStyle = forSlots(ButtonSlots)(Recipes.Button(), { name: 'ButtonStyle' })
export const Counter = SlotView.forMessages<never>()
  .define(Page.slots, (count: number, slots, h) =>
    h.main(slots.root.attrs(), [h.p(slots.count.attrs(), [String(count)])]),
  )
  .pipe(Style.attach(Page.style))
Style.install(stylesheet) // browser entry only; returns the <style>
```

A piece is a `StyleValue`, a declarations object (`Style.self`), or a list (`Style.compose`).
`AppStyle`'s `slots`/`forSlots` compile in the `app` layer; its `stylesheet` is layer order,
reset, tokens, palette and `Defaults.body` (`global` adds to `defaults`). Utilities take token
names, so `U.p('4xl')` and `U.bg('surface.nope')` are type errors.

## 4. `foldkit-mixins-surface`

Use only if the feature already renders through a `foldkit-surface` Surface. `SurfaceView.define`
makes the SlotView's input exactly the Surface projection and its Message universe exactly the
exposed subset, so no annotations are needed and Behaviors cannot read unprojected fields or emit
unexposed Messages. It adds no state and no renderer.

```ts
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Behavior, Capability, Event, Slot, Slots, Style } from 'foldkit-mixins'
import { SurfaceView } from 'foldkit-mixins-surface'
import { Surface } from 'foldkit-surface'

const Model = Schema.Struct({
  todos: Schema.Array(Schema.Struct({ id: Schema.String, title: Schema.String })),
  selectedId: Schema.Option(Schema.String),
  secret: Schema.String,
})
const Message = defineMessageUnion({
  SelectedTodo: { id: Schema.String },
  ArchivedTodo: { id: Schema.String },
  ClearedSecret: {},
})
const App = Surface.application({ Model, Message })

const TodoList = App.surface('TodoList', {
  model: ({ model }) => ({ todos: model.todos, selectedId: model.selectedId }),
  messages: [Message.SelectedTodo, Message.ArchivedTodo],
})

const TodoSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  archive: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
})

type Projected = {
  readonly todos: ReadonlyArray<{ readonly id: string; readonly title: string }>
  readonly selectedId: Option.Option<string>
}

const ArchiveSelected = Behavior.forSlots(TodoSlots)<
  Projected,
  typeof Message.SelectedTodo.Type | typeof Message.ArchivedTodo.Type
>({
  archive: Behavior.slot({
    requires: { events: [Event.Click] },
    attributes: ({ input, h }) =>
      Option.match(input.selectedId, {
        onNone: () => [],
        onSome: id => [h.OnClick(Message.ArchivedTodo({ id }))],
      }),
  }),
})

const TodoListView = SurfaceView.define(TodoList, TodoSlots, (model, slots, h) =>
  h.div(slots.root.attrs(), [
    h.ul([], model.todos.map(todo => h.li([], [todo.title]))),
    h.button(slots.archive.attrs(), ['Archive']),
  ]),
).pipe(
  Style.attach(Style.forSlots(TodoSlots)({ root: Style.class('todo-list') })),
  Behavior.attach(ArchiveSelected),
)

// Running app: the one boundary adaptation.
const renderer = Surface.view(TodoList, SurfaceView.toRenderer(TodoListView))

// Static output / tests: projects root, renders with an inert builder (nothing mounts).
const html = SurfaceView.render(TodoListView, TodoList, undefined, {
  todos: [{ id: 't1', title: 'Write docs' }],
  selectedId: 't1',
  secret: 'not projected',
})
```

`SurfaceView.inspect`, `describe`, and `toMarkdown` give serializable, deterministic metadata for CI drift checks.

## 5. `foldkit-mixins-ui`

`@foldkit/ui` keeps component state, accessibility and base attributes; the adapter names its
`toView` attribute bundles as Slots. `X.toView(mixins, { h }, draw)` fills a component's `toView`
and hands `draw` the bundles with the Mixins applied (non-slot data such as `activeIndex` passes
through); add your own attributes beside them (`h.input([...input, h.Autocomplete('off')])`).

```ts
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as UiButton from '@foldkit/ui/button'
import { Style } from 'foldkit-mixins'
import { Button, ButtonSlots } from 'foldkit-mixins-ui'

const Message = defineMessageUnion({ Saved: {} })
type Message = typeof Message.Type

const SaveStyle = Style.forSlots(ButtonSlots)({ button: Style.class('btn btn-primary') })

export const saveButton = (h: HtmlBuilder<Message>) =>
  UiButton.view(
    {
      onClick: Message.Saved({}),
      toView: Button.toView([SaveStyle.mixin], { h }, ({ button }) => h.button(button, ['Save'])),
    },
    h,
  )
```

Adapters: Button, Input, Textarea, Select, Checkbox, Switch, Fieldset, Disclosure, Dialog,
Popover, Tooltip, Slider, Tabs, RadioGroup, Calendar, Menu, FileDrop, Toast, Listbox, Combobox, DatePicker (namespace + flat `XSlots`). Menu is
special: `@foldkit/ui/menu` exposes no consumer seam, so `MenuView` transcribes its markup assembly
from the pinned `@foldkit/ui` source (attributed in the module) with a `toView` added, and `Menu`
adapts that fork — state, Messages, update, Commands, and Mounts stay upstream, and a parity battery
draws both views over the same models. Pass mixins as
`style.mixin` / `behavior.mixin`. Every `@foldkit/ui` component with a consumer seam has an adapter; the
seamless ones (Menu, Listbox, ComboBox, Toast, DatePicker) are adapted over
small view forks transcribed from the pinned `@foldkit/ui` source, with
state staying upstream.
The same call goes in a Submodel's `viewInputs` (`toView: RadioGroup.toView(mixins, { h },
({ group, options }) => …)`), with `Value` and `Message` inferred. `input` is optional: only what an
input-driven Mixin reads. `X.resolve(attributes, mixins, { h, input })` stays for bundles already in
hand, such as a Calendar whose Mixins read `attributes._tag`. Result types: `ResolvedButton<M>`,
`ResolvedRadioGroup<V, M>`, and so on.

`Recipes.Button | Input | Textarea | Select | Checkbox | Switch | RadioGroup | Slider | Dialog | Tabs | Segmented | Menu | Listbox | Combobox | DatePicker | Popover | Tooltip | Toast | FileDrop | Alert | AspectRatio | Avatar | Badge | Breadcrumb | ButtonGroup | Card | Empty | Icon | Item | Kbd | Label | Pagination | ScrollArea | Separator | Skeleton | Spinner | Table` are shipped
`Style.recipeFor` recipes over those contracts: `Style.forSlots(ButtonSlots)(Recipes.Button({ tone:
'danger', variant: 'outline', size: 'sm' }))`, adjusted with `.extend(patch)`. They reference
`Theme.tokens` and `Theme.oklch` tokens (ship both with `Theme.root`), put bases in the
`components` layer and variants in `variants` of `Layers.standard`, and style state from the
component's own `aria-checked` / `aria-selected` / `aria-disabled`. No recipe declaration is inline
style, so `Style.forSlots(ButtonSlots)({ button: Style.self({ … }) }, { layer: L.layer('app') })` overrides any of
them by layer order alone. `Recipes.Badge` differs: it is a function taking the attribute and a
value-to-tone map (`Badge({ attribute: 'data-state', tones: { Published: 'success' } }).badge`),
because one style serves badges in every state and every tone is present at once.
`Recipes.InputGroup` (`group`, `affix`, `control`) draws a prefixed or suffixed field as one
box; a `Segmented` pressed option is the accent's flat tint; an unfilled button's
hover (outline, ghost, icon) is a tint of its own text, so it reads on a colored band. The
body defaults color scrollbars with `outline.overt`. `Touch`
(`target`, `targets`) and `Icons` (`glyph(size)`, `byAttribute(attribute, icons)`) are style
mechanisms, not components: compose them into your own slots, resolving icon `url(…)`s yourself.

Ship both halves of the theme with `Theme.root` (scales once, palette beside them):

```ts
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'

const L = Layers.standard
const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 280, c: 0.15, l: '60%' } }))

export const stylesheet: string = Style.stylesheet(
  L.declare,
  L.in('reset', Defaults.reset),
  L.in('tokens', Theme.root(Theme.tokens)),
  L.in('theme', Theme.root(theme, { omit: Theme.tokens })),
  L.in('defaults', Defaults.body),
)
```

## 6. Testing helpers

- `SlotView.inertBuilder<Message>()` is an `HtmlBuilder` with no runtime: call `View(input, h)`
  to build real attributes, then read them with `Attributes.find(bundle, 'Class')?.value`.
- `Inert` (`foldkit-mixins/testing`) reads a whole inert tree: `all`, `children`, `byTag`,
  `byRole`, `byLabel`, `text`, `value` (attribute or property), `classes`, `style`, `pressed`.
- `Frames.track()` (`foldkit-mixins/testing`, created after any `requestAnimationFrame` stub)
  is for tests on the real runtime: `await frames.settle(...barriers)` resolves once every frame
  asked for has run (pass `Sync.mount`'s handle to wait for its replica first), instead of a
  sleep; `hold()`/`release()` keep frames back so events meet the last drawn view. It sees no
  frame not yet asked for (a runtime still starting) and no I/O: wait for those first.
- `Inert.draw(view, input)` draws under a Scene frame, so a view using `h.submodel` draws whole
  (nothing dispatched, no Command or Mount checked). `Inert.css(nodes)` is the CSS behind the
  nodes' classes; `Inert.missingTokens(root, stylesheet)` lists `--fk-*` tokens read without a
  fallback that nothing defines. A view test: `expect(Inert.unslotted(tree)).toEqual([])` and
  `expect(Inert.missingTokens(tree, stylesheet)).toEqual([])`.

## 7. Gotchas (verified)

- **When errors fire:** unknown/hidden slot and `requires` mismatches throw in `Style.forSlots` /
  `Behavior.forSlots` (definition time). Ownership conflicts, protected violations and duplicate
  mount names throw when `slots.x.attrs()` resolves (render time).
- **Message inference:** plain `SlotView.define` infers `Message` only from an explicit
  `h: HtmlBuilder<Message>` annotation; otherwise it becomes `unknown` with confusing variance
  errors. Prefer `SlotView.forMessages<Message>().define(...)`.
- **Behavior Input is invariant:** `Behavior.attach` requires the behavior's `Input` to be the
  view's full input type (the whole projection under Surface), not the subset it reads.
- **A mixin cannot replace a base attribute:** adding `h.AriaDisabled(false)` over a
  `@foldkit/ui` Button that set it, or a second `OnClick`, throws. Adding an attribute the base
  lacks is fine.
- A rule piece inside `Style.whenInput` compiles to a static class whose presence follows the
  input; its CSS is always in the stylesheet. Write a state as rules: an inline shorthand beside
  a conditional inline longhand of it (`border` and `borderColor`) is refused at definition. Also: `Style.states({ open: {...} })` (`[data-state]`
  rules), `Style.responsive(breakpoints, map)`, `Style.at(prelude, piece)` (a piece's rules inside
  an at-rule, e.g. a selector under a container query), `Style.enter(decl)` (`@starting-style`) with
  `Style.allowDiscrete`, `Style.vars`, `Style.viewTransitionName`, `Style.grid({ areas, columns?,
  rows?, gap? })` (typed areas, as rules: `.style` on the container, `.area(name)` on a child;
  ragged rows raise `mixins:ragged-grid-areas`), and `Selector.*` builders.
- Multi-slot recipes (every field optional): `Style.recipeFor(Slots)({ base, variants, defaults, compound })` returns
  `selection => StylePieces` (`null` unsets a defaulted axis) with `.extend(patch)` merging per
  slot (`mixins:unknown-slot` for a slot the contract lacks). `Style.perItem(item => piece)` and
  `Style.stagger({ stepMs })` need the item passed to `attrs`. `Style.forCapability(Slots)(cap,
  piece)` styles every slot whose capability satisfies `cap`.
- Theme and layers: `Theme.lightDark(light, dark)` (CSS `light-dark()`, no Model field),
  `Theme.compose(base, over)`. Layers are a value: `Layers.standard` (also
  `foldkit-mixins/layers`) is the order `reset, tokens, theme, defaults, components, layouts,
  variants, utilities, app`; `L.in(name, piece)` puts a piece's rules and global CSS in that layer
  (a misspelled name is a type error), `L.declare` is the `@layer …;` statement, and
  `Style.stylesheet(L.declare, L.in('theme', …), PageStyle)` hoists it first. A slot style is
  layered when it is compiled: `Style.forSlots(S)({…}, { layer: L.layer('app') })` (also
  `forCapability`), so views and the sheet share one value and one set of classes.
  Once a sheet declares an order, an unlayered rule throws `style:unlayered-rule` (it would beat
  every layer, `app` included); keyframes, font faces and `@property` pass. `L.in` takes a bare
  piece (never a `NamedStyle`) and places only what is unlayered: a composed layout or recipe keeps its
  layer, and a bare piece wholly in another layer throws `style:relayered`. `Layers.define(names)`
  makes another order. There is no `Style.foundation`; the page composes its sheet.
- Theme pieces (`foldkit-mixins/theme`): `Theme.root(theme, { omit?, colorScheme? })` is the
  tokens as `:root` custom properties and `Theme.scoped(theme, selector, overrides)` is overrides under a
  selector, typed by `theme`'s own groups and names so a misspelled knob is a type error, both unlayered global pieces (`L.in('theme', …)`). `Theme.tokens` is the shared
  scales (`knob` density/radius-factor/motion/shadow-strength, `space`, `radius`, `font`, `size`, `leading`, `weight`,
  `motion`, `border`, `shadow`, `breakpoint`; `shadow.xs`…`2xl`/`inset` draw in `shadow.color`
  (which `Theme.oklch` sets per scheme), dimmed by the `shadow-strength` knob). `Theme.oklch({ accent: { h, c, l }, … })` derives the
  palette (`surface`, `text`, `outline`, `accent`, `secondary`, `tertiary`, `success`, `warning`,
  `error`, `info`; each family has a fill `default` with `hover`/`active`, a tint `subtle`, a line `outline`,
  `on-fill` for text on it, and `ink` for colored text on the base surface: colored text is `ink`, never `default`); only `knob` holds literals, so overriding `knob.accent-h` under a
  `Theme.scoped` selector recolors everything. Emit `Theme.root(theme, { omit: Theme.tokens })`
  after `Theme.root(Theme.tokens)` to avoid duplicates. The active theme is a Model field written
  as `data-theme` on the root. `Theme.breakpointWidths(Theme.tokens)` feeds the `Breakpoints`
  bundle (`theme:unparseable-breakpoint` for a non-`min-width` query).
  `Theme.inContainer('page', Theme.tokens.breakpoint)` gives the breakpoints as
  `'@container page (min-width: …)'`, which `Style.responsive` and a responsive look take as is.
- Defaults and prose: `Defaults.reset` and `Defaults.all` (`body`, `headings`, `links`, `code`,
  `controls`; `all` excludes `reset`) from `foldkit-mixins/defaults` are `:where()` element CSS over
  `--fk-*` tokens with fallbacks, unlayered: place them with `L.in('reset', …)` / `L.in('defaults',
  …)`. Headings are `text-overt`; a colored band sets `Style.vars({ '--fk-heading': 'currentColor',
  '--fk-ink': 'currentColor' })` and its headings and unfilled (`outline`/`ghost`) buttons take its color. `Prose.style({ measure?, leading?, rhythm?: { paragraph, heading, list, figure } })` from
  `foldkit-mixins/prose` is one class for every caller; options are `--fk-prose-*` variables on
  the element. Put it in `components`.
- Layout: `foldkit-mixins/layout` exports `Layout.stack/cluster/split/sidebar/switcher/reel/center/
  frame/pad/autoGrid(options)` and the child pieces `Layout.intrinsic` (a stack child keeping its
  width) and `Layout.aside` (the sidebar child). Options write `--fk-l-*` inline variables; the
  rule text is shared, except `split`'s breakpoint and `stack`'s `split` index. Pieces are
  unlayered: wrap with `L.in('layouts', Layout.stack({ gap }))`.
- `foldkit-mixins-ui` exports `Patterns`: an `A11y.pattern` per adapter plus `Patterns.catalog`
  (`{ name, pattern, slots, tier, roles, floor }`), and adapters for `HoverIntent` and `Anchor`
  (`Anchor.behavior(Slots)({ floating, config })`).
- `Style.attach`/`Behavior.attach` return new views; the original is untouched.
- Rule-based CSS is data, and arrives with what draws it: in a browser, a class a Slot draws is
  appended once to a `<style data-foldkit-styles>` (made only when needed; it declares the
  standard layer order unless the page already declares one). Install `Style.stylesheet(L.declare, …)`
  yourself for the layer order, the theme and a first paint; injection skips what it carries. On a
  server, `Style.usedIn(html)` is the CSS of the classes the rendered markup uses.

## 8. See also

- https://github.com/doeixd/foldkit-plus/blob/main/docs/mixins.md
- https://github.com/doeixd/foldkit-plus/blob/main/packages/mixins/README.md
- https://github.com/doeixd/foldkit-plus/blob/main/packages/mixins-surface/README.md
- https://github.com/doeixd/foldkit-plus/blob/main/packages/mixins-ui/README.md
- https://github.com/doeixd/foldkit-plus/tree/main/examples/mixins
- https://github.com/doeixd/foldkit-plus/tree/main/examples/todo-app (`src/view.ts`, `src/style.ts`)
- https://github.com/doeixd/foldkit-plus/tree/main/examples/kitchen-sink
- https://github.com/doeixd/foldkit-plus/blob/main/docs/design/mixins-DESIGN.md
