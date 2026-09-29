# `foldkit-mixins-ui`

Adapts [`@foldkit/ui`](https://www.npmjs.com/package/@foldkit/ui) render seams into
[`foldkit-mixins`](../mixins) slots.

Use it when an `@foldkit/ui` component already owns the difficult state and
accessibility behavior, but you want callers to style or decorate the component
through a typed extension contract instead of copying its markup or manually
merging attribute arrays.

The ownership rule stays simple:

```text
@foldkit/ui
  owns component state
  owns accessibility behavior
  owns its base attributes

foldkit-mixins-ui
  names the component's public attribute bundles as Slots

foldkit-mixins
  safely merges Style + Behavior into those Slots
```

This package adds **no component state and no renderer**. It is only a bridge
between an existing `@foldkit/ui` render seam and the Mixins resolver.

## The mental model

An `@foldkit/ui` component commonly hands its caller one or more attribute
bundles:

```text
roles
aria-*
tabindex
event handlers
ChildAttributes
...
```

Those bundles are meaningful, but a raw array is not a public customization
contract. A caller can accidentally add a second `OnClick`, replace something
structural, or repeat bespoke merge code at every call site.

`foldkit-mixins-ui` gives each supported bundle a stable Slot name:

```text
@foldkit/ui component
        |
        | attribute bundles
        v
foldkit-mixins-ui Slots
        |
        | Style + Behavior
        v
foldkit-mixins resolver
        |
        v
component-owned attrs + safe additions
```

So the component author keeps control of the component, while callers get a
typed place to extend it.

## When to use it

Use this package when:

- you already use `@foldkit/ui`;
- the component exposes a consumer render seam such as `toView`;
- you want reusable styling, ARIA decoration, analytics, or element-level
  behavior around that component;
- you want conflicts to be diagnosed rather than resolved by attribute order.

Do **not** use it to add application/component state. State belongs in the
component's Submodel or the application Model. A Mixins `Behavior` contributes
element-level attributes and optional Mount behavior; it is not a hidden state
container.

If you are building your own view rather than adapting `@foldkit/ui`, publish
Slots directly with [`foldkit-mixins`](../mixins).

For Slot / Style / Behavior itself, read [Inside-out view
composition](../../docs/mixins.md) first.

## Install

```bash
pnpm add foldkit-mixins foldkit-mixins-ui @foldkit/ui
```

`foldkit`, `effect`, `foldkit-mixins`, and `@foldkit/ui` are peer dependencies.

## Sixty seconds: style a Button without copying it

Start with a normal `@foldkit/ui` Button. The adapter publishes its consumer
attribute bundle as the `button` Slot.

```ts
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as UiButton from '@foldkit/ui/button'
import { Style } from 'foldkit-mixins'
import { Button, ButtonSlots } from 'foldkit-mixins-ui'

const Message = defineMessageUnion({ Saved: {} })
type Message = typeof Message.Type

const SaveStyle = Style.forSlots(ButtonSlots)({
  button: Style.class('btn btn-primary'),
})

const saveButton = (h: HtmlBuilder<Message>) =>
  UiButton.view(
    {
      onClick: Message.Saved({}),
      toView: Button.toView([SaveStyle.mixin], { h }, ({ button }) => h.button(button, ['Save'])),
    },
    h,
  )
```

The important line is:

```ts
toView: Button.toView(mixins, { h }, draw)
```

Conceptually:

```text
attributes from @foldkit/ui
          +
Style / Behavior mixins
          |
          v
Button.toView(...)
          |
          v
draw(resolved slot arrays)
```

The caller never copies Button's internal behavior and never has to know how to
merge its handlers/ARIA/structural attributes safely.

## Follow the click

`UiButton.view` builds the component's base attributes, including the click
Message, and calls `toView` with them. `Button.toView` applies the style to
those attributes and hands the result to `draw`, which puts it on the actual
element with `h.button`. Clicking emits `Saved` to the parent update. The name
`Saved` is just the example's Message name—it does not mean this adapter wrote
anything to storage.

`toView` performs no I/O and holds nothing: it is a pure function from the
component's bundles to your markup, run on every render.

Start by adding a class. Then add a non-conflicting attribute if needed.
Do not install another `OnClick` to intercept the component: the resolver
rejects competing event owners. Put every resolved bundle on its element,
adding your own attributes beside it where you need them:

```ts
import * as UiInput from '@foldkit/ui/input'
import { Input, InputSlots } from 'foldkit-mixins-ui'

const ZipStyle = Style.forSlots(InputSlots)({ input: Style.class('zip') })

const zipInput = (h: HtmlBuilder<Message>) =>
  UiInput.view(
    {
      id: 'zip',
      toView: Input.toView([ZipStyle.mixin], { h }, ({ input }) =>
        h.input([...input, h.Autocomplete('off')]),
      ),
    },
    h,
  )
```

## `toView` and `resolve`

Every component adapter (all but Anchor, which is a Behavior) has both:

```text
Adapter.toView(mixins, { h, input? }, draw)  ->  the component's toView
Adapter.resolve(attributes, mixins, { h, input? })  ->  the resolved bundles
```

`toView` is `resolve` placed where the component calls back, and is the normal
path. It fits a stateless component's `view` and a Submodel's `viewInputs`
alike. The Message type comes from `h`, and a Submodel's value type (a
RadioGroup's or Tabs' `Value`) from where the `toView` goes, so neither needs
writing out.

