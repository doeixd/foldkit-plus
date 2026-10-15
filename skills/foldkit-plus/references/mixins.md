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
names, so `U.p('4xl')` and `U.bg('surface.nope')` are type errors. `U.scrollFade(axis)` dissolves a
scroller's content toward an edge with more to scroll (CSS only); `U.scrollDivider(axis)` on a
positioned parent with `U.scrollTimeline(axis)` on the scroller draws a hairline at such an edge
(where `timeline-scope` exists); and `U.steady(weight)` keeps room
for a label at a heavier weight from its `data-label`, so turning bold moves nothing.

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

Adapters (an alert dialog is the Dialog with `role: 'alertdialog'` in `Dialog.toView`'s context, no close button, and `Dialog.isDismissal` Messages dropped in `update`): Button, Input, Textarea, Select, Checkbox, Switch, Fieldset, Disclosure, Dialog,
Popover, Tooltip, Tabs, RadioGroup, Calendar, FileDrop, Toast, Listbox, Combobox, DatePicker (namespace + flat `XSlots`). `MenuView` transcribes `@foldkit/ui/menu`'s markup assembly
from the pinned `@foldkit/ui` source (attributed in the module) with a `toView` added, and a parity battery
draws both views over the same models. `Menu` itself (`Menu.init/update/view`, by a button, at a point, or down a submenu) is this package's own component over `@foldkit/ui` Menus, as the Slider is (`Slider.view`, one number or a range). Pass mixins as
`style.mixin` / `behavior.mixin`. Every `@foldkit/ui` component with a consumer seam has an adapter
except those two; the seamless ones (Listbox, ComboBox, Toast, DatePicker) are adapted over
small view forks transcribed from the pinned `@foldkit/ui` source, with
state staying upstream.
The same call goes in a Submodel's `viewInputs` (`toView: RadioGroup.toView(mixins, { h },
({ group, options }) => …)`), with `Value` and `Message` inferred. Draw each radio option as a
`label` element around its `option` button: upstream's `label` bundle is only an id, so a bare label
takes no press. `input` is optional: only what an
input-driven Mixin reads. `X.resolve(attributes, mixins, { h, input })` stays for bundles already in
hand, such as a Calendar whose Mixins read `attributes._tag`. `Listbox`, `Combobox` and `Calendar`'s `toView` take `draw` optionally; without it they draw upstream's
markup from the styled bundles. `Menu.toView(mixins, { h }, draw?)` draws the component's own markup through `drawMenu` without one. Tabs glide with `Tabs.toView([style.mixin, ...Tabs.fluid], { h }, ({ tablist, indicator, highlight, tabs }) => …)`,
drawing `indicator` and `highlight` first in the tablist. `Menu.fluid`, `Listbox.fluid` and `Combobox.fluid` do
the same for a popup's rows (`Menu.toView([style.mixin, ...Menu.fluid], { h })`): one highlight for pointer and keys,
and a gliding marker on a listbox's or combobox's chosen row. `Menu.overlayBars`, `Listbox.overlayBars` and
`Combobox.overlayBars` beside the style lay the overlay scroll bar (`scrollBar`, `scrollThumb` slots) over a
popup whose list scrolls (`itemsScrollAttributes`). `DatePicker.toView(mixins, (resolved, h) => …)`
takes no builder: its bundles speak the date picker's own Message, so it hands `draw` the date picker's
builder. Result types: `ResolvedButton<M>`,
`ResolvedRadioGroup<V, M>`, and so on.

`Recipes.Accordion | Button | Input | Textarea | Select | Checkbox | Switch | RadioGroup | Slider | Dialog | Tabs | Segmented | Menu | Listbox | Combobox | Calendar | DatePicker | Popover | Tooltip | Toast | FileDrop | Alert | AspectRatio | Avatar | Badge | Breadcrumb | ButtonGroup | Card | CardGroup | Carousel | CheckboxGroup | CodeBlock | ColorPicker | Command | Empty | HoverCard | Icon | InputCopy | Item | Kbd | Label | Menubar | MenubarMenu | Meter | Nav | NumberField | OtpField | Pagination | PasswordInput | Progress | Rating | Resizable | ScrollArea | Separator | Sheet | Sidebar | Skeleton | Spinner | Steps | Table | TagsInput | TreeView | Typography | VirtualList` are shipped
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
box; a `Segmented` pressed option is the accent's flat tint (`Segmented.fluid`, with its `indicator` and `highlight`
slots drawn first in the group, slides it as a pill; `Segmented.view` and `Segmented.toggled(pressed, value, { multiple, optional })` draw and step it, `multiple` being a toggle group; a toggle button is `Button.view({ pressed })`); an unfilled button's
hover (outline, ghost, icon) is a tint of its own text, so it reads on a colored band. The
body defaults color scrollbars with `outline.overt`. `Touch`
(`target`, `targets`) and `Icons` (`glyph(size)`, `byAttribute(attribute, icons)`) are style
mechanisms, not components: compose them into your own slots, resolving icon `url(…)`s yourself.
`Icons.glyph` masks an element that already exists. `Icon.view` is the element.

### Stateless vocabulary

These publish slots and a recipe and own no Model, Message, or bundle. Call
`X.view(options, h)` from `foldkit-mixins-ui`. Every view takes optional `style`
(`Style.forSlots(XSlots)(Recipes.X(selection))`) and `mixins`. Hide text with
`U.srOnly`. Name a control with `FieldAssociation`; `Label.view` takes the id
that derived.

| View | Call | Recipe |
| --- | --- | --- |
| `Accordion` | `{ id, items: { id, title, content, disabled? }[], open, onToggle, headingLevel? }`; `Accordion.toggled(open, id, { multiple?, collapsible? })` is the transition `update` applies, the open ids being the application's. Each trigger is a button in a heading naming its panel; a shut panel stays drawn and `inert`. The panel opens on a `0fr`-`1fr` grid row, the chevron turns, and the open title turns semibold in its own width. | `variant`: `divided` (default), `plain`. Slots `root`, `item`, `heading`, `trigger`, `label`, `chevron`, `panel`, `body`, `content`. |
| `Alert` | `{ layout, title, description?, icon?, actions?, onDismiss?, dismissLabel? }`, and by `layout`: `'inline'` takes `assertive?` and is a live region for something that just happened (`role="alert"` when assertive, else `role="status"`); `'banner'` takes `label` and is a full-width strip there on load, a `section` landmark named by `label`, never a live region. An action is `{ label, href }` (a link) or `{ label, onClick }` (a button); `onDismiss` draws a close button named `Dismiss <title>` inline, `Dismiss <label>` as a banner. Whether it shows is the application's. The root writes `data-layout` and `data-dismissible`. | `tone`: `info` (default), `success`, `warning`, `error`; `emphasis`: `subtle` (default, tint) or `bold` (fill). Slots `root`, `icon`, `title`, `description`, `actions`, `action`, `dismiss`. |
| `AspectRatio` | `{ content? }`. Slot `frame`. | `ratio`: `square` (default), `video` (16/9), `portrait` (3/4). The corner reads `radius`. |
| `Avatar` | `{ name, src }`. Initials show until the image covers them. | `size`: `sm`, `md` (default), `lg`. Slots `root`, `fallback`, `image`. |
| `Badge` | `{ text, tone? }` writes `data-tone`. | `Recipes.Badge({ attribute, tones, appearance? })` maps that attribute; values outside the map keep the base. `appearance`: `tinted` (default), `dot`, `outline`, `solid`. Slot `badge`. |
| `Breadcrumb` | `{ steps: { label, href?, current?, icon? }[], separator?, collapse? }`. `current` is text with `aria-current="page"`; the others are links. An `icon` draws before its label, hidden from assistive technology. `separator` is drawn between steps in place of the recipe's; `collapse: { max, onExpand, label? }` folds the middle of a long trail into an ellipsis (`Breadcrumb.collapsedOf(steps, max)` is the split). | No axis. Slots `root`, `list`, `item`, `link`, `current`, `icon`, `separator`, `ellipsis`. |
| `ButtonGroup` | `{ label, items }`. `role="group"`. The buttons stay the caller's. `Segmented` is the control that selects. | No axis. Slot `root`. |
| `Card` | `{ title?, description?, content?, image?, media?, action?, footer?, press?, label?, selected?, disabled?, dismiss? }`. `press` is `{ onClick }` or `{ href, external? }`: one button or link stretched over the card, named by `label` or the title (a pressable card with neither throws); `action`, `footer` and the dismiss button stay pressable above it. `selected` is `aria-pressed` on the button, `aria-current` on the link. `dismiss: { onDismiss, label?, always? }` is revealed on hover and focus unless `always`, and always on a touch screen. The root carries `data-selected`, `data-disabled`, `data-pressable`, `data-dismissible` (the header then keeps clear of the button). | `orientation`: `stacked` (default), `inline` (image or media leading, footer trailing). `surface`: `outlined` (default), `elevated`, `filled`, `plain`. `padding`: `compact`, `comfortable` (default), `roomy`, `flush`. Slots `root`, `image`, `media`, `header`, `title`, `description`, `action`, `content`, `footer`, `overlay`, `dismiss`. |
| `Card.group` | `{ cards: (CardView & { key })[], columns?, fluidHover?, label?, cardStyle? }`. A keyed list of cards in `columns` (default 1); each item carries `data-row` and `data-column`. With `fluidHover` (default) one highlight follows the pointer to the nearest card through `FluidHover` from `foldkit-primitives/dom`, reading both directions when there is more than one column, and a press in a gap presses the highlighted card. `cardStyle` styles every card that names no style of its own. | `Recipes.CardGroup`: `layout`: `divided` (default, hairlines between rows and columns), `separated`. `border`: `none` (default), `outlined`. Use cards of `surface: 'plain'` inside. Slots `root`, `list`, `item`, `highlight`. |
| `Carousel` | The APG carousel, never rotating by itself: `Carousel.view({ id, label, slides, index, onIndex, loop?, picker?, slideLabel?, previousLabel?, nextLabel?, pickerLabel?, style? }, h)`. A group with `aria-roledescription="carousel"`, each slide a group named "2 of 5"; previous and next (`aria-disabled` at the ends unless `loop`), a dot per slide, and a polite status naming the slide shown. The track is a CSS scroll-snap scroller, so swipes move it natively. The application keeps `index` and answers `onIndex` with the `Carousel.ShowSlide({ id, index })` Command, which scrolls the slide into place once the render commits. A swipe is not reported back, so `index` stays where the last Message left it. | `peek`: `none` (default) or `edge`. Slots `root`, `track`, `slide`, `controls`, `previous`, `next`, `picker`, `dot`, `status`. |
| `ColorPicker` | `ColorPicker.view({ id, label, value, onChange, presets?, presetsLabel?, channelLabels?, disabled?, style? }, h)`: an OKLCH color (`ColorPicker.Oklch`, `{ l, c, h }`) as a `group` of three labelled native ranges, each saying its value with its unit in `aria-valuetext`, a swatch, the color as text, and `presets` as a `radiogroup` of native radios. `format`/`parse` (an `Option`) turn it to and from CSS text; `withChannel` sets one channel within its range. | `size`: `sm`, `md` (default), `lg`. Tracks paint gradients from the root's `--fk-color-l`/`-c`/`-h` by `[data-channel]`. Slots `root`, `label`, `swatch`, `value`, `channel`, `channelLabel`, `slider`, `presets`, `preset`. |
| `Command` | `{ id, label, placeholder?, groups: { heading?, items: { value, label, keywords?, shortcut?, disabled? }[] }[], query, onQuery, active, onActive, onRun, empty? }`; `Command.filtered(groups, query)` is what a query leaves. shadcn's Command and Fluid's CommandMenu: the field points at the highlighted row through `aria-activedescendant`, ↑ and ↓ wrap through enabled rows, Enter runs the highlighted one; rows never re-sort, and a filtered-away highlight moves to the first enabled row. `overlayBars: true` sets the list in a `frame` beside an overlay bar. | No axis. Slots `root`, `input`, `list`, `group`, `heading`, `item`, `shortcut`, `empty`, and `frame`, `bar`, `thumb` with `overlayBars`. |
| `Calendar` | One date system, inline: `Calendar.Selection` is `Single`, `Range` or `Multiple`, owned by the application (`Calendar.empty(mode)`, fold each `SelectedDate` through `Calendar.picked`, `Calendar.isComplete` says when a picker may close). Draw with `Calendar.toView(selection, mixins, { h })` and `maybeSelectedDate: Calendar.selectedDate(selection)`, which marks each chosen day `aria-selected`: a range's ends `data-selected` with `data-range-start`/`data-range-end`, every day between `data-in-range`. | `size` (the Calendar's). Slots `CalendarSlots`. |
| `Empty` | `{ title, description?, icon?, action? }`. | No axis. Slots `root`, `icon`, `title`, `description`, `action`. |
| `HoverCard` (recipe) | Styles `@foldkit/ui`'s HoverIntent (`HoverIntentSlots`): a trigger read as a link, a raised panel fading in on the fast tier as it is drawn. Place the panel with the `Anchor` Mount; the open and close delays are HoverIntent's (200ms and 300ms by default). | No axis. Slots `trigger`, `panel`. |
| `Icon` | `{ content, label? }`. A `label` is `role="img"`; without one the glyph is `aria-hidden`. | `size`: `sm`, `md`, `lg` on the type scale; none (the default) stands on the size ladder, 16px or 14px compact. Slot `glyph`. |
| `InputCopy` | A read-only value with a copy button, Zag's clipboard: `InputCopy.view({ id, label, value, copied, onCopy, copyLabel?, copiedLabel?, style? }, h)`. The view is stateless: answer `onCopy` with the `InputCopy.Copy({ text })` Command, which yields `foldkit-primitives/dom`'s `ClipboardMessage` (`Copied` or `CopyFailed`, never a throw); the application sets and clears `copied`. The button is named `Copy <label>`; copied, it reads `Copied` and a polite status region says so. | No axis. Slots `root`, `label`, `group`, `input`, `button`, `status`. |
| `Item` | `{ content?, media?, title?, description?, actions? }`; `content` follows the title and description. | `density`: `comfortable` (default), `compact`. Slots `root`, `media`, `content`, `title`, `description`, `actions`. |
| `CheckboxGroup` | `{ id, legend, options: { value, label, description?, disabled? }[], checked, onToggle }`; `CheckboxGroup.toggled(checked, value)` is the transition. A `fieldset` named by its `legend`, each option the APG's checkbox (`role="checkbox"`) named by a `label` for it, so a press on the words toggles it. | `variant`: `plain` (default), `list` (checked rows fill, and merge where they stand together). The checkbox and label are the Checkbox recipe's pieces. Slots `root`, `legend`, `option`, `checkbox`, `label`, `description`. |
| `CodeBlock` | `{ code, tokens?, language?, title?, lineNumbers?, copy? }`; `tokens` are a tokenizer's `{ from, to, kind }` (`foldkit-richtext-code`, `-shiki`); `copy.onCopy(code)` sends a Message, so run `copyText` from `foldkit-primitives`. | No axis; colors kinds from the theme's `syntax` group. Slots `root`, `header`, `title`, `copy`, `body`, `code`, `line`, `token`. |
| `Kbd` | `{ key }`. Names the key. `Kbd.combo({ keys, joiner? }, h)` draws several in one `kbd`, with an optional joiner between them. | No axis. Slots `key`, `combo`, `joiner`. |
| `Label` | `{ for, text }`. `for` is the control's id. | No axis. Slot `label`. |
| `Menubar` | A row of `@foldkit/ui` Menus, shadcn's and the APG's menubar: `Menubar.view({ label, model, menus, onMessage, direction?, style?, menuMixins }, h)`, its Model (`Menubar.init(ids)`) folded with `Menubar.update`, whose `Selected` OutMessage names the menu and the row. One trigger is the tab stop; ArrowLeft/ArrowRight (Home/End while all are shut) move it, swapped under `direction: 'rtl'`, and with a menu open they open the next on its first row. While one is open, pointing at another opens it, and opening any shuts the rest. `Recipes.MenubarMenu` is the Menu recipe with a bar's flat triggers. | No axis. Slots `bar`, `menu`; each menu's are `MenuSlots`. |
| `Meter` | `@foldkit/ui`'s Meter: `Meter.view({ id, label, value, min?, max?, low?, high?, optimum?, valueText?, style? }, h)` draws a `meter` named by its label. The root says how good the value is as `data-level` (`good`, `fair`, `poor`), as the HTML meter judges it; `Meter.levelOf` is that judgment. A measurement, where `Progress` is work. | No axis; the fill takes success, warning or error by level. Slots `root`, `label`, `track`, `fill`. |
| `Nav` | `@foldkit/ui`'s Nav adapted: `Nav.toView(mixins, { h }, label, draw?)` as the Nav's `toView`, drawing `nav > ul > li > a` with the current link `aria-current="page"`; `Nav.fluid` beside the style glides a line to the current link and a faint pill to the one the pointer nears. shadcn's navigation menu without its dropdown panels; the keys are the browser's. | No axis. Slots `nav`, `list`, `item`, `link`, `indicator`, `highlight`. |
| `Menu` | One menu, opened three ways: `Menu.init(id, rows)` (a row with `items` hosts a submenu, one level deep), folded with `Menu.update`, drawn with `Menu.view({ model, rows, buttonContent, onMessage, opensAt?, direction?, isRowDisabled?, style?, mixins, submenuMixins? }, h)`. By a button (`opensAt` unset); at a point (`opensAt: 'point'`, with `Menu.target(onMessage, h)` on the area: a right press records its point and the `contextmenu` after it opens the menu there). A submenu's row is a `menuitem` with `aria-haspopup="menu"` and `aria-expanded`; ArrowRight, Enter or Space opens it on its first row, ArrowLeft or Escape closes it back to the row (under `direction: 'rtl'` the submenu opens on the left and the arrows swap), a pointer resting 150ms opens it, and choosing a leaf closes everything. `Selected` names the value and the submenu it came from. Pass `Menu.fluid` beside the style (in `submenuMixins`, not `mixins`, where rows open submenus). | No axis. Slots `MenuSlots` plus `sub`, `label`, `chevron`; with `overlayBars`, `scrollBar`, `scrollThumb`. |
| `NumberField` | `{ id, label, description?, value, onChange, min?, max?, step?, page?, format?, disabled? }`; `NumberField.settled(value, bounds)` clamps a value onto its step. The APG's editable spinbutton: an input with `role="spinbutton"` that the arrows, PageUp and PageDown, Home and End step, a typed number committing on change, between steppers out of the tab order that disable at their bound. | No axis. Slots `root`, `label`, `group`, `input`, `decrement`, `increment`, `description`. |
| `OtpField` | `{ label, value, onChange, length?, pattern?, groups?, disabled? }`; `OtpField.kept(text, length, pattern)` filters a code. shadcn's input-otp: one real input (`autocomplete="one-time-code"`, paste and Backspace the browser's) over cells that mirror it, the next cell marked `data-next` for its caret. | No axis. Slots `root`, `input`, `group`, `cell`, `separator`. |
| `Pagination` | `{ page, pageCount, onPage, label?, siblings?, boundaries?, numbered?, ends?, range? }`. Fewer than two pages draws nothing. `Pagination.itemsOf(page, pageCount, window?)` is the stops; `Pagination.summaryOf(page, { total, perPage, text? })` is `"1–10 of 97"`. `numbered: false` leaves previous and next alone; `ends` draws first and last. | No axis. The current stop reads `aria-current`. Slots `root`, `summary`, `first`, `prev`, `next`, `last`, `page`, `ellipsis`. |
| `PasswordInput` | `PasswordInput.view({ id, label, value, onInput, visible, onToggle, autocomplete?, toggleLabel?, description?, invalid?, disabled? }, h)`: a password field whose toggle button (`aria-pressed`, `aria-controls`, one fixed name) shows it as text. `autocomplete` is `current-password` (default) or `new-password`; spellcheck and autocorrect stay off. The app owns the text and the flag. | `size` (`sm`, `md`, `lg`). Input's pieces in InputGroup's box; the eye is `Icons.glyph` by `aria-pressed`. Slots `root`, `label`, `group`, `input`, `toggle`, `description`. |
| `Progress` | `@foldkit/ui`'s Progress: `Progress.view({ id, label, value, min?, max?, valueText?, style? }, h)` draws a `progressbar` named by its label. `value` is an `Option`; none is indeterminate, and the bar's fill sweeps toward the inline end, leftward right to left. The root carries the share done as `--fk-progress`. | `shape`: `bar` (default) or `ring`, Circular Progress. Slots `root`, `label`, `track`, `indicator`. |
| `Rating` | `Rating.view({ id, label, value, onChange, max?, starLabel?, readOnly?, disabled?, style? }, h)`: a `radiogroup` of native radios named by its label, one per star under one name, so the browser's arrows move the choice and a form submits it. `value` is an `Option`; none is unrated. Read-only, it is one `img` whose name says the rating. | `tone`: `warning` (default, gold) or `accent`; `size`: `sm`, `md`, `lg`. Stars are a CSS `clip-path` on each radio's `::before`; pointing previews the rating. Slots `root`, `label`, `star`. |
| `ScrollArea` | `{ content, overlayBars? }`. The height that makes it scroll is the caller's mixin, on `viewport` or `root`; a width goes on `root`. The viewport is tabbable. `overlayBars: true` draws a bar per axis over the viewport's edge, driven by `ScrollBars` (4px thumb, 6px hovered, fades when idle; native on a coarse pointer). | `orientation`: `vertical` (default), `horizontal`, `both`; the first two fade toward an edge with more and draw a hairline there. Slots `root`, `viewport`, `bar`, `thumb`. |
| `Resizable` | `Resizable.Model` (`init(share)`), its `Message` and `update(model, message, bounds)`, which the application keeps and folds; `Resizable.view({ model, onMessage, label, first, second, orientation?, direction?, min?, max?, step? })`. shadcn's Resizable and the APG's window splitter: the handle is a `separator` with its value, stepped by the arrows and sent to the bounds by Home and End; a drag follows the `Move` Mount from where it began over the group the `Resize` Mount measured. Under `direction: 'rtl'` the first panel is on the right, so ArrowLeft and a drag to the left grow it. | No axis; `data-orientation` lays it out. Slots `root`, `first`, `handle`, `second`. |
| `Separator` | `{ orientation? }`, horizontal by default. A vertical rule needs its container to set the cross size. | `orientation`: `horizontal` (default), `vertical`. Slot `rule`. |
| `Sheet` (recipe) | Style `@foldkit/ui`'s Dialog (`DialogSlots`), drawn as a Dialog is, with `h.div(dialog.handle)` in the panel: the panel pinned to an edge of the viewport, sliding in from it on the slow tier as it fades (reduced motion keeps only the fade), bordered on the side facing the page. `handle: 'bar'` shows the handle on that edge and rounds the inner corners: `Sheet({ side: 'bottom', handle: 'bar' })` is vaul's Drawer. The focus trap, Escape and backdrop dismissal stay the Dialog's. | `side`: `top`, `right` (default), `bottom`, `left`; `handle`: `none` (default), `bar`. Slots are `DialogSlots`. |
| `Sidebar` | `{ id, label, sections: { id, title, links: { label, href, current? }[] }[], open, onToggleSection, collapsed, onToggleCollapsed }`; `Sidebar.toggled(open, id)` flips a section. shadcn's sidebar with Fluid's collapse: a named navigation landmark of sections that open like an accordion's (several at once), a toggle that collapses the whole column off the page (no icon rail), the current page `aria-current`. Shut sections and a collapsed column stay drawn and `inert`. | No axis. Slots `root`, `toggle`, `nav`, `section`, `trigger`, `chevron`, `links`, `item`, `link`. |
| `Skeleton` | `{ label? }`. `role="status"`. Stack one bar per line. | `shape`: `bar` (default), `circle`. Slot `bar`. |
| `Slider` | `Slider.view({ id, label, value, onChange, min?, max?, step?, format?, marks?, showValue?, name?, disabled?, style? }, h)`, where `value` is a number or a `{ low, high }` range and `onChange` is handed the same kind. Native `input type="range"` thumbs: drag, keys, right to left and the form value are the browser's. One number is one thumb across the track, named by the label. A range is a `group` of two thumbs named by `thumbLabels` (default `Minimum`, `Maximum`), each bounded by the other, so the browser stops a drag at the other thumb; `Slider.moved(range, 'low' \| 'high', value, bounds)` snaps, bounds and orders a range, returning the same range when nothing changed. `marks` dot values on the track; `showValue` draws each value; both are hidden from assistive technology. | `tone`: `accent` (default), `neutral`; `size`: `sm`, `md` (default), `lg`; `track`: `thick` (default, Fluid's look), `thin`; `value`: `above` (default), `inside` (a pill thumb). Slots `root`, `label`, `control`, `track`, `fill`, `mark`, `value`, `thumb`. |
| `Spinner` | `{ label? }`. `role="status"`. | `size`: `sm`, `md` (default). Slot `wheel`. |
| `Steps` | `Steps.view({ label, steps: { title, description?, icon?, content? }[], current, onSelect?, style? }, h)`: a stepper, an ordered list named by `label`. The step at `current` is `aria-current="step"`, those before it `data-state="complete"` (a check replaces the number), those after `upcoming`. An `icon` stands in the marker for its number; `content` follows the step, beside the line in a vertical stepper. With `onSelect(index)`, completed steps are buttons for going back; steps ahead never are. The application owns `current`. | `orientation`: `horizontal` (default) or `vertical`. Slots `root`, `item`, `step`, `trigger`, `marker`, `text`, `title`, `description`, `content`, `connector`. |
| `Table` | `{ columns: { header, value, numeric? }[], rows, caption?, fluid? }`. With `fluid`, one highlight behind the body rows follows the pointer, and the lines beside the lit row go. Sorting and selection stay with `foldkit-data-grid`. | No axis. Slots `frame`, `highlight` (with `fluid`), `root`, `caption`, `head`, `headerRow`, `headerCell`, `body`, `row`, `cell`. |
| `TagsInput` | Zag's tags input, a small Model of its own: `TagsInput.init({ id, tags?, delimiter? })`, folded with `TagsInput.update` (which returns a focus Command), drawn with `TagsInput.view({ model, onMessage, label, placeholder?, disabled? }, h)`. The tags are a list of chips named by the label, each with a `Remove <tag>` button, then a text input. Enter or the delimiter (default `,`) adds the draft split at the delimiter and trimmed, refusing empty and repeated parts; Backspace on an empty draft removes the last tag; a removal returns focus to the input. Keys reach `update`, which decides from its own draft. | No axis; `data-disabled` on `control`. Slots `root`, `label`, `control`, `list`, `tag`, `remove`, `input`. |
| `TreeView` | The APG's and Zag's tree view, a small Model of its own: `TreeView.init({ id, open? })`, folded with `TreeView.update(nodes)` (curried over the tree, flattened once), drawn with `TreeView.view({ label, model, nodes, onMessage, direction?, style?, mixins? }, h)` over nodes `{ id, label, children?, disabled? }`. One tab stop; Up/Down move through the rows showing, stepping over shut and disabled ones; Right opens or steps in, Left shuts or steps out (swapped under `direction: 'rtl'`); Home/End; a character moves to the next showing row that starts with it; Enter, Space or a click chooses a row and opens or shuts a branch. Keys reach `update`, which decides from its own Model and sends a focus Command. Each item carries `--fk-tree-level`; a shut group stays drawn and `inert`. | No axis; `data-state` on a branch `item` and its `group`. Slots `root`, `item`, `row`, `chevron`, `label`, `group`. |
| `Typography` | `{ level, text }`. The level chooses the element (`h1`–`h4`, `lead`, `body`, `small`, `muted`, `quote`, `code`, and the interface roles `display`, `title`, `subtitle`, `caption`, `micro` as paragraphs). | `level`, same set; a role is its size and leading on the size ladder. Defaults to `body`. Slot `text`. |
| `VirtualList` | `@foldkit/ui`'s virtual list: `VirtualList.view({ model, items, itemToKey, itemToView, onMessage, overscan?, itemToRowHeightPx? \| dynamicRowHeights?, style? }, h)` draws only the rows in view. Its Model is upstream's (`@foldkit/ui/virtualList`'s `init`), kept by the application and folded with that module's `update`. A row's mixins may style it, not handle its events, since it is drawn inside the list's submodel. `overlayBars: true` lays an overlay bar over the list. | No axis. Slots `root` (the box it scrolls within, 18rem tall by default), `row`, and `bar`, `thumb` with `overlayBars`. |

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
  `Theme.compose(base, over)`. A reader's light or dark (`foldkit-mixins/theme`):
  `Theme.schemeScript()` in a head `<script>` applies the kept one before the first paint,
  `Theme.chooseScheme(scheme)` is a Command's Effect that applies and keeps it, and
  `Theme.currentScheme()` reads it back for the Model. Layers are a value: `Layers.standard` (also
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
  scales (`knob` density/radius-factor/motion/travel/step/shadow-strength, `space`, `radius`, `font`, `size`, `leading`, `weight`,
  `motion` (tiers `fast`/`moderate`/`slow` at 80/160/240ms, each with a quicker `-exit`, and the `settle`/`spring` easings; a duration of
  something that moves multiplies by `knob.travel`, which the reset zeroes under reduced motion while fades keep theirs), `type` (six roles, `display`/`title`/`subtitle`/`body`/`caption`/`micro`, each a size and leading at both steps, read through `Theme.role(name)`), `control` (the size ladder's two ends, 36px and 28px, read through `Theme.ladder(name)`, which blends them by `knob.step` on the element that uses it: `--fk-knob-step: 1` on a region makes its controls compact, and the popups they open while those stay in the page (`portal: false`); a recipe's `size` sets the step on its own element, a popup's on its panel too; unset, the default, follows the region), `border`, `shadow`, `breakpoint`; `shadow.xs`…`2xl`/`inset` draw in `shadow.color`
  (which `Theme.oklch` sets per scheme), dimmed by the `shadow-strength` knob). `Theme.oklch({ accent: { h, c, l }, … })` derives the
  palette (`surface`, `text`, `outline`, `accent`, `secondary`, `tertiary`, `success`, `warning`,
  `error`, `info`; each family has a fill `default` with `hover`/`active`, a tint `subtle`, a line `outline`,
  `on-fill` for text on it, and `ink` for colored text on the base surface: colored text is `ink`, never `default`; and `syntax`, code colors named as tokenizers name kinds, `syntax-keyword` reading `--fk-syntax-keyword`); only `knob` holds literals, so overriding `knob.accent-h` under a
  `Theme.scoped` selector recolors everything; `neutral: { h }` gives the neutrals a hue apart from the accent's (a base color), and `menu: { accent: 'bold', color: 'inverted' | 'translucent' | … }` sets the `popup` tokens menus, listboxes and comboboxes draw in; `state` (`hover`, `tint`, `tint-hover`, `edge`) is a mix of the element's own text color, so a hover reads on any surface, and `Theme.nested(outer, inset, border?)` gives a concentric inner radius (or a padded container spreads `Theme.nests(radius, inset, border?)` and its descendants read `Theme.nested()`); `Theme.raise(offset)` lifts an element `offset` levels above the raised element holding it, and `Theme.raisedSurface()` paints its level (popups 2, dialogs 4). Emit `Theme.root(theme, { omit: Theme.tokens })`
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
