# What effect-atom-jsx's UI layer teaches this repository

**Status:** research, 2026-09-23. Read against `C:\Users\Patrick\effect-atom-jsx`
(version 0.5.0 in its `package.json`) and this repository at the commit that
added `resumable-DESIGN.md`. The resumability lessons are in
[resumable-DESIGN.md](./resumable-DESIGN.md); this document covers the rest:
slot contracts, Behaviors, Styles, accessibility, primitives, data, agents,
and testing.

effect-atom-jsx ("AF-UI") is a fine-grained reactive JSX runtime on Effect
with the same inside-out idea as `foldkit-mixins`: a component publishes
slots, and styles and behaviors attach from outside. It went through a
ratified design-question process (DQ-050 to DQ-098), wrote 54 executable
specs against its own claims and found 35 false, and recorded what it learned.
That record is the value here. Its widget catalog is thinner than this
repository's, and several of its headline guarantees are still unmet in its
own code.

## Where this repository is already ahead

Stated first so the rest reads as gaps, not as a verdict.

- **Slots bind to real nodes.** Their slot handles are in-memory Maps never
  connected to the DOM (`src/Element.ts:153-268`); `elements.input.focus()`
  emits a synthetic event and does not focus. Here a Behavior's Mount receives
  the live element and its attributes become real Foldkit attributes.
- **One owner per event and scalar attribute.** Their conflicts are
  "legal but reported" and last-wins (DQ-056/057); ours refuse with
  `mixins:event-conflict` at render.
- **A11y is checked against a pattern, with hidden and optional slots.**
  Their gate compared the Dialog's contract with itself, since the anatomy and
  the pattern are the same object (`src/kit/dialog.ts:197-199`).
- **Primitives.** They built presence, pagination, forms, a clock service and
  a reduced-motion service. Undo history, sockets, reconnect, resize,
  clipboard, timers on Effect's clock, and about thirty others exist only
  here. Their presence has no timeout fallback; ours has `durationMs`.
- **Agent governance exists.** `foldkit-agent` already has authorization and
  an audit log; theirs is comparable, not ahead.

## Gaps worth closing, in order

### 1. Style and Behavior share a write channel for inline style

Their `anchorPosition` behavior writes `position`, `left`, `top` through the
same channel styles use, so a Style setting `position` on that slot silently
fights it. Our resolver has the same property: `resolver.ts:142-175` merges
`Style` contributions per property, later wins, whether the contribution came
from a Style or from a Behavior's `attributes`. Events and scalar attributes
have one owner; style properties do not.

**Decision (done).** A style property gets one owner too, with one exception: two
Styles may layer (that is what `Style.compose` and `Style.when` are for), and a
Style may override the view's base, but a Behavior's property has no other
writer and a Style may not overwrite what a Behavior set.
`mixins:style-property-conflict` is raised at render like the event conflict,
naming the property and both owners. No declaration was needed: a Behavior's
`h.Style` in its attributes is the ownership claim, and the resolver already
checks `protected.style` on every write.

### 2. Environment inputs as services read at transition time

Their reduced-motion is a service the DOM adapter provides from `matchMedia`,
read when a transition starts, so a test or a subtree provides its own value
(`src/behaviors/reduced-motion.ts`). Our `Presence` bundle takes `durationMs`
and sleeps; nothing consults reduced motion, and the `PrefersReducedMotion`
preset is a separate placement an author must wire in by hand.

**Decision (done).** `Presence`, `Tween`, and `Spring` read a `Motion` service
with `Motion.live` over `matchMedia` and `Motion.reduced` and `Motion.full`
fixed layers, at transition time. Under reduced motion a presence exits
immediately and a tween or spring jumps to its end. The service is optional,
so a placement that provides nothing is unchanged; it rides the assembly's
resources like `Socket` does. `Locale` and `Clock` are already Effect services
here, which is the pattern they arrived at late.

### 3. A hidden native control under a custom widget