A button drawn as a button needs no `draw` at all. `Button.view` takes the
label, a style, and `@foldkit/ui`'s own config:

```ts
import { Button } from 'foldkit-mixins-ui'

const saveButton = (disabled: boolean, h: HtmlBuilder<Message>) =>
  Button.view(
    {
      label: 'Save',
      style: SaveStyle,
      type: 'submit',
      disabled,
      onClick: Message.Saved(),
    },
    h,
  )
```

`resolve` is the seam underneath, for bundles already in hand: a view that
receives a Tabs `render` as its input, or a Calendar whose Mixins read the
mode it is showing, which is only known once the attributes arrive:
```ts
import type { CalendarAttributes } from '@foldkit/ui/calendar'
import { Calendar, CalendarSlots } from 'foldkit-mixins-ui'

const CalendarStyle = Style.forSlots(CalendarSlots)({
  root: Style.whenInput<CalendarAttributes['_tag']>(mode => mode === 'Years', Style.class('years')),
})

const resolveCalendar = (attributes: CalendarAttributes, h: HtmlBuilder<Message>) =>
  Calendar.resolve(attributes, [CalendarStyle.mixin], { input: attributes._tag, h })
```

## What `resolve` does

`resolve(attributes, mixins, { input, h })` receives the shaped value the
component passed to its render callback and returns the same shape with published
attribute bundles resolved through Mixins.

For a simple Button:

```text
{ button: baseAttributes }
        |
        v
Button.resolve(...)
        |
        v
{ button: resolvedAttributes }
```

For richer components, non-slot values pass through untouched. Values such as
`animatePanel`, `isVisible`, `activeIndex`, or `selectedValue` remain component
data rather than becoming Mixins slots.

`input` is whatever attached Style/Behavior callbacks are allowed to read. In a
feature view that is often the Surface's projected Model; leave it out when no
attached Mixin reads one.

What `resolve` returns (and `draw` receives) has a name for each adapter:
`ResolvedButton<Message>`, `ResolvedInput<Message>`, `ResolvedDialog<Message>`,
`ResolvedRadioGroup<Value, Message>` and `ResolvedRadioOption<Value, Message>`,
`ResolvedTabs<Value, Message>`, `ResolvedCalendar<Message>`, and so on, so a
helper that draws part of a component can be typed without `ReturnType`.
`ResolvedTextarea`'s `textarea` bundle is typed for `h.textarea`, which refuses
`InnerHTML`; the resolver refuses an `InnerHTML` from any Mixin, so no cast is
needed.

Every adapter is available as both a component namespace (`Button.toView`,
`Button.resolve`, `Button.ButtonSlots`) and flat Slot exports such as
`ButtonSlots`.

## What the resolver protects

This package delegates merge semantics to core `foldkit-mixins`; it does not
simply concatenate arrays.

The resolver guarantees that:

- component/base attributes survive;
- `ChildAttribute`s survive by identity, preserving Submodel routing;
- classes are additive;
- inline declarations merge by property;
- an event or scalar attribute has one owner;
- structural attributes remain protected;
- conflicting ownership produces a `DiagnosticError` rather than an accidental
  second handler.

For example, if the Button already owns its click transition, a Behavior cannot
silently install a competing `OnClick` at the same Slot.

That is the main reason to use this adapter instead of another `className` or
`attributes` escape hatch.

## Submodel components remain Submodels

Some `@foldkit/ui` components publish `ChildAttribute`s carrying the child
state-machine dispatcher.

The resolver preserves those attributes, so adapting the render seam does **not**
flatten or bypass the child boundary:

```text
parent view
   |
resolved Slot attrs
   |
ChildAttribute
   |
component Submodel dispatcher
```

Dialog, Popover, Tooltip, Slider, Tabs, RadioGroup, and Calendar all rely on this
behavior.

Per-item components can also return structured groups rather than one flat Slot
array. The adapter preserves that shape. For example:

