# foldkit-mixins

Typed extension points for Foldkit views.

A component eventually gets used somewhere its author did not anticipate. One caller wants a
brand treatment, another wants a tooltip, another wants analytics, another needs an ARIA
attribute or a `ResizeObserver`. The usual answers are to keep adding props or to copy the
component and edit its markup.

`foldkit-mixins` takes a different approach:

> **A view declares where it may be customized once. Callers attach appearance and
> element-level behavior to those named points later.**

The view keeps its markup, state and Messages. The caller gets a typed customization surface
instead of an open-ended bag of props.

```text
Without a slot contract                 With a slot contract

Button                                  Button
├─ className                            ├─ root slot
├─ iconClassName                        ├─ icon slot
├─ tooltip                              └─ label slot
├─ tracking
├─ ariaLabelOverride                    callers attach independently:
├─ onFocusDecoration                    ├─ BrandStyle
└─ ...                                  ├─ TooltipBehavior
                                        └─ AnalyticsBehavior
```

This is not a second component system and it is not a state library. A slot ultimately resolves
to ordinary Foldkit attributes.

## The mental model

There are five ideas to learn:

| Concept | Meaning |
| --- | --- |
| **Slot** | A named extension point in a view: `root`, `input`, `label`, `trigger`, ... |
| **Slots** | The contract describing which extension points exist and what each permits. |
| **Style** | Appearance attached to a slot: classes, inline declarations and compiled CSS rules. |
| **Behavior** | Element-level interaction attached to a slot: attributes and an optional Foldkit `Mount`. Never application state. |
| **SlotView** | A pure Foldkit view that renders those slots and resolves attached Style/Behavior. |

`Style` and `Behavior` both compile to a `Mixin`. The resolver combines their contributions and
rejects ambiguous ownership instead of silently choosing a winner.

```text
                Slots contract
                      │
          ┌───────────┴───────────┐
        Style                  Behavior
     appearance              interaction
          │                       │
          └───────────┬───────────┘
                      ▼
                    Mixin
                      │
                      ▼
                   resolver
                      │
                      ▼
          ordinary Foldkit attributes
```

## Why not just `className` and props?

A class name says only "append this string." A slot is a **typed public customization point**.
It can say:

- this point is a text input rather than an arbitrary element;
- it publishes `input` but not `click`;
- callers may set `aria-invalid` but may not replace the structural `role`;
- this point is internal and cannot be targeted publicly;
- two independent behaviors may not both own the same event.

That matters once a design system, a feature, accessibility logic and product-specific behavior
all need to customize the same view without knowing about each other.

## Use it when

Use mixins when a view should be restyled or decorated **where it is used**, not only where it is
defined, and you want those customizations checked.

Typical examples are a design system styling a feature component, a tooltip attached by a caller,
analytics on an existing action, ARIA decoration, a focus trap, a `ResizeObserver`, keyboard
behavior, or a reusable visual recipe.

**Not for state.** A widget's open/selected/value belongs in a Foldkit Model or Submodel. A
transition is `update`; a network call is Message → Command; an element-scoped effect is a
`Mount`. A Behavior that "needs state" is a signal to reach for a Submodel, not to hide an atom
inside the mixin.

## Install

```bash
pnpm add foldkit-mixins
```

`foldkit` and `effect` are peer dependencies. `foldkit-mixins-surface` bridges a Surface
projection, and `foldkit-mixins-ui` adapts `@foldkit/ui` components.

The design-system pieces are subpaths, so an application that only attaches classes pays for
none of them: `foldkit-mixins/layers`, `/theme`, `/layout`, `/defaults`, and `/prose` (see
[styleImprovements-DESIGN.md](../../docs/design/styleImprovements-DESIGN.md)).

## Quick start

The component author publishes the extension points. Style and Behavior can then be authored
elsewhere and attached by the caller.

