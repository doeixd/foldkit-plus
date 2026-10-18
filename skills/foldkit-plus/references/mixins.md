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
`style.mixin` / `behavior.mixin`. A custom select is a Listbox drawn with `Listbox.parts(mixins, { h })`
(`option({ label, description?, icon? })`, `trigger(chosen, placeholder)`; recipe axes `check`, `trigger`,
`size`); a Combobox takes `chips: {}` (with `ComboboxView.Multi`, a tags field with suggestions),
`clearContent` and `empty`. A Dialog draws `body` (holding `scroll` and its `scrollBar`) and `footer`, so a
long body scrolls under answers that stay, and `covered: true` in its context steps back a dialog another
was opened from (draw the second inside the first's `dialog`). A tab is a flex row: draw its words in
`label` and an icon in `icon`; `TabsContext.close: { onClose }` makes tabs closable (answer with `Tabs.closing`
and `FocusTab`); Tabs axes `variant`, `size`, `overflow: 'scroll'`. A Segmented option takes an `icon` (or
`iconOnly`); axes `tray` (`tray`, `plain`, `underline`), `size`, `width: 'fill'`. Every `@foldkit/ui` component with a consumer seam has an adapter
except those two; the seamless ones (Listbox, ComboBox, Toast, DatePicker) are adapted over
small view forks transcribed from the pinned `@foldkit/ui` source, with
state staying upstream.
The same call goes in a Submodel's `viewInputs` (`toView: RadioGroup.toView(mixins, { h },
({ group, options }) => …)`), with `Value` and `Message` inferred. Draw each radio option as a
`label` element around its `option` button: upstream's `label` bundle is only an id, so a bare label
takes no press; give that `label` the option's `card` bundle (`h.label(option.card, [h.button(option.option, []), …])`, `data-checked` while checked), which `Recipes.RadioGroup({ variant: 'card' })` frames, filling the chosen one; `orientation: 'Horizontal'` on the view lays them in a wrapping row. `input` is optional: only what an
input-driven Mixin reads. `X.resolve(attributes, mixins, { h, input })` stays for bundles already in
hand, such as a Calendar whose Mixins read `attributes._tag`. `Listbox`, `Combobox` and `Calendar`'s `toView` take `draw` optionally; without it they draw upstream's
markup from the styled bundles. `Menu.toView(mixins, { h }, draw?)` draws the component's own markup through `drawMenu` without one. Tabs glide with `Tabs.toView([style.mixin, ...Tabs.fluid], { h }, ({ tablist, indicator, highlight, tabs }) => …)`,
drawing `indicator` and `highlight` first in the tablist. `Menu.fluid`, `Listbox.fluid` and `Combobox.fluid` do
the same for a popup's rows (`Menu.toView([style.mixin, ...Menu.fluid], { h })`): one highlight for pointer and keys,
and a gliding marker on a listbox's or combobox's chosen row. Overlay scroll bars are one shape, a mixin list
beside the style, off by default (their `ScrollBars` Mount sends no Message, which a Scene test would have to
resolve): `ScrollArea.overlayBars`, `Command.overlayBars`, `VirtualList.overlayBars` in the view's `mixins`
(each always draws its `bar`/`thumb`), and `Menu.overlayBars`, `Listbox.overlayBars`, `Combobox.overlayBars`
in `toView`'s for a popup whose list scrolls (`itemsScrollAttributes`; slots `scrollBar`, `scrollThumb`).
Menu (submenus too), Menubar, Listbox and Combobox panels drawn with `portal: false` are in the top layer:
`popover="manual"` and `inset: auto` on the panel, its anchor Mount wrapped in `Anchor.topLayer(mount)`, which
shows it around the Mount and hides it on release (a no-op without the popover API or attribute); an
unstyled panel keeps the browser's popover border, padding and `Canvas` fill. Popover and Tooltip draw
their `layer` slot (`Anchor.layer(h)`) around the panel, which keeps upstream's anchor (`Popover.anchor()`,
`Tooltip.anchor()`: `portal: false`, 12px and 8px off, flip and shift); a Hover Card is anchored in the top layer by
`HoverIntent.toView(mixins, { h, anchored: { id, anchor? } }, draw)`; each draws an `arrow` in its panel, and
`Tooltip.toView` takes `{ h, id: model.id }`. The DatePicker panel and modal dialogs are not in the top layer. The popup recipes' `width` axis: `trigger` (Combobox's default)
replaces the panel's 14rem minimum with the trigger's width (`--button-width`), `auto` (Listbox's) keeps it.
Right to left: Menu, Menubar, TreeView, Resizable and a horizontal Listbox take `direction?: 'ltr' | 'rtl'`,
swap the arrows into reading order and draw it as the root's `dir`; `Tabs.readingKeys`,
`RadioGroup.readingKeys` and `Calendar.readingKeys` (a mixin each, opt-in for Scene's sake) read upstream's
arrows by `:dir()`; the `fluid` indicators measure again when a `dir` changes. `DatePicker.toView(mixins, (resolved, h) => …)`
takes no builder: its bundles speak the date picker's own Message, so it hands `draw` the date picker's
builder. For a range or many days in the popover, fold with `DatePicker.update(selection)` (open until the
selection is complete) and pass `DatePickerView.view` `selection`, `triggerContent: selection => Html` and
`toCalendarView: Calendar.toView(selection, mixins, { h })`; under `name` each chosen day is its own hidden
input (`FormData.getAll(name)` is `[start, end]`). Result types: `ResolvedButton<M>`,
`ResolvedRadioGroup<V, M>`, and so on.

`Recipes.Accordion | Button | Input | Textarea | Select | Checkbox | Switch | RadioGroup | Slider | Dialog | Tabs | Segmented | Menu | Listbox | Combobox | Calendar | DatePicker | Popover | Tooltip | Toast | FileDrop | Alert | AspectRatio | Avatar | Badge | Breadcrumb | ButtonGroup | Card | CardGroup | Carousel | CheckboxGroup | CodeBlock | ColorPicker | Command | Empty | HoverCard | Icon | InputCopy | Item | Kbd | Label | Menubar | MenubarMenu | Meter | Nav | NumberField | OtpField | Pagination | PasswordInput | Progress | Rating | Resizable | ScrollArea | Separator | Sheet | Sidebar | Skeleton | Spinner | Steps | Table | TagsInput | TreeView | Typography | VirtualList | ChatMessage | ChatMessageGroup | MessageScroller | ThinkingIndicator | ThinkingSteps | Questionnaire | AngleSlider | Timer | Marquee | ImageCropper | SignaturePad | QrCode | Chart | CascadeSelect | FloatingPanel | Tour` are shipped
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
slots drawn first in the group, slides it as a pill; `Segmented.view` and `Segmented.toggled(pressed, value, { multiple, optional })` draw and step it, `multiple` being a toggle group; a toggle button is `Button.view({ pressed })`, which rests on its tone's fill, keeps its text on it hovered and held, and deepens held); a held button scales to 98% (by `travel`), a solid or primary one also deepening to its `active` fill and clearing its 1px border. An unfilled button's
hover (outline, ghost, icon) is a faint film of the state ink, so it reads on a colored band. The
body defaults color scrollbars with `outline.overt`. `Touch`
(`target`, `targets`) and `Icons` (`glyph(size)`, `byAttribute(attribute, icons)`) are style
mechanisms, not components: compose them into your own slots, resolving icon `url(…)`s yourself.
`Icons.glyph` masks an element that already exists. `Icon.view` is the element.

### Views and components of this package

These publish slots and a recipe and take no `@foldkit/ui` bundle. Call
`X.view(options, h)` from `foldkit-mixins-ui`. Most own no Model or Message;
Menu, Menubar, Toast, Sheet, TagsInput, TreeView, Carousel, Resizable,
ColorPicker, InputCopy, MessageScroller, Questionnaire, AngleSlider, Timer,
Marquee, ImageCropper, SignaturePad, Chart, CascadeSelect, FloatingPanel and
Tour keep a small Model of interaction state that the
application keeps and folds with their `update`, the value chosen staying the
application's. Every view takes optional `style`
(`Style.forSlots(XSlots)(Recipes.X(selection))`) and `mixins`. Hide text with
`U.srOnly`. Name a control with `FieldAssociation`; `Label.view` takes the id
that derived.

| View | Call | Recipe |
| --- | --- | --- |
| `Accordion` | `{ id, items: { id, title, content, disabled? }[], open, onToggle, headingLevel? }`; `Accordion.toggled(open, id, { multiple?, collapsible? })` is the transition `update` applies, the open ids being the application's. Each trigger is a button in a heading naming its panel; a shut panel stays drawn and `inert`. The panel opens on a `0fr`-`1fr` grid row, the chevron turns, and the open title turns semibold in its own width. The view takes an `icon` in place of the recipe's. | `variant`: `plain` (default), `bordered`, `separated`, `filled`, `ghost`; `separators`: `on` (default, between sections only), `off`; `indicator`: `chevron` (default), `plus`; `indicatorPosition`: `end` (default), `start`; `active`: `none` (default), `trigger`, `item` (the open section tinted). Slots `root`, `item`, `heading`, `trigger`, `label`, `chevron`, `icon`, `panel`, `body`, `content`. |
| `Alert` | `{ layout, title, description?, icon?, actions?, onDismiss?, dismissLabel? }`, and by `layout`: `'inline'` takes `assertive?` and is a live region for something that just happened (`role="alert"` when assertive, else `role="status"`); `'banner'` takes `label` and is a full-width strip there on load, a `section` landmark named by `label`, never a live region. An action is `{ label, href }` (a link) or `{ label, onClick }` (a button); `onDismiss` draws a close button named `Dismiss <title>` inline, `Dismiss <label>` as a banner. Whether it shows is the application's. The root writes `data-layout` and `data-dismissible`. | `tone`: `info` (default), `success`, `warning`, `error`; `emphasis`: `subtle` (default, tint) or `bold` (fill). Slots `root`, `icon`, `title`, `description`, `actions`, `action`, `dismiss`. |
| `AspectRatio` | `{ content? }`. Slot `frame`. | `ratio`: `square` (default), `video` (16/9), `portrait` (3/4). The corner reads `radius`. |
| `Avatar` | `{ name, src?, initials?, status?, statusLabel? }`. The root is one `role="img"` named by the person (and the status, "Ada Lovelace, Online"); initials show until the picture covers them, the picture's alt empty. `status` (`online`, `away`, `busy`, `offline`) is a dot on the lower end corner. `Avatar.group({ people, max?, label?, moreLabel?, style?, avatarStyle? })` overlaps them, each ringed in the page, and counts the rest as one more avatar. An avatar beside a name and a line is an `Item` with the avatar as its media. | `size`: `xs`, `sm`, `md` (default), `lg`, `xl`; `shape`: `circle` (default), `rounded`, `square`; `color`: `neutral` (default) or `name` (initials in a hue from the name); `ring`: `none`, `page`, `accent`. Slots `root`, `fallback`, `image`, `status`. `Recipes.AvatarGroup({ overlap: 'tight' \| 'loose' \| 'none' })` over `AvatarGroupSlots` (`root`). |
| `Badge` | `{ text, tone? }` writes `data-tone`. | `Recipes.Badge({ attribute, tones, appearance? })` maps that attribute; values outside the map keep the base. `appearance`: `tinted` (default), `dot`, `outline`, `solid`. Slot `badge`. |
| `Breadcrumb` | `{ steps: { label, href?, current?, icon? }[], separator?, collapse? }`. `current` is text with `aria-current="page"`; the others are links. An `icon` draws before its label, hidden from assistive technology. `separator` is drawn between steps in place of the recipe's; `collapse: { max, onExpand, label? }` folds the middle of a long trail into an ellipsis (`Breadcrumb.collapsedOf(steps, max)` is the split). `collapse: { max, menu: { model, onMessage, mixins } }` makes the ellipsis open a Menu of the hidden steps instead: the Menu's Model is the application's, built from `Breadcrumb.menuRows(steps, max)`, and `Breadcrumb.chosen(steps, max, value)` is the step a row leads to. | `separator`: `slash` (default), `chevron` or `dot`, drawn where the view is given no `separator` of its own. Slots `root`, `list`, `item`, `link`, `current`, `icon`, `separator`, `ellipsis`, `dots`. |
| `ButtonGroup` | `{ label, items }`. `role="group"`. The buttons stay the caller's. `Segmented` is the control that selects. | No axis. Slot `root`. |
| `Card` | `{ title?, description?, content?, image?, media?, action?, footer?, press?, label?, selected?, disabled?, dismiss? }`. `press` is `{ onClick }` or `{ href, external? }`: one button or link stretched over the card, named by `label` or the title (a pressable card with neither throws); `action`, `footer` and the dismiss button stay pressable above it. `selected` is `aria-pressed` on the button, `aria-current` on the link. `dismiss: { onDismiss, label?, always? }` is revealed on hover and focus unless `always`, and always on a touch screen. The root carries `data-selected`, `data-disabled`, `data-pressable`, `data-dismissible` (the header then keeps clear of the button). | `orientation`: `stacked` (default), `inline` (image or media leading, footer trailing). `surface`: `outlined` (default), `elevated`, `filled`, `plain`. `padding`: `compact`, `comfortable` (default), `roomy`, `flush`. `elevation`: `0` to `3`, a step of the surface ladder (lighter in a dark scheme; a contact and an ambient shadow in a light one). `lift`: `none` (default) or `hover`, a lift under the pointer that `travel` stills. `Card.overlay` is the stretched press control, shared with Item. Slots `root`, `image`, `media`, `header`, `title`, `description`, `action`, `content`, `footer`, `overlay`, `dismiss`. |
| `Card.group` | `{ cards: (CardView & { key })[], columns?, fluidHover?, label?, cardStyle? }`. A keyed list of cards in `columns` (default 1); each item carries `data-row` and `data-column`. With `fluidHover` (default) one highlight follows the pointer to the nearest card through `FluidHover` from `foldkit-primitives/dom`, reading both directions when there is more than one column, and a press in a gap presses the highlighted card. `cardStyle` styles every card that names no style of its own. | `Recipes.CardGroup`: `layout`: `divided` (default, hairlines between rows and columns), `separated`. `border`: `none` (default), `outlined`. Use cards of `surface: 'plain'` inside. Slots `root`, `list`, `item`, `highlight`. |
| `Carousel` | The APG carousel: `Carousel.init({ id, slide?, autoplay?, delay? })`, folded with `Carousel.update({ count, perView?, loop? })`, drawn with `Carousel.view({ label, model, slides, onMessage, loop?, perView?, picker?, thumbnails?, slideLabel?, previousLabel?, nextLabel?, pickerLabel?, rotationLabels?, style? }, h)`. A group with `aria-roledescription="carousel"`, each slide a group named "2 of 5"; previous and next (`aria-disabled` at the ends unless `loop`), a dot per place the track can rest (or `thumbnails` in their place), and a polite status naming the slide shown. The track is a CSS scroll-snap scroller, so swipes move it natively, and `ScrollSettle` reports where a swipe rests, so the dots follow the finger. Every press, swipe and timer reaches `update`, which returns the `Carousel.ShowSlide` Command that scrolls the track: do not keep the slide yourself. With `autoplay` it moves on every `delay` (4s), the current dot filling as it waits; it pauses under the pointer, stops when focus arrives by the keys, quiets its status while it rotates, and draws the APG's rotation button first. | `peek`: `none` (default) or `edge`. Slots `root`, `track`, `slide`, `controls`, `rotation`, `previous`, `next`, `picker`, `dot`, `thumbnail`, `status`. |
| `ColorPicker` | After ReUI's: a saturation and brightness area, hue and alpha Sliders, an eyedropper where the browser has one (`ColorPicker.Eyedrop`, `canEyedrop`), text in hex, rgb, hsl or oklch, and `presets` as a radio group of swatches. The color, its format and a draft being typed are `ColorPicker.Model` (`init({ id, color?, format? })`), folded with `ColorPicker.update`: keys and drags reach `update` as what was pressed, so fast keys each step from the last color. Drawn with `ColorPicker.view({ model, onMessage, label, presets?, alpha?, eyedropper?, labels?, disabled?, style?, slider? }, h)`; `ColorPicker.popover(options, h)` is a Popover's `toView` that draws it behind a swatch. `ColorPicker.color('#3b82f6')` reads a literal in code (it throws on a typo); `format`, `parse` (an `Option`) and `toOklch` are pure. | `size`. Its Sliders take `Recipes.Slider({ track: 'paint', label: 'hidden' })`. Slots `root`, `label`, `area`, `areaThumb`, `controls`, `eyedropper`, `channels`, `channel`, `swatch`, `fields`, `format`, `input`, `presets`, `preset`, `picker`, `trigger`, `value`. |
| `Command` | `{ id, label, placeholder?, groups: { heading?, items: { value, label, description?, keywords?, shortcut?, icon?, opensPage?, disabled? }[] }[], query, onQuery, active, onActive, onRun, empty?, loading?, page?, hints?, kbd? }`, a `shortcut` being a tuple of keys (`['⌘', 'K']`) drawn as Kbd with `kbd`. `page: { trail, onBack }` draws the pages stepped into as crumbs before the field, and Backspace in an empty field sends `onBack`; a row with `opensPage` has a chevron. `loading` says it and marks the list `aria-busy`, its rows still shown; `hints` are a footer of keys. `Command.hotkey(message)` is ⌘K or Ctrl+K anywhere, for an application to lift with `Subscription.persistentEntry` and open its Dialog on; `Command.filtered(groups, query)` is what a query leaves. shadcn's Command and Fluid's CommandMenu: the field points at the highlighted row through `aria-activedescendant`, ↑ and ↓ wrap through enabled rows, Enter runs the highlighted one; rows never re-sort, and a filtered-away highlight moves to the first enabled row. The list stands in a `frame` beside its bar, which `Command.overlayBars` drives (see [Overlay scroll bars](#overlay-scroll-bars)). A shortcut reads left to right on a right-to-left page. | `frame`: `card` (default) or `bare`, for inside a dialog. Slots `root`, `search`, `crumbs`, `crumb`, `input`, `list`, `group`, `heading`, `item`, `icon`, `text`, `label`, `description`, `shortcut`, `chevron`, `status`, `empty`, `loading`, `frame`, `bar`, `thumb`, `footer`, `hint`. |
| `Calendar` | One date system, inline: `Calendar.Selection` is `Single`, `Range` or `Multiple`, owned by the application (`Calendar.empty(mode)`, fold each `SelectedDate` through `Calendar.picked`, `Calendar.isComplete` says when a picker may close). Spread `Calendar.inputs(selection, mixins, { h })` into upstream `Calendar.view`'s inputs: its `toView` (`Calendar.toView(selection, mixins, { h })`) marks each chosen day `aria-selected`, a range's ends `data-selected` with `data-range-start`/`data-range-end` and every day between `data-in-range`, and its `maybeSelectedDate` (`Calendar.selectedDate(selection)`, a Single selection's day) agrees with it. The grid of a Range or Multiple selection is `aria-multiselectable`. A selection in a popover is the DatePicker's. Options, the fourth argument of `toView`, `inputs` and `resolve` (`CalendarOptions`): `weekNumbers`, `caption: 'label'` or `dropdowns: { model, onShow }` (month and year selects; answer `onShow` with `Calendar.show`), `paging` with `Calendar.alongside(model, other, offset)` for two months side by side, and `preview: { date, onPreview }` for a range under the pointer. `ResolvedDays`' paging buttons are `Option`s and its heading is a `caption` (`Grid`, `Label`, `Dropdowns`). Presets: `Calendar.lastDays`, `nextDays`, `monthOf`, `day`, drawn by `Calendar.presetsView`. `Calendar.localeOf('de-DE')` reads upstream's `locale` from Intl. | `size` (the Calendar's); `outside`: `shown` (default), `hidden`. Slots `CalendarSlots`. |
| `Empty` | `{ title, description?, icon?, action? }`. The title takes the `subtitle` role; the icon is `aria-hidden`. | `media`: `icon` (default), `illustration`; `frame`: `none` (default), `dashed`, `filled`; `tone`: `neutral` (default), `danger`; `size`: `compact`, `comfortable` (default). Slots `root`, `icon`, `title`, `description`, `action`. |
| `HoverCard` (recipe) | Styles `@foldkit/ui`'s HoverIntent (`HoverIntentSlots`): a trigger read as a link, a raised panel fading in on the fast tier as it is drawn. Place the panel with `HoverIntent.toView`'s `anchored`, which shows it in the top layer with an `arrow`; the open and close delays are HoverIntent's (200ms and 300ms by default). | No axis. Slots `trigger`, `panel`, `arrow`. |
| `Icon` | `{ content, label? }`. A `label` is `role="img"`; without one the glyph is `aria-hidden`. | `size`: `sm`, `md`, `lg` on the type scale; none (the default) stands on the size ladder, 16px or 14px compact. Slot `glyph`. |
| `InputCopy` | A read-only value with a copy button, Zag's clipboard: `InputCopy.view({ id, label, value, copied, onCopy, copyLabel?, copiedLabel?, style? }, h)`. The view is stateless: answer `onCopy` with the `InputCopy.Copy({ text })` Command, which yields `foldkit-primitives/dom`'s `ClipboardMessage` (`Copied` or `CopyFailed`, never a throw); `copied` is the application's, and `InputCopy.Model` keeps it: `InputCopy.init({ resetAfter? })` (default 2000ms), folded with `InputCopy.update`, where `Copied` on `ClipboardMessage.Copied` shows it copied and starts the `Reset` Command that sets it back unless a later copy came first; pass `model.copied`. The button is named `Copy <label>`; copied, it reads `Copied` and a polite status region says so. | No axis. Slots `root`, `label`, `group`, `input`, `button`, `status`. |
| `Item` | The row primitive: `{ content?, media?, title?, description?, actions?, press?, label?, selected?, disabled? }`; `content` follows the title and description. `press` is `{ onClick }` or `{ href }`, one control stretched over the row (`overlay`, as a Card's) and named by `label` or the title, `actions` staying pressable above it; `selected` is `aria-pressed` or `aria-current`. `Item.group({ items: (ItemView & { key })[], label?, style?, itemStyle? })` is a list of them. Field is for form controls. | `variant`: `plain` (default), `outline`, `muted`; `density`: `comfortable` (default), `compact`; `media`: `plain` (default), `icon`, `image`. Slots `root`, `media`, `content`, `title`, `description`, `actions`, `overlay`. `Recipes.ItemGroup({ layout: 'divided' \| 'separated' })` over `ItemGroupSlots` (`root`, `row`). |
| `CheckboxGroup` | `{ id, legend, options: { value, label, description?, disabled? }[], checked, onToggle, error?, selectAll? }`; `toggled(checked, value)` is one option's transition, `coverage(options, checked)` is `none` \| `some` \| `all` (a disabled option counts for neither), and `setEnabled(options, checked, on)` is every enabled option or none, a disabled one keeping its state in `checked`. `selectAll: { label, onSet }` draws a first row checked, `mixed` or not by `coverage`, whose press sends `onSet` with `setEnabled`'s values. A `fieldset` named by its `legend`, each option the APG's checkbox (`role="checkbox"`) named by a `label` for it, so a press on the words toggles it. `error` is shown under the options and the group is `aria-invalid`, described by it. | `variant`: `plain` (default), `list` (checked rows fill, and merge where they stand together; a vertical list has no gap, or the block would split). `orientation`: `vertical` (default), `horizontal` (a wrapping row). The checkbox sits on the label's row, so a description does not pull it down. Slots `root`, `legend`, `options`, `option`, `checkbox`, `label`, `description`, `error`. |
| `CodeBlock` | `{ code, tokens?, language?, title?, lineNumbers?, copy? }`; `tokens` are a tokenizer's `{ from, to, kind }` (`foldkit-richtext-code`, `-shiki`); `copy.onCopy(code)` sends a Message, so run `copyText` from `foldkit-primitives`. | No axis; colors kinds from the theme's `syntax` group. Slots `root`, `header`, `title`, `copy`, `body`, `code`, `line`, `token`. |
| `Kbd` | `{ key }`. Names the key. `Kbd.combo({ keys, joiner? }, h)` draws several in one `kbd`, with an optional joiner between them. | No axis. Slots `key`, `combo`, `joiner`. |
| `Label` | `{ for, text }`. `for` is the control's id. | No axis. Slot `label`. |
| `Menubar` | A row of `@foldkit/ui` Menus, shadcn's and the APG's menubar: `Menubar.view({ label, model, menus, onMessage, direction?, style?, menuMixins }, h)`, each menu's `{ label, rows, isRowDisabled? }` taking a Menu's rows (none opening a submenu), its Model (`Menubar.init(ids, { isAnimated?, isModal? })`) folded with `Menubar.update`, whose `Selected` OutMessage names the menu and the row. One trigger is the tab stop; ArrowLeft/ArrowRight (Home/End while all are shut) move it, swapped under `direction: 'rtl'` (drawn as the bar's `dir`), and with a menu open they open the next on its first row. While one is open, pointing at another opens it, and opening any shuts the rest. `Recipes.MenubarMenu` is the Menu recipe with a bar's flat triggers. | No axis. Slots `bar`, `menu`; each menu's are `MenuSlots`. |
| `Meter` | `@foldkit/ui`'s Meter: `Meter.view({ id, label, value, min?, max?, low?, high?, optimum?, valueText?, style? }, h)` draws a `meter` named by its label. The root says how good the value is as `data-level` (`good`, `fair`, `poor`), as the HTML meter judges it; `Meter.levelOf` is that judgment. A measurement, where `Progress` is work. | No axis; the fill takes success, warning or error by level. Slots `root`, `label`, `track`, `fill`. |
| `Nav` | Two layers. `Nav.toView(mixins, { h }, label, draw?)` styles `@foldkit/ui`'s stateless Nav, drawing `nav > ul > li > a` with the current link `aria-current="page"`. `Nav.view({ model, entries, label, onMessage, orientation?, direction?, mixins? }, h)` is a navigation menu: links and triggers whose panels of link columns (`groups` of `{ label, href, description?, current? }`) show in the top layer, with the APG's disclosure-navigation keys (Escape, ArrowDown into a panel, the arrows, Home and End along the row; a press outside and focus leaving close it); which panel shows is `Nav.init(id)`'s Model, folded with `Nav.update`. `Nav.fluid` beside the style glides a line to the current link and a faint pill to the one the pointer nears. | `indicator`: `underline` (default), `pill`; `orientation: 'vertical'` is a column whose panels open beside it. Slots `nav`, `list`, `item`, `link`, `trigger`, `chevron`, `panel`, `groups`, `group`, `heading`, `links`, `panelItem`, `panelLink`, `title`, `description`, `indicator`, `highlight`. |
| `Menu` | One menu, opened three ways: `Menu.init(id, rows, { isAnimated?, isModal? })` (a row with `items` hosts a submenu, one level deep; `isAnimated` gives the menu's and its submenus' panels upstream's transition marks, for the recipe's fade, and `isModal` makes the rest of the page inert while the menu is open), folded with `Menu.update`, drawn with `Menu.view({ model, rows, buttonContent, onMessage, opensAt?, direction?, isRowDisabled?, mixins, submenuMixins? }, h)`, the style being one of the `mixins` (`[MenuStyle.mixin]`). By a button (`opensAt` unset); at a point (`opensAt: 'point'`, with `Menu.target(onMessage, h)` on the area: a right press records its point and the `contextmenu` after it opens the menu there; a finger or a pen held there `Menu.HOLD_MS`, 500ms, opens it too, as iOS fires no `contextmenu`, while one that moves 10px is a scroll; give the area `-webkit-touch-callout: none` and `user-select: none`, or iOS shows its own callout over it). A row is an `ItemRow` (`{ label }`), a `CheckRow` (`check: 'checkbox' \| 'radio'`, `checked`: `menuitemcheckbox` or `menuitemradio` with `aria-checked`; choosing it sends `Selected` and leaves the menu open, the application keeping `checked`, a radio row's group being the rows of its `group`), or a `SubmenuRow` (`items`). Any row may name a `group` (rows next to each other with one group stand under its heading, a separator between groups), a `shortcut` (keys drawn at the row's end as Kbd with the view's `kbd`, named in `aria-keyshortcuts`; the menu binds nothing) and `tone: 'destructive'` (`data-tone`). A submenu's row is a `menuitem` with `aria-haspopup="menu"` and `aria-expanded`; ArrowRight, Enter or Space opens it on its first row, ArrowLeft or Escape closes it back to the row (under `direction: 'rtl'`, drawn as the root's `dir`, the submenu opens on the left, its chevron points there, and the arrows swap), a pointer resting 150ms opens it, and choosing a leaf closes everything. `Selected` names the value and the submenu it came from. Pass `Menu.fluid` beside the style (in `submenuMixins`, not `mixins`, where rows open submenus). Its panels, submenus included, draw in the top layer. A `@foldkit/ui` Menu the application folds itself, for typed items or groups, is drawn through the panel adapter instead, and opens at a point with `Menu.drawAtPoint` and `Menu.pointTarget` (see [Why some components needed a fork](#why-some-components-needed-a-fork)). | No axis. Slots `MenuSlots`. |
| `NumberField` | `{ id, label, description?, value, onChange, min?, max?, step?, page?, format?, disabled? }`; `NumberField.settled(value, bounds)` clamps a value onto its step. The APG's editable spinbutton: an input with `role="spinbutton"` that the arrows, PageUp and PageDown, Home and End step, a typed number committing on change, between steppers out of the tab order that disable at their bound. | No axis. Slots `root`, `label`, `group`, `input`, `decrement`, `increment`, `description`. |
| `OtpField` | `{ label, value, onChange, length?, pattern?, groups?, disabled? }`; `OtpField.kept(text, length, pattern)` filters a code. shadcn's input-otp: one real input (`autocomplete="one-time-code"`, paste and Backspace the browser's) over cells that mirror it, the next cell marked `data-next` for its caret. | No axis. Slots `root`, `input`, `group`, `cell`, `separator`. |
| `Pagination` | `{ page, pageCount, onPage, label?, siblings?, boundaries?, numbered?, ends?, range? }`. Fewer than two pages draws nothing. `Pagination.itemsOf(page, pageCount, window?)` is the stops; `Pagination.summaryOf(page, { total, perPage, text? })` is `"1–10 of 97"`, drawn with `range`; `range.choose: { sizes, onPerPage, label? }` adds a rows-per-page select. `numbered: false` leaves previous and next alone; `ends` draws first and last. The current stop holds ` / 12` (`pageCount`, hidden from assistive technology). | `compact`: `narrow` (default, a window under 30rem), `always`, `never`: only the current number shows, with its total. The current stop reads `aria-current`. Slots `root`, `summary`, `perPage`, `perPageSelect`, `first`, `prev`, `next`, `last`, `page`, `pageCount`, `ellipsis`. |
| `PasswordInput` | `PasswordInput.view({ id, label, value, onInput, visible, onToggle, autocomplete?, toggleLabel?, description?, invalid?, disabled? }, h)`: a password field whose toggle button (`aria-pressed`, `aria-controls`, one fixed name) shows it as text. `autocomplete` is `current-password` (default) or `new-password`; spellcheck and autocorrect stay off. `strength` is a `Meter` view's options, drawn under the field; `requirements` are `{ label, met }[]` (`PasswordRequirement`), listed and each read as met or not (`requirementStates`); `capsLock: { on, onKey }` says Caps Lock is on, politely, `onKey` given `capsLockOf(key, modifiers)` for each key (an `Option`: none for a key that says nothing of it). The app owns the text, the flag and the Caps Lock reading. | `size` (`sm`, `md`, `lg`). Input's pieces in InputGroup's box; the eye is `Icons.glyph` by `aria-pressed`. Slots `root`, `label`, `group`, `input`, `toggle`, `description`, `strength`, `requirements`, `requirement`, `requirementState`, `capsLock`. |
| `Progress` | `@foldkit/ui`'s Progress: `Progress.view({ id, label, value, min?, max?, valueText?, style? }, h)` draws a `progressbar` named by its label. `value` is an `Option`; none is indeterminate, and the bar's fill sweeps toward the inline end, leftward right to left. The root carries the share done as `--fk-progress`. `showValue` draws the value (`valueText`, else a percentage) at the end of a bar's label line and inside a ring. A `value` given as `ProgressSection`s is one stacked bar of toned parts, read aloud as their sum; `buffer` draws how far the work could go behind the fill; `segments` cuts the track into steps. | `shape`: `bar` (default) or `ring`, Circular Progress; `tone`: `accent`, `neutral`, `success`, `warning`, `error`, `info` (Meter's tokens); `stripes`: `none` (default), `still`, `moving` (travel-aware); `size`: `sm`, `md`, `lg`. Slots `root`, `label`, `track`, `indicator`. |
| `Rating` | `Rating.view({ id, label, value, onChange, max?, starLabel?, readOnly?, disabled?, style? }, h)`: a `radiogroup` of native radios named by its label, one per star under one name, so the browser's arrows move the choice and a form submits it. `value` is an `Option`; none is unrated. Read-only, it is one `img` whose name says the rating. `precision: 0.5` draws two radios a star; a read-only value of any fraction fills its last star part way. `onClear` is sent by a press on the star already chosen; `showValue` shows `starLabel` of the rating beside the stars, so a word per value is one function. Home and End go to the ends through the `Rating.Ends` Mount (resolve it in a Scene test with a choice's Message). A read-only rating (`readOnly: true`) takes no `onChange`. | `tone`: `warning` (default, gold), `accent` or `error`; `glyph`: `star` (default), `heart`, `circle`, or `--_fk-rating-shape`; `size`: `sm`, `md`, `lg`. Stars are a CSS `clip-path` on each radio's `::before`; pointing previews the rating. Slots `root`, `label`, `star`. |
| `ScrollArea` | `{ content }`. The height that makes it scroll is the caller's mixin, on `viewport` or `root`; a width goes on `root`. The viewport is tabbable. A bar per axis is drawn beside it; `mixins: ScrollArea.overlayBars` lays them over the viewport's edge, driven by `ScrollBars` (4px thumb, 6px hovered, fades when idle; native on a coarse pointer). | `orientation`: `vertical` (default), `horizontal`, `both`; the first two fade toward an edge with more and draw a hairline there. Slots `root`, `viewport`, `bar`, `thumb`. |
| `Resizable` | `Resizable.Model` (`init(share)`), its `Message` and `update(model, message, bounds)`, which the application keeps and folds; `Resizable.view({ model, onMessage, label, first, second, orientation?, direction?, min?, max?, step? })`. shadcn's Resizable and the APG's window splitter: the handle is a `separator` with its value, stepped by the arrows and sent to the bounds by Home and End; a drag follows the `Move` Mount from where it began over the group the `Resize` Mount measured. Under `direction: 'rtl'`, drawn as the root's `dir`, the first panel is on the right, so ArrowLeft and a drag to the left grow it. `collapsible: 'first' | 'second'` (with `collapsedTo`) collapses that panel on Enter or a double-click and puts it back where it was, easing there while a drag follows the pointer at once; pass the same bounds to `update` and the view. A split fills its panel, so splits nest either way. | `handle`: `line` (default; a thicker accent line under the pointer) or `grip` (a pill of dots); `data-orientation` lays it out. Slots `root`, `first`, `handle`, `second`. |
| `Separator` | `{ orientation?, label?, decorative? }`, horizontal by default. A `label` sits between two drawn rules and is read as text; `decorative` is `role="none"`. A vertical rule needs its container to set the cross size. | `orientation`: `horizontal` (default), `vertical`; `line`: `solid`, `dashed`, `dotted`; `thickness`: `thin`, `thick`; `spacing`: `none`, `sm`, `md`, `lg`; `inset`: `none`, `sm`, `md`. The line is a border in `outline.default`, which a dark page shows. Slots `rule`, `root`, `label`. |
| `Sheet` | A Dialog its handle drags, vaul's Drawer: `Sheet.init({ id, side?, points?, opensAt?, dismissible?, isAnimated? })`, folded with `Sheet.update` and opened with `Sheet.open` and `Sheet.close` (each also reporting the Dialog's `Opened` or `Closed`), drawn with `Sheet.view({ model, onMessage, mixins, hasDescription?, covered?, scalesPage?, draw }, h)`, `draw` laying out `DialogSlots`' bundles with `h.div(sheet.handle)` in the panel. The panel stands on `side`'s edge (`data-side`); a drag of the handle follows the pointer and settles at the nearest of `points` (the share of the panel shown, ascending), or, flicked or dragged far enough past the first, closes it, unless `dismissible: false`. The Dialog keeps focus, Escape and scroll lock. `Dialog.keyboard` among the mixins keeps a sheet or dialog that holds a field above the on-screen keyboard. `scalesPage` with `Recipes.sheetPage` on the page beside the sheet, never around it, steps the page back while it is open. | `Recipes.Sheet`: `size`: `sm`, `md` (default), `lg`, `full`; `handle`: `bar` (default) or `none`. Slots are `DialogSlots`. |
| `Sidebar` | shadcn's sidebar with Fluid's collapse, keeping a Model: `Sidebar.init({ id, rows, open?, collapsed?, side? })` (a Tooltip per row id, and the phone's Sheet), folded with `Sidebar.update`, drawn with `Sidebar.view({ model, onMessage, label, groups, header?, footer?, direction?, collapse?, style?, mixins?, tooltip?, sheet? }, h)`. `groups` are `{ id, title?, collapsible?, rows }`, a row a `SidebarLink` (`{ id, label, href, current?, icon?, badge? }`) or a `SidebarBranch` of nested links (`items`). Groups and branches open like an accordion's, several at once; the current page is `aria-current` and `Sidebar.fluid` glides a marker to it. `collapse: 'offcanvas'` (default) takes the whole column off the page; `'icons'` leaves a rail of icons named in Tooltips (`tooltip`, a Tooltip style). With `sheet` (a Sheet style), an opener shows it in a Sheet on a phone. Shut groups and a collapsed column stay drawn and `inert`. A resizable width is a Resizable whose `first` is the sidebar with `width: 'fill'`. | `width: 'fill'`. Slots `root`, `header`, `footer`, `opener`, `title`, `toggle`, `nav`, `section`, `heading`, `trigger`, `chevron`, `links`, `item`, `branch`, `link`, `icon`, `label`, `badge`, `tip`, `indicator`, `highlight`. |
| `Skeleton` | `{ label? }`, `role="status"`, a bar a film of the text. `Skeleton.lines({ lines, label? })`, `avatarRow`, `card` and `tableRow({ columns })` draw the shapes content takes, in a `group`. | `shape`: `bar` (default), `circle`; `animation`: `pulse` (default), `shimmer`, `none`. Slots `bar`, `group`. |
| `Slider` | `Slider.view({ id, label, value, onChange, min?, max?, step?, format?, marks?, showValue?, name?, disabled?, style? }, h)`, where `value` is a number or a `{ low, high }` range and `onChange` is handed the same kind. Native `input type="range"` thumbs, so drag, keys, right to left and the form value are the browser's. One number is one thumb across the track, named by the label; a press anywhere on the track moves it. A range is a `group` named by its label holding two thumbs named by `thumbLabels` (default `Minimum` and `Maximum`), each bounded by the other (the low one's `max` is the high value), so the browser stops a drag or a key at the other thumb; `Slider.moved(range, 'low' \| 'high', value, bounds)` snaps, bounds and orders a range, and returns the same range when nothing changed. `marks` are values dotted on the track (`data-filled` where the fill covers them) and `showValue` draws each value, both hidden from assistive technology, which hears `aria-valuetext`. `@foldkit/ui`'s Slider is not adapted: draw its Submodel with Slots of your own. `orientation: 'vertical'` stands it upright; `ticks` dots every step; a mark may be `{ value, label }` (`SliderMark`), its words under the track. | `tone`: `accent` (default) or `neutral`; `size`: `sm`, `md` (default), `lg`, the thumb's edge; `track`: `thick` (default; the fill reaches each thumb's far edge, Fluid's look), `thin` or `paint` (a track a holder paints, as the color picker's); `value`: `above` (default), `inside` (widens the thumb into a pill; best at `md` or `lg`) or `end` (at the end of the label's row); `label`: `shown` (default) or `hidden`. Slots `root`, `label`, `control`, `track`, `fill`, `mark`, `value`, `thumb`. |
| `Spinner` | `{ label?, showLabel? }`. `role="status"`; `showLabel` draws the label beside the wheel. A turn is about 720ms times `travel`. | `kind`: `ring` (default), `dots`, `bars`, `pulse`, `orbit`; `size`: `sm`, `md` (default), `lg`; `tone`: `accent` (default), `neutral`, `current`. Slots `wheel`, `part`, `root`, `text`. |
| `Steps` | `Steps.view({ label, steps: { title, description?, icon?, content? }[], current, onSelect?, style? }, h)`: a stepper, an ordered list named by `label`. The step at `current` is `aria-current="step"`, those before it `data-state="complete"` (a check replaces the number), those after `upcoming`. An `icon` stands in the marker for its number; `content` follows the step, beside the line in a vertical stepper. With `onSelect(index)`, completed steps are buttons for going back; steps ahead never are. The application owns `current`. `progress` (0 to 1) fills the connector after the current step when the recipe's connector is a progress bar. | `orientation`: `horizontal` (default) or `vertical`; `size`: `xs`, `sm`, `md`, `lg` (the Avatar's sizes; unset, 1.75rem); `marker`: `number` or `dot`; `connector`: `line` or `progress`. Slots `root`, `item`, `step`, `trigger`, `marker`, `text`, `title`, `description`, `content`, `connector`. |
| `Table` | The presentational table: `{ columns: { header, value, numeric?, sortKey? }[], rows, rowKey?, caption?, fluid?, sort?, selection?, expansion?, empty? }`. A column with a `sortKey` heads with a button that sends `sort.onSort(column)`, and the sorted column carries `aria-sort`; `Table.nextSort(sort, column)` cycles ascending, descending and none. `selection` puts a checkbox on every row and one in the heading, mixed while only some are chosen; `expansion` opens a row's detail in a row below it (`aria-expanded`, `aria-controls`); `empty` stands across the table while there are no rows (an `Empty.view`). The sort, the chosen and the open rows are the application's. It stands in a `frame`, which scrolls sideways when the table is wider than the screen (under a `static` header; a `sticky` one sticks to the application's scroller, which scrolls it). With `fluid`, one highlight behind the body rows follows the pointer, skipping detail and empty rows. Filtering, column reorder and resize, and virtualized rows stay with `foldkit-data-grid`. | `rows`: `lined`, `striped`, `plain`; `density`: `compact`, `regular`, `comfortable` (none set follows the region); `header`: `static`, `sticky`. Slots `frame`, `highlight` (with `fluid`), `root`, `caption`, `head`, `headerRow`, `headerCell`, `sortButton`, `sortIcon`, `body`, `row`, `cell`, `controlCell`, `checkboxLabel`, `expandButton`, `expandIcon`, `detailRow`, `detailCell`, `emptyRow`, `emptyCell`. |
| `TagsInput` | Zag's tags input, a small Model of its own: `TagsInput.init({ id, tags?, delimiter?, max? })`, folded with `TagsInput.update` (which returns a focus Command), drawn with `TagsInput.view({ model, onMessage, label, placeholder?, disabled? }, h)`. The tags are a list of chips named by the label, each with a `Remove <tag>` button, then a text input. Enter or the delimiter (default `,`) adds the draft split at the delimiter and trimmed, refusing empty and repeated parts, and parts past `max`: a refusal (`TagsInput.Refusal`: `Repeat`, `Empty`, `Full`) is said in a polite `message` (worded by `refusalText`) and shakes the field once, the shake travel-aware; Backspace on an empty draft removes the last tag; a removal returns focus to the input. Keys reach `update`, which decides from its own draft. | No axis; `data-disabled` on `control`. Slots `root`, `label`, `control`, `list`, `tag`, `remove`, `input`, `message`. |
| `Toast` | A stack of toasts, Sonner's: `Toast.init(id, { position?, direction?, duration?, max?, threshold? })`, folded with `Toast.update`, whose `Acted` OutMessage names a pressed action; `Toast.show(model, { type?, title, description?, action?, duration? })` returns the stack and the new toast's `id`, `Toast.settle(model, id, input)` turns a toast (a `loading` one, a promise's) into its outcome, and `Toast.dismiss(model, id)` takes it away; draw it with `Toast.view({ model, onMessage, label?, closeLabel?, expand?, icons?, style? }, h)`. The newest stand in front, spread out while the pointer or focus holds the stack, at most `max` (3) showing; a held stack or a hidden page pauses every countdown, keeping the time left; a swipe toward the edge past `threshold` dismisses one. A toast is spoken in a polite region, an error in an assertive one. A promise toast is `show` with `type: 'loading'`, the work run as a Command, and `settle` on the toast's `id` when its Message comes back. `ToastView` is the fork for toasts that carry their own payload. | `tone`: `plain` (default) or `rich` (each type on its tint). Slots `container`, `entry`, `list`, `icon`, `body`, `title`, `description`, `action`, `close`, `status`, `alert`. |
| `TreeView` | The APG's and Zag's tree view, a small Model of its own: `TreeView.init({ id, open?, checked? })`, folded with `TreeView.update(nodes, { checkable? })` (curried over the tree, flattened once), drawn with `TreeView.view({ label, model, nodes, onMessage, direction?, style?, mixins? }, h)` over nodes `{ id, label, children?, disabled?, icon?, openIcon? }`. `checkable` (on the view and `update`) gives each row a box: the Model's `checked` holds the leaves, a branch reads checked, mixed or not from them (`TreeView.checksOf`), and Space checks the current row in `update`. One tab stop; Up/Down move through the rows showing, stepping over shut and disabled ones; Right opens or steps in, Left shuts or steps out (swapped under `direction: 'rtl'`, drawn as the root's `dir`); Home/End; a character moves to the next showing row that starts with it; Enter, Space or a click chooses a row and opens or shuts a branch. Keys reach `update`, which decides from its own Model and sends a focus Command. Each item carries `--fk-tree-level`; a shut group stays drawn and `inert`. | `guides`: `none` (default) or `lines`, a guide down each open branch; `data-state` on a branch `item` and its `group`. Slots `root`, `item`, `row`, `chevron`, `checkbox`, `icon`, `label`, `group`. |
| `Typography` | `{ level, text }`. The level chooses the element (`h1`–`h4`, `lead`, `body`, `small`, `muted`, `quote`, `code`, and the interface roles `display`, `title`, `subtitle`, `caption`, `micro` as paragraphs). | `level`, same set; a role is its size and leading on the size ladder. Defaults to `body`. Slot `text`. |
| `VirtualList` | `@foldkit/ui`'s virtual list: `VirtualList.view({ model, items, itemToKey, itemToView, onMessage, overscan?, itemToRowHeightPx? \| dynamicRowHeights?, style?, mixins? }, h)` draws only the rows in view. Its Model is upstream's (`@foldkit/ui/virtualList`'s `init`), kept by the application and folded with that module's `update`. A row's mixins may style it, not handle its events, since it is drawn inside the list's submodel. A bar is drawn beside the list; `mixins: VirtualList.overlayBars` lays it over the list. | No axis. Slots `root` (the box it scrolls within: 18rem tall, as wide as its container, 20rem where the container takes its width from it), `row`, `bar`, `thumb`. |
| `AngleSlider` | After Zag's: a dial in degrees, 0 at the top and clockwise. `AngleSlider.init({ id, value? })` is the angle and the drag, folded with `AngleSlider.update(layout)`, where `layout` (`step`, `largeStep`, `marks`, `restrictToMarks`) is the object the view spreads in too: `AngleSlider.view({ ...layout, model, onMessage, label, name?, format?, valueText?, showValue?, disabled?, readOnly?, invalid?, style? }, h)`. A press or drag on the dial sends `Pointed` and `Released`; the APG's slider keys reach `update` as what was pressed, and go round past 0. A `name` draws a hidden input for a form. | `tone`, `track` (`ring`, `plain`, `disc`), `value` (`inside`, `below`), `size`. Slots `root`, `label`, `control`, `needle`, `thumb`, `markers`, `marker`, `markerLabel`, `value`, `input`. |
| `CascadeSelect` | After Zag's: one value chosen as a path of ids through nested options. `CascadeSelect.init({ id })` holds the chosen path and the one the keys are on while open, folded with `CascadeSelect.update(config)` (`config` is `{ nodes, parents?, closeOnSelect?, loop? }`, the same object the view takes): `CascadeSelect.view({ model, config, onMessage, label, placeholder?, levels?, layout?, expandOn?, clearable?, separator?, name?, disabled?, invalid?, direction?, style? }, h)`. The trigger is a combobox opening a top-layer APG tree, a column per level or one level at a time (`layout: 'drill'`; the columns also drill in on their own when they would not fit the window, measured as the popup opens); the arrows move within and between levels (swapped right to left), Home, End and a letter jump, Enter and Space choose, and only an option without children is chosen unless `parents` allows any. | `size`, `trigger` (`outline`, `filled`, `ghost`), `width` (`trigger`, `auto`). Slots `root`, `trigger`, `valueText`, `chevron`, `clear`, `input`, `layer`, `backdrop`, `panel`, `column`, `heading`, `back`, `item`, `itemText`, `branch`. |
| `Chart` | After shadcn's Chart: `Chart.view({ id, label, kind: 'bar' \| 'line' \| 'area', categories, series: [{ name, values, color? }], model, onMessage, description?, format?, legend?, table?, categoryLabel?, style? }, h)`, or `kind: 'donut'` with `slices: [{ name, value, color? }]` and `totalLabel?`. The value axis's ticks are round and reach both ends, zero included; the plot is drawn in percentages, so it fills its container's width with nothing measured and renders the same on a server. `Chart.Model` (`Chart.init()`, folded with `Chart.update`) holds the lit point: the pointer lights a category's band and its tooltip, and the plot is a tab stop whose arrows, Home and End step through the points while a polite status says each. The drawing is hidden from assistive technology, which reads a data table, visually hidden unless `table: 'shown'`. Series take `chart-1` to `chart-5` in order, or the `color` they name; a sixth series throws. | `height` (`sm`, `md`, `lg`), `grid` (`lines`, `zero`), `indicator` (`dot`, `line`). Slots `root`, `title`, `description`, `legend`, `legendItem`, `swatch`, `body`, `yAxis`, `xAxis`, `yTick`, `xTick`, `plot`, `canvas`, `paths`, `grid`, `cursor`, `bar`, `line`, `area`, `dot`, `slice`, `band`, `center`, `centerValue`, `centerLabel`, `tooltip` and its parts, `status`, `table` and its parts. |
| `ChatMessage` | One message of a chat: `ChatMessage.view({ from, content, author?, avatar?, time?, status?, onRetry?, actions?, pinActions?, streaming?, style? }, h)`, `from` being `user`, `assistant` or `system`. The user's sits at the end in a bubble, an answer as text at the start. `status` is `sending`, `sent` or `failed`, which draws a retry; `actions` are named buttons (`{ key, label, onClick, icon?, pressed?, disabled? }`) shown on hover and focus unless pinned. A streamed answer is the same message drawn again with more `content` and `streaming: true` (`aria-busy`); its body wraps with `text-wrap: wrap`, so no earlier word moves line. `ChatMessage.group({ items, continues?, style?, messageStyle? }, h)` draws a run, a sender's following messages continued. Markdown is the application's to render (`foldkit-richtext-markdown`'s `parse`, `foldkit-richtext-dom/view`'s `renderDocument`). | `layout` (`chat`, `thread`), `bubble` (`muted`, `accent`), `content` (`text`, `markdown`). `Recipes.ChatMessageGroup` for the group. Slots `root`, `avatar`, `main`, `header`, `author`, `time`, `bubble`, `body`, `footer`, `status`, `retry`, `actions`, `action`. |
| `FloatingPanel` | After Zag's: a non-modal window. `FloatingPanel.init({ id, rect, open? })` holds its rect, stage and a drag, folded with `FloatingPanel.update(limits)` (`min`, `max`, `grid`, `overflow`); `FloatingPanel.open(model, { opener })` focuses it and `close` gives focus back. `FloatingPanel.view({ model, onMessage, title, content, order?, draggable?, resizable?, closeOnEscape?, step?, direction?, labels?, style? }, h)`: the drag trigger moves it and eight edges resize it, kept within the viewport; the arrows move it from the drag trigger and resize it from the bottom-end corner; minimize, maximize, restore and close. A press or focus inside returns the `Raised` OutMessage, which the application folds into the `order` its panels stack by with `FloatingPanel.raise(order, id)`. | `header`. Slots `root`, `boundary`, `panel`, `header`, `dragTrigger`, `title`, `controls`, `minimize`, `maximize`, `restore`, `close`, `body`, `handle`. |
| `ImageCropper` | After Zag's: the image fitted in a viewport, a selection that a drag moves (`Move`) and eight handles resize, zoom by a Slider, the wheel and `+`/`-` with the selection kept where it is on screen, a pan of the zoomed image, quarter turns, an aspect lock and a round crop. `ImageCropper.init({ id, aspect?, shape?, crop?, min?, maxZoom? })` holds the crop, in the turned image's pixels, folded with `ImageCropper.update`; keys (arrows, Shift ×10, Alt to resize) step by screen pixels. Drawn with `ImageCropper.view({ model, onMessage, label, src, crossOrigin?, controls?, labels?, disabled?, style?, slider? }, h)`. `ImageCropper.crop(model)` is the crop in whole pixels (an `Option`); `RequestedExport({ type, quality })` returns the `Export` Command, answered by `Exported({ url, width, height })` or `FailedExport`. | `guides`, `handles` (`all`, `corners`), `viewport` (`landscape`, `wide`, `square`). Its zoom takes `Recipes.Slider({ label: 'hidden' })`. Slots `root`, `label`, `viewport`, `stage`, `pan`, `image`, `selection`, `guides`, `handle`, `controls`, `zoom`, `rotate`, `reset`. |
| `Marquee` | After Zag's: content that scrolls on without a seam. `Marquee.init({ id })` holds what it measured and whether it is paused, folded with `Marquee.update`; `Marquee.view({ model, onMessage, label, items, side?, speed?, autoFill?, repeat?, delay?, loopCount?, style? }, h)` measures its content (`Resize`) and draws copies to fill the viewport, `inert` after the first. A pointer, focus or its pause press (WCAG 2.2.2) holds it; `Marquee.Message.Paused()` holds it from outside. Its motion is CSS, and under reduced motion the viewport scrolls instead. | `spacing`, `edges` (`fade`, `none`). Slots `root`, `viewport`, `content`, `item`, `pause`. |
| `MessageScroller` | A conversation's log that follows the newest message while the reader is at the end and stops when they scroll up. `MessageScroller.init({ id })` holds only whether it follows and how many arrived unseen; the scroll position is the browser's, read by its `FollowEnd` Mount. Fold `MessageScroller.update`, and send `Message.Appended({ count })` when your update appends messages (not when it loads older ones, which it holds in place). `MessageScroller.view({ model, label, content, onMessage, jumpLabel?, unseenLabel?, style?, areaStyle?, areaMixins? }, h)` draws a named `role="log"` in a ScrollArea, with a jump button counting what arrived while away; give its parent a height. | No axis. Slots `root`, `log`, `jump`, `count`. |
| `QrCode` | After Zag's: `QrCode.view({ id, value, label?, level?, quietZone?, overlay?, tooLong?, style? }, h)`, one `img` named `QR code: <value>` (or `label`), every dark module one SVG `path` over a background that carries the quiet zone. `level` is the error correction, `M` by default and `H` under an `overlay` (a logo at the centre). `QrCode.encode(text, level)` gives the matrix, none when no version holds the text, and `pathOf` its path; both are pure. `QrCode.Download({ id, format, filename, pixels })` saves the drawn code as PNG or SVG in the colors it shows; the overlay is not in the file. | `scheme` (`light`, dark on light on any page, or `page`), `size`. Slots `root`, `frame`, `background`, `pattern`, `overlay`, `fallback`. |
| `Questionnaire` | An assistant's questions answered in the chat. `Questionnaire.init({ id, questions, layout? })` with `Questionnaire.single`, `multiple` and `text` questions (`Question` is a Schema, so a tool's input decodes into it), folded with `Questionnaire.update`, which says what is missing and focuses it, and returns `OutMessage.Answered({ answers })` once every required question is answered; the form then gives way to a summary. `Questionnaire.view({ model, onMessage, title?, style?, radioGroup?, checkboxGroup?, input?, textarea?, button?, submitButton? }, h)`: the controls are the package's RadioGroup, CheckboxGroup, Input and Textarea, each taking its own style. | `variant` (`plain`, `card`), `actions` (`end`, `start`). Slots `root`, `title`, `progress`, `question`, `prompt`, `words`, `field`, `other`, `otherLabel`, `error`, `actions`, `summary`, `asked`, `answer`. |
| `SignaturePad` | After Zag's: strokes drawn by one pointer over a dashed line and "Sign here", undo, clear, and a typed name instead. `SignaturePad.init({ id, pen? })` holds the strokes (points with pressure, in the pad's coordinates), folded with `SignaturePad.update`. Drawn with `SignaturePad.view({ model, onMessage, label, fallback?, labels?, disabled?, style? }, h)`. `pathOf(stroke, pen)` and `toSvg(model, { color?, font? })` are pure; `RequestedPng({ scale, background })` returns `ExportPng`, answered by `ExportedPng({ url, width, height })` or `FailedExport`. | `surface` (`plain`, `muted`, `dashed`), `size`. Slots `root`, `label`, `control`, `segments`, `stroke`, `guide`, `placeholder`, `typedName`, `controls`, `undo`, `clear`, `fallback`, `fallbackLabel`, `input`. |
| `ThinkingIndicator` | An assistant at work: `ThinkingIndicator.view({ label?, detail?, active?, icon?, style? }, h)` draws dots, a pulse or the view's icon beside words a band of light sweeps, and a detail line, in a polite status. Keep it drawn with `active: false` before work starts, so what it says when it starts is announced. Every movement holds under reduced motion. | `mark` (`dots`, `pulse`, `none`), `label` (`shimmer`, `plain`, `hidden`), `tone` (`muted`, `accent`). Slots `root`, `mark`, `dot`, `icon`, `label`, `detail`. |
| `ThinkingSteps` | The trace of what an assistant did: `ThinkingSteps.view({ id, steps, open, onToggle, duration?, summary?, openSteps?, onToggleStep?, stateWords?, style? }, h)`. Each step is `{ id, title, state, duration?, detail?, icon?, steps? }`, `state` being `pending`, `running`, `done` or `failed`, said in words too. The button says the running step's title, or "Thought for 4s". Its openness is yours, an `Option<boolean>`: none opens it while a step runs and shuts it once all are done, and the press sends the state the reader asked for. `openSteps` and `onToggleStep` make each step's detail collapsible (`Accordion.toggled`). | `variant` (`plain`, `card`), `connector` (`line`, `none`). Slots `root`, `trigger`, `summary`, `chevron`, `panel`, `list`, `step`, `head`, `marker`, `title`, `state`, `duration`, `body`, `detail`. |
| `Timer` | After Zag's: a countdown (`Timer.init({ id, countdown: true, duration })`) or a stopwatch (`Timer.init({ id, interval? })`), folded with `Timer.update`, whose Commands (`Timer.Stamp`, `Timer.Tick`) read Effect's `Clock`, so TestClock drives a run. `Timer.view({ model, onMessage, label, units?, separator?, labels?, style? }, h)`: a `role="timer"` with each unit in a Slot, one press that says what comes next, and reset. `Timer.phase(model)` is `idle`, `running`, `paused` or `done`; to start at once, return `Timer.update(model, Timer.Message.Pressed({ action: 'start' }))` from `init`. | `tone`, `look`, `progress`, `size`. Slots `root`, `label`, `area`, `item`, `separator`, `controls`, `action`. |
| `Tour` | Steps anchored beside their targets in the top layer, over a dim with a cutout the target's presses reach. `Tour.init({ id })`, started with `Tour.start(model, config, { opener })` and folded with `Tour.update(config)` (`config` is `{ steps: [{ title, description, target?, placement? }] }`); `Tour.view({ model, config, onMessage, padding?, interactive?, dismissOnOutside?, closeOnEscape?, labels?, direction?, style? }, h)`. The target scrolls into view; Next, Back and the arrows move on, Escape and Skip end it with focus back to the opener, and `update` returns `Ended { completed }`. A step without a target, or whose target is missing, stands in the middle. The cutout is placed from `--fk-tour-x/-y/-w/-h/-radius`, which `TrackBox` (`foldkit-primitives/dom`) writes on the `layer`. | No axis. Slots `layer`, `blocker`, `spotlight`, `panel`, `arrow`, `progress`, `title`, `description`, `actions`, `back`, `next`, `skip`. |

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
  something that moves multiplies by `knob.travel`, which the reset zeroes under reduced motion while fades keep theirs), `type` (six roles, `display`/`title`/`subtitle`/`body`/`caption`/`micro`, each a size and leading at both steps, read through `Theme.role(name)`), `control` (the size ladder's two ends, 36px and 28px, read through `Theme.ladder(name)`, which blends them by `knob.step` on the element that uses it: `--fk-knob-step: 1` on a region makes its controls compact, and the popups they open while those stay in the page (`portal: false`); a recipe's `size` sets the step on its own element, a popup's on its panel too; unset, the default, follows the region), `border`, `shadow`, `breakpoint`, `safe` (`top`/`right`/`bottom`/`left`: the screen's safe-area insets, which a fixed bar pads the edge it touches by; 0 unless the page's viewport meta has `viewport-fit=cover`); `shadow.xs`…`2xl`/`inset` draw in `shadow.color`
  (which `Theme.oklch` sets per scheme), dimmed by the `shadow-strength` knob). `Theme.oklch({ accent: { h, c, l }, … })` derives the
  palette (`surface`, `text`, `outline`, `accent`, `secondary`, `tertiary`, `success`, `warning`,
  `error`, `info`; each family has a fill `default` with `hover`/`active`, a tint `subtle`, a line `outline`,
  `on-fill` for text on it, and `ink` for colored text on the base surface: colored text is `ink`, never `default`; `syntax`, code colors named as tokenizers name kinds, `syntax-keyword` reading `--fk-syntax-keyword`; and `chart`, series colors `chart-1` to `chart-5`, which a chart assigns in order, turned by the `chart-h` knob); only `knob` holds literals, so overriding `knob.accent-h` under a
  `Theme.scoped` selector recolors everything; `neutral: { h }` gives the neutrals a hue apart from the accent's (a base color), and `menu: { accent: 'bold', color: 'inverted' | 'translucent' | … }` sets the `popup` tokens menus, listboxes and comboboxes draw in; `state` (`hover`, `tint`, `tint-hover`, `edge`) is a mix of the element's own text color, so a hover reads on any surface, and `unfilledHover` films the state ink: the theme's `--fk-state-ink` (`state.ink`) unless a surface painted in a hue names its paint in the local `--_fk-state-ink` (the accent and danger tones their fill, a subtle alert band its ink, a bold one its fill; the neutral and ink tones name the theme's back) — so `OklchKnobs.stateHue` (`neutral`, `surface`, `accent`) switches every component; and `Theme.nested(outer, inset, border?)` gives a concentric inner radius (or a padded container spreads `Theme.nests(radius, inset, border?)` and its descendants read `Theme.nested()`); `Theme.raise(offset)` lifts an element `offset` levels above the raised element holding it, and `Theme.raisedSurface()` paints its level (popups 2, dialogs 4). Emit `Theme.root(theme, { omit: Theme.tokens })`
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
  (`Anchor.behavior(Slots)({ floating, config })`; `Anchor.topLayer(mount)` for an in-place panel, above).
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