```text
Tabs       -> { tablist, tabs, activeIndex }
RadioGroup -> { group, options, selectedValue, hiddenInput }
Calendar   -> ResolvedDays | ResolvedMonths | ResolvedYears
```

One Slot contribution can apply to each repeated item while every item's base
attributes keep their own event ownership.

## Supported components

This is reference material; you do not need to memorize it to understand the
adapter.

| Component | Slots |
| --- | --- |
| Button | `button` |
| Input | `input`, `label`, `description` |
| Textarea | `textarea`, `label`, `description` |
| Select | `select`, `label`, `description` |
| Checkbox | `checkbox`, `label`, `description`, `hiddenInput` |
| Switch | `button`, `label`, `description`, `hiddenInput` |
| Fieldset | `fieldset`, `legend`, `description` |
| Disclosure | `button`, `panel` |
| Dialog | `dialog`, `backdrop`, `panel`, `title`, `description`, `initialFocus`, `closeButton` |
| Popover | `button`, `panel`, `backdrop`, `arrow` |
| Tooltip | `trigger`, `panel` |
| HoverIntent | `trigger`, `panel` (open and close delays with intent, for a hover card or a menu) |
| Slider | `root`, `track`, `filledTrack`, `thumb`, `label`, `hiddenInput` |
| Tabs | `tablist`, `tab`, `panel` |
| RadioGroup | `group`, `option`, `label`, `description`, `hiddenInput` |
| Anchor | a Mount and a Behavior over `@foldkit/ui/anchor`: `Anchor.behavior(Slots)({ floating, config })` positions a floating slot against a button by id |
| Calendar | `root`, `grid`, `headerRow`, `previousMonthButton`, `nextMonthButton`, `headingButton`, `previousPageButton`, `nextPageButton`, `columnHeader`, `weekRow`, `dayCell`, `dayButton`, `monthCell`, `monthButton`, `yearCell`, `yearButton` |

## Recipes

The adapters only name slots. `Recipes` gives those slots a look: one
`Style.recipeFor` per contract (`Button`, `Input`, `Textarea`, `Checkbox`,
`Switch`, `Dialog`, `Tabs`, `Segmented`), built on the tokens of `foldkit-mixins/theme`.
Select variants, hand the pieces to `Style.forSlots`, and attach the result
like any other Style:

```ts
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { ButtonSlots, Recipes } from 'foldkit-mixins-ui'

const DeleteStyle = Style.forSlots(ButtonSlots)(
  Recipes.Button({ tone: 'danger', variant: 'outline', size: 'sm' }),
)

const L = Layers.standard
const palette = Theme.oklch({ accent: { h: 280, c: 0.15, l: '60%' } })

export const sheet = Style.stylesheet(
  L.declare,
  L.in('tokens', Theme.root(Theme.tokens)),
  L.in('theme', Theme.root(palette)),
  DeleteStyle,
)
```

`DeleteStyle.mixin` then goes to `Button.toView` as in the first example.

What a recipe assumes and does:

- **The page ships the tokens.** Every value is a `var(--fk-…)` reference to
  `Theme.tokens` or a `Theme.oklch` palette, so a scoped theme or a knob
  override restyles every recipe with no new CSS.
- **Bases sit in `components`, variants in `variants`** of `Layers.standard`,
  so an application's `app` layer overrides both without specificity fights.
  Every declaration is a layered rule and none is inline style, since inline
  style beats every layer and could not be overridden this way:

  ```ts
  const Red = Style.forSlots(ButtonSlots)(
    { button: Style.self({ background: 'red' }) },
    { layer: L.layer('app') },
  )
  // Style.stylesheet(L.declare, …, DeleteStyle, Red): Red's background wins.
  ```
- **State comes from the component's own attributes.** Checked, selected, and
  disabled looks read `aria-checked`, `aria-selected`, and `aria-disabled`,
  which `@foldkit/ui` already writes; no `whenInput` is needed.
- **Tone and variant are independent.** A tone sets a few private custom
  properties that `solid`, `outline`, and `ghost` read — except `primary`,
  which is ink by definition, and `icon`, which fixes its own square geometry
  (combine it with `size: null`, since a density would un-square it).
- **On a colored band, unfilled buttons take the band's color.** `outline` and
  `ghost` draw their text in the tone's ink, which reads on the page's surface
  and not on a band of the accent. A band sets
  `Style.vars({ '--fk-ink': 'currentColor' })`, beside `--fk-heading` for its
  headings, and their text is the band's.

Adjust a recipe with `extend` instead of forking it. Base pieces compose per
slot, a variant's pieces compose over the shipped ones, and compounds append:

```ts
const BrandButton = Recipes.Button.extend({
  base: { button: Style.class('brand-button') },
  variants: { size: { lg: { button: Style.class('brand-button-lg') } } },
})
```

`Recipes.Badge` is a function rather than a variant selection: one style serves
badges in every state, so every tone is present at once and there is no axis
to select. It takes the attribute carrying the value and the value-to-tone
map; values the map leaves out keep the base pill:

```ts
const EntryStyle = Style.forSlots(EntrySlots)(
  {
    badge: Recipes.Badge({
      attribute: 'data-state',
      tones: { Published: 'success', Changed: 'warning' },
    }).badge,
  },
)
```

Like the variant recipes it reads `Theme.tokens` and `Theme.oklch` tokens and
keeps the base in `components` with each tone in `variants`.

`Recipes.Segmented` is a tray of toggle buttons where pressing selects — plain
buttons, not `Tabs` (the group is `role="group"`, each option `aria-pressed`).
The pressed option rises from the tray: that rule lives on the group, so icon
tiles take the group piece alone. `tray` is a muted tray or a plain row (which
sets no `display`: the Builder owns its narrow tabs' visibility); `size` is
text density:

```ts
const SegmentedStyle = Style.forSlots(SegmentedSlots)(
  {
    group: Recipes.Segmented({ tray: 'plain', size: 'sm' }).group ?? Style.empty,
    option: Recipes.Segmented({ tray: 'plain', size: 'sm' }).option ?? Style.empty,
  },
  { layer: L.layer('app') },
)
```

## Mechanisms

`Touch` and `Icons` are style mechanisms, not components: no slots, no views.
Compose them into your own slots. `Touch.target` floors one control at 44px
where the pointer is coarse; `Touch.targets` floors every boxed control a
region draws. `Icons.glyph(size)` draws the icon in `--icon` before the
element's words, and `Icons.byAttribute(attribute, icons)` sets `--icon` from
an attribute's value, where `icons` maps each value to its resolved `url(…)`:

```ts
const TileStyle = Style.forSlots(TileSlots)(
  {
    tile: Style.compose(
      Touch.target,
      Icons.glyph('1rem'),
      Icons.byAttribute('data-block', { Hero: iconUrl('hero') }),
    ),
  },
  { layer: L.layer('app') },
)
```

## Accessibility patterns

Every adapter has an `A11y.pattern` beside its Slots, under `Patterns`: the
slots a widget of that kind must publish and what each must expose. The
catalog lists them with a `tier` (`stateful` for a Submodel, `stateless` for
a decorated native control), the ARIA `roles` involved, and the platform
`floor`: what the widget relies on the browser for (`focus-trap`,
`escape-dismiss`, `top-layer`, `form-submission`, ...), so nothing here
reimplements it and a reader or an agent can ask.

```ts
import { A11y } from 'foldkit-mixins'
import { Patterns } from 'foldkit-mixins-ui'

A11y.validate(Patterns.Tabs, MyTabsSlots) // [] when a custom tabs view publishes what tabs need
Patterns.catalog.find(entry => entry.name === 'dialog')?.floor // ['focus-trap', 'escape-dismiss', ...]
```

A test iterates the catalog and validates each adapter's own Slots against
its pattern, so an adapter cannot drift from the contract it claims. The
patterns are written separately from the Slots, which is what makes the
check mean something.

## Why some components cannot be adapted

The bridge needs a **consumer-visible attribute bundle**. If a component builds
its entire element tree internally and exposes no `toView`-style seam, there is
nothing for Mixins to attach to.

Currently `Menu`, `Listbox`, `ComboBox`, and `DatePicker` fall into that category.
They cannot be adapted here without a change to their upstream component API.
That is a limitation of the exposed render seam, not of Slot resolution.

Other `@foldkit/ui` modules—`Toast`, `FileDrop`, `VirtualList`, `DragAndDrop`,
and `Animation`—simply do not have adapters here yet.
`FileDrop` does expose a render seam, so it is an example that could be added
without changing `@foldkit/ui`.

## Status

The API is still settling in the `0.x` series. This package should stay small:

```text
component state / accessibility -> @foldkit/ui
merge semantics                 -> foldkit-mixins
adapter metadata                -> foldkit-mixins-ui
```

If behavior starts moving from the component into this package, the abstraction
boundary is going in the wrong direction.

## See also

- [Inside-out view composition](../../docs/mixins.md) — Slot / Style / Behavior mental model.
- [`foldkit-mixins`](../mixins) — resolver and extension contracts.
- [`foldkit-mixins-surface`](../mixins-surface) — derives a SlotView boundary from a Surface.
- [`examples/todo-app`](../../examples/todo-app) — Button and Checkbox adapted in a complete application.