```ts
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Attr, Behavior, Capability, Event, Slot, Slots, SlotView, Style } from 'foldkit-mixins'

const Message = defineMessageUnion({ ChangedValue: { value: Schema.String } })
type Message = typeof Message.Type

type FieldInput = { readonly value: string; readonly invalid: boolean }

// 1. The component author publishes the extension points it supports.
const FieldSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  input: Slot.make({
    capability: Capability.TextInput,
    events: [Event.Input],
    attributes: [Attr.AriaInvalid],
  }),
})

// 2. Appearance can live in a design system or another module.
const FieldStyle = Style.forSlots(FieldSlots)({
  root: Style.compose(Style.class('field'), Style.inline({ display: 'grid' })),
  input: Style.class('field-input'),
})

// 3. Element-level behavior can be authored independently.
const Validation = Behavior.forSlots(FieldSlots)<FieldInput, Message>({
  input: Behavior.slot({
    requires: { capability: Capability.TextInput, attributes: [Attr.AriaInvalid] },
    attributes: ({ input, h }) => [h.AriaInvalid(input.invalid)],
  }),
})

// 4. The pure view renders through the slots. Attachments return a new view;
// the original view is unchanged.
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

`slots.input.attrs(base)` returns the view's base attributes plus every resolved contribution.
Base attributes, event Messages and any `ChildAttribute` survive. The caller did not copy the
markup or add a `validationBehavior` prop to the component.

### Render it and interpret the result

`Field` is a view function. From a parent view with a compatible builder, call
`Field({ value: model.value, invalid: model.invalid }, h)`. The input's value
comes from the parent; typing emits `ChangedValue`; the parent update must
store that value before the next render. Mixins owns none of that state.

In this example, `FieldStyle` supplies classes and a grid layout, while
`Validation` supplies `aria-invalid`. The input's `OnInput` remains owned by
the base view. Adding another `OnInput` attachment is a conflict, not a way to
chain a second application update. Compose the action in the existing Message
handler instead.

For `Style.pseudo`, `Style.media`, or other compiled rules, also install the
text returned by `Style.stylesheet(style)` in the page. Calling a SlotView
returns HTML; it does not inject a stylesheet for you.

## What the resolver guarantees

Attachments are not concatenated and left to renderer order. The resolver applies explicit rules:

- classes are additive and deduplicated into one `Class`;
- inline styles from Style pieces merge per property, later attachments winning, over the
  view's base; a property a Behavior sets (through `h.Style` in its attributes) has exactly one
  owner, so a Style piece, the base, or a second Behavior setting the same property is an error;
- an event or scalar attribute has exactly one owner — a second owner is an error;
- a `ChildAttribute` (a Submodel's published handler) is preserved by identity;
- `Key` and `InnerHTML` are structural and cannot be overridden;
- multiple mount contributions compose into exactly one `OnMount`.

Conflicts throw `Diagnostics.DiagnosticError` with stable codes such as
`mixins:event-conflict`, `mixins:style-property-conflict` and `mixins:protected-attribute`, so tests,
DevTools and editor tooling can all speak the same diagnostic language. The style rule exists
because a positioning Behavior that writes `top` and a Style that also sets `top` would otherwise
fight silently, last writer winning.

## Slots: the public contract

A slot is metadata, not a DOM node:

```ts
Slot.make({
  capability: Capability.TextInput,
  events: [Event.Input],
  attributes: [Attr.AriaInvalid],
  hidden: false,
  protected: { events: [Event.Click], attributes: [Attr.Role], style: ['position'] },
})
```

- **Capability** describes structural compatibility. The built-in hierarchy is
  `Base → Interactive → { Container, Focusable → TextInput, Draggable }`, plus
  `Base → Collection`. A behavior that requires `Interactive` may attach to a `TextInput`.
  Extend it with `Capability.make(name, { extends })`.
- **Event** and **Attr** are branded metadata tokens. `Event.make` and `Attr.make` add custom ones;
  declaring them does not install handlers.
- **Requirement** tokens name platform needs such as `Keyboard`, `Pointer` and `Clipboard` for
  tooling to inspect.
- `hidden` reserves an internal extension point: public Style and Behavior specs do not even offer
  that key.
- `protected` keeps structural events, attributes or style properties from being replaced by an
  attachment.

Names come from the keys passed to `Slots.define`; they are never repeated inside each slot.

## Style: appearance as data

Style is pure data. It never touches the DOM.

Every piece takes `Declarations`: camelCase CSS properties (typed by
[`csstype`](https://github.com/frenic/csstype)) and custom properties, each a
string. A misspelled or kebab-case property in an object literal is a type
error; the compiler writes the kebab-case name. Values are not checked, so
`var(...)` and `light-dark(...)` pass through.

| Primitive | Meaning |
| --- | --- |
| `Style.class(...)` | class tokens |
| `Style.inline({...})` | inline declarations |
| `Style.compose(...)` | concatenate classes; later declarations win per property |
| `Style.when(condition, piece)` | a boolean known at authoring time |
| `Style.whenInput(predicate, piece)` | a condition read from the view input at render time |
| `Style.recipe({ base, variants, defaults, compound })` | one slot: returns `selection => StyleValue` |
| `Style.recipeFor(Slots)({ base, variants, defaults, compound })` | every slot: returns `selection => StylePieces`; `null` unsets a defaulted axis; `.extend(patch)` merges per slot and refuses a slot the contract lacks |
| `Style.perItem(item => piece)` / `Style.stagger({ stepMs })` | a piece from the item the slot is rendered for (`attrs(base, item)`); stagger writes `--fk-index` and a `calc` delay |
| `Style.forCapability(Slots)(capability, piece)` | one piece for every public slot whose capability satisfies it |
| `Style.self` / `pseudo` / `media` / `supports` / `container` / `nest` | rule-based appearance; `self` is a rule on the element's own class (`&{…}`), for declarations a layer must hold |
| `Style.keyframes` / `global` | class-independent CSS |
| `Theme.define` / `Theme.ref(theme)` / `variables` | typed tokens; every token as a typed `var(--fk-group-name)` reference (`Theme.ref(theme).surface.base`), built once per theme; the tokens as inline custom properties |
| `Theme.lightDark(light, dark)` / `Theme.compose(base, over)` | a token that follows the color scheme with CSS `light-dark()`; themes merged at definition time |
| `Theme.root(theme, { omit?, colorScheme? })` / `Theme.scoped(theme, selector, overrides)` | from `foldkit-mixins/theme`: tokens as `:root` custom properties, or as overrides under a selector; unlayered global pieces for `Style.stylesheet` |
| `Theme.tokens` / `Theme.oklch(knobs)` / `Theme.breakpointWidths(theme)` | from `foldkit-mixins/theme`: the shipped spacing, type, radius, motion, border and breakpoint scales; a whole palette derived from an accent and a few knobs; the breakpoints as pixel widths for `foldkit-primitives/media` |
| `Layers.define(names)` / `Layers.standard` | cascade layers as a value: `names`, `declare` (the `@layer …;` statement as a global piece) and `in(name, pieceOrNamedStyle)` (the unlayered rules and global CSS inside that layer; what is already layered keeps its layer; a name outside the order is a type error; a bare piece wholly in another layer is `style:relayered`). `standard` is `reset, tokens, theme, defaults, components, layouts, variants, utilities, app`; also under `foldkit-mixins/layers` |
| `Style.stylesheet(...)` | one `<style>` block from `NamedStyle`s and bare `StyleValue`s: the layer order hoisted first (two different orders is `style:conflicting-layer-order`), then global chunks, then scoped classes, deduplicated. Once an order is declared, a rule outside it is `style:unlayered-rule`, since it would beat every layer; keyframes, font faces and `@property` pass |

Rule-based Style compiles to one deterministic class (an FNV-1a hash of canonical rule text) plus
CSS as data:

```ts
const CardStyle = Style.forSlots(FieldSlots)({
  root: Style.compose(
    Style.class('card'),
    Style.pseudo(':hover', { boxShadow: '0 1px 2px' }),
    Style.media('(min-width: 40rem)', { gridTemplateColumns: '1fr 1fr' }),
  ),
})

