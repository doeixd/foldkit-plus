# UI architecture contract

The vocabulary every Foldkit Plus UI layer shares, written down after the
fact from what is built — not before it as a wish. If a new API does not
fit these ten nouns, the API is wrong, not the list. (Design source:
[ui-DESIGN.md](./design/ui-DESIGN.md) Phase 0; package sources of truth are
the READMEs and the skill reference.)

```text
Theme / Tokens / Knobs
        ↓
Recipe
        ↓
Anatomy / Slots / A11y Pattern
        ↓
State / Bundle / primitive
        ↓
Behavior / Mixins
        ↓
Assembled Widget
        ↓
Higher-level Patterns
        ↓
Blocks
```

Each layer is replaceable without forking the widget: theme, recipe,
anatomy, behavior, state implementation, and assembled default are
independent values. If a reasonable customization needs a widget's source,
that is a kit API bug.

## The layers

**Anatomy** — what parts exist. A `Slots.define` contract
(`foldkit-mixins`), e.g. `DialogSlots`, is the anatomy value: named slots
carrying capability, events, attributes, requirements, and visibility.
`Slots.describe` renders a contract inspectable; `Slots.withCapability`
selects the slots one capability fits. Every adapted widget publishes a
full typed anatomy, not the minimum currently needed.

**Capability** — what each part can do. `Base -> Interactive ->
{ Container, Focusable -> TextInput, Draggable }`, `Base -> Collection`,
checked by `Behavior.forSlots` when the behavior is defined, not when it
attaches. A capability is added only when a behavior needs to require it:
taxonomy without a consumer is dead weight. (Today's set is exactly
`Base`, `Interactive`, `Container`, `Focusable`, `TextInput`, `Draggable`,
`Collection` — nothing else has earned its place.)

**Pattern** — what those parts must do together. An `A11y.pattern` per
widget with an ARIA contract, plus a `Patterns.catalog` entry
`{ name, pattern, slots, tier, roles, floor }`. CI validates every entry's
slots against its pattern, so an adapter cannot drift from the contract it
claims — and a custom view built from primitives validates against the
same pattern. Timing and positioning behaviors without an ARIA contract of
their own (`Anchor`, `HoverIntent`) get none; they borrow their content's.

**State** — what the widget owns. A `Bundle`, a Submodel, or a primitive;
never a Behavior. A Behavior that "needs state" means a Submodel is
missing. State transitions are Messages through `update`; element effects
are Mounts; I/O is Message -> Command.

**Behavior** — reusable interaction attached to compatible anatomy:
`Behavior.forSlots(Slots)<Input, Message>({ slot: Behavior.slot({
requires, attributes, mount }) })`, applied with `Behavior.attach`
(which returns a new view; the original is untouched). Cross-component by
construction: a tooltip behavior asks only "does this slot satisfy
Interactive/Focusable?", never "is this a Button?".

**Style** — how parts look. `Style.forSlots(Slots)({ slot: piece })`
with classes, inline declarations, rules, and states, compiled to
deterministic classes in named layers (`Layers.standard`). A slot style is
layered when compiled, so views and the stylesheet share one value.

**Recipe** — the default design policy. `Style.recipeFor(Slots)({ base,
variants, defaults, compound })` over semantic theme tokens, `.extend`ed
rather than copied (`IconButton` extends `Button`, it does not redeclare
it). Recipes ship for the common contracts (`Recipes.Button`, ...);
`Segmented` shows the shape for the rest.

**Theme / Knobs** — system-wide policy. Tokens are semantic values;
knobs (`Theme.tokens`' density/radius factors) are global
transformations; variants are component-local decisions; state is runtime.
Recipes talk only to tokens, so re-knobbing recolors the suite.

**Widget** — the assembled default. Either an upstream `@foldkit/ui`
component adapted through its `toView` seam, or — where upstream exposes
no seam — a view fork transcribed from the pinned source with the seam
added and behavior staying upstream (documented per fork, deleted if
upstream gains the seam). Every widget registers anatomy, pattern,
recipe, tier, and platform floor in the catalog.

**Block** — application-level composition (`SettingsPage = Form +
Surface + Field + Tabs + Remote`), teaching architecture rather than
shipping a lump of view code. Blocks arrive last, when the layers below
make them boring.

## The resolver rules (the whole merge semantics)

Base attributes and `ChildAttribute`s survive by identity; classes are
additive; inline declarations merge per property; each event and scalar
attribute has exactly one owner (a second owner throws
`mixins:event-conflict`, never silently doubles); `Key`/`InnerHTML` cannot
come from a mixin; all mounts compose. Diagnostics carry codes
(`mixins:unknown-slot`, `a11y:missing-slot`, ...), never bare strings.

## Platform floor

For every widget, declare what the browser already guarantees
(`Popover.pattern.floor`, `Patterns.catalog` `floor`) instead of
reimplementing it in JS: native controls, form submission, top-layer,
focus trap, escape/outside dismiss, inert. `Theme.breakpointWidths` and
`Style.responsive` keep viewport/container/preference conditions in data,
not ad-hoc CSS.

## Status (2026-10-07)

- Anatomy: 23 slot contracts published, 22 with catalog patterns (the
  exception is `HoverIntent`, a timing behavior without an ARIA contract).
  No adapter hides slots yet — none has internal-only parts; `hidden`
  waits for the first one.
- Capabilities: frozen at the seven above. Proposals like
  `CollectionItem`, `OverlayTrigger`, or `FormControl` return when a
  behavior requires them.
- The a11y gate runs in CI (`patterns.test.ts`); every catalog entry
  names a tier and at least one role.
- Representative widgets (Combobox, Menu, Tree, Field, Drawer) arrive via
  the adapter + fork work already landed, not as bespoke state machines.
- Component coverage past that follows the capability matrix, not a
  checklist: fill a missing capability and a family of widgets gets cheap.

## Where to read next

- [Mixins guide](./mixins.md) — Slot / Style / Behavior mental model.
- [`foldkit-mixins-ui`](../packages/mixins-ui/README.md) — the adapters,
  the fork policy, and the supported-components table.
- [UI design](./design/ui-DESIGN.md) — the full roadmap this contract
  sequences (contract, then capabilities, then widgets).
