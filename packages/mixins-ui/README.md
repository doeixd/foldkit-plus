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
      toView: attributes => {
        const slots = Button.resolve(attributes, [SaveStyle.mixin], {
          input: undefined,
          h,
        })

        return h.button(slots.button, ['Save'])
      },
    },
    h,
  )
```

The important line is:

```ts
Button.resolve(attributes, [SaveStyle.mixin], { input, h })
```

Conceptually:

```text
attributes from @foldkit/ui
          +
Style / Behavior mixins
          |
          v
Button.resolve(...)
          |
          v
resolved slot arrays
```

The caller never copies Button's internal behavior and never has to know how to
merge its handlers/ARIA/structural attributes safely.

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
feature view that is often the Surface's projected Model; for purely static
styling it can be `undefined`.

Every adapter is available as both a component namespace (`Button.resolve`,
`Button.ButtonSlots`) and flat Slot exports such as `ButtonSlots`.

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
| Slider | `root`, `track`, `filledTrack`, `thumb`, `label`, `hiddenInput` |
| Tabs | `tablist`, `tab`, `panel` |
| RadioGroup | `group`, `option`, `label`, `description`, `hiddenInput` |
| Calendar | `root`, `grid`, `headerRow`, `previousMonthButton`, `nextMonthButton`, `headingButton`, `previousPageButton`, `nextPageButton`, `columnHeader`, `weekRow`, `dayCell`, `dayButton`, `monthCell`, `monthButton`, `yearCell`, `yearButton` |

## Why some components cannot be adapted

The bridge needs a **consumer-visible attribute bundle**. If a component builds
its entire element tree internally and exposes no `toView`-style seam, there is
nothing for Mixins to attach to.

Currently `Menu`, `Listbox`, `ComboBox`, and `DatePicker` fall into that category.
They cannot be adapted here without a change to their upstream component API.
That is a limitation of the exposed render seam, not of Slot resolution.

Other `@foldkit/ui` modules—`Toast`, `FileDrop`, `VirtualList`, `DragAndDrop`,
`Anchor`, `HoverIntent`, and `Animation`—simply do not have adapters here yet.
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