CardStyle.css
Style.stylesheet(FieldStyle, CardStyle)
```

Equal rules share a class, so server and client derive the same class and CSS. A rule piece
inside `Style.whenInput` compiles to its class like any other; the class is static and only its
presence follows the input, and its CSS is in `Style.stylesheet` whether or not the condition
ever holds.

Beyond `self`, `pseudo`, `media`, `supports`, `container` and `nest`, the rule pieces are:

- `Style.states({ open: { opacity: '1' } })` compiles to `&[data-state="open"]`, for Behaviors that
  write `data-state`; `whenInput` when the view knows, `states` when the DOM does;
- `Style.responsive(breakpoints, { md: { display: 'flex' } })`, named breakpoints from the record
  you pass, so a misspelled one is a type error;
- `Style.enter({ opacity: '0' })`, a `@starting-style` rule the element animates from, with
  `Style.allowDiscrete` when `display` takes part;
- `Style.vars({ '--gap': '1rem' })` and `Style.viewTransitionName('hero')`, declarations;
- `Style.grid({ areas: [['header', 'header'], ['nav', 'main']], columns, rows, gap })`, a grid
  template with typed areas: `.style` for the container and `.area('main')` for a child, where
  a name the template lacks is a type error and a ragged template raises
  `mixins:ragged-grid-areas`;
- `Selector.attr`, `not`, `is`, `child`, `descendant`, `sibling`, `siblings` build the selector
  strings `pseudo` and `nest` take. Each takes a selector list: every top-level selector is
  scoped to the class (`:is(a, b)` is not split), and a selector that writes `&` places the class
  itself (`nest('[data-open] &')`).

### Theme from a few knobs

`foldkit-mixins/theme` extends the root `Theme` with the pieces a page ships. `Theme.oklch` takes
an accent color and a few knobs (hue shifts, surface saturation and contrast, a contrast factor,
feedback hues) and returns typed tokens for surfaces, text, outlines, and the accent, secondary,
tertiary and feedback families. Only the `knob` group holds literals; every other value is a CSS
expression over other tokens (`oklch(from …)`, `color-mix()`, `light-dark()`), so the browser does
the derivation and one knob override recolors everything below it. `Theme.tokens` is the
non-color scales, with `space` and `radius` multiplied by the `density` and `radius-factor` knobs.

A theme reaches the page as pieces, and the page chooses the layers:

```ts
import { Layers, Slot, Slots, Capability, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'

const L = Layers.standard
const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 280, c: 0.15, l: '60%' } }))
const t = Theme.ref(theme) // t.surface.base is 'var(--fk-surface-base)'; a missing name is a type error

