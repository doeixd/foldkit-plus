# foldkit-mixins-ui

Published slot contracts and mixin adapters for [`@foldkit/ui`](https://www.npmjs.com/package/@foldkit/ui),
built on [`foldkit-mixins`](https://github.com/doeixd/foldkit-plus/tree/main/packages/mixins).

`@foldkit/ui` components do not own markup. A component works out the attributes
an accessible button, dialog or calendar needs — roles, `aria-*`, tabindex,
event handlers — and hands them to your `toView` callback as named bundles; you
decide the elements. That already lets you style the component, but only by
hand-merging arrays at each call site, and nothing stops you from clobbering the
`OnClick` the component installed.

This package names those bundles. It publishes each component's attribute groups
as a `foldkit-mixins` `Slots` contract, so a Style or Behavior written once
attaches to `button` or `panel` or `dayCell` by name. `resolve` merges the
attached mixins into the component's own bundles through the core resolver:
base accessibility attributes, event Messages and `ChildAttribute`s are
preserved, classes are additive, and a Behavior that tries to take over an event
the component already owns is a `DiagnosticError` rather than a silent second
handler.

## Install

```bash
pnpm add foldkit-mixins foldkit-mixins-ui @foldkit/ui
```

`foldkit`, `effect`, `foldkit-mixins`, and `@foldkit/ui` are peer dependencies.

## Use it when

You render an `@foldkit/ui` component and want to style or decorate it without
copying it. Not every component can be adapted — see [Limits](#limits) — and a
mixin still owns no state: the component's open/selected/value stays in its own
Submodel.

## Usage

```ts
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as UiButton from '@foldkit/ui/button'
import { Style } from 'foldkit-mixins'
import { Button, ButtonSlots } from 'foldkit-mixins-ui'

const Message = defineMessageUnion({ Saved: {} })
type Message = typeof Message.Type

// Written once, against the contract this package publishes for Button.
const SaveStyle = Style.forSlots(ButtonSlots)({ button: Style.class('btn btn-primary') })

// In a view, with the view's own `h`.
const saveButton = (h: HtmlBuilder<Message>) =>
  UiButton.view(
    {
      onClick: Message.Saved({}),
      toView: attributes => {
        const slots = Button.resolve(attributes, [SaveStyle.mixin], { input: undefined, h })
        return h.button(slots.button, ['Save'])
      },
    },
    h,
  )
```

`resolve(attributes, mixins, { input, h })` takes the component's own bundles and
returns them with contributions merged, one resolved array per published slot.
Anything the component passes that is not a slot (`animatePanel`, `isVisible`,
`activeIndex`, `selectedValue`) is returned unchanged. `input` is whatever your
Style/Behavior callbacks read — the model you are rendering, or `undefined` if
they read nothing.

Each component is also a namespace: `Button.resolve` and `Button.ButtonSlots`,
or the flat `ButtonSlots` re-export used above.

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

Submodel components (Dialog, Popover, Tooltip, Slider, Tabs, RadioGroup, Calendar)
publish `ChildAttribute`s, which carry the child boundary's dispatcher; the
resolver preserves them by identity, so spreading a resolved bundle into the
parent's markup still routes through the component's `toParentMessage`.

Tabs, RadioGroup and Calendar have per-item groups, so their `resolve` returns
the shaped record the component handed it — `{ tablist, tabs, activeIndex }`,
`{ group, options, selectedValue, hiddenInput }`, and one of `ResolvedDays` /
`ResolvedMonths` / `ResolvedYears` keyed by `_tag`. One `tab` contribution
applies to every tab, while each tab's base keeps its own event ownership: a
disabled tab publishes no click, so a Behavior may add one there and only there.

## Limits

The table above is the complete adapted set. `Menu`, `Listbox`, `ComboBox` and
`DatePicker` **cannot** be adapted: they build their whole element tree
internally, expose no `toView`, and hand the consumer no attribute bundles, so
there is nothing for `resolve` to attach to. That is a boundary of the component
API, not of the mixin model. The remaining `@foldkit/ui` modules — `Toast`,
`FileDrop`, `VirtualList`, `DragAndDrop`, `Anchor`, `HoverIntent`, `Animation` —
have no adapter here yet.

The API is still settling (`0.1.0`). See [DESIGN.md](https://github.com/doeixd/foldkit-plus/blob/main/docs/design/mixins-DESIGN.md).

## See also

- [Inside-out view composition](https://github.com/doeixd/foldkit-plus/blob/main/docs/mixins.md) — the mental model,
  and where `@foldkit/ui` adaptation stops.
- [`foldkit-mixins`](https://github.com/doeixd/foldkit-plus/tree/main/packages/mixins) — the resolver these adapters use.
- [`examples/todo-app`](https://github.com/doeixd/foldkit-plus/tree/main/examples/todo-app) — Button and Checkbox resolved through this package.