Their `formControl` behavior renders a hidden native `<input>` as a real slot
that follows the widget's value, so a form submits before any script loads
with one source of truth (`src/behaviors/form-control.ts:1-15`). Our
`foldkit-form` has a `Hidden` control kind but nothing that pairs a custom
widget (a `@foldkit/ui` Slider, Select, or Calendar) with a native field for
submission.

**Decision (done, differently).** `foldkit-mixins-form`'s default renderers
were already native controls; they only lacked a `name`. Every control now
carries `name=<key>`, and a relation picker's checkboxes carry `name` and
`value`, so a plain form post carries the drafts. That is what the
no-JavaScript fallback in the resumable design needs. A hidden-input helper
for a custom widget that is not a native control waits for a renderer that
needs it.

### 4. Semantic keys: checked, not a gap

Their reactivity keys are typed witnesses shared by readers and writers
(`Key.make('users')`, `Key.family('user')(42)`), read-capture during a loader
records the keys touched, and a single-flight mutation reruns only the loaders
whose keys intersect what the mutation invalidated (`router-runtime.ts:444-470`,
`Route.ts:3140-3218`). They needed keys because a loader is opaque code.

Remote does not: a projection declares what a Surface reads, a mutation
returns entity patches (`remote-server/src/index.ts:1126`), and the server's
live hub turns patches into field changes and `ConnectionInvalidate` messages
(`remote/src/client.ts:126`). The witness is the entity itself, typed by
`foldkit-entity`, and the read set is the projection. What they capture at
runtime, this repository has at declaration. The one idea to keep in mind is
their single-flight response: a mutation's reply carries the refreshed reads
in the same round trip. Remote refetches through its read entries instead,
one request later; if latency ever matters, the server already has the
patches to include.

### 5. Agent: a two-arm response that carries what changed

Their agent dispatch returns exactly `{ ok: true, payload: { mutation,
loaders, invalidated, url } } | { ok: false, error }`, refuses hidden tools by
name with a distinct error, checks build drift and returns a fresh manifest on
mismatch, and a restart denies pending approvals rather than dropping them
(`AGENT_SURFACE_GUIDE.md` §2–3). Our agent dispatches a Message; an agent gets
no typed outcome back beyond what it observes.

**Decision.** Keep Messages as the unit; that is what lets an agent drive any
transition, which they cannot. Add the envelope: a tool call returns the
Messages it caused, the Surfaces whose projections changed, and the resulting
route, or a typed refusal. Add a build id to the exposed manifest and refuse a
stale caller. `foldkit-agent` has authorization and an audit log
(`packages/agent/src/agent.ts`, `audit.ts`) and no approval step; when one is
added, a pending approval that outlives a restart is denied, not dropped, and
the pending queue is readable as ordinary state.

### 6. Agent-authored UI as a format that cannot express markup

Their ViewSpec has two node kinds, element and text; text carries a value and
never HTML, so raw markup is unrepresentable rather than filtered (DQ-090).
Validation checks the tree against the component catalog and action allow list
and ignores claims inside the spec. This repository has no way for an agent to
propose UI at all.

**Decision.** When agent-authored UI is wanted, the format is a tree of
Bundle placements with args decoded through each Bundle's args Schema, and
Messages from a Surface's list. A Bundle's args Schema is the catalog entry.
No new IR; note it in `agent-DESIGN.md` as the shape.

### 7. Devtools keyframes

Their timeline stores a snapshot every fifty events instead of every step and
rewinds by replay from the nearest keyframe (`Devtools.ts`). Our undo history
bounds by count. Worth a note in `foldkit-primitives` `history`: a keyframe
option for large Models, replaying Messages between keyframes, since `update`
is pure. Low priority.

## Lessons that are rules, not features

These held across their audits and apply to every package here.

- **Cleanup belongs to the Scope, not the render owner.** Their listeners,
  observers, and style writes leaked whenever no reactive owner existed, and
  tests missed it because tests always ran under one. Here a Mount's stream
  and a Managed Resource's `release` already own cleanup; the rule is to test
  each once outside a runtime.
- **Create per-instance state per instance.** Two Dialogs shared one handle
  because handles were made at definition time (DQ-050). Our resolver is per
  render, but `Style.recipe` and `Theme.define` produce module values; audit
  that nothing in them is mutable.