const PageSlots = Slots.define({ root: Slot.make({ capability: Capability.Container }) })
// Layered where it is defined: the view attaches this same value, so its classes are the sheet's.
const PageStyle = L.in(
  'app',
  Style.forSlots(PageSlots)({
    root: Style.self({
      background: t.surface.base,
      color: t.text.default,
    }),
  }),
)

export const sheet = Style.stylesheet(
  L.declare,
  L.in('tokens', Theme.root(Theme.tokens)),
  L.in('theme', Theme.root(theme, { omit: Theme.tokens })),
  L.in('theme', Theme.scoped(theme, ':root[data-theme="ocean"]', { knob: { 'accent-h': '215' } })),
  PageStyle,
)
```

Once the sheet declares an order, every rule in it must sit in one of its layers: an unlayered
rule would beat all of them, `app` included, so `Style.stylesheet` refuses it with
`style:unlayered-rule`. `L.in('app', style)` places a whole `NamedStyle`; a layout or recipe
it composes keeps the layer it was already given. Layer a style where it is defined, never
only in the sheet: a layer is part of a rule's identity, so the layered copy has new class
names, and a view still attaching the original would render classes the sheet lacks.

`omit` leaves out the tokens another theme already declared, so the scales go out once in
`tokens` and the palette once in `theme`. Which theme is active is a Model fact: the view writes
`data-theme` on the root, and `Theme.scoped` only says what the value means. A scheme the user
picks works the same way with a `data-color-scheme` selector and a `color-scheme` override; a
scheme the browser picks needs nothing, because the `light-dark()` values follow it. The palette
needs relative color syntax and `light-dark()` (Chrome 123, Firefox 128, Safari 17.5).

`Style.responsive(Theme.tokens.breakpoint, { md: { … } })` and
`Theme.breakpointWidths(Theme.tokens)` (for the `Breakpoints` bundle) name the same breakpoints;
a query that is not a plain `min-width` raises `theme:unparseable-breakpoint`.

### Layout

`foldkit-mixins/layout` ships the common arrangements as pieces: `Layout.stack`, `cluster`,
`split`, `sidebar`, `switcher`, `reel`, `center`, `frame`, `pad`, and `autoGrid`, plus
`Layout.intrinsic` (a stack child that keeps its own width) and `Layout.aside` (the sidebar
child). Each compiles to rule text that is the same for every caller and reads `--fk-l-*`
variables with token fallbacks; the options only write those variables inline, so ten stacks
with ten gaps are one rule and ten inline declarations. The pieces are unlayered; put them in
`layouts`:

```ts
import { Layers, Style } from 'foldkit-mixins'
import { Layout } from 'foldkit-mixins/layout'

