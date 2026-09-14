# foldkit-mixins

Typed slot contracts and inside-out Style/Behavior attachments for Foldkit.

If you style components with CSS classes today, the failure mode is familiar: a
component looks right in one place and wrong in another, and the ways out are a
prop for every difference or a copy of the component. This package takes the
other route. A view declares the points it is willing to let others touch —
`root`, `input`, `label` — and publishes them as a typed contract. Appearance
(**Style**) and interaction (**Behavior**) are then written somewhere else and
attached to a named point by whoever uses the view. The view's markup, its state
and its Messages are never edited.

Attachments are not concatenated and handed to the renderer. A resolver merges
them: classes are additive, inline styles merge per property, and an event or
scalar attribute has exactly one owner — a second owner is an error with a
stable diagnostic code, not a handler that silently wins. What comes out is an
ordinary array of Foldkit attributes, so nothing new runs at runtime.

```text
                Slots contract
                      │
          ┌───────────┴───────────┐
        Style                  Behavior
     appearance              interaction
          │                       │
          └───────────┬──────────┘
                      ▼
                    Mixin
              slot contributions
                      │
                      ▼
          ordinary Foldkit attributes
```

## Use it when

- A view should be restyled or decorated where it is used, not where it is
  defined, and you want that customization checked rather than hoped for.
- Appearance and interaction come from different places — a design system and a
  feature — and neither should have to know about the other.
- You want CSS as data: deterministic class names and rule text you can put in
  one `<style>` block, identical on the server and the client.

**Not for state.** A Behavior owns none of it. A widget's open/selected/value is
a Foldkit Model or Submodel, a transition is `update`, a network call is Message
→ Command, and an element-scoped effect (focus trap, `ResizeObserver`) is a
`Mount`. There are no hooks, no atoms, no query cache and no second update loop
here — a Behavior that "needs state" is a signal to reach for a Submodel.

## Install

```bash
pnpm add foldkit-mixins
```

`foldkit` and `effect` are peer dependencies. `foldkit-mixins-surface` bridges a
Surface projection, and `foldkit-mixins-ui` adapts `@foldkit/ui`.

## Quick start

```ts
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Attr, Behavior, Capability, Event, Slot, Slots, SlotView, Style } from 'foldkit-mixins'

const Message = defineMessageUnion({ ChangedValue: { value: Schema.String } })
type Message = typeof Message.Type

type FieldInput = { readonly value: string; readonly invalid: boolean }

// 1. The view publishes the attachment points it will honor.
const FieldSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  input: Slot.make({
    capability: Capability.TextInput,
    events: [Event.Input],
    attributes: [Attr.AriaInvalid],
  }),
})

// 2. Appearance, authored anywhere.
const FieldStyle = Style.forSlots(FieldSlots)({
  root: Style.compose(Style.class('field'), Style.inline({ display: 'grid' })),
  input: Style.class('field-input'),
})

// 3. Interaction, built from the view's own input and builder.
const Validation = Behavior.forSlots(FieldSlots)<FieldInput, Message>({
  input: Behavior.slot({
    requires: { capability: Capability.TextInput, attributes: [Attr.AriaInvalid] },
    attributes: ({ input, h }) => [h.AriaInvalid(input.invalid)],
  }),
})

// 4. The view, and the two attachments.
const Field = SlotView.define(
  FieldSlots,
  // `h`'s annotation is what pins the view's Message universe.
  (input: FieldInput, slots, h: HtmlBuilder<Message>) =>
    h.label(slots.root.attrs(), [
      h.input(
        slots.input.attrs([
          h.Value(input.value),
          h.OnInput(value => Message.ChangedValue({ value })),
        ]),
      ),
    ]),
).pipe(Style.attach(FieldStyle), Behavior.attach(Validation))
```

`slots.input.attrs(base)` returns the base attributes plus every attached
contribution; base attributes, event Messages and any `ChildAttribute` survive.
`Style.attach` and `Behavior.attach` return a new view — the original is
unchanged.

## Slots

A slot is named metadata, not a DOM node:

```ts
Slot.make({
  capability: Capability.TextInput, // what it structurally is
  events: [Event.Input],            // what it emits
  attributes: [Attr.AriaInvalid],   // what it exposes
  hidden: false,                    // internal attachment points are hidden
  protected: { events: [Event.Click], attributes: [Attr.Role], style: ['position'] },
})
```

- **Capability** is a hierarchy: `Base → Interactive → { Container, Focusable →
  TextInput, Draggable }`, plus `Base → Collection`. A behavior that requires
  `Interactive` attaches to a `TextInput`. Extend it with
  `Capability.make(name, { extends })`.
- **Event** and **Attr** are branded tokens; `Event.make`/`Attr.make` add custom
  ones. They are metadata: they do not install handlers.
- **Requirement** tokens name platform needs (`Keyboard`, `Pointer`,
  `Clipboard`) for tooling to read.
- `hidden` reserves an internal point that public mixins cannot target: Style
  and Behavior specs do not even offer the key.
- `protected` keeps structural pieces (an event, an attribute, a style property)
  from being replaced by an attachment.

