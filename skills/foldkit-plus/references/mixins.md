# Mixins: `foldkit-mixins`, `foldkit-mixins-surface`, `foldkit-mixins-ui`

Checked against `foldkit-mixins` 0.26.0, `foldkit-mixins-surface` 0.12.0 and `foldkit-mixins-ui` 0.27.0.

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

**Which piece for the task**

- A key of the application's on a widget: its `routes` option (Command, SearchField, Toolbar, Menubar, Nav, Tabs, TagsInput, Picker, CascadeSelect, Tour, FloatingPanel) takes `Behaviors.Keys.route`s; on your own view, one `Behaviors.Keys.behavior` per slot (section 2, `Behaviors.Keys`; example under the table in section 5). `<Widget>.conflict(routes, input?)` on each of those widgets is the `Option<Diagnostic>` that drawing it with `routes` would throw, asked without drawing, for a screen that lets a user rebind keys; `input` is the part of the view's options that decides the widget's own keys (`Tour.conflict(routes, { closeOnEscape: false })`), and widgets whose own keys never vary (Command, SearchField, CascadeSelect, Picker) take `routes` alone.
- Focus when a row, clear button or toast goes away: `FocusRecovery.behavior` with `parts` (`primitives.md`); Alert and Card name their dismiss button with `recoveryPart`, Toast has `keepFocus`. When a dialog's, tour's or floating panel's opener is gone: `Dialog.focusReturn`, `Tour.focusReturn`, `FloatingPanel.focusReturn`.
- A keyboard-reorderable list, arrows over a board, a value edited where it shows: `Reorder`, `SpatialNavigation`, `InlineEdit` in `primitives.md`.
- A search box `SearchField`; a file picker whose files you own `FileInput`; files that are checked, listed, previewed, dropped and sent `FileUpload` (a Submodel drop zone is `FileDrop`); a toolbar `Toolbar`; a command palette `Command`; a menu bar `Menubar`; a select `Listbox` or `Picker`; tags `TagsInput`; a number `NumberField`.
- The same style, words or mixins at every call of a widget: `Button.configure({ base: { style }, presets: { danger: { style } } })` returns `{ view }`, called as `AppButton.view({ label, preset: 'danger', onClick }, h)`. Order: `base`, the named preset, the call; `mixins` concatenate and `words` merge word by word (a word is text with `{blanks}`, never a function: `TagsInput`'s are `remove`, `mark`, `repeat`, `empty`, `full`), any other option is replaced; an option given as `undefined` is not given. A preset holds only options with no Message, state or drawing (`style`, `mixins`, `words`; `type` for Button; `placeholder`, `addOnBlur`, `direction` for TagsInput), and may hold a Behavior with a Mount. An undeclared `preset` is a type error (and throws for a name computed at run time); with no `presets`, `preset` is no option. Shipped on `Button`, `TagsInput`, `Combobox`, `Calendar`, `DatePicker` and `FileUpload` (which returns `{ view, parts }`) so far.
- A stateful widget placed with `foldkit-bundle` (a peer dependency, loaded only by `Bundles`): `Bundle.withChild('labels', Bundles.TagsInput, { args: { id, tags?, delimiter?, max? } })`, then `TagsInput.view({ model: model.labels, onMessage: message => App.Message.GotLabelsMessage({ message }), label }, h)`. A Bundle is headless and its args are `init`'s options. `Bundles.Combobox` (args `{ id, multiple?, nullable?, immediate?, animated?, modal?, selectInputOnFocus? }`) holds upstream's interaction Model only; the value is the application's field, folded in `onOut` through a `Choice`: `const City = Combobox.one(cities)`, `onOut: out => model => ({ model: { ...model, city: City.picked(model.city, out) } })`. `Combobox.one` holds `Option<Item>`, `Combobox.many` a list (place with `multiple: true`), `Combobox.text` the typed text; `Choice<Item, Value>` (`items`, `empty`, `picked`, `chosen`, `resting`, `multiple`) is an interface an application may implement, and `ChoiceChange` is `Selected { value } | ClearedSelection | Typed { text }`. Draw it with `Combobox.view({ model: model.cityBox, onMessage, label, choice: City, value: model.city, filter: Combobox.contains, option: item => ({ label, description?, icon?, trailing?, content?, disabled? }), clear: true }, h)`; further options are `items`, `groupBy`, `heading`, `placeholder`, `empty`, `chips`, `buttonContent`, `disabled`, `invalid`, `readOnly`, `name`, `openOnFocus`, `anchor`, `words` (`clear`, `remove`), `style`, `mixins`, and `Combobox.configure({ base, presets })` binds those with no Message, value or drawing. The Bundle's `text` arg is the field's starting text for a value chosen already. `Bundles.Calendar` holds its own value, the `Calendar.Selection`, and reports `Changed { selection }`, answered with `onOut` or `Bundle.ignore`: `Bundle.withChild('trip', Bundles.Calendar, { args: { id: 'trip', today, selection: Calendar.empty('Range'), months: 2 }, onOut: Bundle.ignore })`, then `Calendar.view({ model: model.trip, onMessage, label }, h)` and `Calendar.rangeOf(model.trip.selection)`. `Bundles.DatePicker` is the same in a popover (args as the Calendar's without `months`, plus `animated` and `closes: 'complete' | 'manual'`), drawn with `DatePicker.view({ model, onMessage, label, trigger: selection => string, name?, disabled?, anchor?, style?, calendarStyle?, …the Calendar's options }, h)`; outside a Bundle its state is `DatePicker.init`, `DatePicker.fold` (not `update`, which is the adapter's `update(selection, closes?)`) and `DatePicker.set`. For one or two widgets on a page, folding `X.update` by hand is smaller: the first placement costs about 6 kB brotli.
- Who provides an accessibility obligation (navigation, name, focus strategy): `provides` on a Behavior slot, or `A11y.base` / `A11y.native` / `A11y.delegated`, checked by `A11y.conform` (the Obligations bullet below).
- A widget's keyboard conformance in a test: `Conformance` from `foldkit-mixins/testing` in a browser test (the Rendered conformance bullet below).

## 2. Mental model

```text
Slots.define({ name: Slot.make({ capability, events, attributes, hidden, protected }) })
      |                                   (public contract, pure metadata)
      +-- Style.forSlots(S)({ name: StyleValue })            -> { mixin, css, ... }
      +-- Behavior.forSlots(S)<Input, Message>({ name: Behavior.slot({...}) })
      |
SlotView.define(S, (input, slots, h) => h.x(slots.name.attrs(base), ...))
      .pipe(Style.attach(style), Behavior.attach(behavior))  -> new view (original unchanged)
      (a list of Behaviors is one step: Behavior.attachAll(list); a spread is no step)
      |
resolver: base attrs + contributions -> Foldkit attributes (or DiagnosticError)
```

- **Capability** hierarchy: `Base -> Interactive -> { Container, Focusable -> TextInput, Draggable }`,
  `Base -> Collection`; extend with `Capability.make(name, { extends })`. A behavior requiring
  `Interactive` fits a `TextInput` slot.
- **Event / Attr** tokens (`Event.Click`, `Attr.AriaInvalid`, `Event.make`, `Attr.make`) are
  metadata; declaring them installs nothing. `Attr` also has `AriaSort`, `AriaLabelledby`, `AriaControls`, `AriaReadonly`, `AriaRequired`, `AriaCurrent` and `AriaValuenow`, for a slot to declare.
- `Behavior.slot({ requires, attributes: ({ input, h }) => [...], mount })` — `requires`
  (capability/events/attributes) is checked against the slot **when `forSlots` runs**.
- **Binder**: `const B = SlotView.over(S)<Input, Message>()` names the slots, input and Message
  universe once; `B.define((input, slots, h) => …)`, `B.behavior({ slot: { attributes } }, { name })`
  and `B.parts` are `SlotView.define`, `Behavior.forSlots` and `SlotView.parts` with all three
  fixed, so nothing is annotated. `SurfaceView.over(surface, S)` reads both types from a Surface.
  `SlotView.isBound(x)` tells a binder from bare slots, for a factory that takes either.
- **Attachments are remembered**: each Mixin keeps its name and, from `Style.forSlots` or
  `Behavior.forSlots`, a frozen `meta` (`kind`, per slot `requires`, `provides`, `reads`).
  `SlotView.detach(name)` and `SlotView.replace(name, mixin)` (same place in the order) return a
  new view, and throw `mixins:unknown-attachment` / `mixins:ambiguous-attachment`, so name a
  Behavior you mean to address. A two-owner conflict names both contributors (`the view` for base
  attributes) in its message and `details.contributors`.
- **Obligations** (#552): a pattern's slot may name what an attachment must do there
  (`A11y.pattern({ listbox: { obligations: [A11y.Navigation, A11y.Name] } })`; the set is
  `Navigation`, `FocusStrategy`, `Activation`, `State(Attr.X)`, `Name`, compared by name). A
  Behavior slot says what it meets with `provides`; `A11y.base`, `A11y.native(spec, { element })`
  and `A11y.delegated(spec, { to, provider })` are meta-only Mixins for the view's own word, a
  native element and another slot's Behavior, attached with `SlotView.attach`.
  `A11y.conform(pattern)` in the view's `pipe` is a type error naming each
  `'slot/obligation'` the steps before it leave missing and, where the module loads, throws the first `a11y:unsatisfied-obligation`
  / `a11y:delegation-unmet` (all in `details.diagnostics`); it returns a new view whose `detach`
  and `replace` are checked again. `A11y.check(pattern, view)` is the same as data. The navigation
  primitives, `Selection`, `Press`, `ToggleState`, `Disclosure` and `FieldAssociation` state what
  they supply on the binder overload only, and only where the run time is sure to
  (`A11y.ProvidedOn`: one literal slot; `Selection`'s activation for a literal selecting `mode`
  and its click on). A binder's `behavior` reads a hand-written slot's `provides` into its type;
  `forSlots(slots)<I, M>` reads none. An annotation may forget what a value supplies (an
  annotated `SlotView<S, I, M>` supplies nothing) but never claim more. A view `detach` or
  `replace` makes supplies nothing at the type level (a Style taken or not); the run-time
  check judges it. A part's own `behaviors`
  supply nothing to `conform` (it cannot find a part without drawing it): attach those to the
  assembly. Structural, never WCAG.
- **Rendered conformance** (#552, #558): `Conformance` (`foldkit-mixins/testing`) runs
  `listbox`, `checkbox`, `tree`, `dialog` and `tabs` over a mounted widget with a harness
  `{ root, press, accessibility, click }` (`Conformance.harness({ cdp, userEvent }, root?)` from
  `vitest/browser`'s two; the tree is read inside `root`, each node with its DOM node) and returns `ReadonlyArray<{ scenario, check, passed,
  detail }>` (`Conformance.failures(result)` keeps the failed ones). Names and roles come from
  Chromium's accessibility tree; state, focus and keys from the page. `Conformance.server(scenario,
  root, expected)` reads server markup parsed back. A scenario runs over the shipped widget and
  over a view assembled from primitives alike. `SlotView.describe(view).conforms` reports the
  patterns `A11y.conform` checked (slots with capability and obligation names).
- **Parts** cut a big view so each piece redraws only when what it reads changes:
  `const P = SlotView.parts(S)<Input, Message>()`, `P.part(name, { reads: ['k'], behaviors },
  (input, slots, h) => …)` (input is `Pick<Input, 'k'>`), `P.assemble((input, slots, h, draw) =>
  … draw(Part) …)` is a SlotView; a part may be drawn in more than one place. A whole-view Mixin
  that reads input makes parts redraw every time.
  Per item: `slots.row.lazy(item, drawRow, { ...args })` with `drawRow(slots, h, args)` defined once;
  an item redraws when an arg changes or what Mixins give its Slots changes (a static Style by
  identity). The memo is one per `drawRow`, shared by every view drawing it; a key not drawn for
  two passes is forgotten, so keys may be unbounded (search results, scrolled rows).
- **Regions** redraw by Model path: `const R = SlotView.region(Projection.struct({ cart:
  App.model.cart }), (value, slots: Builders, h: H) => …)`, then `R(model, slots, h)` in the
  page's render. Drawn again only when a value at a path the Projection reads changed (by
  identity), or its read gives new fields; the drawing gets only that value. A read with no path
  of its own (a Remote read, alone or in a `struct`) is read every render, and the region drawn
  again when that gives other fields. A reused region's DOM is not patched; a region inside
  another region or item is drawn in place, the outer one every time. A region is built on
  `foldkit-surface`'s `Projection.derive(on, f)`, the same rule for a value (a filtered list the
  view reads) rather than a drawing; it refuses an empty `on`.
- `hidden: true` slots are omitted from public Style/Behavior spec keys.
- **Styling pipeline:** `tokens -> ref -> pieces -> slots -> sheet`. `Theme.standard(theme)`
  (the scales and the palette, at a theme's knob values) is the only source of values; read them
  through `Theme.ref` — a misspelled group/name is a type error, and it emits
  `var(--fk-…)`, never a literal. `Style.self` is a rule on a generated class
  (layerable, overridable); `Style.inline` sits outside every layer and beats
  everything, so only for values no theme may touch: a conditional rule (media, pseudo,
  nest, container, `states`) for the same property in the same composition is refused as
  `mixins:dead-conditional-rule`, since it could never apply (a development-time check, absent from production builds); put such a base in `Style.self`. Bases go in `components`,
  selections in `variants`, the page's own rules in `app` (always last).
- `protected: { events, attributes, style }` forbids attachments from supplying those. An
  attribute is compared by the HTML attribute a contribution sets, so `h.Attribute('aria-label', …)`,
  `h.DataAttribute` and a `Prop` are refused where `h.AriaLabel` is. An event is compared by the
  DOM event Foldkit registers: `OnKeyDownPreventDefault`, `OnKeyDownSelf` and `OnKeyDownFocus`
  are `keydown`, `OnDoubleClick` is `dblclick`, `OnFocusEnter` is `focusin`, and
  `OnCustomEvent` is the event it names.
- **Resolver rules:** classes additive + deduped into one `Class`; Style pieces' inline style
  merged per property (later wins) over the base, but a property a Behavior sets via `h.Style`
  has one owner (`mixins:style-property-conflict` otherwise); each event / scalar attribute has
  exactly one owner (base or one mixin);
  the same holds across builders (`AriaLabel` and `Attribute('aria-label')` are one owner);
  `ChildAttribute` preserved by identity and reserves its event, and a mixin's child meets the
  same checks (its `Class` joins the one class); a mixin's raw `class`/`style` (`Attribute`,
  `Prop`, child `Style`) is `mixins:attribute-conflict`, an inline `on…` handler is
  `mixins:unsupported-event`; a style property is the declaration it writes, and a protected or
  Behavior-owned one is also guarded from its shorthands (`inset`), physical sides (`right` for
  `insetInlineEnd`) and `translate`/`rotate`/`scale` beside `transform`; `Key`/`InnerHTML`, or a `Prop` that
  replaces the children, cannot come from a mixin; all mounts compose into one `OnMount`. A composed Mount that fails ends alone
  and is reported as a `MountFailed` diagnostic (`{ mount, slot: Option, cause }`) through
  `foldkit-surface`'s `Diagnostics.Reporter`; an interrupted one is not. Foldkit runs Mounts
  outside the runtime's `resources`, so the resolver dispatches it at the Mount's element
  (`Diagnostics.dispatch`): `Diagnostics.layer(reporter)` in the resources claims it for
  `reporter`; without that layer it goes to the log.
- `DevOverlay.make()` gives `{ report, mount }` for development: give
  `Diagnostics.layer(overlay.report)` in the resources and draw `h.div([h.OnMount(overlay.mount)],
  [])` behind the app's development flag. It lists every diagnostic (the newest 50) in a fixed
  panel, then passes each to `next` (`Diagnostics.log`). It sends no Message, so a Scene test of
  a page drawing it cannot resolve it.
- Diagnostics you will hit (`Diagnostics.DiagnosticError`, `.diagnostic.code`):
  `mixins:unknown-slot`, `mixins:capability-mismatch`, `mixins:event-conflict`,
  `mixins:attribute-conflict`, `mixins:style-property-conflict`; from `Theme.make`,
  `Theme.set` and `Knobs.withValue`, `theme:knob-value` (a value out of range, naming the call
  and the knob) and `theme:unknown-knob`.

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

`Behaviors.Keys` gives a slot's `keydown` one owner, built from named routes, so Escape-to-clear,
Alt+ArrowDown-to-open and a primitive's arrows share one input instead of failing
`mixins:event-conflict`. `Keys.route(name, { on, handle })` declares its gestures
(`Keys.chord('Escape')`, `Keys.chord('ArrowDown', { alt: true })`, `Keys.printable`, or an
undeclared `Keys.where((key, modifiers) => …)`) and answers `Option<Message>`, or
`Option.some(Keys.focus(id, message))` to move focus in the handler.
`Keys.behavior(bound)({ slot, routes, name? })` (or `(Slots)<Input, Message>(…)`) requires the
slot to publish `Event.KeyDown`. Two routes declaring one press throw `mixins:key-conflict`
naming both when the Behavior is defined, unless `Keys.first(a, b)` orders them (`Keys.conflict(routes, slot?)`
is the same check as an `Option<Diagnostic>`, for seeing a clash without throwing); a misspelt key
(`Keys.chord('Esc')`) is a type error and throws `mixins:unknown-key`. A press asks its one
declared route, then the `where` routes in list order; the first `Some` wins and is
default-prevented, a declined key keeps its native effect, propagation is never stopped, IME
composition keys reach no route, and a held key runs its route on every repeat (guard a
once-only route in `update`). `Keys.answer(routes)(press)` is the same question asked without a
page, `Keys.matches(gesture, key, modifiers)` asks one gesture, `Keys.withShift('ArrowDown')` is a
named key as chords with Shift up and down, and `Keys.attribute(routes, { slot?, moveFocus? })` is the
one `keydown` attribute for a Behavior that also writes other attributes on the slot.
`SpinValue.keys(options)` is the spinbutton's route. Observing a key without owning it is a Subscription (`foldkit-primitives/events`).

### 3b. An application's own look

An application styling its own markup declares the Slots by their style and fixes theme, layer
and sheet once (`forSlots` stays for a contract someone else published, such as `ButtonSlots`).
`theme` is optional: `AppStyle.make({})` is the shipped theme (a vivid blue on faintly cool greys, bold
fluid headings, quiet shadows (`shadow.strength` 70; `shadow: { strength: 0 }` is flat), a spring, Heroicons), and a theme that sets
knobs keeps the rest of it:

```ts
import { Event, Style, SlotView } from 'foldkit-mixins'
import { AppStyle } from 'foldkit-mixins/app'
import { Theme } from 'foldkit-mixins/theme'
import { Utilities as U } from 'foldkit-mixins/utilities'
import { ButtonSlots, Recipes } from 'foldkit-mixins-ui'

const { t, slots, forSlots, stylesheet } = AppStyle.make({
  theme: Theme.make({ accent: { hue: 260, chroma: 0.21, lightness: 62 } }),
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
reset, tokens, palette and `Defaults.body` (`global` adds to `defaults`), built when first read:
with `foldkit-mixins/vite`, read it in a server-only module, never in the browser. Utilities take token
names, so `U.p('4xl')` and `U.bg('surface.nope')` are type errors. `U.scrollFade(axis)` dissolves a
scroller's content toward an edge with more to scroll (CSS only); `U.scrollDivider(axis)` on a
positioned parent with `U.scrollTimeline(axis)` on the scroller draws a hairline at such an edge
(where `timeline-scope` exists); and `U.steady(weight)` keeps room
for a label at a heavier weight from its `data-label`, so turning bold moves nothing. `U.busyReveal`
on a status Slot shows an `aria-busy="true"` line only after 0.6s (its space held), so a quick read
never flashes "Loading…"; draw the wait with `aria-busy`, and the empty or failed line without. For a page in a
browser running no scripts, `U.scriptedOnly` (last in a slot's pieces) hides a control only a script
drives and `U.plainOnly('flex')` shows its plain stand-in there; write no `srOnly` or media query of your own.

## 4. `foldkit-mixins-surface`

Use only if the feature already renders through a `foldkit-surface` Surface. `SurfaceView.define`
makes the SlotView's input exactly the Surface projection and its Message universe exactly the
exposed subset, so no annotations are needed and Behaviors cannot read unprojected fields or emit
unexposed Messages. It adds no state and no renderer. `SurfaceView.over(surface, slots)` is
`SlotView.over` with the same two types, for making Behaviors without naming them.

```ts standalone
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
  selectedId: Option.some('t1'),
  secret: 'not projected',
})
```

`SlotView.describe(view)` (attachments in order, with what each requires and contributes per slot; `'unknown'` for a function of the input) and `SlotView.resolution(view, input)` (names and owners per slot, no attribute or style value or Mount args; class tokens as given; no Mount or handler run) are serializable. `SurfaceView.describe` adds what the Surface observes and emits, and `toMarkdown` renders either for CI drift checks. `SurfaceView.inspect` is deprecated.

## 5. `foldkit-mixins-ui`

`@foldkit/ui` keeps component state, accessibility and base attributes; the adapter names its
`toView` attribute bundles as Slots. `X.toView(mixins, { h }, draw)` fills a component's `toView`
and hands `draw` the bundles with the Mixins applied (non-slot data such as `activeIndex` passes
through); add your own attributes beside them (`h.input([...input, h.Autocomplete('off')])`).

```ts standalone
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
Popover, Tooltip, Tabs, RadioGroup, Calendar, FileDrop (`FileDrop.Message`: upstream's Messages over a `File` codec with no decoding services, which a `Bundle.parent` accepts and upstream's `Schema<File>` does not), Toast, Listbox, Combobox, DatePicker (namespace + flat `XSlots`). `MenuView` transcribes `@foldkit/ui/menu`'s markup assembly
from the pinned `@foldkit/ui` source (attributed in the module) with a `toView` added, and a parity battery
draws both views over the same models. `Menu` itself (`Menu.init/update/view`, by a button, at a point, or down a submenu) is this package's own component over `@foldkit/ui` Menus, as the Slider is (`Slider.view`, one number or a range). Pass mixins as
`style.mixin` / `behavior.mixin`. A custom select is a Listbox drawn with `Listbox.parts(mixins, { h })`
(`option({ label, description?, icon? })`, `trigger(chosen, placeholder)`; recipe axes `check`, `trigger`,
`size`); a Combobox takes `chips: {}` (with `ComboboxView.Multi`, a tags field with suggestions),
`clearContent` and `empty`. An invalid Listbox trigger or Combobox writes `aria-invalid` (a Combobox's on its input) and draws the error edge, and a disabled trigger shows no hover; a portaled panel carries the Listbox's `direction`, so a right-to-left page places it for its side; Combobox Home and End move the caret, and its `size` takes `sm`, `md` or `lg`. A Dialog draws `body` (holding `scroll` and its `scrollBar`) and `footer`, so a
long body scrolls under answers that stay, and `covered: true` in its context steps back a dialog another
was opened from (draw the second inside the first's `dialog`). `isLeaving: Dialog.isLeaving(model)` in the context draws the panel `inert` for the rest of its exit, so no press or key acts on it (the Sheet does this itself); `Dialog.update(model, message)` and `Dialog.open(model)` are `@foldkit/ui`'s `update` and `open` plus one focus repair: an open that meets the exit puts focus back inside the dialog (the `focusSelector`, the initial-focus mark, else the first control), and a bare upstream `open` skips it. A dialog whose opener is gone as it closes returns focus through `Dialog.focusReturn`. A tab is a flex row: draw its words in
`label` and an icon in `icon`; `Tabs.view({ model, onMessage, label, tabs: { value, label, icon?, trailing?, disabled?, panel? }[], value, orientation?, close?, routes?, style?, mixins? }, h)` is the options-level drawing over `Bundles.Tabs.with({ id, activationMode? })` (`Selected` is answered in `onOut`; the chosen `value` is yours), with `Tabs.configure({ base, presets })`; `TabsContext.close: { onClose }` makes tabs closable (answer with `Tabs.closing`
and `FocusTab`); `TabsContext.routes` takes keys the application answers on a tab, such as F2 renaming it, beside Delete: the input is the tab's `TabInfo`, and a tab with no key to answer draws no keydown at all; Tabs axes `variant`, `size`, `overflow: 'scroll' | 'wrap'` (wrap is equal columns filling the row; `.extend` the tablist's `--_fk-tab-min` to tune the minimum column), and the pill's `selection: 'raised' | 'tint'`. A Segmented option takes an `icon` (or
`iconOnly`); axes `tray` (`tray`, `plain`, `underline`), `size`, `width: 'fill'`. Listbox, Combobox, Toast and DatePicker, which upstream draws
with no consumer seam, are adapted over small view forks transcribed from the pinned `@foldkit/ui` source, with
state staying upstream.
The same call goes in a Submodel's `viewInputs` (`toView: RadioGroup.toView(mixins, { h },
({ group, options }) => …)`), with `Value` and `Message` inferred. Draw each radio option as a
`label` element around its `option` button: upstream's `label` bundle is only an id, so a bare label
takes no press; give that `label` the option's `card` bundle (`h.label(option.card, [h.button(option.option, []), …])`, `data-checked` while checked), which `Recipes.RadioGroup({ variant: 'card' })` frames, filling the chosen one; `orientation: 'Horizontal'` on the view lays them in a wrapping row. A Checkbox's `checkbox`, a Switch's `button` and a RadioGroup's `group` declare `aria-invalid`: an invalid control carries `h.AriaInvalid(true)` beside its resolved bundle (the views take no option for it) and the recipes draw the error edge. `input` is optional: only what an
input-driven Mixin reads. `X.resolve(attributes, mixins, { h, input })` stays for bundles already in
hand, such as a Calendar whose Mixins read `attributes._tag`. `Listbox`, `Combobox` and `Calendar`'s `toView` take `draw` optionally; without it they draw upstream's
markup from the styled bundles. `Menu.toView(mixins, { h }, draw?)` draws the component's own markup through `drawMenu` without one. Tabs glide with `Tabs.toView([style.mixin, ...Tabs.fluid], { h }, ({ tablist, indicator, highlight, tabs }) => …)`,
drawing `indicator` and `highlight` first in the tablist. `Menu.fluid`, `Listbox.fluid` and `Combobox.fluid` do
the same for a popup's rows (`Menu.toView([style.mixin, ...Menu.fluid], { h })`): one highlight for pointer and keys,
and a gliding marker on a listbox's or combobox's chosen row. Overlay scroll bars are one shape, a mixin list
beside the style, off by default (their `ScrollBars` Mount sends no Message, which a Scene test would have to
resolve): `ScrollArea.overlayBars`, `Command.overlayBars`, `VirtualList.overlayBars` in the view's `mixins`
(each always draws its `bar`/`thumb`), `Dialog.overlayBars` in `toView`'s (draw `scrollBar` beside `scroll`), and `Menu.overlayBars`, `Listbox.overlayBars`, `Combobox.overlayBars`
in `toView`'s for a popup whose list scrolls (`itemsScrollAttributes`; slots `scrollBar`, `scrollThumb`).
Menu (submenus too), Menubar, Listbox and Combobox panels drawn with `portal: false` are in the top layer:
`popover="manual"` and `inset: auto` on the panel, its anchor Mount wrapped in `Anchor.topLayer(mount)`, which
shows it around the Mount and hides it on release (a no-op without the popover API or attribute); an
unstyled panel keeps the browser's popover border, padding and `Canvas` fill. Popover and Tooltip draw
their `layer` slot (`Anchor.layer(h)`) around the panel, which keeps upstream's anchor (`Popover.anchor()`,
`Tooltip.anchor()`: `portal: false`, 12px and 8px off, flip and shift; the Popover recipe's panel fades out on leave when the Popover has `isAnimated`); a Hover Card is anchored in the top layer by
`HoverIntent.toView(mixins, { h, anchored: { id, anchor? } }, draw)` (the trigger then carries `aria-expanded` and, while open, `aria-describedby` naming the panel, whose id is `HoverIntent.panelId(id)`); each draws an `arrow` in its panel, and
`Tooltip.toView` takes `{ h, id: model.id }`. The DatePicker panel and modal dialogs are not in the top layer. The popup recipes' `width` axis: `trigger` (Combobox's default)
replaces the panel's 14rem minimum with the trigger's width (`--button-width`), `auto` (Listbox's) keeps it.
Right to left: Menu, Menubar, TreeView, Resizable and a horizontal Listbox take `direction?: 'ltr' | 'rtl'`,
swap the arrows into reading order and draw it as the root's `dir`; `Tabs.readingKeys`,
`RadioGroup.readingKeys` and `Calendar.readingKeys` (a mixin each, opt-in for Scene's sake) read upstream's
arrows by `:dir()` (a RadioGroup's reads both arrow pairs whichever way it stands, the horizontal pair swapped on a right-to-left page); `Switch.draggable(onToggle)` (opt-in too, with the `onToggle` the view was given) lets the thumb be dragged, toggling on release past the middle of the track; the `fluid` indicators measure again when a `dir` changes. `DatePicker.toView(mixins, (resolved, h) => …)`
takes no builder: its bundles speak the date picker's own Message, so it hands `draw` the date picker's
builder. For a range or many days in the popover, fold with `DatePicker.update(selection)` (open until the
selection is complete) and pass `DatePickerView.view` `selection`, `triggerContent: selection => Html` and
`toCalendarView: Calendar.toView(selection, mixins, { h })`; under `name` each chosen day is its own hidden
input (`FormData.getAll(name)` is `[start, end]`). Result types: `ResolvedButton<M>`,
`ResolvedRadioGroup<V, M>`, and so on.

`Recipes.Disclosure` (`variant`: `plain`, `bordered`, `ghost`; `indicator`: `chevron`, `none`)
draws the button's chevron as its `::after`; the panel's height is upstream's `animatePanel`, whose
inline transition the recipe overrides so the `motion` knob and reduced motion reach it. `Recipes.Fieldset` (`variant`: `plain`, `bordered`, `filled`)
floats the legend into the group and dims the legend and description of a disabled fieldset.
A disclosure with its recipe: the recipe draws the button and the panel's box,
and `animatePanel` keeps the shut panel inert and moves its height.

<!-- docs-check
declare const ToggledDetails: (payload: { readonly isOpen: boolean }) => Message
-->

```ts
import { Disclosure as UiDisclosure } from '@foldkit/ui'
import { Style } from 'foldkit-mixins'
import { Disclosure, DisclosureSlots, Recipes } from 'foldkit-mixins-ui'

const DetailsStyle = Style.forSlots(DisclosureSlots)(Recipes.Disclosure({ variant: 'bordered' }))

const details = (isOpen: boolean, h: HtmlBuilder<Message>) =>
  UiDisclosure.view(
    {
      id: 'details',
      isOpen,
      onToggle: isOpen => ToggledDetails({ isOpen }),
      toView: attributes => {
        const disclosure = Disclosure.resolve(attributes, [DetailsStyle.mixin], {
          input: undefined,
          h,
        })
        return h.div(
          [],
          [
            h.button(disclosure.button, ['Shipping details']),
            disclosure.animatePanel(h.div(disclosure.panel, ['Shipped in two days.'])),
          ],
        )
      },
    },
    h,
  )
```

`Recipes.Accordion | Button | Input | Textarea | Select | Checkbox | Switch | Fieldset | Disclosure | RadioGroup | Slider | Dialog | Tabs | Segmented | Menu | Listbox | Combobox | Calendar | DatePicker | Popover | Tooltip | Toast | FileDrop | Alert | AspectRatio | Avatar | Badge | Breadcrumb | ButtonGroup | Card | CardGroup | Carousel | CheckboxGroup | CodeBlock | ColorPicker | Command | Empty | HoverCard | Icon | InputCopy | Item | Kbd | Label | Menubar | MenubarMenu | Meter | Nav | NumberField | OtpField | Pagination | PasswordInput | SearchField | Toolbar | FileInput | Progress | Rating | Resizable | ScrollArea | Separator | Sheet | Picker | Drawer | Sidebar | Skeleton | Spinner | Steps | Table | TagsInput | TreeView | Typography | VirtualList | ChatMessage | ChatMessageGroup | MessageScroller | ThinkingIndicator | ThinkingSteps | Questionnaire | AngleSlider | Timer | Marquee | ImageCropper | SignaturePad | QrCode | Chart | CascadeSelect | FloatingPanel | Tour | Image | Figure | AppShell` are shipped
`Style.recipeFor` recipes over those contracts: `Style.forSlots(ButtonSlots)(Recipes.Button({ tone:
'danger', variant: 'outline', size: 'sm' }))`, adjusted with `.extend(patch)`. They reference
the shipped tokens (`Theme.root(Theme.standard(theme))` ships them; a theme is typed knob values,
`Theme.make({ shape: { radius: 1.8 }, menu: { panel: 'inverted' } })` over `Knobs.standard`, pipeable with
`Theme.set` and `Theme.describe`; the defaults are `shape.radius` 1 (6px controls; 0.45 is the old, squarer look), `menu.panel` `'default'` (the page's raised surface; `'inverted'` is the old panel), `surface.saturation` 0.005 and accent `lightness` 54, and a TagsInput chip and a Badge are full pills; `shadow: { relief: 'bevel' }` raises every faced button and sinks every
field; every knob is a
variable, choices too: `icon.size` (multiplies the icon rung of `ladder`) and `icon.stroke` (`border.glyph`, what recipes draw in CSS), `shape.border`, `type.body`, `type.headingWeight`, `type.fluid` (0 keeps one size; 1 grows type between `type.viewportMin` and `type.viewportMax`), `motion.easing`, `shadow.style`, `shadow.relief`,
`shape.outlines` and `surface.hover` each write the CSS their option holds, so they switch at runtime;
`Themes.make({ iris, cobalt }, { initial: 'iris' })` installs themes by name for `AppStyle.make({ themes })`,
`themes.Name` the Model's field and `Themes.apply(themes, name)` the Command (`Themes.choose` also keeps the name,
and `Themes.script(themes)` in the head shows the kept one before the first paint), and `Theme.scope(theme, selector)`
themes a subtree; `Theme.fluidType({ min, max })` blends one size over the theme's fluid range
(`Theme.fluidType({ min, max, viewport })` over a range of its own, or
`container: true` over the nearest `container-type: inline-size` ancestor;
`Theme.containerFluidProgress()` is that container progress for
`--fk-fluid-progress`; `Theme.role('display' | 'title' | 'subtitle', { fluid: true })`
grows a role's size and leading together, while `body` / `caption` / `micro`
stay on the control ladder); `reading.measure` (in `ch`) caps `Prose` and
reading `Typography`, `reading.headingWrap` / `reading.bodyWrap` choose
`text-wrap`, and `reading.align` sets reading alignment;
`Knobs.schema(knobs)` decodes a theme's values, `Theme.print(theme)` writes its source, and each
knob's `title`, `description` and `default` draw its control; `Knobs.at(knobs, path)`, `Knobs.valueAt` and
`Knobs.withValue` reach one knob by its path, typed), put bases in the
`components` layer and variants in `variants` of `Layers.standard`, and style state from the
component's own `aria-checked` / `aria-selected` / `aria-disabled`. No recipe declaration is inline
style, so `Style.forSlots(ButtonSlots)({ button: Style.self({ … }) }, { layer: L.layer('app') })` overrides any of
them by layer order alone. `Recipes.Badge` reads its tone from `data-tone` (the view writes it), so `tone` is not an axis: `appearance` and `size` are, and `Recipes.badgeTones(attribute, map)` through `extend` maps an attribute of your own.
`Recipes.InputGroup` (`group`, `affix`, `control`) draws a prefixed or suffixed field as one
box; a `Segmented` pressed option is the accent's flat tint (`Segmented.fluid`, with its `indicator` and `highlight`
slots drawn first in the group, slides it as a pill; `Segmented.view` and `Segmented.toggled(pressed, value, { multiple, optional })` draw and step it. A single choice is a radio group (`role="radiogroup"` of `role="radio"` with `aria-checked`, one tab stop; the arrows, Home and End move choice and focus) and requires `id`, which prefixes the options' ids; `direction: 'rtl'` swaps the arrows; `multiple: true` is a group of `aria-pressed` buttons; `name` submits the chosen values as hidden inputs and `disabled` turns the group off; `Button.view({ icon })` draws an icon (an `svg`, `aria-hidden`) in its `icon` slot before the label, which the `icon` variant hides so the icon stands alone, the label still its name (`shape: 'square'` does so for any variant, an outlined icon button); `Button.view({ attributes: { button: dialog.initialFocus } })` adds another component's attributes to the slot before the mixins resolve, so a class joins the style's; `Button.view({ trailing, description, mark })` draws a part after the label, a second line, and a corner Badge or dot (slots `trailing`, `content`, `description`, `mark`); `invalid` writes `data-invalid` (not `aria-invalid`) and turns the colours danger; `busy` writes `aria-busy` and withholds the press, and a busy submit stops submitting, with the spinner the application's own `icon` (no `loading` option); `href` with `external` draws an anchor (no `type` or `onClick`, no `href` while disabled); `Recipes.Button` adds `variant: 'link'` and `size: 'xs'`; `Button.view({ disabled })` writes only `aria-disabled`, so a `type: 'submit'` one still submits on Enter or a press, and `update` refuses what it should not send; a toggle button is `Button.view({ pressed })`, which rests on its tone's fill, keeps its text on it hovered and held, and deepens held); a held button scales to 98% (by `travel`), a solid or primary one also deepening to its `active` fill and clearing its 1px border, so it stands 1px in. That fill is clipped to the padding box: override it with `backgroundColor` in every state, since a `background` shorthand resets the clip. An unfilled button's
hover (outline, ghost, icon) is a faint film of the state ink, so it reads on a colored band. The
body defaults color scrollbars with `outline.overt`. `Touch`
(`target`, `targets`) and `Icons` (`glyph(size)`, `byAttribute(attribute, icons)`) are style
mechanisms, not components: compose them into your own slots, resolving icon `url(…)`s yourself.
`Icons.glyph` masks an element that already exists. `Icon.view({ icon, label?, key? })` is the
element: it draws the `IconData` into its glyph as inline SVG, with `foldkit-media`'s `Icon.draw`. Never set an
icon through `innerHTML`.

### States

Each interactive state has one owner, so a theme moves them all at once:

| State | Drawn by | Set by |
| --- | --- | --- |
| hover | the hover ink as a film | `surface.hover` (ink), `surface.hoverStrength` (strength) |
| press | the same ink at 1.75 of the hover's strength | `surface.hoverStrength` |
| selected / current | `accent.subtle`; a popup's lit row by `menu.highlight` | `accent.*`, `menu.highlight` |
| focus | `focusRing`: one outline token, one offset | `accent.hue` |
| disabled | one fade, and nothing else changes | `state.disabledOpacity` |

A fluid highlight (Table's, Segmented's, pill Tabs', Nav's, Sidebar's, TreeView's, a Card
group's) **is** the hover: it lays the same film from the same ink, so a fluid list and a plain
one on a page hover alike. `hover()` lays the press on a held row, tab, accordion trigger or menu
item, and a held fluid highlight takes it too (`FluidHover` marks the container
`data-fluid-held`). Popups keep their own highlight (`menu.highlight`) and a Card lightens a
dark page as it darkens a light one, both by design.

### Views and components of this package

These publish slots and a recipe and take no `@foldkit/ui` bundle. Call
`X.view(options, h)` from `foldkit-mixins-ui`. Most own no Model or Message;
Menu, Menubar, Toast, Sheet, Picker, WindowList, TagsInput, TreeView, Carousel, Resizable,
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
| `Accordion` | `{ id, items: { id, title, content, disabled? }[], open, onToggle, headingLevel? }`; `Accordion.toggled(open, id, { multiple?, collapsible? })` is the transition `update` applies, the open ids being the application's. Each trigger is a button in a heading naming its panel; a shut panel stays drawn and `inert`. The panel opens on a `0fr`-`1fr` grid row, the chevron turns, and the open title turns semibold in its own width. A panel shuts over the time it opens in (default the theme's `moderate`), so switching sections moves both together; `--fk-collapse-duration` sets both and `--fk-collapse-close-duration` the shutting alone, each a time of the theme (`var(--fk-motion-slow)`) so the `motion` and `travel` knobs still apply. TreeView, Sidebar and ThinkingSteps groups share the two properties. The view takes an `icon` in place of the recipe's. | `variant`: `plain` (default), `bordered`, `separated`, `filled`, `ghost`; `separators`: `on` (default, between sections only), `off`; `indicator`: `chevron` (default), `plus`; `indicatorPosition`: `end` (default), `start`; `active`: `none` (default), `trigger`, `item` (the open section tinted). Slots `root`, `item`, `heading`, `trigger`, `label`, `chevron`, `icon`, `panel`, `body`, `content`. |
| `Alert` | `{ layout, title, description?, icon?, actions?, onDismiss?, words? }`, and by `layout`: `'inline'` takes `assertive?` and is a live region for something that just happened (`role="alert"` when assertive, else `role="status"`); `'banner'` takes `label` and is a full-width strip there on load, a `section` landmark named by `label`, never a live region. An action is `{ label, href }` (a link) or `{ label, onClick }` (a button); `onDismiss` draws a close button named by `words.dismiss` (`'Dismiss {name}'`: the title inline, the label as a banner), its mark `words.dismissMark`. `Alert.configure({ base, presets })` binds a look and words. Whether it shows is the application's. Given `recoveryPart`, a dismissible Alert marks its dismiss button as the `FocusRecovery` part of that name; the application attaches `FocusRecovery.behavior` to the list holding the alerts, with `parts` naming it (for example `{ dismiss: ['next', 'previous'] }`), and without `recoveryPart` dismissing one drops focus to the page. The root writes `data-layout` and `data-dismissible`. | `tone`: `info` (default), `success`, `warning`, `danger`, `neutral`, `accent`; `emphasis`: `subtle` (default, tint) or `bold` (fill; neutral inverts the page). Slots `root`, `icon`, `title`, `description`, `actions`, `action`, `dismiss`. |
| `AppShell` | An application's page frame: `AppShell.view({ title, brand?, status?, actions?, side?, footer?, mainId?, words? }, main, h)`. A skip link to the main region, a header bar (the banner) with the title and, at its end, `status` and `actions` (components: `Segmented`, `Badge`, `Avatar`), an optional side column for a `Sidebar`'s view, the main region (`id` `main` by default, focusable by script so the skip link moves focus there), and a footer. It holds no state and sends no Message; a `Sidebar` in `side` brings its own navigation landmark, collapse and phone Sheet. The header and the side column stay in view while the page scrolls; below `md` the side column, by then a Sidebar's opener, sits at the start of the header's row. `Patterns.AppShell` is its contract. | `width`: `full` (default) or `contained` (the main region's content kept to the theme's `width.page`, centred). Slots `root`, `skip`, `header`, `brand`, `mark`, `title`, `status`, `actions`, `side`, `main`, `footer`. |
| `AspectRatio` | `{ content? }`. `AspectRatio.configure({ base, presets })` binds a look once. Slot `frame`. | `ratio`: `square` (default), `video` (16/9), `portrait` (3/4); any other is `Recipes.AspectRatio.add({ ratio: { cinema: { frame: Style.self({ aspectRatio: '21 / 9' }) } } })`. The corner reads `radius`. |
| `Avatar` | `{ name, src?, picture?, initials?, status?, badges?, words? }`. The root is one `role="img"` named by the person (and the status, "Ada Lovelace, Online"); initials show until the picture covers them, the picture's alt empty. `status` (`online`, `away`, `busy`, `offline`) is a dot on the lower end corner. `src` is a URL; `picture` is `Avatar.picture({ asset, provider, width })` from `foldkit-media` (a file of its own: a page that passes `src` ships no media code; give one of the two): the picture is drawn with its 1x and 2x candidates at `width` CSS pixels, and a provider with no URL for it leaves the initials. `Avatar.widthOf(size)` is a size's width in CSS pixels, for that `width`. `Avatar.group({ people, max?, label?, words?, rest?, wrap?, style?, avatarStyle? })` overlaps them, each ringed in the page, and counts the rest as one more avatar (`words.more`, `'{count} more'`); `rest(count)` is what the `+N` disc holds in place of its text, an icon say, and `wrap(avatar, person)` draws around each. `badges: [{ content, place, label? }]` puts a mark on a corner (`top-start`, `top-end`, `bottom-start`, `bottom-end`; the bottom end is the status dot's), hidden from assistive technology, its `label` read with the name. `words` holds the four statuses and `more`. `Avatar.configure({ base, presets })` returns `{ view, group }`. An avatar beside a name and a line is an `Item` with the avatar as its media. | `size`: `xs`, `sm`, `md` (default), `lg`, `xl`; `shape`: `circle` (default), `rounded`, `square`; `color`: `neutral` (default) or `name` (initials in a hue from the name); `ring`: `none`, `page`, `accent`. Slots `root`, `fallback`, `image`, `status`, `badge`. `Recipes.AvatarGroup({ overlap: 'tight' \| 'loose' \| 'none', lift: 'none' \| 'hover' })` over `AvatarGroupSlots` (`root`); `lift: 'hover'` raises the avatar under the pointer, which `travel` stills. |
| `Figure` | `{ content, caption? }`: a `figure` holding its content (an `Image.view`, a chart, a code block), then its caption in a `figcaption`, which names the figure for assistive technology by itself; no caption, no `figcaption`. `Figure.configure` binds a look once. | `align`: `start` (default) or `center`; `caption`: `after` (default) or `before` (CSS `order` only: the markup, so the reading order, keeps it after the content). The caption is the `caption` role, muted. Slots `root`, `caption`. |
| `Frame` | `{ title?, headingLevel?, description?, action?, panels, footer? }`: a tray holding several things that belong together, each in a panel of its own (Alerts, Items, an accordion's items); it places what it is given and understands none of it. `Frame.configure` binds a look once. Use `Card` for one thing. | `variant`: `muted` (default), `outline`, `plain`; `padding`: `comfortable` (default) or `none` where the content draws its own room; `spacing`: `compact`, `comfortable` (default), `roomy`; `radius`: `md`, `lg` (default), `none`. Slots `root`, `header`, `title`, `description`, `action`, `panels`, `panel`, `footer`. |
| `FileInput` | `FileInput.view({ id, label, files, onChange, onRemove, name?, accept?, multiple?, disabled?, required?, invalid?, description?, words?, style?, mixins? }, h)`: a file picker, not a drop zone (that is `FileDrop`). A native `type="file"` input, hidden but still focusable, and a button drawn on the `<label for>` that names it (`label` is its words), so a press on the button and Enter or Space on the focused input open the browser's dialog with no script. The chosen files are a list, each row with a `remove` button named `Remove {name}` (`words: { remove? }`). The application owns `files`, `File`s compared by identity: fold a pick in with `FileInput.added(files, picked, { multiple })` (a single field takes the newest pick, `multiple` appends and skips a file already held, by name, size, type and modification time) and answer `onChange` and `onRemove` with the `FileInput.Sync({ id, files })` Command, which writes the list back into the input, so a surrounding form submits exactly the list shown (Foldkit empties the input after each pick); an empty list resets its value, so a removed file can be chosen again. Answer `onRemove` with `FileInput.Focus({ id })` as well, which puts focus on the input, since the button that held it left with its row, as `SearchField.Focus` does; both answer `FileInput.Message.CompletedSync` and `CompletedFocus`. `name`, `accept`, `multiple` and `required` are the native attributes (`accept` is an array of `.ext`, `type/*` or `type/subtype` tokens, joined with `,`; `FileInput.keyOf(file)` is the identity `added` dedupes by); `invalid` is `aria-invalid`, and `description` is read after the name. A disabled field takes no pick and its rows no remove. The view keeps nothing. | `size` is Button's ladder step. The trigger is Button's outlined neutral face, ringed when the hidden input has keyboard focus, dimmed when disabled and bordered in the error color when invalid; `remove` is Button's icon variant. Slots `root`, `input`, `trigger`, `description`, `list`, `item`, `name`, `remove`. |
| `FileUpload` | A small Model of its own: `FileUpload.init({ id, multiple?, accept?, maxSize?, maxFiles?, previews?, lanes?, initial? })` (throws, naming the option, for a bad `accept` token, a negative or fractional count, `maxFiles` without `multiple`), folded with `FileUpload.update(model, message)`, which returns `{ model, commands?, outMessage? }` (`Picked { added, replaced, refused }`, `Removed { ids }`); a no-op returns the Model given. `FileUpload.view({ model, onMessage, label, name?, required?, disabled?, readOnly?, invalid?, description?, picture?, itemActions?, progress?, routes?, sort?, words?, style?, mixins? }, h)`; `FileUpload.parts(options, h)` is the same drawing unassembled (`items[n]` has `name` and `meta` as Html and `preview`, `state`, `progress`, `actions`, `grip` as Options; an uploading row with `progress` draws no state text) for a Table or Card. An `Offered { files, by }` Message (pick, drop, paste) is judged per file (Kind, TooLarge, Duplicate) and all-or-nothing against `maxFiles`; kept files are `Held` (no lanes) or `Queued`, then `Uploading { lane }` as a lane frees. The picker is the input's `label`, always its next sibling, and owns the drag events; `Recipes.FileUpload`'s `layout` (`button`, `zone`, `avatar`, `cover`) only restyles it, and what is drawn follows the view's options (`picture` draws the single-image face and no list; `words.prompt` a zone's invitation). Sending is the application's: `FileUpload.lanes({ count, model, send })` returns one Subscription entry per lane (`lane` is one), `send` turns a `Job { id, attempt, file }` into a Stream of the application's Messages, which fold `Progressed`, `Succeeded`, `Failed` back; a stale attempt changes nothing; `Retried` requeues a retryable failure. `progress` is built by the application (`FileUploadProgress.make({ style })`), so a field that sends nothing never loads Progress. Sorting is the application's too: place `Reorder`, give `sort: { input, mixin }`, apply `Moved` with `FileUpload.ordered`, and add `FileUploadSort.keepFocus` to `mixins` to keep a grip's focus through a keyed move. The widget writes the local files back into the input after every change (`FileInput.Sync`), so a form posts them; `settled(model)` is the JSON-safe Model; `released(model)` revokes preview URLs and the application calls it when it drops the widget. Enter and Space belong to the dialog and Backspace and Delete remove the last file: `FileUpload.conflict(routes)` names a clash. `Bundles.FileUpload` places the same state (args are `init`'s options; it reports `Picked` and `Removed`, answered with `onOut` or `Bundle.ignore`; the application still adds `FileUpload.lanes` to its Subscriptions), and `FileUpload.configure({ base, presets })` returns `{ view, parts }` bound to `style`, `words`, `picture`, `itemActions`, `progress` and `mixins`; `sort` and `routes` stay at the call. | `layout`, `list` (`rows`, `grid`), `size`. Slots `root`, `input`, `picker`, `prompt`, `browse`, `constraints`, `description`, `picture`, `status`, `errors`, `error`, `summary`, `clear`, `list`, `item`, `preview`, `name`, `meta`, `state`, `progress`, `actions`, `retry`, `remove`, `grip`. |
| `Image` | `{ asset, provider, layout, alt, priority?, sizes? }` from `foldkit-media` (`Image.configure({ base, presets })` binds a layout and look; `Image.watchLoad` and `Image.audit` are in files of their own, so a page that names neither ships neither): a `picture` with a `source` per format the provider offers and an `img` with its candidates, `sizes`, `width` and `height` (the box is held before the file arrives), lazy unless `priority` (then `fetchpriority="high"`). `alt` is what the image shows in words (a string, or `Image.described(text)`) or `Image.decorative` (`alt=""`, `role="presentation"`), never omitted; `Provider.hosted` takes only a `HashedAsset`. The `img` carries `--fk-image-ratio`, `--fk-image-placeholder` (none behind a transparent image) and `data-layout` (`fixed`, `constrained`, `full`); a provider with no URL for the image leaves an empty frame marked `data-unavailable`. An unavailable image keeps its box and is `role="img"` named by its alt text (hidden when decorative). `--fk-image-focus` places a crop at the asset's focal point. `placeholder: 'detail' | 'average'` chooses how much of a ThumbHash to paint; by default the picture for `priority`, the color otherwise. `Image.watchLoad`, beside the style, marks the `img`'s `data-state` (`loading`, `loaded`, `failed`); the recipe hides a failed image, keeping its box. `Image.audit`, beside the style in a development build, warns in the console of an image drawn wider than its file (blurry) or far narrower (wasted bytes), and of more than one image drawn with `priority`. `Image.preloadsIn` is a `foldkit-ssr` `Head`: the `<link rel="preload">` of each image the rendered page drew with `priority`. | `fit`: `cover` (default) or `contain`; `edge`: `none` (default) or `line` (the faint inset line); `ratio`: `auto` (default), `square`, `video` (16:9), `portrait` (3:4), cropped at the asset's focal point (an unavailable image holds the cropped box); `radius`: `none` (default), `sm`, `md`, `lg`, `full`. The placeholder paints the `img`'s background. Slots `frame`, `source`, `image`. |
| `Badge` | `{ text, tone?, icon?, onDismiss?, href?, external?, words? }` writes `data-tone`; `onDismiss` draws a dismiss button, `href` draws a link (never both). | `Recipes.Badge({ appearance?, size? })`: `appearance` `tinted` (default), `dot`, `outline`, `solid`; `size` `sm`, `md`, `lg`. The tone is the word the badge carries (`accent`, `neutral`, `info`, `success`, `warning`, `danger`); `Recipes.badgeTones(attribute, map)` through `extend` maps an attribute of your own. Slots `badge`, `icon`, `dismiss`. |
| `Breadcrumb` | `{ words?, steps: { label, href?, current?, icon?, trailing?, labelHidden? }[], separator?, collapse? }`. `words` is `{ label, more, ellipsis }` (defaults `Breadcrumb.words`, merged word by word): the landmark's name (`Breadcrumb`), the ellipsis's name (`Show {count} more`, `{count}` the hidden steps) and its mark (`…`). `current` is text with `aria-current="page"`; the others are links. `trailing` draws after the label (a count), in the `trailing` slot; `labelHidden` draws no words, and the label is the step's accessible name, for an `icon` that says it. An `icon` draws before its label, hidden from assistive technology. `separator` is drawn between steps in place of the recipe's; `collapse: { max, onExpand }` folds the middle of a long trail into an ellipsis (`Breadcrumb.collapsedOf(steps, max)` is the split). `collapse: BreadcrumbMenu.make({ max, menu: { model, onMessage, mixins } })` makes the ellipsis open a Menu of the hidden steps instead (a value from its own module, so a trail that opens none loads no Menu; any `CollapseFeature`, `{ max, draw }`, is the same seam for a fold of your own): the Menu's Model is the application's, built from `Breadcrumb.menuRows(steps, max)`, and `Breadcrumb.chosen(steps, max, value)` is the step a row leads to (a row's value is its step's place among the hidden steps, so two steps of one label are two rows). | `item`: `plain` (default), `pill`, `button`. `separator`: `slash` (default), `chevron` or `dot`, drawn where the view is given no `separator` of its own. The separator is drawn after each step but the last, so a wrapped trail never begins a line with one. Slots `root`, `list`, `item`, `link`, `current`, `icon`, `trailing`, `separator`, `ellipsis`, `dots`. |
| `ButtonGroup` | `{ label, items, orientation?, separated? }`. `role="group"`, joining its items: borders overlap by one, only the outer corners round. An item is the caller's button, field or Menu (a wrapper passes the corners to its face), or a string drawn in the `text` box (a count, a prefix). `orientation: 'vertical'` stacks them; `separated` draws a rule on each seam, for solid buttons. `Segmented` is the control that selects. | `size`: `sm`, `md`, `lg`; `width: 'fill'`. Slots `root`, `separator`, `text`. |
| `Card` | `{ title?, description?, content?, image?, media?, action?, footer?, press?, label?, selected?, disabled?, dismiss?, words? }`. `press` is `Press` (`press.ts`): `{ onClick }` or `{ href, external? }`: one button or link stretched over the card, named by `label` or the title (a pressable card with neither throws); `action`, `footer` and the dismiss button stay pressable above it. `selected` is `aria-pressed` on the button, `aria-current="page"` on the link. `headingLevel` (2 to 6, default 3) is the level of the title's heading. `recoveryPart` marks the dismiss button as a `FocusRecovery` part, as the Alert's does. A `disabled` card's overlay is `aria-disabled` and sends nothing, so it stays focusable (a link loses its `href`). `dismiss: { onDismiss, always? }` is revealed on hover and focus unless `always`, and always on a touch screen; `words` holds its name (`dismiss`, `{name}`), `dismissAlone`, `dismissMark` and `newTab`. `Card.configure({ base, presets })` returns `{ view, group }`. The root carries `data-selected`, `data-disabled`, `data-pressable`, `data-dismissible` (the header then keeps clear of the button). | `orientation`: `stacked` (default), `inline` (image or media leading, footer trailing), `overlay` (the image fills the card, the text lies over its foot on a fade to the card's surface). An `image` bleeds to the card's edges (16:9 when stacked); `media` puts a bare icon (`svg`, `img`) in a tile and lets anything else, an Avatar say, lead at its own size. `surface`: `outlined` (default), `elevated`, `filled`, `plain`. `padding`: `compact`, `comfortable` (default), `roomy`, `flush`. `elevation`: `0` to `3`, a step of the surface ladder (lighter in a dark scheme; a contact and an ambient shadow in a light one). `divide`: `none` (default), `header` or `sections`, a hairline under the header, or under it and over the footer, edge to edge. `lift`: `none` (default), `hover`, a lift under the pointer that `travel` stills, or `zoom`, the picture growing inside its frame (`travel` stills it) (not in a `Card.group` given `fluid`, whose highlight is the hover there). The stretched press control is `press.ts`'s `overlay`, shared with Item, so an Item page ships no Card. Slots `root`, `image`, `media`, `header`, `title`, `description`, `action`, `content`, `footer`, `overlay`, `dismiss`. |
| `Card.group` | `{ cards: (CardView & { key })[], columns?, fluid?, label?, wrap?, cardStyle? }`. A keyed list of cards in up to `columns` (default 1), which wraps to fewer where a column would be narrower than the recipe's `minColumn`; the root carries `--fk-card-columns` and `data-card-fluid`. Given `fluid: Card.fluid` (`card/fluid.ts`; a page that never names it ships no `FluidHover`, and a group without it draws no highlight) one highlight follows the pointer to the nearest card, reading both directions when there is more than one column, and a press in a gap presses the highlighted card. `cardStyle` styles every card that names no style of its own. | `Recipes.CardGroup`: `layout`: `divided` (default, hairlines between cards, wherever the row wraps), `separated` (apart, for cards with a surface). `minColumn`: `none`, `sm`, `md` (default), `lg`, the narrowest a column may be (10, 14, 18rem); `none` keeps every column at any width. `border`: `none` (default), `outlined`. The highlight is a film over the card the pointer is on, and is that card's hover: a card in a group with one draws no hover of its own, whatever its `surface`. Divided cards are usually `surface: 'plain'`. Slots `root`, `list`, `item`, `highlight`. |
| `Carousel` | The APG carousel: `Carousel.init({ id, index?, autoplay?, delay?, reducedMotion? })`, folded with `Carousel.update({ count, perView?, loop? })`, drawn with `Carousel.view({ label, model, slides, onMessage, loop?, perView?, picker?, thumbnails?, slideLabel?, previousLabel?, nextLabel?, pickerLabel?, rotationLabels?, style? }, h)`. A group with `aria-roledescription="carousel"`, each slide a group named "2 of 5"; previous and next (`aria-disabled` at the ends unless `loop`), a dot per place the track can rest (or `thumbnails` in their place), and a polite status naming the slide shown. The track is a CSS scroll-snap scroller, so swipes move it natively, and `ScrollSettle` reports where a swipe rests, so the dots follow the finger. Every press, swipe and timer reaches `update`, which returns the `Carousel.ShowSlide` Command that scrolls the track: do not keep the slide yourself. With `autoplay` it moves on every `delay` (4s), the current dot filling as it waits; it pauses under the pointer, stops when focus arrives by the keys, quiets its status while it rotates, and draws the APG's rotation button first. `reducedMotion` in `init` (the application's reading of `prefers-reduced-motion`) starts an autoplaying carousel stopped, and a slide out of view is `inert`. | `peek`: `none` (default) or `edge`. Slots `root`, `track`, `slide`, `controls`, `rotation`, `previous`, `next`, `picker`, `dot`, `thumbnail`, `status`. |
| `ColorPicker` | After ReUI's: a saturation and brightness area, hue and alpha Sliders, an eyedropper when the application passes `eyedropper: true` (default `false`: the view reads no environment; take `ColorPicker.canEyedrop()` into the Model, in `init` or from a Command after hydration; `ColorPicker.Eyedrop`), text in hex, rgb, hsl or oklch, and `presets` as a radio group of swatches. The color, its format and a draft being typed are `ColorPicker.Model` (`init({ id, color?, format? })`), folded with `ColorPicker.update`: keys and drags reach `update` as what was pressed, so fast keys each step from the last color. Drawn with `ColorPicker.view({ model, onMessage, label, presets?, alpha?, eyedropper?, labels?, disabled?, style?, slider? }, h)`; `ColorPicker.popover({ ...options, popover, onPopover, anchor?, popoverMixins? }, h)` draws it behind a swatch in a Popover made with `contentFocus: true` (it throws for one without): the panel opens on the area's thumb, a press or a drag inside never closes it, whatever opened it, and focus leaving it closes one the keys or a finger opened (a mouse's stays open, as upstream's Popover does). `ColorPicker.color('#3b82f6')` reads a literal in code (it throws on a typo); `format`, `parse` (an `Option`) and `toOklch` are pure. | `size`. Its Sliders take `Recipes.Slider({ track: 'paint', label: 'hidden' })`. Slots `root`, `label`, `area`, `areaThumb`, `controls`, `eyedropper`, `channels`, `channel`, `swatch`, `fields`, `format`, `input`, `presets`, `preset`, `picker`, `trigger`, `value`. |
| `Command` | `{ id, label, placeholder?, groups: { heading?, items: { value, label, description?, keywords?, shortcut?, icon?, opensPage?, disabled? }[] }[], query, onQuery, active, onActive, onRun, empty?, loading?, page?, routes?, hints?, kbd? }` (`Command.configure({ base, presets })` fixes `placeholder`, `empty`, `hints`, `kbd`, the style and mixins once), a `shortcut` being a tuple of keys (`['⌘', 'K']`) drawn as Kbd with `kbd`. `page: { trail, onBack }` draws the pages stepped into as crumbs before the field, and Backspace in an empty field sends `onBack`; a row with `opensPage` has a chevron. `loading` says it and marks the list `aria-busy`, its rows still shown; `hints` are a footer of keys. `Command.hotkey(message)` is ⌘K or Ctrl+K anywhere, for an application to lift with `Subscription.persistentEntry` and open its Dialog on; `Command.filtered(groups, query)` is what a query leaves. `routes` are keys the application answers in the field, such as Escape clearing the query or Home and End moving the highlight: each is a `Behaviors.Keys.Route` (`CommandRoute`) whose `handle` reads a `CommandKeyInput` of the query, the highlighted row and the rows the keys step through, and the routes share one keydown owner with the menu's own, so a route on the same gesture as another throws `mixins:key-conflict` naming both. `Command.keepActiveInView` beside the style scrolls the highlighted row into view as the keys move it, the least that shows it; it is a mixin, off by default, because its Mount sends no Message. shadcn's Command and Fluid's CommandMenu: the field points at the highlighted row through `aria-activedescendant`, ↑ and ↓ wrap through enabled rows, PageUp and PageDown move the highlight ten rows and stop at the ends, Enter runs the highlighted one, and Home and End stay the field's caret keys; rows never re-sort, and a filtered-away highlight moves to the first enabled row. The list stands in a `frame` beside its bar, which `Command.overlayBars` drives (see [Overlay scroll bars](#overlay-scroll-bars)). A shortcut reads left to right on a right-to-left page. The card is 32rem wide unless its parent is narrower; its field is led by a magnifier, `--icon` on `search` for another. | `frame`: `card` (default) or `bare`, for inside a dialog. Slots `root`, `search`, `crumbs`, `crumb`, `input`, `list`, `group`, `heading`, `item`, `icon`, `text`, `label`, `description`, `shortcut`, `chevron`, `status`, `empty`, `loading`, `frame`, `bar`, `thumb`, `footer`, `hint`. |
| `Calendar` | One date system, inline: `Calendar.Selection` is `Single`, `Range` or `Multiple`, a type of the Calendar's own, so its state holds it. `Calendar.init(args)`/`update`/`set` and `Bundles.Calendar` (args `{ id, today, selection?, months?: 1 \| 2, minDate?, maxDate?, disabledDaysOfWeek?, disabledDates?, locale? }`; OutMessage `Changed { selection }`; helper `set`) hold the month shown, a second month, the selection and a range's preview. `Calendar.view({ model, onMessage, label, … }, h)` draws it: `weekNumbers`, `caption` (`'grid'`, `'label'`, `{ dropdowns: { years?, month?: 'select' \| 'label' } }`), `paging` (`'both'`, `'previous'`, `'next'`, `'none'`, `'end'`), `today: { label, selects? }`, `presets: [{ label, selection }]`, `detail`, `aside` and `footer` (the application's own drawings), `words` (`Calendar.words`), `style`, `mixins`; `Calendar.configure({ base, presets })` binds all but the wiring and the two drawings. Read the value with `Calendar.selectedDate`, `rangeOf`, `datesOf`, `firstDate`. The adapter rung, for a calendar the application folds or draws itself, has the selection owned by the application (`Calendar.empty(mode)`, fold each `SelectedDate` through `Calendar.picked`, `Calendar.isComplete` says when a picker may close). Spread `Calendar.inputs(selection, mixins, { h })` into upstream `Calendar.view`'s inputs: its `toView` (`Calendar.toView(selection, mixins, { h })`) marks each chosen day `aria-selected`, a range's ends `data-selected` with `data-range-start`/`data-range-end` and every day between `data-in-range`, and its `maybeSelectedDate` (`Calendar.selectedDate(selection)`, a Single selection's day) agrees with it. The grid of a Range or Multiple selection is `aria-multiselectable`. A selection in a popover is the DatePicker's. Options, the fourth argument of `toView`, `inputs` and `resolve` (`CalendarOptions`): `weekNumbers`, `caption: 'label'` or `dropdowns: { model, onShow, years?, month?, words? }` (month and year selects; answer `onShow` with `Calendar.show`), `paging` (`'end'` draws both buttons after the caption) with `Calendar.alongside(model, other, offset)` for two months side by side, `preview: { date, onPreview }` for a range under the pointer, and `detail: date => Option<string>` for a line under a day's number (a price, "2 events") that describes its button; `ResolvedDayCell.detail` holds it. `ResolvedDays`' paging buttons are `Option`s and its heading is a `caption` (`Grid`, `Label`, `Dropdowns`, `YearDropdown`). Presets: `Calendar.lastDays`, `nextDays`, `monthOf`, `day`, drawn by `Calendar.presetsView`. `Calendar.localeOf('de-DE')` reads upstream's `locale` from Intl. | `size` (the Calendar's); `outside`: `shown` (default), `hidden`; `detail`: `text` (a taller rounded day holding the line), `dot` (the line as a dot, its words left to a screen reader), unset by default. Slots `CalendarSlots`. |
| `Empty` | `{ title, description?, icon?, action? }`. The title takes the `subtitle` role; the icon is `aria-hidden`. `Empty.configure` binds a look once. | `media`: `icon` (default), `illustration`; `frame`: `none` (default), `dashed`, `filled`; `tone`: `neutral` (default), `danger`; `size`: `compact`, `comfortable` (default). Slots `root`, `icon`, `title`, `description`, `action`. |
| `HoverCard` (recipe) | Styles `@foldkit/ui`'s HoverIntent (`HoverIntentSlots`): a trigger read as a link, a raised panel fading in on the fast tier as it is drawn. Place the panel with `HoverIntent.toView`'s `anchored`, which shows it in the top layer with an `arrow`; the open and close delays are HoverIntent's (200ms and 300ms by default). The trigger carries `aria-expanded`, and `aria-describedby` for the panel while it is open. | No axis. Slots `trigger`, `panel`, `arrow`. |
| `Icon` | `{ icon, label?, key?, mark? }` or `{ glyph, label?, mark? }` (data or a drawing of your own, never both). A `label` is `role="img"`; without one the glyph is `aria-hidden`. `foldkit-media`'s `Icon.draw(icon, h)` is an `IconData`'s inline SVG, which the glyph fills. | `size`: `xs`..`xl` on the type scale; none (the default) stands on the size ladder, 16px or 14px compact. `surface`: `outline`, `soft`, `solid`, `raised` (a tile twice the icon); `tone`: `accent`, `neutral`, `info`, `success`, `warning`, `danger`; `shape`: `circle`, `square`. Slots `glyph`, `mark`. |
| `InputCopy` | A read-only value with a copy button, Zag's clipboard: `InputCopy.view({ id, label, value, copied, failed?, onCopy, copyLabel?, copiedLabel?, failedLabel?, style? }, h)`. The view is stateless: answer `onCopy` with the `InputCopy.Copy({ text })` Command, which yields `foldkit-primitives/dom`'s `ClipboardMessage` (`Copied` or `CopyFailed`, never a throw); `copied` is the application's, and `InputCopy.Model` keeps it: `InputCopy.init({ resetAfter? })` (default 2000ms), folded with `InputCopy.update`, where `Copied` on `ClipboardMessage.Copied` shows it copied and starts the `Reset` Command that sets it back unless a later copy came first; pass `model.copied`. `Failed` on `ClipboardMessage.CopyFailed` does the same for a refused copy (`failed`, never together with `copied`, reset the same way): pass `failed: model.failed`, and the status region says `failedLabel` (default `Copy failed`) while the button carries `data-failed`. The button is named `Copy <label>`; copied, it reads `Copied` and a polite status region says so. | No axis. Slots `root`, `label`, `group`, `input`, `button`, `status`. |
| `Item` | The row primitive: `{ header?, media?, title?, description?, content?, actions?, footer?, press?, label?, selected?, disabled?, words? }`; `content` follows the title and description; `header` and `footer` are bands across the row. `press` is `Press`, one control stretched over the row (`overlay`, as a Card's) and named by `label` or the title, `actions` staying pressable above it; `selected` is `aria-pressed` or `aria-current`. `Item.group({ items: (ItemView & { key })[], label?, wrap?, style?, itemStyle? })` is a list of them; `Item.configure` returns `{ view, group }`. Field is for form controls. | `variant`: `plain` (default), `outline`, `muted`; `density`: `comfortable` (default), `compact`, `roomy`; `media`: `plain` (default), `icon`, `image`. Slots `root`, `header`, `media`, `content`, `title`, `description`, `actions`, `footer`, `overlay`. `Recipes.ItemGroup({ layout: 'divided' \| 'separated' })` over `ItemGroupSlots` (`root`, `row`). |
| `CheckboxGroup` | `{ id, legend, options: { value, label, description?, disabled? }[], checked, onToggle, error?, name?, selectAll? }`; `toggled(checked, value)` is one option's transition, `coverage(options, checked)` is `none` \| `some` \| `all` (a disabled option counts for neither), and `setEnabled(options, checked, on)` is every enabled option or none, a disabled one keeping its state in `checked`. `selectAll: { label, onSet }` draws a first row checked, `mixed` or not by `coverage`, whose press sends `onSet` with `setEnabled`'s values. A `fieldset` named by its `legend`, each option the APG's checkbox (`role="checkbox"`) named by a `label` for it, so a press on the words toggles it. `error` is shown under the options: the `fieldset` is described by it and each checkbox is `aria-invalid`, as a `fieldset` has no such property. `name` submits each checked value as one `hiddenInput`, in the options' order. | `variant`: `plain` (default), `list` (checked rows fill, and merge where they stand together; a vertical list has no gap, or the block would split). `orientation`: `vertical` (default), `horizontal` (a wrapping row). The checkbox sits on the label's row, so a description does not pull it down. Slots `root`, `legend`, `options`, `option`, `checkbox`, `label`, `description`, `error`. |
| `CodeBlock` | `{ code, tokens?, language?, title?, lineNumbers?, copy? }`; `tokens` are a tokenizer's `{ from, to, kind }` (`foldkit-richtext-code`, `-shiki`); `copy.onCopy(code)` sends a Message, so run `copyText` from `foldkit-primitives`. A final line break is not a numbered line, and a copy is announced in the `status` slot. | No axis; colors kinds from the theme's `syntax` group. Slots `root`, `header`, `title`, `copy`, `status`, `body`, `code`, `line`, `token`. |
| `Kbd` | `{ key }`, text or a drawing. Names the key. `Kbd.combo({ keys, joiner? }, h)` draws several (each text or a drawing) in one `kbd`, with an optional joiner between them. | No axis. Slots `key`, `combo`, `joiner`. |
| `Label` | `{ for, text, required?, optional?, disabled?, invalid?, trailing?, words? }`. Names a control by `for`. `required` is a hidden star and `optional` words that are read (never both); `disabled` and `invalid` write `data-disabled` and `data-invalid` on the label alone; `trailing` stands beside the label (slot `root` holds both), so a button there is not inside the `label`. | No axis. Slots `label`, `marker`, `trailing`, `root`. |
| `Menubar` | A row of `@foldkit/ui` Menus, shadcn's and the APG's menubar: `Menubar.view({ label, model, menus, onMessage, direction?, anchor?, routes?, style?, menuMixins? }, h)` (`Bundles.Menubar.with({ ids, isAnimated?, isModal? })` places the Model and reports `Selected` with the menu's index; `Menubar.configure({ base, presets })`), each menu's `{ label, rows, isRowDisabled?, header?, footer? }` (Html in its panel above and below the rows) taking a Menu's rows (none opening a submenu), its Model (`Menubar.init(ids, { isAnimated?, isModal? })`) folded with `Menubar.update`, whose `Selected` OutMessage names the menu and the row's `value`. One trigger is the tab stop; ArrowLeft/ArrowRight (Home/End while all are shut) move it, swapped under `direction: 'rtl'` (drawn as the bar's `dir`), and with a menu open they open the next on its first row. While one is open, pointing at another opens it, and opening any shuts the rest. `routes` takes keys the application answers on the bar, beside the arrows, Home and End; a route on the same gesture is a `mixins:key-conflict` diagnostic naming both. `Recipes.MenubarMenu` is the Menu recipe with a bar's flat triggers. | No axis. Slots `bar`, `menu`; each menu's are `MenuSlots`. |
| `Meter` | `@foldkit/ui`'s Meter: `Meter.view({ id, label, value, min?, max?, low?, high?, optimum?, valueText?, style? }, h)` draws a `meter` named by its label. The root says how good the value is as `data-level` (`good`, `fair`, `poor`), as the HTML meter judges it; `Meter.levelOf` is that judgment. A measurement, where `Progress` is work. | No axis; the fill takes success, warning or error by level. Slots `root`, `label`, `track`, `fill`. |
| `Nav` | Two layers. `Nav.toView(mixins, { h }, label, draw?)` styles `@foldkit/ui`'s stateless Nav, drawing `nav > ul > li > a` with the current link `aria-current="page"`. `Nav.view({ model, entries, label, onMessage, orientation?, direction?, routes?, panelRoutes?, mixins? }, h)` (`Bundles.Nav.with({ id })` places the Model; `Nav.configure({ base, presets })`; a link and a panel link take `icon`, a panel `footer`; recipe `panel: 'grid'`) is a navigation menu: links and triggers whose panels of link columns (`groups` of `{ label, href, description?, current?, icon? }`) show in the top layer, with the APG's disclosure-navigation keys (Escape, ArrowDown into a panel, the arrows, Home and End along the row; a press outside and focus leaving close it); which panel shows is `Nav.init(id)`'s Model, folded with `Nav.update`. A trigger names its panel in `aria-controls` only while the panel is drawn, and links are keyed by place as well as address, so two links to one address do not collide. `routes` takes keys on the top-level links and triggers, beside the row's own: the input is the entry and `item.index` its place; `panelRoutes` takes keys on a panel's links, where the input is the link and `item.index` its place among the panel's links. `Nav.fluid` beside the style glides a line to the current link and a faint pill to the one the pointer nears. | `indicator`: `underline` (default), `pill`; `orientation: 'vertical'` is a column whose panels open beside it. Slots `nav`, `list`, `item`, `link`, `trigger`, `chevron`, `panel`, `groups`, `group`, `heading`, `links`, `panelItem`, `panelLink`, `title`, `description`, `indicator`, `highlight`. |
| `Menu` | One menu, opened three ways: `Menu.init(id, rows, { isAnimated?, isModal? })` (a row with `items` hosts a submenu, one level deep; `isAnimated` gives the menu's and its submenus' panels upstream's transition marks, for the recipe's fade, and `isModal` makes the rest of the page inert while the menu is open), folded with `Menu.update`, drawn with `Menu.view({ model, rows, buttonContent, onMessage, opensAt?, direction?, anchor?, header?, footer?, isRowDisabled?, mixins, submenuMixins? }, h)` (`anchor` merges over `bottom-start` and a 4px gap; `header` and `footer` are Html in the panel outside the rows; a row's `content` replaces its words, `label` staying its name; `Bundles.Menu.with({ id, rows, ... })` places the state and answers `Selected`; `Menu.configure({ base, presets })`), the style being one of the `mixins` (`[MenuStyle.mixin]`). By a button (`opensAt` unset); at a point (`opensAt: 'point'`, with `Menu.target(onMessage, h)` on the area: a right press records its point and the `contextmenu` after it opens the menu there; a finger or a pen held there `Menu.HOLD_MS`, 500ms, opens it too, as iOS fires no `contextmenu`, while one that moves 10px is a scroll; give the area `-webkit-touch-callout: none` and `user-select: none`, or iOS shows its own callout over it). A row is an `ItemRow` (`{ value, label }`: the `value` names the row, unique among the menu's rows and their submenus' items, and is what `isRowDisabled`, `Selected` and `Menu.checkChosen` use; the `label` is what is drawn and what typeahead matches, so two rows may read alike; type the values by a union with `Row<'a' | 'b'>`), a `CheckRow` (`check: 'checkbox' \| 'radio'`, `checked`: `menuitemcheckbox` or `menuitemradio` with `aria-checked`; choosing it sends `Selected` and leaves the menu open, the application keeping `checked`, a radio row's group being the rows of its `group`), or a `SubmenuRow` (`items`, each an `ItemRow`, and `isItemDisabled?` asked of their values). Any row may name a `group` (rows next to each other with one group stand under its heading, a separator between groups), a `shortcut` (keys drawn at the row's end as Kbd with the view's `kbd`, named in `aria-keyshortcuts`; the menu binds nothing), an `icon` (an `Html` drawn before the label in the `icon` slot, hidden from assistive technology; the row's gap spaces it), a `hint` (a quiet note at the end of the row, before the shortcut, in the `hint` slot) and `tone: 'destructive'` (`data-tone`). A submenu's items take the same parts. A submenu's row is a `menuitem` with `aria-haspopup="menu"` and `aria-expanded`; ArrowRight, Enter or Space opens it on its first row, ArrowLeft or Escape closes it back to the row (under `direction: 'rtl'`, drawn as the root's `dir`, the submenu opens on the left, its chevron points there, and the arrows swap), a pointer resting 150ms opens it, and choosing a leaf closes everything. `Selected` names the row's `value` and the `value` of the submenu's row it came from. Pass `Menu.fluid` beside the style (in `submenuMixins`, not `mixins`, where rows open submenus). Its panels, submenus included, draw in the top layer. A `@foldkit/ui` Menu the application folds itself, for typed items or groups, is drawn through the panel adapter instead, and opens at a point with `Menu.drawAtPoint` and `Menu.pointTarget` (see [Why some components needed a fork](#why-some-components-needed-a-fork)). | No axis. Slots `MenuSlots`. |
| `NumberField` | `{ id, label, description?, value, onChange, min?, max?, step?, page?, locale?, name?, required?, disabled?, invalid?, readOnly?, start?, end?, words? }` (`words`: `decrease`, `increase`; `start` and `end` go around the number inside the box; recipe axis `steppers`: `split`, `end`, `none`), or `format` with `parse` in place of `locale`; `NumberField.parseNumber(text, locale?)` reads text as that locale writes a number; `NumberField.settled(value, bounds)` clamps a value onto its step. The APG's editable spinbutton: an input with `role="spinbutton"` that the arrows, PageUp and PageDown, Home and End step, a typed number committing on change, between steppers out of the tab order that disable at their bound. `value` is an `Option<number>`: none is an empty field (no `aria-valuenow`, and the steppers start from the bounds), and clearing the text sends `onChange(Option.none())`. What the field draws is what it accepts: `locale` draws and reads that locale's marks (`de-DE`: `1.234,5`), `format` with its `parse` (`Option.none()` for text that is no number, which leaves the value as it was) is for anything else, and with neither it is `String` and a plain number. `name` submits the text the field shows, and `required` is the native `required` with `aria-required`. | No axis. Slots `root`, `label`, `group`, `input`, `decrement`, `increment`, `description`. |
| `OtpField` | `{ id?, name?, label, value, onChange, length?, pattern?, groups?, disabled?, readOnly?, invalid? }`; `OtpField.kept(text, length, pattern)` filters a code. shadcn's input-otp: one real input (`autocomplete="one-time-code"`, paste and Backspace the browser's) over cells that mirror it, the next cell marked `data-next` for its caret. `id` names the input for a label or a form, `name` submits the code, `readOnly` lets it be read and copied, and `invalid` marks the input `aria-invalid` and each cell `data-invalid`; disabled and invalid cells have looks of their own. | No axis. Slots `root`, `input`, `group`, `cell`, `separator`. |
| `Pagination` | `{ page, pageCount, onPage, siblings?, boundaries?, numbered?, ends?, icons?, range?, words? }`. Fewer than two pages draws no stops; with a `range` it still draws the summary and the page-size select. `Pagination.itemsOf(page, pageCount, window?)` is the stops; `Pagination.summaryOf(page, { total, perPage }, summary?)` is `"1–10 of 97"`, drawn with `range`; `range.choose: { sizes, onPerPage }` adds a rows-per-page select. `numbered: false` leaves previous and next alone; `ends` draws first and last; `icons: { first?, previous?, next?, last? }` draws an Html in place of a stop's word, which stays its name; `Pagination.configure({ base, presets })`. `words: { label, first, previous, next, last, stop, ellipsis, ofCount, perPage, summary }` (`Pagination.words`, merged word by word) is every word it says, as text with blanks: `stop` is `"{word} page"` (each stop's name), `ofCount` ` / {count}`, `summary` `"{from}–{to} of {total}"`, for another language. A stop at an end is `aria-disabled`, not `disabled`, so it keeps focus and sends nothing. The current stop holds ` / 12` (`pageCount`, hidden from assistive technology). | `compact`: `narrow` (default, a window under 30rem), `always`, `never`: only the current number shows, with its total; `shape`: `square`, `round`; `treatment`: `ghost`, `outline`. The current stop reads `aria-current`. Slots `root`, `summary`, `perPage`, `perPageSelect`, `first`, `prev`, `next`, `last`, `page`, `pageCount`, `ellipsis`. |
| `PasswordInput` | `PasswordInput.view({ id, label, value, onInput, visible, onToggle, autocomplete?, toggleLabel?, description?, invalid?, disabled?, name?, required?, attributes? }, h)`: a password field whose toggle button (`aria-pressed`, `aria-controls`, one fixed name) shows it as text. `autocomplete` is `current-password` (default) or `new-password`; spellcheck and autocorrect stay off. `strength` is a gauge the app draws (`Meter.view(…, h)`), placed under the field, so a page with none ships no Meter; `requirements` are `{ label, met }[]` (`PasswordRequirement`), listed and each read as met or not (`requirementStates`); `capsLock: { on, onKey }` says Caps Lock is on, politely, `onKey` given `capsLockOf(key, modifiers)` for each key (an `Option`: none for a key that says nothing of it). The app owns the text, the flag and the Caps Lock reading. `attributes: { input?, toggle?, … }` adds to a Slot before the mixins resolve. | `size` (`sm`, `md`, `lg`). Input's pieces in InputGroup's box; the eye is `Icons.glyph` by `aria-pressed`. Slots `root`, `label`, `group`, `input`, `toggle`, `description`, `strength`, `requirements`, `requirement`, `requirementState`, `capsLock`. |
| `Progress` | `@foldkit/ui`'s Progress: `Progress.view({ id, label, value, min?, max?, valueText?, style? }, h)` draws a `progressbar` named by its label. `value` is an `Option`; none is indeterminate, and the bar's fill sweeps toward the inline end, leftward right to left. The root carries the share done as `--fk-progress`. `showValue` draws the value (`valueText`, else a percentage) at the end of a bar's label line and inside a ring. A `value` given as `ProgressSection`s is one stacked bar of toned parts, read aloud as their sum; `buffer` draws how far the work could go behind the fill; `segments` cuts the track into steps. | `shape`: `bar` (default) or `ring`, Circular Progress; `tone`: `accent`, `neutral`, `success`, `warning`, `error`, `info` (Meter's tokens); `stripes`: `none` (default), `still`, `moving` (travel-aware); `size`: `sm`, `md`, `lg`. Slots `root`, `label`, `track`, `indicator`. |
| `Rating` | `Rating.view({ id, label, value, onChange, max?, starLabel?, readOnly?, disabled?, name?, style? }, h)`: a `radiogroup` of native radios named by its label, one per star under one name (`name`, which defaults to `id`), so the browser's arrows move the choice and a form submits it. `value` is an `Option`; none is unrated. Read-only, it is one `img` whose name says the rating. `precision: 0.5` draws two radios a star; a read-only value of any fraction fills its last star part way. `onClear` is sent by a press on the star already chosen; `showValue` shows `starLabel` of the rating beside the stars, so a word per value is one function. Home and End on a star are a key route that focuses the first or last star by its id (`<id>-<value>`) and chooses it; a read-only or disabled rating draws none. A read-only rating (`readOnly: true`) takes no `onChange`. | `tone`: `warning` (default, gold), `accent` or `error`; `glyph`: `star` (default), `heart`, `circle`, or `--_fk-rating-shape`; `size`: `sm`, `md`, `lg`. Stars are a CSS `clip-path` on each radio's `::before`; pointing previews the rating. Slots `root`, `label`, `star`. |
| `ScrollArea` | `{ content }`. The height that makes it scroll is the caller's mixin, on `viewport` or `root`; a width goes on `root`. The viewport is tabbable; a `label` makes it a `region` landmark of that name. A bar per axis is drawn beside it; `mixins: ScrollArea.overlayBars` lays them over the viewport's edge, driven by `ScrollBars` (4px thumb, 6px hovered, fades when idle; native on a coarse pointer). | `orientation`: `vertical` (default), `horizontal`, `both`; the first two fade toward an edge with more and draw a hairline there. Slots `root`, `viewport`, `bar`, `thumb`. |
| `SearchField` | `SearchField.view({ id, label, value, onInput, clear?: { onClear, content? }, start?, end?, busy?, placeholder?, invalid?, disabled?, words?, routes?, style?, mixins? }, h)`: a native `type="search"` input (role `searchbox`) named by `label`, since a search field wears no visible label, and a clear button drawn only while there is text. The view keeps nothing: the application owns the text, `onInput` reports typing, and `clear.onClear` is what the button and Escape send (a field given no `clear` has neither; `clear.content` replaces the cross), Escape only on a field with text. `start` and `end` go inside the box beside the input, a magnifier in `start` while it is empty; `busy` sets `aria-busy`, so on an empty one it still reaches an enclosing dialog. Pressing the button removes it and the focus it held, so answer `onClear` with the `SearchField.Focus({ id })` Command, which puts focus back on the input and answers `SearchField.Message.CompletedFocus` (`SearchField.inputId(id)` is the input's id). `words: { clear? }` renames the button (default `Clear search`). `routes` takes `Behaviors.Keys.Route`s, keys the application answers in the input, such as ArrowDown opening results: each is `Keys.route(name, { on: [Keys.chord('ArrowDown')], handle: ({ input }) => Option.some(message) })`, `input` being the field's text. They share one keydown owner with Escape, so a route on the same gesture as another throws `mixins:key-conflict` naming both; wrap the pair in `Keys.first` to give one precedence. A disabled field takes no text or keys and draws no button. | `size` and `variant` are `Input`'s axes. A magnifier at the start, the clear button at the end (the inline end, so a right-to-left page mirrors both), and the browser's own cancel button hidden. Slots `root`, `input`, `clear`. |
| `Resizable` | `Resizable.Model` (`init(share)`), its `Message` and `update(model, message, bounds)`, which the application keeps and folds; `Resizable.view({ model, onMessage, id?, label, first, second, orientation?, direction?, min?, max?, step? })`. shadcn's Resizable and the APG's window splitter: the handle is a `separator` with its value, stepped by the arrows and sent to the bounds by Home and End (a `collapsible` panel collapses when the key reaches its side, as the APG asks, and a collapsed one leaves the key alone); with an `id` the handle's `aria-controls` names the first panel; a drag follows the `Move` Mount from where it began over the group the `Resize` Mount measured. Under `direction: 'rtl'`, drawn as the root's `dir`, the first panel is on the right, so ArrowLeft and a drag to the left grow it. `collapsible: 'first' | 'second'` (with `collapsedTo`) collapses that panel on Enter or a double-click and puts it back where it was, easing there while a drag follows the pointer at once; pass the same bounds to `update` and the view. A split fills its panel, so splits nest either way. | `handle`: `line` (default; a thicker accent line under the pointer) or `grip` (a pill of dots); `data-orientation` lays it out. Slots `root`, `first`, `handle`, `second`. |
| `Separator` | `{ orientation?, label?, decorative? }`, horizontal by default. A `label` sits between two drawn rules and is read as text; `decorative` is `role="none"`. The rule and a label's frame carry `data-orientation`, which the recipe reads, so one style draws both orientations. A vertical rule stretches across a flex or grid row, short of it by the inset, and elsewhere (running text) stands as tall as the letters. | `line`: `solid`, `dashed`, `dotted`; `thickness`: `thin`, `thick`; `spacing`: `none`, `sm`, `md`, `lg`; `inset`: `none`, `sm`, `md`. The line is a border in `outline.default`, which a dark page shows. Slots `rule`, `root`, `label`. |
| `Drawer` | A panel docked to the bottom that peeks or opens beside the page, not over it: no focus trap, backdrop or scroll lock (a modal one is the `Sheet`). `Drawer.init({ id, open?, swipe? })`, folded with `Drawer.update`, opened with `Drawer.open` and `Drawer.close`, drawn with `Drawer.view({ model, onMessage, label, style?, mixins?, draw }, h)`, `draw` laying out `panel`, `handle`, `body` and, optionally, `grip` (a row of tabs to drag it by; sideways swipes still scroll). A drag follows the finger and settles by its speed, then by a quarter of the panel; a click or Enter on the handle toggles it. `label` names the handle once and its `aria-expanded` says the state; the body is hidden when the slide ends, not as it starts, and `Drawer.keepFocus` beside the style (a mixin, off by default) moves focus to the handle when the drawer closes with focus in its body. `swipe` is the Sheet's. Set `--fk-drawer-peek` and `--fk-drawer-height` on an ancestor. | `Recipes.Drawer`: `dock`: `always` (default), `below-lg` or `below-xl`. Slots `panel`, `handle`, `body`, `grip`. |
| `Sheet` | A Dialog a finger drags, vaul's Drawer: `Sheet.init({ id, side?, points?, opensAt?, dismissible?, isAnimated?, swipe? })`, folded with `Sheet.update` and opened with `Sheet.open` and `Sheet.close` (each also reporting the Dialog's `Opened` or `Closed`), drawn with `Sheet.view({ model, onMessage, style?, mixins?, words?, hasDescription?, covered?, scalesPage?, draw }, h)`, `draw` laying out `DialogSlots`' bundles with `h.div(sheet.handle)` in the panel. The panel stands on `side`'s edge (`data-side`); a drag of the handle follows the pointer and settles at the nearest of `points` (the share of the panel shown, ascending; a top or bottom sheet with a point below 1 takes its `size`'s full height, so a short one still shows its start), or, flicked or dragged far enough past the first, closes it, unless `dismissible: false`. `swipe: { from?, flickSpeed?, closeShare? }` says how it is swiped: a finger drags it from anywhere on the panel (`from: 'panel'`, the default), yielding to content that can still scroll its way, so a long one scrolls back to its top and then goes, and a field or `data-no-swipe` starts no drag; a mouse drags it by the handle, and `from: 'handle'` keeps every pointer there. A release faster than `flickSpeed` (0.4px/ms) is a flick, and a slow one goes once dragged `closeShare` (a quarter) of the panel. With more than one point the handle is a focusable `separator` named by `words.handle` (default `Resize sheet`), its `aria-valuenow` the percent shown: the arrow keys along the edge (the one toward the page raises it: ArrowUp on a bottom sheet, ArrowDown on a top one, ArrowLeft on a right one, ArrowRight on a left one), Home and End step between the points through `Message.SnappedTo { at }` (an index into `points`, the transition a release at that point leaves) and stop at the ends, and Escape still closes; an opened sheet with points takes focus on the handle unless the panel has an initial-focus element. With one point the handle stays decoration, `aria-hidden`; with `handle: 'none'` an application moves the sheet with `SnappedTo` from a control of its own. The Dialog keeps focus, Escape and scroll lock, and a leaving Sheet's panel is `inert` until it is gone; `Sheet.open` is `Dialog.open`'s, so a Sheet opened again while it leaves takes focus back. `Dialog.focusReturn` among the mixins gives focus a place to go when the opener is gone as the dialog closes (removed, or drawn again; upstream's return goes to `body`): an element with its `id`, its `FocusRecovery` steps for its slot, the dialog below, the page's first tabbable element. `Dialog.keyboard` among the mixins keeps a sheet or dialog that holds a field above the on-screen keyboard. `scalesPage` with `Recipes.sheetPage` on the page beside the sheet, never around it, steps the page back while it is open. | `Recipes.Sheet`: `size`: `sm`, `md` (default), `lg`, `full`; `handle`: `bar` (default) or `none`; `title`: `shown` (default) or `hidden`, the heading left to a screen reader (it still names the dialog); `close` and `motion` as on `Recipes.Dialog` (`Recipes.Sheet({ motion: 'none' })` stands open at once). `Recipes.Dialog` takes the `title`, `close` and `motion` axes. The slide and its exit run on `Theme.tokens.motion.sheet` and `sheet-exit`, which default to the `slow` tier and its exit and are multiplied by `travel`: an application that keeps another timing sets them in its tokens (`Theme.define({ motion: { sheet: '500ms', 'sheet-exit': '500ms' } })`), and `sheetPage` follows `sheet`. The padding keeps clear of `Theme.tokens.safe` and the backdrop is the `overlay.scrim` token, which an application overrides in its own tokens instead of restyling `backdrop`. Slots are `DialogSlots`. |
| `Picker` | A select that is a dropdown on a desktop and a bottom sheet on a phone, with one Model and one set of Messages whatever the width: `Picker.init({ id, sheet? })` (upstream's Listbox Model and a `Sheet`'s), folded with `Picker.update`, which returns `Picker.OutMessage.Chose({ value })` for a choice made either way, drawn with `Picker.view({ model, onMessage, label, options, value, placeholder, anchor?, style?, mixins?, listbox?, sheet?, routes? }, h)`. The application keeps the value (`Option`), as with the Listbox; `options` are `{ value, label, description?, icon? }`, `Value` inferred from them. Both halves are drawn and the recipe shows one, so nothing reads the width: the Listbox (its panel kept in place) at or above the breakpoint, and below it an opener whose Sheet lists the options as a listbox, the chosen one (or the first) focused, the arrows, Home and End moving focus, Enter, Space or a tap choosing and closing it. `routes` takes keys the application answers on a Sheet option (`item.index` is its place), beside the arrows, Home and End; the dropdown's keys are the Listbox's. Opening the Sheet closes a Listbox left open. `listbox` takes `Recipes.Listbox`, which also draws the options' and the trigger's content (`Listbox.parts`), and `sheet` takes `Recipes.Sheet`. | `Recipes.Picker`: `sheetBelow`: `sm`, `md` (default) or `lg`, the theme's breakpoint below which the Sheet's half shows; `trigger`: `outline` (default), `filled`, `ghost`, the opener's look, as the Listbox's; `size`: `sm`, `md`, `lg`. Slots `root`, `dropdown`, `opener`, `list`, `option`. |
| `Sidebar` | shadcn's sidebar with Fluid's collapse, keeping a Model: `Sidebar.init({ id, rows, open?, collapsed?, side?, width? })` (a Tooltip per row id, and the phone's Sheet; a rail that draws a row `init`'s `rows` did not list throws), folded with `Sidebar.update`, drawn with `Sidebar.view({ model, onMessage, label, groups, header?, footer?, direction?, collapse?, style?, mixins?, tooltip?, sheet? }, h)`. `header` and `footer` are `{ content, mark? }`: a rail keeps only the `mark` (a logo, an avatar), centred over the icons. `groups` are `{ id, title?, collapsible?, action?, rows }`, a row a `SidebarLink` (`{ id, label, href, current?, icon?, badge?, action? }`) or a `SidebarBranch` of nested links (`items`). An `action` (`SidebarAction`: `{ label, icon, message }`) is a button at a titled group's heading or beside a link, where it takes the badge's place under the pointer (both show on a touch screen). Groups and branches open like an accordion's, several at once; the current page is `aria-current` and `Sidebar.fluid` glides a marker to it. `collapse: 'offcanvas'` (default) takes the whole column off the page; `'icons'` leaves a rail of icons named in Tooltips (`tooltip`, a Tooltip style). With `sheet` (a Sheet style), an opener shows it in a Sheet on a phone. Shut groups and a collapsed column stay drawn and `inert`. `Sidebar.init({ width: { size?, min?, max? } })` makes the column resizable, its width in the Model: a `resize` handle on its edge drags it, the arrows step it, Home collapses it (a collapsed one leaves the key alone) and End goes to the widest, Enter or a double-click collapses it, and dragged below half `min` it collapses, coming back at the width the drag began at. | `variant`: `sidebar` (flush with the page's edge, the default), `floating` (a card lifted off it), `inset` (no edge, on the surface it stands on, for a page drawn as a card beside it); on a phone with a Sheet the column is its opener alone. Slots `root`, `header`, `footer`, `opener`, `title`, `toggle`, `nav`, `section`, `heading`, `trigger`, `chevron`, `links`, `item`, `branch`, `link`, `icon`, `mark`, `detail`, `label`, `badge`, `action`, `tip`, `indicator`, `highlight`, `resize`. |
| `Skeleton` | `{ label?, inline?, block? }` (`inline` and `block` are CSS lengths of a lone bar): `role="status"` named by `label`, and `aria-hidden` without one, so a page of placeholders is not a page of empty live regions; a bar a film of the text. `Skeleton.lines({ lines, label? })`, `avatarRow`, `card` and `tableRow({ columns })` draw the shapes content takes, in a `group`; `Skeleton.configure` returns all five with one look. | `shape`: `bar` (default), `circle`; `animation`: `pulse` (default), `shimmer`, `none`. Slots `bar`, `group`. |
| `Slider` | `Slider.view({ id, label, value, onChange, onCommit?, description?, min?, max?, step?, format?, marks?, showValue?, name?, disabled?, style? }, h)`, where `value` is a number or a `{ low, high }` range and `onChange` is handed the same kind; `onCommit` is sent with the value when the reader lets go (the input's native `change`, once per release or key press), and `description` is a line each thumb is described by. Native `input type="range"` thumbs, so drag, keys, right to left and the form value are the browser's. One number is one thumb across the track, named by the label; a press anywhere on the track moves it. A range is a `group` named by its label holding two thumbs named by `thumbLabels` (default `Minimum` and `Maximum`), each bounded by the other (the low one's `max` is the high value), so the browser stops a drag or a key at the other thumb; `Slider.moved(range, 'low' \| 'high', value, bounds)` snaps, bounds and orders a range, and returns the same range when nothing changed. `marks` are values dotted on the track (`data-filled` where the fill covers them) and `showValue` draws each value, both hidden from assistive technology, which hears `aria-valuetext`. `@foldkit/ui`'s Slider is not adapted: draw its Submodel with Slots of your own. `orientation: 'vertical'` stands it upright; `ticks` dots every step; a mark may be `{ value, label }` (`SliderMark`), its words under the track, those at either end flush with its ends rather than hanging past them. | `tone`: `accent` (default) or `neutral`; `size`: `sm`, `md` (default), `lg`, the thumb's edge; `track`: `thick` (default; the fill reaches each thumb's far edge, Fluid's look), `thin` or `paint` (a track a holder paints, as the color picker's); `value`: `above` (default), `inside` (widens the thumb into a pill; best at `md` or `lg`) or `end` (at the end of the label's row); `label`: `shown` (default) or `hidden`. A Slider is at least 12rem wide; a holder that lays it narrower sets `--fk-slider-min-length`, as the ColorPicker's channels do. Slots `root`, `label`, `control`, `track`, `fill`, `mark`, `value`, `thumb`. |
| `Spinner` | `{ label?, showLabel? }`. `role="status"` named by `label`, and `aria-hidden` without one; `showLabel` draws the label beside the wheel. A turn is about 720ms times `travel`. | `kind`: `ring` (default), `dots`, `bars`, `pulse`, `orbit`; `size`: `sm`, `md` (default), `lg`; `tone`: `accent` (default), `neutral`, `current`, `info`, `success`, `warning`, `danger`. Slots `wheel`, `part`, `root`, `text`. |
| `Steps` | `Steps.view({ label, steps: { title, description?, icon?, content?, state?, trailing? }[], current, onSelect?, words?, style? }, h)`: a stepper, an ordered list named by `label`. The step at `current` is `aria-current="step"`, those before it `data-state="complete"` (a check replaces the number), those after `upcoming`. An `icon` stands in the marker for its number; `content` follows the step, beside the line in a vertical stepper. With `onSelect(index)`, completed steps are buttons for going back; steps ahead never are. The application owns `current`. The marker is hidden from assistive technology, so `words: { complete?, current?, upcoming? }` (defaults `Steps.words`: `Completed`, an empty word that says nothing, `Upcoming`; the current step's `aria-current="step"` already says it) say each step's state in text after its title, in the `state` slot. `progress` (0 to 1) fills the connector after the current step when the recipe's connector is a progress bar. | `orientation`: `horizontal` (default) or `vertical`; `size`: `xs`, `sm`, `md`, `lg` (the Avatar's sizes; unset, 1.75rem); `marker`: `number` or `dot`; `connector`: `line`, `progress` or `segments`; `labels`: `current` or `hidden`. A step's `state` (`complete`, `current`, `upcoming`, `loading`, `error`) overrides the one `current` gives, `aria-current` staying by position, with words `loading` and `error`; `trailing` ends its row. `Steps.configure({ base, presets })`. A horizontal row narrower than 32rem shows only the current step's words, wrapping inside an even share so the markers stay evenly spaced (a word longer than 40% of the row is cut), and narrower than 17rem draws them on a line of their own under the markers. Slots `root`, `item`, `step`, `trigger`, `marker`, `number` (the figure in a marker with no icon, trimmed to its digits so it centers in any face), `text`, `title`, `state`, `description`, `content`, `connector`. |
| `Table` | The presentational table: `{ columns: { header, value, numeric?, sortKey? }[], rows, rowKey?, caption?, fluid?, sort?, selection?, expansion?, empty? }`. A column's `value` returns text or markup, and one with `rowHeader` draws `th scope="row"` cells; an expansion's buttons are headed `Details` for a screen reader (`headerLabel`). A column with a `sortKey` heads with a button that sends `sort.onSort(column)`, with `column` typed as the union of the `sortKey` literals (columns hoisted into a constant go through `Table.defineColumns<Row>()([...])` or `as const`; naming `Table.view`'s type arguments gives `string`), and the sorted column carries `aria-sort`; `Table.nextSort(sort, column)` cycles ascending, descending and none. `selection` puts a checkbox on every row and one in the heading, mixed while only some are chosen; `expansion` opens a row's detail in a row below it (`aria-expanded`, `aria-controls`); `empty` stands across the table while there are no rows (an `Empty.view`). The sort, the chosen and the open rows are the application's. It stands in a `frame`, which scrolls sideways when the table is wider than the screen (under a `static` header; a `sticky` one sticks to the application's scroller, which scrolls it). With `fluid`, one highlight behind the body rows follows the pointer, skipping detail and empty rows. Filtering, column reorder and resize, and virtualized rows stay with `foldkit-data-grid`. A re-sort moves keyed rows and blurs the control focused in one: give `FocusRecovery.behavior(TableSlots)({ owner: 'frame', parts: { expandButton: ['same'], sortButton: ['same'], control: ['same'] } })` in `mixins`, and mark a control you draw in a cell with `FOCUS_MARK.part` (`'control'`) and `FOCUS_MARK.key` (the row key) data attributes. | `rows`: `lined`, `striped`, `plain`; `density`: `compact`, `regular`, `comfortable` (none set follows the region); `header`: `static`, `sticky`. Slots `frame`, `highlight` (with `fluid`), `root`, `caption`, `head`, `headerRow`, `headerCell`, `sortButton`, `sortIcon`, `body`, `row`, `cell`, `control`, `controlCell`, `checkboxLabel`, `expandButton`, `expandIcon`, `detailRow`, `detailCell`, `emptyRow`, `emptyCell`. |
| `TagsInput` | Zag's tags input, a small Model of its own: `TagsInput.init({ id, tags?, delimiter?, max? })`, folded with `TagsInput.update` (which returns a focus Command), drawn with `TagsInput.view({ model, onMessage, label, placeholder?, name?, disabled?, direction?, addOnBlur?, routes?, words? }, h)`. The tags are a list of chips named by the label, each with a `Remove {tag}` button (`words.remove` names it, `words.mark` is its `×`), then a text input. Enter or the delimiter (default `,`) adds the draft split at the delimiter and trimmed, refusing empty and repeated parts, and parts past `max`: a refusal (`TagsInput.Refusal`: `Repeat`, `Empty`, `Full`) is said in a polite `message` (worded by `words.repeat` `'{tag} is already added'`, `words.empty` and `words.full` `'At most {max} tags'`: text with blanks, `TagsInput.words` the defaults) and shakes the field once, the shake travel-aware; Backspace in an empty input removes the last tag (`Message.BackspacedEmpty`, sent only when the input itself holds no text, so text typed since the last frame is edited, not skipped). The chips are one roving tab stop (`Model.chip`, set by `Message.FocusMoved`): ArrowLeft and ArrowRight, swapped by `direction: 'rtl'`, move among them, Home and End go to the ends, Backspace and Delete remove the focused one, ArrowRight past the last returns to the input, and ArrowLeft from the start of the input's text, with nothing selected, enters the last chip. A removal, by button or key, focuses the chip that takes its place, else the one before it, else the input, through the Command `update` returns. `addOnBlur` adds the draft when the input loses focus (off by default). `name` draws one hidden input per tag, so a form submits the tags and not the draft. The input's keys are `Behaviors.Keys` routes and `routes` adds the application's: one on Enter, the delimiter or Backspace is a `mixins:key-conflict`; `Message.Typed { text, drawn }` carries the `commits` count of the drawing that read the text, so a frame drawn mid-burst loses no draft (code that builds `Typed` itself passes it). | No axis; `data-disabled` on `control`. Slots `root`, `label`, `control`, `list`, `tag`, `remove`, `input`, `message`, `hiddenInput`. |
| `Textarea` | `Textarea.view({ id, value?, onInput?, rows?, maxRows?, maxLength?, count?, readOnly?, name?, placeholder?, invalid?, described?, disabled?, style?, draw }, h)` hands `draw` the bundles to place; `Textarea.field({ id, label, field, changed, rows?, maxRows?, maxLength?, count?, footer?, placeholder?, style?, draw? }, h)` draws a whole `FieldValidation` field. A `maxLength` caps the text and, in `field`, counts toward it under the field (`count` defaults to whether there is one; `Textarea.countOf(value, maxLength)` is the text), the count describing the textarea and carrying `data-limit` (`under`, `near` from nine tenths, `at`). A `footer` (`Html[]`) draws the field as one box (`frame`), its controls in a row under the text and the count at its end. | `resize`: `auto` (default, grows with its text from `rows` lines, 2 unless given, to `maxRows`, then scrolls, by CSS `field-sizing`), `vertical` (stays `rows` lines, dragged), `none`. `size`, `variant` (`outline`, `filled`). Slots `textarea`, `label`, `description`, `count`, `frame`, `footer`, `meta`. |
| `Toast` | A stack of toasts, Sonner's: `Toast.init(id, { position?, direction?, duration?, max?, threshold? })`, folded with `Toast.update`, whose `Acted` OutMessage names a pressed action; `Toast.show(model, { type?, title, description?, action?, duration? })` returns the stack and the new toast's `id`, `Toast.settle(model, id, input)` turns a toast (a `loading` one, a promise's) into its outcome, and `Toast.dismiss(model, id)` takes it away; draw it with `Toast.view({ model, onMessage, label?, closeLabel?, expand?, icons?, style? }, h)`. The newest stand in front, spread out while the pointer or focus holds the stack, at most `max` (3) showing; a held stack or a hidden page pauses every countdown, keeping the time left; a swipe toward the edge past `threshold` dismisses one. A toast is spoken in a polite region, an error in an assertive one, each toast a keyed child of its own (the regions are not atomic), so one added beside another, or with the same words, is still read by itself. A toast that is already leaving does not act again when its action is pressed. `Toast.keepFocus` beside the style, a `FocusRecovery.behavior` on the container, hands focus from a dismissed toast's close button to the close button of the toast behind it, else the one in front; from an action it goes to the action of a neighbouring toast, else to a close button; with no toast left, focus is not moved. It is a mixin, off by default, because its Mount sends no Message. A promise toast is `show` with `type: 'loading'`, the work run as a Command, and `settle` on the toast's `id` when its Message comes back. `ToastView` is the fork for toasts that carry their own payload. | `tone`: `plain` (default) or `rich` (each type on its tint). Slots `container`, `entry`, `list`, `icon`, `body`, `title`, `description`, `action`, `close`, `status`, `alert`. |
| `TreeView` | The APG's and Zag's tree view, a small Model of its own: `TreeView.init({ id, open?, checked? })`, folded with `TreeView.update(nodes, { checkable? })` (curried over the tree, flattened once), drawn with `TreeView.view({ label, model, nodes, onMessage, direction?, style?, mixins? }, h)` over nodes `{ id, label, children?, disabled?, icon?, openIcon? }`. `checkable` (on the view and `update`) gives each row a box: the Model's `checked` holds the leaves, a branch reads checked, mixed or not from them (`TreeView.checksOf`), and Space checks the current row in `update`. `TreeView.checkedAs(nodes, checked, 'leaf' | 'branch' | 'trunk')` reads those leaves as every fully checked row (`'branch'`) or only the outermost ones (`'trunk'`), and `TreeView.leavesOf(nodes, value)` expands such a value back to leaves, to seed `init({ checked })`; both are pure, a disabled leaf counts toward its branch, and ids the tree lacks are ignored. One tab stop; Up/Down move through the rows showing, stepping over shut and disabled ones; Right opens or steps in, Left shuts or steps out (swapped under `direction: 'rtl'`, drawn as the root's `dir`); Home/End; letters typed within 500ms of each other find the next showing row whose label starts with all of them (`TreeView.Model.typeahead`, cleared by the `QueryExpired` Message, which an application that wraps the Messages passes through to `update`); `*` opens every row beside the current one that holds rows; Enter, Space or a click chooses a row and opens or shuts a branch. Keys reach `update`, which decides from its own Model and sends a focus Command. Each item carries `--fk-tree-level`; a shut group stays drawn and `inert`. `TreeView.fluid`, passed in `mixins`, glides one `highlight` to the showing row nearest the pointer and to the row the keys focus. | `guides`: `none` (default) or `lines`, a guide down each open branch; `data-state` on a branch `item` and its `group`. Slots `root`, `item`, `row`, `chevron`, `checkbox`, `icon`, `label`, `group`, `highlight`. |
| `Typography` | `{ level, text }` or `{ level, content }` (text and `Html` where the voice holds a link or emphasis). The level chooses the element (`h1`–`h4`, `lead`, `body`, `small`, `muted`, `quote`, `code`, and the interface roles `display`, `title`, `subtitle`, `caption`, `micro` as paragraphs) and is written as `data-level`. | No `level` axis: the recipe reads `data-level`, so the view's level is the one fact; a role is its size and leading on the size ladder. Slot `text`. |
| `VirtualList` | `@foldkit/ui`'s virtual list: `VirtualList.view({ model, items, itemToKey, itemToView, onMessage, overscan?, itemToRowHeightPx? \| dynamicRowHeights?, style?, mixins? }, h)` draws only the rows in view. Its Model is upstream's (`@foldkit/ui/virtualList`'s `init`), kept by the application and folded with that module's `update`. A row's mixins may style it, not handle its events, since it is drawn inside the list's submodel. A bar is drawn beside the list; `mixins: VirtualList.overlayBars` lays it over the list. It keeps no row once it leaves the window, the one holding focus included, which `WindowList` does. | No axis. Slots `root` (the box it scrolls within: 18rem tall, as wide as its container, 20rem where the container takes its width from it), `row`, `bar`, `thumb`. |
| `WindowList` | A virtual list that scrolls with the window: `WindowList.init({ id, estimatedHeight, unmeasured?, overscan?, viewportHeight?, from? })`, folded with `WindowList.update`, drawn with `WindowList.view({ model, items, itemToKey, itemToView, onMessage, label?, findable?, style?, mixins? }, h)`. `update` returns an `Update.Return`, the model and, for a `Found` match, the `Reveal` Command, so the application's own `update` returns the commands too. A row holding focus stays drawn beside the window while it is scrolled out (`Message.Focused` reports it as `Model.held`, `WindowList.heldRow(model, keys)` is its index, and `keep` retains its height), so the reader keeps their place in the tab order; `VirtualList` keeps neither. `WindowList.reveal(model, index, align?)` is the `Reveal` Command that scrolls the page until row `index` is drawn and shown, however far outside the window (`align`: `nearest` by default, `start`, `center` or `end`); return it from an `update`, and it answers `Message.CompletedReveal`. `findable: (item, index) => text` lets the browser's find in page match rows that are not drawn: each row outside the window is a `hidden="until-found"` stand-in holding that text in the spacers, which keep their height, and a match (`Message.Found`) reveals its row. It costs a node and a text node per row, so it is for lists of thousands; it is drawn once the runtime has placed the list and only where `WindowList.supportsFindable()` says the browser finds hidden text. It draws the rows in view of the document's viewport between spacers as tall as the rest, so the page keeps its own scrolling: the browser restores its offset, a `sticky` header above the list sticks, and Space and End move it. Its one Mount on `root`, `WindowList.Track`, reads where the viewport lies over the list as it mounts, on the window's scroll and resize, and when the list or the page resizes (`WindowViewport`, as `Message.Placed`), so content above it, or growing above it, counts, and measures each drawn row's border box (`MeasureRows`, as `Message.Measured`; space rows with padding: a row is `flow-root`). The rows already drawn when it starts are read at once, so no row leaves before its height is known; a failure in either read ends both, reported as `Track`'s. A row not yet measured counts `estimatedHeight`, or with `unmeasured: 'mean'` the mean of the rows measured above 0: for rows whose height the window's width decides, which `init` cannot know. A Scene test of a page drawing the list resolves it with `Scene.Mount.resolveAll(WindowList.resolveTrack(onMessage, WindowList.Message.Placed({ top, height })))`, the reading going through the view's own `onMessage`. `WindowList.windowOf(model, keys)` is which rows are drawn, for loading what is in view, and `WindowList.keep(model, keys)` drops the heights of rows that left; a row still drawn is measured again only when it resizes, so keep the keys of the rows drawn. A server's page opens the list at a row with `from` (a page's `?from=`): the window starts at that row (or the last viewport's worth, for a row past its start), with no overscan above it, and the rows above take no room until `Track` places the list, which gives them their room and scrolls the window by what that moved the first row drawn, so a reader sees the same rows before and after the runtime takes the page over. The first `Placed` sets `from` back to 0, and the list follows the window. For a page without scripts, `WindowList.pageOf(model, keys)` is `{ start, end, previous, next }`: the rows drawn and, as `Option`s, the rows the pages either side open at (`previous` the first whose window reaches this one's start), for links that set `?from=`. Use `VirtualList` for a list in a box of its own. | `Recipes.WindowList`: no look, only the spacers hidden where no script runs (`U.scriptedOnly`), so the rows a server drew lie in the page's flow; `.extend` it with the list's look. Slots `root` (`role="list"`), `spacer` (`data-edge` `start` or `end`, hidden from assistive technology), `row` (`role="listitem"`). |
| `AngleSlider` | After Zag's: a dial in degrees, 0 at the top and clockwise. `AngleSlider.init({ id, value? })` is the angle and the drag, folded with `AngleSlider.update(layout)`, where `layout` (`step`, `largeStep`, `marks`, `restrictToMarks`) is the object the view spreads in too: `AngleSlider.view({ ...layout, model, onMessage, label, name?, format?, valueText?, showValue?, disabled?, readOnly?, invalid?, style? }, h)`. A press or drag on the dial sends `Pointed` and `Released`; the APG's slider keys reach `update` as what was pressed, and go round past 0. A `name` draws a hidden input for a form. | `tone`, `track` (`ring`, `plain`, `disc`), `value` (`inside`, `below`), `size`. Slots `root`, `label`, `control`, `needle`, `thumb`, `markers`, `marker`, `markerLabel`, `value`, `input`. |
| `CascadeSelect` | After Zag's: one value chosen as a path of ids through nested options. `CascadeSelect.init({ id })` holds the chosen path and the one the keys are on while open, folded with `CascadeSelect.update(config)` (`config` is `{ nodes, parents?, closeOnSelect?, loop? }`, the same object the view takes): `CascadeSelect.view({ model, config, onMessage, label, placeholder?, levels?, layout?, expandOn?, clearable?, separator?, name?, disabled?, invalid?, direction?, routes?, style? }, h)`. The trigger is a combobox opening a top-layer APG tree, a column per level or one level at a time (`layout: 'drill'`; the columns also drill in on their own when they would not fit the window, measured as the popup opens); the arrows move within and between levels (swapped right to left), Home and End jump to the ends, letters typed within half a second find the row whose label starts with them (`CascadeSelect.Model.typeahead`, cleared by the `QueryExpired` Message), Enter and Space choose (Space opens the closed trigger too), and only an option without children is chosen unless `parents` allows any. `routes` takes keys the application answers on the open panel, such as Ctrl+A choosing every option, beside the arrows, Home, End, Enter, Escape and every printable character (Space included, which still chooses); a route on the same gesture is a `mixins:key-conflict` diagnostic naming both, and the closed trigger's keys are not open to routes. With `name` a form submits one hidden `input` per level of the path (an id may hold any character, so no separator joins them), or one empty input when nothing is chosen. | `size`, `trigger` (`outline`, `filled`, `ghost`), `width` (`trigger`, `auto`). Slots `root`, `trigger`, `valueText`, `chevron`, `clear`, `input`, `layer`, `backdrop`, `panel`, `column`, `heading`, `back`, `item`, `itemText`, `branch`. |
| `Chart` | After shadcn's Chart: `Chart.view({ id, label, kind: 'bar' \| 'line' \| 'area', categories, series: [{ name, values, color? }], model, onMessage, description?, format?, legend?, table?, categoryLabel?, style? }, h)`, or `kind: 'donut'` with `slices: [{ name, value, color? }]` and `totalLabel?`. The value axis's ticks are round and reach both ends, zero included; the plot is drawn in percentages, so it fills its container's width with nothing measured and renders the same on a server. `Chart.Model` (`Chart.init()`, folded with `Chart.update`) holds the lit point: the pointer lights a category's band and its tooltip, and the plot is a tab stop whose arrows, Home and End step through the points while a polite status says each. The drawing is hidden from assistive technology, which reads a data table, visually hidden unless `table: 'shown'`. Series take `chart-1` to `chart-5` in order, or the `color` they name; a sixth series throws. | `height` (`sm`, `md`, `lg`), `grid` (`lines`, `zero`), `indicator` (`dot`, `line`). Slots `root`, `title`, `description`, `legend`, `legendItem`, `swatch`, `body`, `yAxis`, `xAxis`, `yTick`, `xTick`, `plot`, `canvas`, `paths`, `grid`, `cursor`, `bar`, `line`, `area`, `dot`, `slice`, `band`, `center`, `centerValue`, `centerLabel`, `tooltip` and its parts, `status`, `table` and its parts. |
| `ChatMessage` | One message of a chat: `ChatMessage.view({ from, content, author?, avatar?, time?, status?, onRetry?, actions?, pinActions?, streaming?, style? }, h)`, `from` being `user`, `assistant` or `system`. The user's sits at the end in a bubble, an answer as text at the start. `status` is `sending`, `sent` or `failed`, which draws a retry; `actions` are named buttons (`{ key, label, onClick, icon?, pressed?, disabled? }`) shown on hover and focus unless pinned. A streamed answer is the same message drawn again with more `content` and `streaming: true` (`aria-busy`); its body wraps with `text-wrap: wrap`, so no earlier word moves line. `ChatMessage.group({ items, continues?, style?, messageStyle? }, h)` draws a run, a sender's following messages continued. Markdown is the application's to render (`foldkit-richtext-markdown`'s `parse`, `foldkit-richtext-dom/view`'s `renderDocument`). | `layout` (`chat`, `thread`), `bubble` (`muted`, `accent`), `content` (`text`, `markdown`). `Recipes.ChatMessageGroup` for the group. Slots `root`, `avatar`, `main`, `header`, `author`, `time`, `bubble`, `body`, `footer`, `status`, `retry`, `actions`, `action`. |
| `FloatingPanel` | After Zag's: a non-modal window. `FloatingPanel.init({ id, rect, open? })` holds its rect, stage and a drag, folded with `FloatingPanel.update(limits)` (`min`, `max`, `grid`, `overflow`); `FloatingPanel.open(model)` focuses it and `close` closes it. `FloatingPanel.view({ model, onMessage, title, content, order?, draggable?, resizable?, closeOnEscape?, routes?, step?, direction?, labels?, style? }, h)`: the drag trigger (`role="button"`, named `Move <title>`) moves it and eight edges resize it, kept within the viewport; the arrows move it from the drag trigger and resize it from the bottom-end corner; minimize, maximize, restore and close. `routes` takes keys the application answers on the panel, beside Escape (unless `closeOnEscape` is false); the arrows on the drag trigger and the corner are the panel's own, and a press they handled still reaches the panel. `FloatingPanel.focusReturn` among the mixins is opt-in and is the one way focus returns: closing the panel gives focus back to what had it before it opened, by `FocusReturn`'s rules when that is gone (the panel keeps no opener of its own). A press or focus inside returns the `Raised` OutMessage, which the application folds into the `order` its panels stack by with `FloatingPanel.raise(order, id)`. | `header`. Slots `root`, `boundary`, `panel`, `header`, `dragTrigger`, `title`, `controls`, `minimize`, `maximize`, `restore`, `close`, `body`, `handle`. |
| `ImageCropper` | After Zag's: the image fitted in a viewport, a selection that a drag moves (`Move`) and eight handles resize, zoom by a Slider, the wheel, two fingers spread or pinched, and `+`/`-` with the selection kept where it is on screen, a pan of the zoomed image, quarter turns, an aspect lock and a round crop. `ImageCropper.init({ id, aspect?, shape?, crop?, min?, maxZoom? })` holds the crop, in the turned image's pixels, folded with `ImageCropper.update`; keys (arrows, Shift ×10, Alt to resize) step by screen pixels. Drawn with `ImageCropper.view({ model, onMessage, label, src, crossOrigin?, controls?, labels?, disabled?, style?, slider? }, h)`. `ImageCropper.crop(model)` is the crop in whole pixels (an `Option`); `RequestedExport({ type, quality })` returns the `Export` Command, answered by `Exported({ url, width, height })` or `FailedExport`. | `guides`, `handles` (`all`, `corners`), `viewport` (`landscape`, `wide`, `square`). Its zoom takes `Recipes.Slider({ label: 'hidden' })`. Slots `root`, `label`, `viewport`, `stage`, `pan`, `image`, `selection`, `guides`, `handle`, `controls`, `zoom`, `rotate`, `reset`. |
| `Marquee` | After Zag's: content that scrolls on without a seam. `Marquee.init({ id })` holds what it measured and whether it is paused, folded with `Marquee.update`; `Marquee.view({ model, onMessage, label, items, side?, speed?, autoFill?, repeat?, delay?, loopCount?, style? }, h)` measures its content (`Resize`) and draws copies to fill the viewport, `inert` after the first and without their `id`s. A pointer, focus or its pause press (WCAG 2.2.2) holds it; `Marquee.Message.Paused()` holds it from outside. Its motion is CSS, and under reduced motion the viewport scrolls instead. | `spacing`, `edges` (`fade`, `none`). Slots `root`, `viewport`, `content`, `item`, `pause`. |
| `MessageScroller` | A conversation's log that follows the newest message while the reader is at the end and stops when they scroll up, or when an upward wheel or ArrowUp, PageUp, or Home arrives before that scroll (not a Ctrl wheel, a wheel over a nested element that can still scroll up, or a key that was prevented, has Ctrl, Meta or Alt down, or goes to an editable field). A shorter viewport stays at the end while following. `MessageScroller.init({ id })` holds only whether it follows and how many arrived unseen; the scroll position is the browser's, read by its `FollowEnd` Mount. Fold `MessageScroller.update`, and send `Message.Appended({ count })` when your update appends messages (not when it loads older ones, which it holds in place). `MessageScroller.view({ model, label, content, onMessage, jumpLabel?, unseenLabel?, style?, areaStyle?, areaMixins? }, h)` draws a named `role="log"` in a ScrollArea, with a jump button counting what arrived while away; give its parent a height. | No axis. Slots `root`, `log`, `jump`, `count`. |
| `QrCode` | After Zag's: `QrCode.view({ id, value, label?, level?, quietZone?, overlay?, tooLong?, style? }, h)`, one `img` named `QR code: <value>` (or `label`), every dark module one SVG `path` over a background that carries the quiet zone. `level` is the error correction, `M` by default and `H` under an `overlay` (a logo at the centre). `QrCode.encode(text, level)` gives the matrix, none when no version holds the text, and `pathOf` its path; both are pure. `QrCode.Download({ id, format, filename, pixels })` saves the drawn code as PNG or SVG in the colors it shows; the overlay is not in the file. | `scheme` (`light`, dark on light on any page, or `page`), `size`. Slots `root`, `frame`, `background`, `pattern`, `overlay`, `fallback`. |
| `Questionnaire` | An assistant's questions answered in the chat. `Questionnaire.init({ id, questions, layout? })` with `Questionnaire.single`, `multiple` and `text` questions (`Question` is a Schema, so a tool's input decodes into it), folded with `Questionnaire.update`, which says what is missing and focuses it, and returns `OutMessage.Answered({ answers })` once every required question is answered; the form then gives way to a summary. `Questionnaire.view({ model, onMessage, title?, style?, radioGroup?, checkboxGroup?, input?, textarea?, button?, submitButton? }, h)`: the controls are the package's RadioGroup, CheckboxGroup, Input and Textarea, each taking its own style. | `variant` (`plain`, `card`), `actions` (`end`, `start`). Slots `root`, `title`, `progress`, `question`, `prompt`, `words`, `field`, `other`, `otherLabel`, `error`, `actions`, `summary`, `asked`, `answer`. |
| `SignaturePad` | After Zag's: strokes drawn by one pointer over a dashed line and "Sign here", undo, clear, and a typed name instead. `SignaturePad.init({ id, pen? })` holds the strokes (points with pressure, in the pad's coordinates), folded with `SignaturePad.update`. Drawn with `SignaturePad.view({ model, onMessage, label, fallback?, labels?, disabled?, style? }, h)`. `pathOf(stroke, pen)` and `toSvg(model, { color?, font? })` are pure; `RequestedPng({ scale, background })` returns `ExportPng`, answered by `ExportedPng({ url, width, height })` or `FailedExport`. | `surface` (`plain`, `muted`, `dashed`), `size`. Slots `root`, `label`, `control`, `segments`, `stroke`, `guide`, `placeholder`, `typedName`, `controls`, `undo`, `clear`, `fallback`, `fallbackLabel`, `input`. |
| `ThinkingIndicator` | An assistant at work: `ThinkingIndicator.view({ label?, detail?, active?, icon?, style? }, h)` draws dots, a pulse or the view's icon beside words a band of light sweeps, and a detail line, in a polite status. Keep it drawn with `active: false` before work starts, so what it says when it starts is announced. Every movement holds under reduced motion. | `mark` (`dots`, `pulse`, `none`), `label` (`shimmer`, `plain`, `hidden`), `tone` (`muted`, `accent`). Slots `root`, `mark`, `dot`, `icon`, `label`, `detail`. |
| `ThinkingSteps` | The trace of what an assistant did: `ThinkingSteps.view({ id, steps, open, onToggle, duration?, summary?, openSteps?, onToggleStep?, stateWords?, style? }, h)`. Each step is `{ id, title, state, duration?, detail?, icon?, steps? }`, `state` being `pending`, `running`, `done` or `failed`, said in words too. The button says the running step's title, or "Thought for 4s". Its openness is yours, an `Option<boolean>`: none opens it while a step runs and shuts it once all are done, and the press sends the state the reader asked for. `openSteps` and `onToggleStep` make each step's detail collapsible (`Accordion.toggled`). | `variant` (`plain`, `card`), `connector` (`line`, `none`). Slots `root`, `trigger`, `summary`, `chevron`, `panel`, `list`, `step`, `head`, `marker`, `title`, `state`, `duration`, `body`, `detail`. |
| `Timer` | After Zag's: a countdown (`Timer.init({ id, countdown: true, duration })`) or a stopwatch (`Timer.init({ id, interval? })`), folded with `Timer.update`, whose Commands (`Timer.Stamp`, `Timer.Tick`) read Effect's `Clock`, so TestClock drives a run. `Timer.view({ model, onMessage, label, units?, separator?, labels?, style? }, h)`: a `role="timer"` with each unit in a Slot, one press that says what comes next, and reset. `Timer.phase(model)` is `idle`, `running`, `paused` or `done`; to start at once, return `Timer.update(model, Timer.Message.Pressed({ action: 'start' }))` from `init`. | `tone`, `look`, `progress`, `size`. Slots `root`, `label`, `area`, `item`, `separator`, `controls`, `action`. |
| `Toolbar` | `Toolbar.view({ id, label, items, roving, onFocus, orientation?, direction?, loop?, disabled?, routes?, style?, mixins? }, h)`: the APG's toolbar, `role="toolbar"` named by `label`, with one tab stop over its controls and the arrows along `orientation` (default horizontal; `direction: 'rtl'` mirrors Left and Right), Home and End moving focus between them. The view keeps nothing and draws nothing around the controls, which are the application's own. `items` are, in order, controls `{ id, disabled?, draw }`, where `draw` receives `{ attributes, disabled }` and puts `attributes` (the id, the `tabindex` and a focus report) on the one focusable element, as `Button.view`'s `attributes: { button: control.attributes }` does, and draws it off when `disabled`; groups `{ label, controls, disabled? }`, a named `role="group"` of controls; and the word `'separator'`, a rule between sets. The application keeps the tab stop: `roving` is a placed `RovingTabindex`'s slice (`{ current }`) and `onFocus(id)` is answered with its `Focused`, so Tab re-enters at the control focused last, or at the first enabled one. `Bundles.Toolbar` (args `{ current? }`) places that slice, and `Toolbar.focused(wrap)` builds its `onFocus`; `Toolbar.configure({ base, presets })` binds `orientation`, `direction`, `loop` and the look. A disabled control (its own, its group's, or the toolbar's `disabled`) is skipped by the arrows and never holds the tab stop, as in `Segmented`; `Toolbar.controlId(toolbarId, id)` is the id a control draws, for a Command that focuses it. A focused text field, textarea, select or range keeps the keys it uses (Home and End, the arrows along its caret or value, Up and Down in a textarea), so the arrows leave a text field only from the edge they point at: place a field last, or leave it with Tab. A key pressed in something the toolbar did not draw, such as a menu's rows, is left to it. `routes` takes `Behaviors.Keys.Route`s (their `input` is `undefined`) on the toolbar's one keydown owner; a route on the same gesture as another throws `mixins:key-conflict` naming both. | `size` is Button's ladder step (`sm`, `md`, `lg`), set on the toolbar so buttons without a size of their own line up. A bordered row, or column when vertical, with a rule between sets. Slots `root`, `group`, `separator`. |
| `Tour` | Steps anchored beside their targets in the top layer, over a dim with a cutout the target's presses reach. `Tour.init({ id })`, started with `Tour.start(model, config)` and folded with `Tour.update(config)` (`config` is `{ steps: [{ title, description, target?, placement? }] }`); `Tour.view({ model, config, onMessage, padding?, interactive?, dismissOnOutside?, closeOnEscape?, routes?, labels?, direction?, style? }, h)`. The target scrolls into view; Next, Back and the arrows move on, Escape and Skip end it, and `update` returns `Ended { completed }`. `routes` takes keys the application answers on a step, such as a digit jumping to that step, beside the arrows and, unless `closeOnEscape` is false, Escape. `Tour.focusReturn` among the mixins is opt-in and is the one way focus returns: ending the tour gives focus back to what had it before it started, by `FocusReturn`'s rules when that is gone (the tour keeps no opener of its own). A step without a target, or whose target is missing, stands in the middle. The cutout is placed from `--fk-tour-x/-y/-w/-h/-radius`, which `TrackBox` (`foldkit-primitives/dom`) writes on the `layer`. | No axis. Slots `layer`, `blocker`, `spotlight`, `panel`, `arrow`, `progress`, `title`, `description`, `actions`, `back`, `next`, `skip`. |

A widget's keys are routes on one `keydown` owner, and `routes` adds the application's.
`SearchField` shows the whole loop: the application owns the text, a route answers ArrowDown,
and the clear button's focus comes back through a Command:

```ts standalone
import { Option, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import type { Return } from 'foldkit/update'
import { Behaviors } from 'foldkit-mixins'
import { SearchField } from 'foldkit-mixins-ui'

const Model = Schema.Struct({ query: Schema.String, resultsOpen: Schema.Boolean })
const Message = defineMessageUnion({
  ChangedQuery: { query: Schema.String },
  ClearedQuery: {},
  OpenedResults: {},
  CompletedFocus: {},
})
type Message = typeof Message.Type

// A route declares its gesture; a second route on ArrowDown would throw
// `mixins:key-conflict` when the view is drawn, naming both.
const OpenResults = Behaviors.Keys.route('OpenResults', {
  on: [Behaviors.Keys.chord('ArrowDown')],
  handle: () => Option.some(Message.OpenedResults()),
})

const update = (model: typeof Model.Type, message: Message): Return<typeof Model.Type, Message> =>
  Message.match(message, {
    ChangedQuery: ({ query }) => ({ model: modifyFields(model, { query: () => query }) }),
    // The clear button leaves with the text, taking focus with it.
    ClearedQuery: () => ({
      model: modifyFields(model, { query: () => '' }),
      commands: [SearchField.Focus({ id: 'find' })],
    }),
    OpenedResults: () => ({ model: modifyFields(model, { resultsOpen: () => true }) }),
    CompletedFocus: () => ({ model }),
  })

const view = (model: typeof Model.Type, h: HtmlBuilder<Message>) =>
  SearchField.view(
    {
      id: 'find',
      label: 'Search',
      value: model.query,
      onInput: query => Message.ChangedQuery({ query }),
      clear: { onClear: Message.ClearedQuery() },
      routes: [OpenResults],
    },
    h,
  )
```

`Toolbar` is one tab stop over controls you draw: `roving` is the `{ current }` slice you keep and
`onFocus(id)` sets it; each control's `draw` puts `control.attributes` on its one focusable element:

```ts standalone
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Button, Toolbar } from 'foldkit-mixins-ui'

const Model = Schema.Struct({ stop: Schema.NullOr(Schema.String) })
const Message = defineMessageUnion({ Focused: { id: Schema.String }, ToggledBold: {} })
type Message = typeof Message.Type

const view = (model: typeof Model.Type, h: HtmlBuilder<Message>) =>
  Toolbar.view(
    {
      id: 'format',
      label: 'Formatting',
      roving: { current: model.stop },
      onFocus: id => Message.Focused({ id }),
      items: [
        {
          id: 'bold',
          draw: control =>
            Button.view(
              {
                label: 'Bold',
                onClick: Message.ToggledBold(),
                attributes: { button: control.attributes },
              },
              h,
            ),
        },
      ],
    },
    h,
  )
```

`FileInput` keeps no files: fold a pick with `FileInput.added`, then write the list back into the
native input with `FileInput.Sync`, so a surrounding form submits what the list shows:

```ts standalone
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import type { Return } from 'foldkit/update'
import { FileInput } from 'foldkit-mixins-ui'

const Model = Schema.Struct({ files: Schema.Array(Schema.instanceOf(File)) })
const Message = defineMessageUnion({
  Picked: { files: Schema.Array(Schema.instanceOf(File)) },
  Removed: { file: Schema.instanceOf(File) },
  ...FileInput.cases,
})
type Message = typeof Message.Type

const update = (model: typeof Model.Type, message: Message): Return<typeof Model.Type, Message> =>
  Message.match(message, {
    Picked: ({ files }) => {
      const next = FileInput.added(model.files, files, { multiple: true })
      return {
        model: modifyFields(model, { files: () => next }),
        commands: [FileInput.Sync({ id: 'cv', files: next })],
      }
    },
    // The remove button held focus and left with its row.
    Removed: ({ file }) => {
      const next = model.files.filter(each => each !== file)
      return {
        model: modifyFields(model, { files: () => next }),
        commands: [FileInput.Sync({ id: 'cv', files: next }), FileInput.Focus({ id: 'cv' })],
      }
    },
    CompletedSync: () => ({ model }),
    CompletedFocus: () => ({ model }),
  })

const view = (model: typeof Model.Type, h: HtmlBuilder<Message>) =>
  FileInput.view(
    {
      id: 'cv',
      label: 'Attach files',
      name: 'attachments',
      multiple: true,
      files: model.files,
      onChange: files => Message.Picked({ files }),
      onRemove: file => Message.Removed({ file }),
    },
    h,
  )
```

Given a `label` instead of `draw`, `Input.view` draws the field itself: `Input.view({ id, label, description?, labelAside?, start?, end?, value, onInput, style }, h)`. `start` and `end` (`Adornments`) go inside the field's box (the `group` Slot, which rings on focus and dims when disabled) beside the control, `labelAside` beside the label; with neither, no group is drawn. `Recipes.Input`'s `variant` is `outline`, `filled`, `ghost` or `underline`; `Recipes.Adorned` is the `group`, `start` and `end` pieces for another field's recipe.

Beyond `type` and `placeholder`, `Input.view` takes `name`, `readOnly`, `required`, `autocomplete`, `inputMode` and `maxLength`, so a form that submits natively needs no hand-drawn `input`, and `attributes: { input?, label?, description? }` adds what another component hands a slot (a blur handler, `aria-busy`) before the mixins resolve. `Textarea.view` takes `name`, `required`, `autocomplete` and `attributes` the same way. A field's description (`Input.field`'s and `Textarea.field`'s) is an always-drawn `role="status"` span, even with nothing to say, since a live region announces only what is put into it.

`Input.view`'s and `PasswordInput.view`'s `onInput` is a closure or the `OnInput` attribute
the view's builder makes. A closure is not data, so on a resumable page (`foldkit-ssr`'s
`Resume.builder`) pass the attribute made from a Message member, which the server writes into
its markup, and keep early typing with `rh.KeepTyped()`: in `Input.view`'s `draw`, or in
`PasswordInput`'s `attributes.input` while the field is enabled (a disabled field sends
nothing, and the server refuses a kept field with nothing to replay):

<!-- docs-check standalone
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
const Message = defineMessageUnion({ ChangedPassword: { value: Schema.String }, Toggled: {} })
type Message = typeof Message.Type
declare const model: { readonly password: string; readonly shown: boolean }
-->

```ts
import { PasswordInput } from 'foldkit-mixins-ui'
import { Resume } from 'foldkit-ssr/client'

const password = (h: HtmlBuilder<Message>) => {
  const rh = Resume.builder(h)
  return PasswordInput.view(
    {
      id: 'password',
      label: 'Password',
      value: model.password,
      onInput: rh.OnInput(Message.ChangedPassword),
      visible: model.shown,
      onToggle: Message.Toggled(),
      attributes: { input: [rh.KeepTyped()] },
    },
    rh,
  )
}
```

Ship both halves of the theme with `Theme.root` (scales once, palette beside them):

```ts
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'

const L = Layers.standard
const theme = Theme.standard(Theme.make({ accent: { hue: 280, chroma: 0.15, lightness: 60 } }))

export const stylesheet: string = Style.stylesheet(
  L.declare,
  L.in('reset', Defaults.reset),
  L.in('theme', Theme.root(theme)),
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
  `selection => RecipePieces`: every `base` slot is present (no `?? Style.empty` to reuse one), a
  variant's may be absent (`null` unsets a defaulted axis, the way to make a piece optional).
  `.extend(patch)` composes per slot and removes nothing (`mixins:unknown-slot` for a slot the
  contract lacks) and admits only axes and values the recipe has, so a misspelt axis is a type
  error. `.add({ tone: { brand: pieces }, width: { full: pieces } })` gives a recipe a value or
  an axis it lacks and returns a recipe whose selection takes them (`Recipes.Button.add({ tone:
  { brand } })({ tone: 'brand' })`); a value the axis has is a type error and
  `mixins:recipe-value-exists`, and an added axis has no default until `.extend({ defaults })`.
  To leave a piece out of one use, destructure the selection. Leaving out a style
  does not leave out the element. `Style.perItem(item => piece)` and
  `Style.stagger({ stepMs })` need the item passed to `attrs`. `Style.forCapability(Slots)(cap,
  piece)` styles every slot whose capability satisfies `cap`.
- Theme and layers: `Theme.lightDark(light, dark)` (CSS `light-dark()`, no Model field),
  `Theme.compose(base, over)`. A reader's light or dark (`foldkit-mixins/theme`):
  `Theme.schemeScript()` in a head `<script>` applies the kept one before the first paint,
  `Theme.chooseScheme(scheme)` is a Command's Effect that applies and keeps it, and
  `Theme.currentScheme()` reads it back for the Model. Another tab's choice arrives as a Stream,
  `themeChanges(themes)` or `schemeChanges()` (named exports), from `storage` events (never the writing
  tab's): map it to a Message in `Subscription.persistentEntry`, and `update` stores it and
  returns `Themes.apply` or `Theme.chooseScheme`. A page built with `foldkit-mixins/vite`'s `modules`
  (no style compiler in the browser) cannot import `Themes.make`: it takes `applyTheme`, `chooseTheme`,
  `themeScript`, `themeChanges` and `type ThemeNames` (names, initial, attribute) from
  `foldkit-mixins/theme/runtime`, the same functions as the `Themes` members, and a slider's
  `title`, `variable`, `unit`, `min`, `max`, `step` and `default` from `shapeDensity` in
  `foldkit-mixins/theme/knob-data` (one plain-data export per range knob, `accentChromaLight` and
  `accentChromaDark` for a two-scheme knob; `knobData['shape.density']` is the table of all, so a page
  keeps only what it imports). On a server, `schemeOfHint(header)` reads
  `Sec-CH-Prefers-Color-Scheme` into `Option<'light' | 'dark'>`; send `COLOR_SCHEME_HINT_HEADERS`
  so the browser sends it. Knob values a reader set get the same pair:
  `Theme.knobScript({ selector? })` in the head applies the kept knob variables, and
  `Theme.chooseKnobs(theme, { base })` applies and keeps those that differ from `base`, in one
  unlayered rule both write. Layers are a value: `Layers.standard` (also
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
  something that moves multiplies by `knob.travel`, which the reset zeroes under reduced motion while fades keep theirs), `type` (six roles, `display`/`title`/`subtitle`/`body`/`caption`/`micro`, each a size and leading at both steps, read through `Theme.role(name)`), `control` (the size ladder's two ends, 36px and 28px, read through `Theme.ladder(name)`, which blends them by `knob.step` on the element that uses it: `--fk-knob-step: 1` on a region makes its controls compact, and the popups they open while those stay in the page (`portal: false`); a recipe's `size` sets the step on its own element, a popup's on its panel too; unset, the default, follows the region), `icon` (the masks of the icons the components draw: `search`, `eye`, `eye-off`, `pipette`, `rotate-ccw`, `rotate-cw`, `success`, `warning`, `error`, `info`, `lock`, `close`, from Heroicons' outline set at a 2px stroke; an app's pack, such as Lucide's icons by those names, replaces them with `AppStyle.make({ tokens: Icons.tokens(pack, { width?, corners? }) })`, `Icons` from `foldkit-mixins-ui`), `border`, `shadow`, `overlay` (`scrim`, a modal backdrop's veil), `breakpoint`, `safe` (`top`/`right`/`bottom`/`left`: the screen's safe-area insets, which a fixed bar pads the edge it touches by; 0 unless the page's viewport meta has `viewport-fit=cover`); `shadow.xs`…`2xl`/`inset` draw in `shadow.color`
  (which the palette sets per scheme), dimmed by the `shadow-strength` knob). The palette, derived from the knobs, is (`surface`, `text`, `outline`, `accent`, `secondary`, `tertiary`, `success`, `warning`,
  `error`, `info`; each family has a fill `default` with `hover`/`active` (a grey fill stays grey when pressed), a tint `subtle`, a line `outline`,
  `on-fill` for text on it, and `ink` for colored text on the base surface: colored text is `ink`, never `default`; `syntax`, code colors named as tokenizers name kinds, `syntax-keyword` reading `--fk-syntax-keyword`; `chart`, series colors `chart-1` to `chart-5`, which a chart assigns in order, turned by the `chart-h` knob; and seven color scales, `red` `orange` `yellow` `green` `teal` `blue` `purple`, each steps `1` (near white) to `10` (near black) on one lightness ladder shared by every hue, plus `wash-1` to `wash-4`, step 6 mixed into `surface.base`, for colors no role names; their hues are knobs (`red-h`) and `scale-c` scales their chroma); only `knob` holds literals, so a theme of other knobs
  under `Themes.make` recolors everything; a derived color takes its hue from the `hue` tokens, never from a grey it starts from, and the palette mixes in OKLab, since engines read a grey's powerless hue differently (an OKLCH mix of a grey can turn red): mix tokens of your own with `color-mix(in oklab, …)`; `surface: { hue }` gives the neutrals a hue apart from the accent's (a base color), and `menu: { highlight: 'bold', panel: 'default' | 'inverted' | 'translucent' | … }` sets the `popup` tokens menus, listboxes and comboboxes draw in (the panel is the page's own raised surface by default; a popup panel sets `--_fk-row-highlight`, `--_fk-row-press` and `--_fk-row-highlight-ink` on itself so a lit row takes its ink from its surface, and a row outside a panel reads the `popup.plain-*` tokens); `state` (`hover`, `press`, `tint`, `tint-hover`, `edge`) is a mix of the element's own text color (`press` the hover at 1.75, so a held row deepens), so a hover reads on any surface, and `unfilledHover` films the state ink: the theme's `--fk-state-ink` (`state.ink`) unless a surface painted in a hue names its paint in the local `--_fk-state-ink` (the accent and danger tones their fill, a subtle alert band its ink, a bold one its fill; the neutral and ink tones name the theme's back) — so the `surface.hover` knob (`neutral`, `surface`, `accent`) switches every component, and
`surface.hoverStrength` (4% to 24%, default 12%) how strongly, `state.disabledOpacity` (0.3 to 0.7, default 0.5) how far a disabled control fades; and `Theme.nested(outer, inset, border?)` gives a concentric inner radius (or a padded container spreads `Theme.nests(radius, inset, border?)` and its descendants read `Theme.nested()`; `Theme.concentric({ min, max })` is a control's corner from the same container, clamped, so buttons and fields in a Card, Dialog, Toast or Alert round with it); `Theme.raise(offset)` lifts an element `offset` levels above the raised element holding it, and `Theme.raisedSurface()` paints its level (popups 2, dialogs 4). `Theme.root(Theme.standard(theme))` declares every
  token once; never split it with `omit: Theme.tokens`, which names knobs too. The active theme is a Model field written
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
  frame/pad/autoGrid(options)` and the child pieces `Layout.intrinsic` (a stack child as wide as
  its content; a child that sets a width keeps it anyway) and `Layout.aside` (the sidebar child). Options write `--fk-l-*` inline variables; the
  rule text is shared, except `split`'s breakpoint and `stack`'s `split` index. Pieces are
  unlayered: wrap with `L.in('layouts', Layout.stack({ gap }))`. `center` fills to its
  measure, inside a `stack` or a flex row too.
- `foldkit-mixins-ui` exports `Patterns`: an `A11y.pattern` per adapter plus `Patterns.catalog`
  (`{ name, pattern, slots, tier, roles, floor, support }`; most patterns name obligations: a custom
  view is `A11y.conform`ed to them, while an adapter is validated and its `support` (`A11y.base` or
  `A11y.native` Mixins naming where each obligation is supplied) is checked by the catalog gate), and adapters for `HoverIntent` and `Anchor`
  (`Anchor.behavior(Slots)({ floating, config })`; `Anchor.topLayer(mount)` for an in-place panel, above). A panel upstream portals to the document is given its region's custom properties as it leaves (`Anchor.inheritRegion(mount)`, which Menu, Listbox and Combobox apply and the `Anchor` Mount does itself), so a compact region still reaches it; not a Popover or Tooltip with `portal: true`.
- `Style.attach`/`Behavior.attach` return new views; the original is untouched.
- Rule-based CSS is data, and arrives with what draws it: in a browser, a class a Slot draws is
  appended once to a `<style data-foldkit-styles>` (made only when needed; it declares the
  standard layer order unless the page already declares one). Install `Style.stylesheet(L.declare, …)`
  yourself for the layer order, the theme and a first paint; injection skips what it carries.
  In a Vite app, the plugin `foundations({ module: '/src/sheet.ts' })` from
  `foldkit-mixins/foundations` (Node only) compiles that module's `stylesheet` export into
  `index.html`'s head, so the page paints themed before any script runs. On a
  server, `Style.usedIn(html)` is the CSS of the classes the rendered markup uses, with the
  global rules of the Styles behind them (keyframes, `raise`'s depth rules).

- A server can link the stylesheet as a hashed file instead of writing it into every page:
  `styles({ sheet: '/src/style.ts' })` from `foldkit-mixins/vite` (Node only) writes
  `assets/styles-<hash>.css` (the sheet module's `stylesheet` export, then every compiled
  class and global rule it lacks, `Style.complete`), and `import { href } from
  'virtual:foldkit-styles'` is its address (dev serves the same `href`). Put
  `<link rel="stylesheet" href="${href}" data-foldkit-styles-href>` in the document's head;
  the browser's injection treats the linked sheet's classes as present. Declare the virtual
  module's type yourself. `styles({ sheet, prune: { keep } })` ships only the `--fk-*`
  tokens a rule reads (`Inert.prune` from `foldkit-mixins/testing`, in dev too); a token read only inline (`Theme.ref`) or
  by a script goes in `keep`, and `Inert.missingTokens(tree, Inert.prune(css, { keep }))`
  lists one a drawn view reads that pruning took.
  `styles({ sheet, modules: ['/src/client/style.ts'] })` ships each listed style module to the
  production browser as data (each Style's `name` and `mixin` of compiled classes, a
  `Style.slots` declaration's `slots` and `style`, strings and token objects), so the page loads
  no style compiler. A `Style.whenInput` is kept when its predicate is a named import from a
  module that is not listed (the frozen module imports it again, and its conditions' classes are
  compiled at build); a predicate written in place or imported from a listed module, any other
  export, and any `Style.perItem` (it compiles when drawn) fail the build naming it: leave such a
  module off the list. With a module listed the build injects nothing
  (the sheet holds every class; a frozen class with no rule fails the build, and so does a page
  that still compiles a Style from a module off the list); dev is unchanged.
  Attach a frozen style with `SlotView.attach(style.mixin)`: importing `Style` keeps the compiler.

## 8. Known traps

Met in applications on this stack: what failed, and what to do instead.

- **Two Slots' attributes on one element keep one class.** Foldkit's `Class`
  sets the vnode's data outright, so `h.label([...option.card,
  ...builders.choice.attrs()])` dropped the `card` class while unit tests
  passed. Give each Slot an element of its own; assert layout in a browser.
- **An element holds one Mount.** Foldkit's `OnMount` replaces the vnode's
  `insert` hook. The resolver composes the Mounts mixins add, but not one inside
  an upstream bundle: a Mount given to a listbox's `items` slot disabled its
  anchor, and the panel stayed hidden with no error. Put a Mount of your own on
  an element of your own, after checking the slot's bundle for an `OnMount`.
- **A Mount reads its args once, at insert.** A Mount meant to follow the Model
  (focus the next cell) ran with its first args for good. Drive a DOM effect
  the Model causes as a Command from the Message that changed it, or key the
  element by the value the args depend on (`h.Key(node)`), never a counter.
- **A Mount that throws halfway through acquiring leaks what it attached
  first**: an observer left behind kept calling into a torn-down Mount. Make
  every observer before any observes. A Mount also runs outside the runtime's
  `resources`, so a service given there never reaches it, and a `MountFailed`
  goes to the default log ([#333](https://github.com/doeixd/foldkit-plus/issues/333)).
- **A knob set on a region does not reach a portaled panel.** Menus, Listboxes
  and Comboboxes portal their panel by default, so a `size` set on the wrapper
  never reached the rows. Set what a panel needs on the panel's own slot, and
  test by opening the real component in a browser.
- **A state rule in a base loses to a variant that sets the same property**:
  every `surface` variant sets `background` in `variants`, so a selected Card's
  fill in `components` never showed. Write the state beside each variant that
  sets its property, and where a base sets a longhand (`backgroundClip`), its
  hover and pressed rules write longhands too (`backgroundColor`).
- **A view returning a `Document` owns the whole body**: a note placed beside
  the app's container was removed by the first draw. Draw such chrome in the
  view, in a Slot.
- **A synthetic event moves no focus.** `dispatchEvent(new MouseEvent('click'))`
  left focus in place, so four focus bugs passed jsdom. Test a focus claim in a
  browser with `userEvent`, and wait with `frames.settle()`, never a sleep.

## 9. See also

- https://github.com/doeixd/foldkit-plus/blob/main/docs/mixins.md
- https://github.com/doeixd/foldkit-plus/blob/main/packages/mixins/README.md
- https://github.com/doeixd/foldkit-plus/blob/main/packages/mixins-surface/README.md
- https://github.com/doeixd/foldkit-plus/blob/main/packages/mixins-ui/README.md
- https://github.com/doeixd/foldkit-plus/tree/main/examples/mixins
- https://github.com/doeixd/foldkit-plus/tree/main/examples/todo-app (`src/view.ts`, `src/style.ts`)
- https://github.com/doeixd/foldkit-plus/tree/main/examples/kitchen-sink
- https://github.com/doeixd/foldkit-plus/blob/main/docs/design/mixins-DESIGN.md