const L = Layers.standard

const CardStyle = Style.forSlots(CardSlots)({
  root: L.in('layouts', Layout.stack({ gap: 'var(--fk-space-sm)' })),
  actions: L.in('layouts', Layout.cluster({ justify: 'end' })),
})
```

`split` adapts to its container by default (`container-type: inline-size` and a `@container`
query); `{ contain: false }` uses `@media` on the viewport instead. Its breakpoint and
`stack`'s `split` index are in the rule text, because a query cannot read a variable, so each
distinct value is its own class. `sidebar` and `switcher` are flex math and need no query.

### Defaults and prose

`foldkit-mixins/defaults` is the baseline plain HTML gets before any slot is styled: `Defaults.reset`
(box model, media, form-control fonts, reduced motion) and `body`, `headings`, `links`, `code`,
`controls`, composed as `Defaults.all` (everything except `reset`). Each is element-selector CSS
under `:where()` over `--fk-*` tokens with a fallback, so a class rule always beats it and it reads
with or without a theme. `foldkit-mixins/prose` is the longform contract: `Prose.style({ measure?,
rhythm? })` is one class for every caller (the rhythm between unlike elements: heading to
paragraph, list to paragraph, around figures) whose options are `--fk-prose-*` variables on the
element. Both are unlayered; the page places them:

```ts
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Prose } from 'foldkit-mixins/prose'

const L = Layers.standard
const Article = Style.forSlots(ArticleSlots)({ body: L.in('components', Prose.style({ measure: '60ch' })) })

export const sheet = Style.stylesheet(
  L.declare,
  L.in('reset', Defaults.reset),
  L.in('defaults', Defaults.all),
  Article,
)
```

## Behavior: reusable element-level interaction

A Behavior is a reusable bundle of element-level interaction that does **not** own application
state. Its attributes are built while resolving from the view's `input` and `h`, so it can only
emit Messages from the view's own Message universe. Like an agent capability,
a Behavior points one way — toward a Message — and never gets a Model setter.

```ts
const Focus = Behavior.forSlots(FieldSlots)<FieldInput, Message>({
  input: Behavior.slot({
    requires: { capability: Capability.TextInput },
    attributes: ({ input, h }) => (input.invalid ? [h.AriaInvalid(true)] : []),
    mount: input => MeasureField(input.value), // your own Mount.define* action
  }),
})
```

`requires` is checked against the slot contract at definition time. A behavior that requires
`Event.Click` cannot attach to a slot that did not publish click. Multiple mount contributions
compose into one `OnMount` per element.

A slot rendered once per item (rows, tabs, options) tells the Behavior which repetition it is
resolving through the second argument of `attrs`:

```ts
h.ul(slots.list.attrs(), items.map((item, index) =>
  h.li(slots.row.attrs([h.Key(item.id)], { index, id: item.id, count: items.length }), [item.label]),
))
```

The Behavior receives it as `item` (`{ index, id?, count? }`) in `attributes` and as the second
argument of `mount`, so one Behavior can write `tabindex="0"` on the current row and `-1` on the
rest, or `aria-posinset` and `aria-setsize` on each. Without an item argument, `item` is
`undefined` and the Behavior decorates the slot as a single element.

### Ready-made Behaviors

`Behaviors` holds Behaviors that own no state. The first is `Collection`: describe the parent's
array once, and a view and the Behaviors on it agree about identity, order, and disabled items.

```ts
import { Behaviors } from 'foldkit-mixins'