Names come from the `Slots.define` keys, never repeated inside the value.

## Style

Pure data; it never touches the DOM.

| Primitive | Meaning |
| --- | --- |
| `Style.class(...)` | class tokens |
| `Style.inline({...})` | inline declarations |
| `Style.compose(...)` | concatenate classes, later declarations win per property |
| `Style.when(condition, piece)` | a boolean known at authoring time |
| `Style.whenInput(predicate, piece)` | a condition read from the view input at render time |
| `Style.recipe({ base, variants, defaults, compound })` | returns `selection => StyleValue` |
| `Style.pseudo`/`media`/`supports`/`container`/`nest` | rule-based appearance |
| `Style.keyframes`/`global` | class-independent CSS |
| `Theme.define`/`variable`/`variables` | typed tokens and CSS custom properties |

Rule-based styles compile to **one deterministic class** (an FNV-1a hash of the
canonical rule text) plus CSS as data:

```ts
const CardStyle = Style.forSlots(FieldSlots)({
  root: Style.compose(
    Style.class('card'),
    Style.pseudo(':hover', { boxShadow: '0 1px 2px' }),
    Style.media('(min-width: 40rem)', { gridTemplateColumns: '1fr 1fr' }),
  ),
})

CardStyle.css                            // `.style-…:hover{box-shadow:0 1px 2px}@media …{…}`
Style.stylesheet(FieldStyle, CardStyle)  // every style you use, deduplicated
```

Equal rules share a class; nothing mutates the DOM, so the server and the client
derive the same class and rules. Rules inside `Style.whenInput` are rejected
(`style:conditional-rules-unsupported`) because the class is static while the
condition is not. See [DESIGN.md](https://github.com/doeixd/foldkit-plus/blob/main/docs/design/mixins-DESIGN.md) for the compiler's scope.

## Behavior

A named set of interaction contributions. Attributes are built while resolving,
from the view's `input` and `h`, so the view's Message universe is the only one
a behavior can emit into. `requires` is checked against the slot contract at
definition time: a behavior that needs `Event.Click` cannot attach to a slot
that does not publish it.

```ts
const Focus = Behavior.forSlots(FieldSlots)<FieldInput, Message>({
  input: Behavior.slot({
    requires: { capability: Capability.TextInput },
    attributes: ({ input, h }) => (input.invalid ? [h.AriaInvalid(true)] : []),
    mount: input => MeasureField(input.value), // your own `Mount.define*` action
  }),
})
```

Multiple mount contributions compose into **one** `OnMount` per element.

## SlotView

`SlotView.define(slots, render)` is a pure view that publishes slots. Attach with
`SlotView.attach`, `Style.attach` or `Behavior.attach`; each returns a new view.
For a component whose render payload has **per-item** groups (tabs, options,
calendar cells), call `SlotView.buildersFor(slots, mixins, { input, h })` and map
the items yourself — one contribution then applies to every item while each
item's base keeps its own event ownership.

## A11y

```ts
const DialogPattern = A11y.pattern({
  trigger: { capability: Capability.Interactive, events: [Event.Click] },
  content: { capability: Capability.Container },
})

A11y.validate(DialogPattern, DialogSlots) // ReadonlyArray<A11yDiagnostic>
```

`validate` is pure and DOM-independent: it checks the declared contract, never a
rendered tree, and reports missing or hidden slots, capability mismatches and
unpublished events or attributes in authored order. A requirement marked
`optional` tolerates an absent slot but still checks a present one. It does not
certify WCAG.

## Introspection and diagnostics

- `Slots.describe(contract)` and `Slot.describe(slot)` return serializable
  metadata.
- Conflicts throw a `Diagnostics.DiagnosticError` with a stable code
  (`mixins:event-conflict`, `mixins:protected-attribute`, …) and a `details`
  record, so tests, DevTools and editor tooling share one shape.
- `Mixin.compose` merges mixins; `Mixin.make`/`Mixin.dynamic`/`Mixin.empty` build
  them.

## Status

The API is still settling (`0.1.0`), and this package replaces none of Foldkit's
own machinery — Commands, Subscriptions, Mounts, ManagedResources, `@foldkit/ui`.
[DESIGN.md](https://github.com/doeixd/foldkit-plus/blob/main/docs/design/mixins-DESIGN.md) records the substrate probes and the decisions they
forced.

## See also

- [Inside-out view composition](https://github.com/doeixd/foldkit-plus/blob/main/docs/mixins.md) — the mental
  model, the four concerns, and the resolver's rules.
- [`foldkit-mixins-surface`](https://github.com/doeixd/foldkit-plus/tree/main/packages/mixins-surface) renders a Surface projection through a SlotView, and
  [`foldkit-mixins-ui`](https://github.com/doeixd/foldkit-plus/tree/main/packages/mixins-ui) adapts `@foldkit/ui` components.
- [`examples/mixins`](https://github.com/doeixd/foldkit-plus/tree/main/examples/mixins) — a runnable trace; [`examples/todo-app`](https://github.com/doeixd/foldkit-plus/tree/main/examples/todo-app) styles a whole
  application this way.
