# Surface versus Bundle: observation against ownership

`foldkit-surface` and `foldkit-bundle` both talk about "features" and both
touch Messages, so they are easy to confuse. They answer different questions:

```text
Surface   = "What may this feature observe, and which Messages may it cause?"
Bundle    = "Which state machine owns this slice, and where does it live?"
```

A Surface is an observation + capability contract over state owned elsewhere.
A Bundle packages a state machine — its Model, Message, init, update,
Subscriptions, resources, view — so it can be placed at a Model path, possibly
many times. The parent Model owns the placed state in both cases; the
difference is who owns the *transitions*.

## Who owns what

| | Surface | Bundle (placed) |
| --- | --- | --- |
| State | Owned elsewhere; the Surface reads it | Owned by the parent Model at the Link's path |
| Transitions | None. A Surface has no update, no private Model, no Message wrapping | The child's `update`, compiled to Foldkit's own child fold |
| Messages | An allowlist of constructible union variants | Wrapped variants of the parent union, routed to the slice by wrapper |
| Runtime behavior | None — pure contract | None added — compiles to existing lifts, no store/reducer/runtime of its own |
| May read across Submodels | Yes; that is the point | No; a placement renders and folds its own slice |

The shorthand from the Surface README still holds:

```text
Optic       = structural focus
Surface     = observation + capability contract
Submodel    = state-machine ownership boundary
```

A Bundle is the packaging of the third line: a Submodel written once and
placed through a Link.

## What each one is made of

A Surface, built from the Model's own Schema so it cannot name a missing
field: a name, optional params, a Projection of what it reads, and the
Messages it may send. `App.surface('TodoList', …)` is plain data — inspectable
without running anything, renderable, usable as an agent's context, and
collected by `Module` next to contracts.

A Bundle, built from its own Model/Message Schemas: the child's transition
parts in one value, plus args. `Bundle.declare(MediaQuery, 'dark')` gives the
placement its Model field and its wrapper variant; `Page.at(…)` places it;
`Page.assemble(…)` derives the parent's update, init, Subscriptions, and
checks. The child's Messages travel wrapped (`GotDarkMessage`), so two
placements of one bundle never claim the same tag.

## When to use which

| Situation | Use |
| --- | --- |
| Something needs to inspect what data a feature uses (fetch planning, replication scope, agent context, render binding, Module checks) | a Surface |
| A child machine placed two or more times, or published for others | a Bundle |
| A child with Subscriptions or resources you keep forgetting to lift | a Bundle, then `placements.complete` |
| A one-off child used in a single place | a hand-wired Submodel; both are overkill |
| A read boundary with no state machine behind it (a screen, an agent's context) | a Surface; a Bundle would invent transitions that do not exist |
| A state machine with no external readers (internal widget state) | a Bundle or a hand-wired Submodel; a Surface buys nothing |

The negative rows matter more than the positive ones: a Surface without an
inspector is paperwork, and a Bundle around stateless UI is machinery around
nothing. The Surface README says the first half outright ("If nothing needs to
inspect a feature's data needs, a plain function of the Model is simpler");
the same applies to bundles.

## How they compose

They are designed to overlap without merging:

- **A Surface may read across placements.** A screen showing two placed
  children declares one Surface over both slices; the placements still own
  their transitions. Observation is not ownership.
- **An agent's context may be a Surface over bundle state.** The agent sees
  the projection and sends the root Messages that route to the children. No
  second transition path appears.
- **Sync replicates a writable projection, not a placement.** The projection
  may select a placed slice's fields; replay still runs through the parent's
  `update`, which routes to the child.
- **The Module collects both.** A placement contributes a contract owning its
  Model path; a Surface (and each integration's wiring contract) sits beside
  it so `validate` sees observers and owners in one list.
- **An assembly holds both.** `Page.assemble` takes placements and integration
  wirings in one list with shared key/tag/resource checks; see
  [Wiring](./wiring.md). Placements route by wrapper, wirings route by tag.

Taking the MediaQuery bundle from `foldkit-bundle`'s README and reading its
field through a Surface looks like this — the first half places the owner,
the second half declares an observer over the same Model and Message:

```ts
const Dark = Bundle.declare(MediaQuery, 'dark')
const Model = Schema.Struct({ ...Dark.fields, helpOpen: Schema.Boolean })
const Message = defineMessageUnion({ ...Dark.cases, ClickedHelp: {} })
const App = Surface.application({ Model, Message })

const Page = Bundle.parent({ Model, Message })
const placements = Page.assemble(Page.at(Dark, { args: { query: '(prefers-color-scheme: dark)' } }))

// Observer, not a second owner: renders and inspects the placed slice.
const DarkScreen = App.surface('DarkScreen', {
  model: ({ model }) => ({ matches: model.dark.matches }),
  messages: [Message.ClickedHelp],
})
```

`DarkScreen` may read `model.dark` and may cause `ClickedHelp`. It may not
cause `GotDarkMessage`, and it owns no transitions. The placement owns the
`dark` slice's transitions and nothing else.

## Wrapped versus flat Messages

The rule both packages share, stated once: a child machine's Messages are
wrapped because the parent owns routing to a slice; an integration's Messages
are flat cases of the application union because they are facts about the whole
application that agents and journals name directly.

- Wrapping an integration's Messages adds nothing: the router would unwrap
  them before folding.
- Flattening a child's Messages breaks routing: two placements would claim
  the same tags, and `assemble` refuses that.
- A Surface's `messages` list is neither: it is an allowlist of what a
  feature may construct, enforced by the builder's type, not a routing table.

## Common confusions, corrected

- **"A Surface is a lightweight Submodel."** It is not a Submodel at all. No
  private Model, no child update, no wrapping. If it folds Messages, it is
  misnamed.
- **"A Bundle is a component."** It has a view part, but its job is the
  transitions, init, Subscriptions, and resources behind the view. A component
  without those is not a Bundle-shaped problem.
- **"A writable projection owns its slice."** `Projection.pick` and
  `FieldRef.set` are plumbing: Sync installs reconciled state through the
  shared projection (`sync.projection.set(model, shared)` on every exchange).
  Using them does not transfer ownership and does not skip the owning update;
  causing a child transition means sending the root Message that routes to
  the child.
- **`MessageSet` versus wrapper.** A `MessageSet` marks existing union
  variants durable or exposable; it routes nothing. A wrapper variant routes a
  child's Messages to its slice. Marking is policy; wrapping is routing.
- **Two applications, one field name.** Every ref and Surface carries
  `App.owner`; mixing applications is a type error or a runtime throw. A
  Bundle placed through another application's ref is a `foreign-contract`
  finding in `Module.validate`, not a working program.