const items = Behaviors.Collection.of(input.tools, {
  id: tool => tool.id,
  disabled: tool => tool.disabled,
}) // ids, size, at, indexOf, isDisabled, enabled, slotItem

const Ids = Behaviors.Collection.behavior(ToolbarSlots)<ToolbarInput, Message>({
  item: 'tool',
  items: input => Behaviors.Collection.of(input.tools, { id: tool => tool.id }),
  posInSet: true,
})

// in the view: slots.tool.attrs([h.Key(tool.id)], items.slotItem(index))
```

`of` is pure and refuses two items with one id (`mixins:duplicate-item-id`), since an id is what
`aria-activedescendant` and `aria-controls` rely on. The Behavior writes `id`, `aria-disabled`,
and with `posInSet` `aria-posinset` and `aria-setsize`, reading the item context the view passes;
it contributes nothing to a slot resolved without one. Behaviors that need state, such as a
roving tab stop or a press, live in `foldkit-primitives` as a Bundle plus its Behavior.

Four more stateless Behaviors say a parent's state in ARIA, so a custom view
gets it right without hand-writing it. Each takes slot names and functions of
the view's input; none owns anything.

- `Behaviors.Disclosure.behavior(Slots)<Input, Message>({ trigger, content, open, id })`
  writes `aria-expanded` and `aria-controls` on the trigger, `id` and `hidden`
  on the content. The floor is `<details>`.
- `Behaviors.ToggleState.behavior(Slots)({ control, state, as: 'checked' | 'pressed' })`
  writes `aria-checked` (checkbox, switch, radio, option) or `aria-pressed` (a
  toggle button) from a `boolean | 'mixed'`.
- `Behaviors.FieldAssociation.behavior(Slots)({ control, label, description?, error?, id, invalid?, required? })`
  derives `<id>`, `<id>-label`, `<id>-description`, `<id>-error` from one base
  id (`FieldAssociation.ids(id)` for a view that renders them itself) and
  writes `id`, `for`, `aria-labelledby`, `aria-describedby` (the error joins
  while `invalid`), `aria-invalid`, `aria-required`. Derived, not minted, so a
  resumed page and a test agree.
- `Behaviors.SpinValue.behavior(Slots)({ control, value, onChange, min?, max?, step?, page?, text? })`
  writes the `spinbutton` role and `aria-value*`, and steps the parent's number
  with ArrowUp and ArrowDown by `step`, PageUp and PageDown by `page` (default
  ten steps), Home and End to the bounds, clamped and default-prevented;
  `SpinValue.spin(value, key, modifiers, bounds)` is the pure step. A
  press-and-hold repeat and the wheel are not handled: Foldkit's wheel
  attribute carries no delta, and a repeat is a timer the Model would own.


## SlotView

`SlotView.define(slots, render)` is a pure view that publishes slots. Attach with
`SlotView.attach`, `Style.attach` or `Behavior.attach`; each returns a new view.

Nothing but the render callback's builder names the view's Message universe, so plain `define`
infers it from an explicit `h: HtmlBuilder<Message>` annotation. Without one, `Message` becomes
`unknown` and the eventual variance error is hard to read.
`SlotView.forMessages<Message>().define(slots, render)` fixes the universe up front instead;
`Input` still comes from the callback's own `input` annotation.

`Behavior.attach` uses the behavior's `Input` as the attached view's `Input`, so declare a
behavior over the view's input type, not merely the subset of fields it happens to read.

For per-item groups such as tabs, options or calendar cells, use
`SlotView.buildersFor(slots, mixins, { input, h })` and map the items yourself. One contribution
then applies to every item while each item's base attributes retain their own event ownership.

## With `foldkit-surface`

Mixins do not require Surface, but the two fit naturally: Surface says **what a feature may
observe and emit**; slots say **where that feature may be customized**.

`foldkit-mixins-surface` renders a Surface projection through a `SlotView`, so a Behavior reads the
projected input rather than the root application Model, and its builder carries the Surface's
Message subset.

```text
Application Model / Message
          │
       Surface
  what may be seen/emitted
          │
       SlotView
  where it may be customized
          │
   Style + Behavior
