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

## What the resolver guarantees

Attachments are not concatenated and left to renderer order. The resolver applies explicit rules:

- classes are additive and deduplicated into one `Class`;
- inline styles merge per property, with later attachments winning per property;
- an event or scalar attribute has exactly one owner — a second owner is an error;
- a `ChildAttribute` (a Submodel's published handler) is preserved by identity;
- `Key` and `InnerHTML` are structural and cannot be overridden;
- multiple mount contributions compose into exactly one `OnMount`.

Conflicts throw `Diagnostics.DiagnosticError` with stable codes such as
`mixins:event-conflict` and `mixins:protected-attribute`, so tests, DevTools and editor tooling can
all speak the same diagnostic language.

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

| Primitive | Meaning |
| --- | --- |
| `Style.class(...)` | class tokens |
| `Style.inline({...})` | inline declarations |
| `Style.compose(...)` | concatenate classes; later declarations win per property |
| `Style.when(condition, piece)` | a boolean known at authoring time |
| `Style.whenInput(predicate, piece)` | a condition read from the view input at render time |
| `Style.recipe({ base, variants, defaults, compound })` | returns `selection => StyleValue` |
| `Style.pseudo` / `media` / `supports` / `container` / `nest` | rule-based appearance |
| `Style.keyframes` / `global` | class-independent CSS |
| `Theme.define` / `variable` / `variables` | typed tokens and CSS custom properties |

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

Equal rules share a class, so server and client derive the same class and CSS. Rules inside
`Style.whenInput` are rejected (`style:conditional-rules-unsupported`) because the class is static
while the condition is not.

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
