# `foldkit-mixins-ui`

Lets [`foldkit-mixins`](https://github.com/doeixd/foldkit-plus/tree/main/packages/mixins)
customize [`@foldkit/ui`](https://www.npmjs.com/package/@foldkit/ui) components
without copying their `toView` markup or hand-merging attribute arrays at every
call site.

`@foldkit/ui` components already do the hard accessibility/state work. They
produce bundles of attributes — roles, `aria-*`, tabindex, event handlers,
`ChildAttribute`s — and give those bundles to your render callback. The problem
is that a raw attribute array is not an extension contract: a caller can append
another `OnClick`, replace a structural attribute, or repeat the same merge logic
in every view.

This package names those bundles as Mixins **slots** and runs them through the
same resolver as any other SlotView:

```text
@foldkit/ui component
  produces attribute bundles
            │
            ▼
   foldkit-mixins-ui Slots
            │
      Style + Behavior
            │
            ▼
        resolver
            │
            ▼
component attributes + safe customization
```

The component still owns its state and accessibility behavior. Mixins only add
appearance or element-level behavior where the component exposes a seam.

## Use it when

Use this package when you already use `@foldkit/ui` and want reusable,
type-checked styling or decoration around those components. If you are building
your own view, publish slots directly with `foldkit-mixins`; if you are trying
to add state, use the component's Submodel/application Model rather than a
Behavior.

Not every `@foldkit/ui` component exposes a consumer render seam. Components
that build their whole element tree internally cannot be adapted here without a
change upstream; see [Limits](#limits).

For the Slot/Style/Behavior mental model first, read [Inside-out view
composition](https://github.com/doeixd/foldkit-plus/blob/main/docs/mixins.md).

## Install

```bash
pnpm add foldkit-mixins foldkit-mixins-ui @foldkit/ui
```

`foldkit`, `effect`, `foldkit-mixins`, and `@foldkit/ui` are peer dependencies.

## Quick start

```ts
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as UiButton from '@foldkit/ui/button'
import { Style } from 'foldkit-mixins'
import { Button, ButtonSlots } from 'foldkit-mixins-ui'

const Message = defineMessageUnion({ Saved: {} })
type Message = typeof Message.Type

// Written once against the stable slot contract for @foldkit/ui Button.
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

Without the adapter, every call site has to know which attribute bundle is the
button, merge its own classes/handlers into it, and avoid clobbering what the
component owns. With the adapter, the component publishes `button` once and a
Style targets that name.

`resolve(attributes, mixins, { input, h })` returns the component's own bundles
with contributions merged, one resolved array per published slot. Anything the
component passes that is not a slot (`animatePanel`, `isVisible`, `activeIndex`,
`selectedValue`) is returned unchanged. `input` is whatever your Style/Behavior
callbacks read — often the feature's projected Model, or `undefined` when they
read nothing.

Each component is also a namespace: `Button.resolve` and `Button.ButtonSlots`,
or the flat `ButtonSlots` re-export used above.

## What the resolver protects

The adapter does not simply concatenate arrays. Core `foldkit-mixins` owns the
merge policy:

- component/base attributes and `ChildAttribute`s survive;
- classes are additive;
- inline declarations merge by property;
- an event or scalar attribute has one owner, so a Behavior trying to replace a
  component-owned event gets a `DiagnosticError` instead of a silent second
  handler;
- structural attributes stay protected.

That is the reason to use this rather than another `className`/attributes prop.

## Components

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

Submodel components (Dialog, Popover, Tooltip, Slider, Tabs, RadioGroup,
Calendar) publish `ChildAttribute`s, which carry the child boundary's dispatcher;
the resolver preserves them by identity, so spreading a resolved bundle into
the parent's markup still routes through the component's `toParentMessage`.

Tabs, RadioGroup, and Calendar have per-item groups, so their `resolve` returns
the shaped record the component handed it — `{ tablist, tabs, activeIndex }`,
`{ group, options, selectedValue, hiddenInput }`, and one of `ResolvedDays` /
`ResolvedMonths` / `ResolvedYears` keyed by `_tag`. One `tab` contribution
applies to every tab while each tab's base keeps its own event ownership.

## Limits

The table above is the complete adapted set. `Menu`, `Listbox`, `ComboBox`, and
`DatePicker` **cannot** currently be adapted: they build their whole element tree
internally, expose no `toView`, and hand the consumer no attribute bundles, so
there is nothing for `resolve` to attach to. That is a boundary of the component
API, not of the mixin model.

The remaining `@foldkit/ui` modules — `Toast`, `FileDrop`, `VirtualList`,
`DragAndDrop`, `Anchor`, `HoverIntent`, `Animation` — simply do not have an
adapter here yet. `FileDrop` does expose a render seam, so it is an example of an
adapter that could be added without changing `@foldkit/ui`.

## Status

The API is still settling in the `0.x` series. This package should stay an
adapter: component state/accessibility remains in `@foldkit/ui`, and merge
semantics remain in `foldkit-mixins`.

## See also

- [Inside-out view composition](https://github.com/doeixd/foldkit-plus/blob/main/docs/mixins.md) — the mental model and where `@foldkit/ui` adaptation stops.
- [`foldkit-mixins`](https://github.com/doeixd/foldkit-plus/tree/main/packages/mixins) — the resolver, Style, and Behavior.
- [`examples/todo-app`](https://github.com/doeixd/foldkit-plus/tree/main/examples/todo-app) — Button and Checkbox resolved through this package.