```

## Accessibility contracts

```ts
const DialogPattern = A11y.pattern({
  trigger: { capability: Capability.Interactive, events: [Event.Click] },
  content: { capability: Capability.Container },
})

A11y.validate(DialogPattern, DialogSlots)
```

`A11y.validate` is pure and DOM-independent. It checks the declared contract for missing or hidden
slots, capability mismatches and unpublished events or attributes. An optional requirement
tolerates an absent slot but still checks a present one. It does **not** certify WCAG compliance.

## Introspection

The contracts are data:

- `Slots.describe(contract)` and `Slot.describe(slot)` return serializable metadata.
- `Mixin.compose` combines mixins; `Mixin.make`, `Mixin.dynamic` and `Mixin.empty` build them.
- diagnostics have stable codes and structured `details`, so the same information can feed tests,
  DevTools, documentation or agent tooling.

## Testing and static output

`SlotView.inertBuilder<Message>()` is an `HtmlBuilder` with no runtime behind it. Rendering a
view with it builds the same tagged attributes and elements, but nothing mounts and handlers are
never dispatched. Use it in tests, demos and static output, not as a renderer.

`Attributes` reads a resolved bundle, such as the result of `slots.x.attrs(base)`, by tag.
`Attributes.find(bundle, tag)` returns the **first** match typed as that variant, so `value`,
`message` or `action` need no cast; `Attributes.filter` returns every match in bundle order;
`Attributes.tagOf` returns an entry's tag. Opaque `ChildAttribute` entries have no readable tag
and are skipped.

```ts
import { Attributes, type SlotAttributes } from 'foldkit-mixins'

let input: SlotAttributes<Message> = []
const Probe = SlotView.forMessages<Message>()
  .define(FieldSlots, (field: FieldInput, slots, h) => {
    input = slots.input.attrs([h.Value(field.value)])
    return h.input(input)
  })
  .pipe(Style.attach(FieldStyle), Behavior.attach(Validation))

Probe({ value: 'Ada', invalid: true }, SlotView.inertBuilder<Message>())

Attributes.find(input, 'Class')?.value // 'field-input'
Attributes.find(input, 'AriaInvalid')?.value // true
```

## `@foldkit/ui`

`foldkit-mixins-ui` adapts `@foldkit/ui` components that expose attribute bundles or a consumer
render seam. Button, Input, Checkbox, Disclosure, Dialog, Popover, Tooltip, Slider, Tabs,
RadioGroup, Calendar and others are covered.

Some components build their entire element tree internally and expose no attachment seam; those
cannot be adapted without changing the component API. Others simply do not have an adapter yet.
See the [guide](https://github.com/doeixd/foldkit-plus/blob/main/docs/mixins.md) for the current
boundary.

## Status

The API is still settling (`0.2.x`). This package replaces none of Foldkit's state or effect
machinery — Commands, Subscriptions, Mounts, ManagedResources, Models or Submodels. Its job is
narrower: make view customization explicit, typed and composable.

The [design note](https://github.com/doeixd/foldkit-plus/blob/main/docs/design/mixins-DESIGN.md)
records the substrate probes and implementation decisions.

## See also

- [Inside-out view composition](https://github.com/doeixd/foldkit-plus/blob/main/docs/mixins.md) — the mental model and when to use it.
- [`foldkit-mixins-surface`](https://github.com/doeixd/foldkit-plus/tree/main/packages/mixins-surface) — bind a Surface projection and Message subset to a SlotView.
- [`foldkit-mixins-ui`](https://github.com/doeixd/foldkit-plus/tree/main/packages/mixins-ui) — adapters for `@foldkit/ui`.
- [`examples/mixins`](https://github.com/doeixd/foldkit-plus/tree/main/examples/mixins) — a focused runnable trace.
- [`examples/todo-app`](https://github.com/doeixd/foldkit-plus/tree/main/examples/todo-app) — a whole application styled this way.