- **Never ship an inert API.** Their `Route.guard` type-checked and gated
  nothing, an authorization bypass. Declared-but-unread options
  (`revalidateOnFocus`, `timeout`) were the same class. Wire it in the same
  change or do not add it. This is already the spirit of "tests must be able
  to fail" in AGENTS.md; extend it to options.
- **No process-global registries.** Nine module globals caused races between
  concurrent server renders. `foldkit-ssr`'s static-region context is a
  module variable set around one synchronous view call; that is safe only
  while rendering stays synchronous (ssr-PLAN decision 6). If rendering ever
  awaits, it becomes a FiberRef.
- **Take requirements from the component, never the caller.** Their
  capability checks were against the caller's contract, which a caller could
  widen. Our `forSlots` checks against the declared Slots, which is the
  component's; keep it that way when `foldkit-mixins-ui` adapters grow
  options.
- **Prefer a format that cannot represent the dangerous thing** over a
  diagnostic that catches it.
- **Pin wire bytes before refactoring.** Their Result wire format has frozen
  golden fixtures. `foldkit-ssr`'s envelope and `foldkit-sync`'s journal
  should have the same.
- **A test named for a bug must fail under that bug.** Their audits found a
  "preserved handle" test that passed after preservation silently stopped.

## Their reversals, so we do not repeat them

- **Exit animation had three owners in sequence:** the renderer, then a
  presence behavior parked on `animationend` with no timeout, then native CSS
  `allow-discrete` with no presence at all. Ours is one owner, the `Presence`
  bundle with a duration; keep it, and add the motion service above.
- **`Style.forSlots` was the recommended path, then deleted** because it
  erased inference (DQ-054). Our `Style.forSlots(Slots)({...})` keeps the
  contract in the type; the failure they hit was a contract-less overload.
  Do not add one.
- **The shipped Dialog contradicts its own research**, which said to use no
  machine, make the `<dialog>` the root, and let native `cancel` handle
  Escape. `foldkit-mixins-ui`'s Dialog adapter already does the last two;
  `@foldkit/ui` owns the state. Nothing to change.
- **Handler callbacks versus Effects was left open** (DQ-066). Press timing
  fell back to an injected `now()` and `Effect.runSync` inside listeners.
  Foldkit settled this: a handler yields a Message and time lives in a
  Command or Subscription on Effect's clock.

## From their research folder

Their `docs/kit-research/` surveyed Zag, Radix, Base UI, react-aria, Floating
UI, @stylextras/ui and @remix-run/ui for a headless kit. What transfers:

- Zag's rule to split serializable state from DOM refs, which is Foldkit's
  Model-versus-Mount split already.
- Radix's dismissable-layer stack as a service, never a module global, one
  stack per Layer provision. `foldkit-primitives` has no layer stack; if
  Popover and Menu adapters need one, this is the shape.
- Floating UI as a dependency behind an injected `measure`, failing with a
  typed error when absent instead of returning zeros. Our `Bounds()` and
  `Intersection()` Mounts emit nothing without the API; a typed
  `MeasureUnavailable` Message would be more honest.
- @stylextras/ui's native-first floor and one typed override channel applied
  last, which is our `protected` plus resolver order.
- Researched but unbuilt on their side and absent here: `focusScope`,
  `focusVisible`, `hideOutside`, `scrollLock`. The `@foldkit/ui` components
  own focus inside themselves; a page-level focus scope for a custom overlay
  would be a `foldkit-primitives/dom` Mount.

## What not to take

- Runtime inline-style application through handles. Our Styles compile to
  classes and a deterministic stylesheet; theirs write inline and then needed
  static extraction (DQ-064) to get CSS back out.
- Last-wins behavior composition with `provides-override` diagnostics.
- A Machine adapter over `@typeonce/effect-machine`. Foldkit's `update` over
  a tagged Model is the state machine; `foldkit/experimental/machine` exists
  upstream if a chart is wanted.
- A custom `Clock` service. Effect's `Clock` and `TestClock` are already what
  our timers run on.
