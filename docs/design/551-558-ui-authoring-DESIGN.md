# UI authoring: assembly, obligations, focus recovery, keys, presence, inspection, agent parts (#551 to #558)

Status: decided 2026-11-14 (decisions delegated by the owner). Nothing here is
built by this note.

It follows AGENTS.md's "Scope: build the feature": nothing below is deferred
because no application uses it yet. Each thing not built names one of the four
reasons that rule allows (upstream owns it, a measured cost, an unsound design,
another package's ownership); §11 lists them.

The eight issues compare Foldkit Plus with UI SDK core (`@ui-sdk/core`
0.1.0-beta.1; the comparison is `docs/ui-sdk-core-review.md` on the
`ui-sdk-core-review` branch). UI SDK assembles a component from behaviors and
slots around a mutable per-instance store. Nothing here adopts that store: the
parent Model owns interaction state, `update` owns every transition, a Mount
owns element lifecycle, and a Behavior owns nothing. Every decision below is a
composition of values that exist, plus the few values that were missing.

## 0. Decisions

| # | Issue | Question | Decision |
| --- | --- | --- | --- |
| D1 | #551 | Is an assembly helper justified? | **Yes, one, and it is not a new kind of value.** `SlotView.over(slots)<Input, Message>()` names the slots, the input and the Message universe once. It hands back `define`, `behavior` and `parts` already bound, and every Behavior factory takes it where it takes the slots today. Its `define` returns the SlotView that `SlotView.define` returns today. `SurfaceView.over(surface, slots)` is the same binder with both types read from the Surface, so it takes no annotation at all. |
| D2 | #551 | Is there a "widget" object beside the SlotView? | **No.** The assembled widget is the SlotView. What it gains (D3) is the record of what was attached to it. No placement layer: where a child's state lives stays `Bundle.declare` and `Parent.at` until Blocks replace them (#190 Phase 1), and the binder never touches it. |
| D3 | #556, #552, #554 | What does a view remember about an attachment? | **Its name, its kind, what it requires and what it supplies, per slot, in order.** Today `Behavior.attach` keeps `{ name, contributions }` and drops the rest. A Mixin gains a frozen `meta`; `SlotView.detach(name)` and `SlotView.replace(name, mixin)` return new views. |
| D4 | #554, #556 | Who does a resolver conflict name? | **Both contributors, by attachment name** (`"the view"` for base attributes), beside the tag it names today. |
| D5 | #554 | How do two key behaviors share `keydown`? | **`Keys.behavior`: one Behavior, one `keydown` owner, built from named routes.** Each route declares its gestures as typed chords. Two routes that declare the same chord are refused when the Behavior is defined, naming the slot and both routes, unless they are wrapped in `Keys.first(a, b)`. No resolver rule is relaxed, and nothing chains. |
| D6 | #554 | Observation | **A Subscription, which exists** (`foldkit-primitives/events`' keyboard and hotkeys). It cannot cancel and owns no element event. A route is interception. `Keys` gains no observer. |
| D7 | #554 | IME, modifiers, repeat, `preventDefault`, propagation | Stated in §5 from Foldkit's source and a probe. Two limits are Foldkit's and go upstream (Appendix A): a handler is not told `repeat`, and cannot handle a key without preventing its default. |
| D8 | #554 | A handled Escape inside a dismissable layer | **The innermost handler wins.** `DismissLayer` listens in the bubble phase and yields to `defaultPrevented`, as a native `<dialog>` already does (probed). |
| D9 | #553 | The recovery primitive | **`FocusRecovery`: a Mount on an owner element and a Behavior that marks the owner and its parts.** A part's fallback is an ordered list of typed steps: `same`, `next`, `previous`, `parent`, `stop`, `{ part: <slot> }`, `owner`. Elements and focus bookkeeping stay in the Mount; the Model learns of the move only through the Messages it already has (`OnFocus`). |
| D10 | #553 | Nested ownership | **The innermost owner at the time focus entered decides.** An owner with no step left passes the decision outward with one bubbling event. No module-level registry. |
| D11 | #553 | `FollowTabStop` | **Keeps its meaning** (follow the roving stop while focus is inside). Its nested-stop defect (probe B2c) is fixed by scoping its query to its own owner mark. `TreeNavigation` keeps it. |
| D12 | #553, #558 | Deferred focus for a row not yet drawn | **Not in the Mount**: a claim held across renders can take focus the user has since moved (unsound). It is the Model's: a `focus` capability and a Command after the scroll. §4 gives the recipe. |
| D13 | #555 | Presence and interaction | **Five facts, named apart** (§6). Exiting content is `inert` from the frame `Hide` is drawn until it is removed. A stateless `Presence.behavior` writes `data-presence` and `inert` from the phase the Model holds. No new state machine and no `transitionend` timer. |
| D14 | #555 | When does focus move? | **When interaction eligibility ends, not at removal.** `FocusRecovery` observes `inert`, `hidden` and `disabled`, and moves focus in the same task as the patch, before the browser's own fix-up (probe P3). The later removal finds focus elsewhere and decides nothing. |
| D15 | #555 | Per-row presence | **`Bundle.each(Presence, …)`**, which exists. No keyed Presence bundle is written. |
| D16 | #552 | Obligations | **A small closed set** (`Navigation`, `Activation`, `FocusStrategy`, `State(attr)`, `Name`) on `A11y.pattern`'s slot requirements, for `Listbox` and `Checkbox` first. A Behavior slot says what it `provides`. A native control or a delegation is declared with `A11y.native` and `A11y.delegated`, the latter naming its provider. |
| D17 | #552 | Where is it checked? | **`A11y.conform(pattern)` in the view's pipe**: a type error for a literal assembly, a `DiagnosticError` when the module loads for a dynamic one. `A11y.check(pattern, view)` returns the same findings as data. |
| D18 | #552, #558 | Declared, structural, rendered | **Three words, never merged.** A rendered claim is a browser scenario from `foldkit-mixins/testing`'s `Conformance` (listbox, tree, dialog, tabs), which is #558's first item. Nothing structural is ever described as WCAG conformance. |
| D19 | #556 | Inspection | **`SlotView.describe(view)`**: pure, serializable, static. **`SlotView.resolution(view, input)`**: what one input resolves to, with names and owners and no values. Neither runs a Mount, a Command or `update`. `SurfaceView.describe` is built on the first. |
| D20 | #557 | UI parts for agents | **`Agent.part`**: a declared part names an exposed capability or a field of the agent's context, with a label and a role. Discovery reads the declaration, not the DOM, so it works headless. A part adds no way to act: invoking is `messages.dispatch`, unchanged. |
| D21 | #557 | Identity | Part id (the declaration's key) is the application identity. An occurrence key (`each`, `key`) tells repeated rows apart. A label is text: two parts with one label answer `Ambiguous`, never the first. Mounting changes nothing. |
| D22 | #558 | The audit's six items | Items 1, 2 and 6 are built by the packages here. Items 3 to 5 start with a recorded audit (U-WP11), and the one gap already known from the source, a keyboard path for reorder, is built (U-WP12). |
| D23 | all | New packages | **None.** New entries: `foldkit-mixins`' `Behaviors.Keys`, `foldkit-primitives/dom`'s `FocusRecovery`, `foldkit-primitives/interaction`'s `FocusRecovery`, `Presence` and `Reorder`, `foldkit-agent`'s parts. One new example, `examples/authoring`. |

## 1. What was read

- Issues #551 to #558 in full (none has a comment), and #531 (open), #523,
  #408 and #455 (closed), which they cite.
- `packages/mixins/src`: `a11y.ts`, `behavior.ts`, `mixin.ts`, `contribution.ts`,
  `slot.ts`, `slots.ts`, `slotView.ts`, `resolver.ts`, `attribute.ts`.
- `packages/mixins-ui/src/patterns.ts`, `tagsInput.ts`, `leaveDrawn.ts`;
  `packages/mixins-surface/src/surfaceView.ts`.
- `packages/primitives/src`: `dom/follow-tab-stop.ts`, `dom/focus-scope.ts`,
  `interaction/{focus-scope,bundle-behavior,list-navigation,overlay,dismiss-layer,pointer-drag,move}.ts`,
  `motion/presence.ts`, `events/hotkeys.ts`, and `motion/README.md`.
- `packages/agent/src/{introspect,docs,expose}.ts`,
  `packages/agent-webmcp/src/forms.ts`, `packages/surface/src/index.ts`
  (`Action`, `Module`), `packages/remote/src/can.ts`.
- Foldkit 0.170.0's `dist/html/index.js` (the build `packages/mixins` resolves).
- `docs/ui-architecture.md`, `docs/design/495-primitive-capabilities-DESIGN.md`,
  `docs/design/contract-layer-PLAN.md` (Phases 1, 3 and 4),
  `docs/design/541-laws-DESIGN.md` (D23, `Evidence`).

## 2. What was probed

Two browser probes (Chromium build 1248, the `browser` project) and one unit
probe, as scratch test files under `packages/primitives/test` and
`packages/mixins/test`. All three are deleted. Each work package turns the rows
it relies on into checked-in tests.

**Focus.**

| # | Finding | Evidence |
| --- | --- | --- |
| B1 | Removing the focused element fires `blur` and `focusout` with no `relatedTarget`, and `activeElement` is `body` at once. | `events=[blur(clear->null) focusout(clear->null)] active(sync)=body` |
| B2a | Under `FollowTabStop`, removing the only row leaves focus on `body`. | `active=body` |
| B2b | Under `FollowTabStop` on a field, removing the focused clear button leaves focus on `body`; it reaches the input only when the input carries a literal `tabindex="0"`. | `active=body`; with the attribute, `active=in` |
| B2c | **A defect.** A row that holds another roving widget: the outer container's `querySelector('[tabindex="0"]')` finds the nested stop first. Row 3 removed, the stop is row 2, focus lands on row 1's inner button. | `active=row1-tool` |
| B2d | Two nested `FollowTabStop`s, the inner focused part removed: the **outer** one moves focus (to its own stop), because its observer was made first. The inner owner never decides. | `focus calls=[o1] active=o1` |
| B2e, B2f | A modal dialog opened in the task that removes the row, or a frame later, keeps focus. | `active=ok` both |
| B3 | `inert`, `hidden`, `display: none`, `visibility: hidden` and `disabled` on, or around, the focused element: focus is still there synchronously, and is `body` after a frame, with `blur` and `focusout` and no `relatedTarget`. `aria-hidden` moves nothing. | `active(sync)=inside active(after frames)=body`; `aria-hidden: events=[] … =inside` |
| B4 | `focus()` scrolls the page to its target; `focus({ preventScroll: true })` does not. | `scrollY` 0 against 2118 |
| B5 | For the ids `1-option-1`, `a:b`, `x"y`, `a\b`, `row.1#2`, `a b`, `q]r`: `#id` throws or misses for every one; `RovingTabindex.idSelector`, `CSS.escape` and `getElementById` find every one. | Seven of seven |
| P2 | A focused row moved with `insertBefore` (a keyed reorder) loses focus to `body` and is connected again in the next microtask. Moving its siblings around it keeps focus. `moveBefore` exists in this Chromium and keeps focus. | `active(sync)=body microtask=body,connected=true`; `P2c … active=c` |
| P3 | `inert` set on the focused row: a MutationObserver's callback still finds focus on it, and a `focus()` made there moves it with a real `relatedTarget`. Two frames later focus is where it was put, and removing the row then moves nothing. | `active at observer=b-x events=[focusout(b-x->a) focusin(a)] … after removal=a` |
| P4 | An `inert` row takes no Tab, no programmatic `focus()`, and no hit test. | `Tab … lands on after; elementFromPoint … =div; clicks=0` |

**Keys.**

| # | Finding | Evidence |
| --- | --- | --- |
| K1 | Two Behaviors that each add a `keydown` handler to one slot throw `mixins:event-conflict`. The diagnostic names the slot, the event and the two Foldkit tags. It names neither Behavior. | `"two owners for event \"keydown\": \"OnKeyDownPreventDefault\" already owns it"`, `details: { tag, event, owner }` |
| P1 | In a native modal `<dialog>`, an input that prevents Escape's default keeps the dialog open; unprevented, it closes. A document listener sees `defaultPrevented` false in the capture phase and true in the bubble phase. | `capture(prevented=false) bubble(prevented=true) dialog.open=true` |
| P1b | A held key arrives as one `keydown` with `repeat` false and the rest with `repeat` true. | `repeat=[false,true,true]` |
| B6 | Two listeners on one element both run; the second sees the first's `preventDefault`. | `first(defaultPrevented=false) second(defaultPrevented=true)` |

**Mounts, attachments, patterns.**

| # | Finding | Evidence |
| --- | --- | --- |
| M1 | A base `OnMount` and a Mixin's mount compose into one. | `OnMount:Mixins[root](ProbeA,ProbeB)` |
| M2 | #531 holds at HEAD: a `ChildAttribute` holding an `OnMount` is emitted beside the composed one. | Two entries: the child attribute, and `OnMount ProbeB` |
| K2 | An attached view's `mixins` hold `name` and `contributions` only. A Behavior's `requires` and its spec are gone. | `keys: ["name","contributions"]` |
| K3 | `attach` leaves the view it was given unchanged. | `["Look","EscapeClears"]` after a third attach elsewhere |
| K4 | An unnamed Behavior is named `"Behavior"`. | — |
| A1, A2 | A contract that declares `keydown` on `listbox` and `aria-selected` on `option` passes `A11y.validate`, and a view over it that writes no role, no ARIA and no handler draws `<ul><li>` with empty data. | `[]`; `{"sel":"ul","data":{},…}` |

Read from source, not probed: Foldkit wraps every `OnKeyDown*` in
`skipImeCompositionKeydown` (`html/index.js:448-490`, `:64`); a handler is
given `(key, modifiers)` and nothing else; `OnKeyDownPreventDefault` prevents
only when its function answers `Some`; `OnKeyDown` dispatches on every key and
cannot decline; nothing stops propagation; two handlers given to one vnode
chain (`addDataOn`, `:210-225`). Real IME input was not driven.

**Types.** A scratch file of declarations modelling `Bound`, `NamedBehavior`
with a provided union, `View` with a fourth parameter, `attach` and `conform`,
compiled alone with the workspace's TypeScript 7.0.2 and deleted. It models
the mechanism, not the packages: the work packages prove it on the real types.

| # | Finding | Evidence |
| --- | --- | --- |
| T1 | A factory given the binder types its options from it with nothing annotated, hoisted and inline inside `pipe`, and refuses an unknown slot, a field the input lacks and a Message outside the universe. The old `(slots)<Input, Message>` call still compiles. | Three `@ts-expect-error` used; no other error |
| T2 | `Search.use(factory)` does not type: the overloaded factory resolves to its last overload as an argument. | `TS18046: 'input' is of type 'unknown'` |
| T3 | A view accumulates what its attachments provide through `pipe`, and `conform` refuses a pattern they do not cover, an empty view, and a Behavior wired to the wrong slot. | Three errors where expected, one of them `lacks option/focus-strategy` for `item: 'clear'` |
| T4 | The whole model costs 1,594 instantiations. | `--extendedDiagnostics` |

Not probed: touch (`browser-touch`), a screen reader, Safari and Firefox, and
snabbdom's choice of which element a keyed reorder moves.

## 3. Assembly (#551): D1, D2, D3

### What exists

A view names its Message universe once (`SlotView.forMessages<Message>()`,
`slotView.ts:440`), its input in the render callback's annotation, and every
Behavior factory names both again, because a Behavior is made before the view
it will meet:

```ts
// examples/tree/src/view.ts, as it stands
export const TreeKeys = TreeNavigation.behavior(Nav, navArgs)(TreeSlots)<Model, Message>({ … })
export const TreePicks = Selection.behavior(Sel, selArgs)(TreeSlots)<Model, Message>({ … })
export const Tree = SlotView.forMessages<Message>()
  .define(TreeSlots, (model: Model, slots, h) => …)
  .pipe(Behavior.attach(TreeKeys), Behavior.attach(TreePicks))
```

Two behaviors and a view name `Model` or `Message` in four places and the
slots in three. With *n* behaviors it is *n* + 2 and *n* + 1. A wrong pair is
caught, but late and far away: `Behavior.attach` reports an invariance
mismatch that names neither annotation (`slotView.ts:393-398` says so).

`SlotView.parts(S)<Input, Message>()` (`slotView.ts:567`) already binds the
three once, for parts. `SurfaceView.define` (`surfaceView.ts:14`) already
infers both types from a Surface. Neither reaches a Behavior factory.

### The gap

The repetition is the factory generics, and nothing else. Model, Message
union, Bundle, slot contract, recipe and Behavior are six values because they
are six replaceable things (`docs/ui-architecture.md`), and a helper that
folded them into one would remove the replaceability the issue asks to keep.

### The binder

```ts
// foldkit-mixins
const Search = SlotView.over(SearchSlots)<SearchInput, Message>()

const Keys = ListNavigation.behavior(Results, navArgs)(Search)({
  container: 'input',
  item: 'option',
  items: input => input.results, // `input` is SearchInput
  text: (input, index) => input.results.at(index).label,
})
const Clears = Search.behavior(
  { clear: Behavior.slot({ attributes: ({ h }) => [h.OnClick(Message.Cleared())] }) },
  { name: 'Clears' },
)
export const SearchField = Search.define((input, slots, h) => …) // nothing annotated
  .pipe(Style.attach(SearchStyle), Behavior.attach(Keys), Behavior.attach(Clears))
```

- `over(slots)<Input, Message>()` returns a `Bound<Slots, Input, Message>`:
  `{ slots, define, behavior, parts }`, carrying the two types.
- `define(render, options?)` is `SlotView.define` with all three fixed.
- `behavior(spec, options?)` is `Behavior.forSlots(slots)<Input, Message>(spec, options)`.
- `parts` is `SlotView.parts(slots)<Input, Message>()`.
- **A Behavior factory takes the binder where it takes the slots.** Every
  factory in `foldkit-primitives/interaction` and under `Behaviors` ends in
  `(slots)<Input, Message>(options)`. Each gains one overload, listed first:
  `(bound: Bound<Slots, Input, Message>) => (options) => NamedBehavior`. The
  old call stays. A `use(factory, options)` on the binder was tried and does
  not type: a generic overloaded function passed as an argument resolves to
  its last overload, and the options came out `unknown` (probe T2).
- `SurfaceView.over(surface, slots)` returns the same record with `Input` the
  Surface's projected Model and `Message` its exposed subset.

`forMessages` stays: a view with no Behavior needs only it. `over` is not a
second way to do what it does, since `forMessages` cannot type a Behavior.

**What it must reject, each as a `@ts-expect-error` case:** a Behavior made by
another binder with another Message (at `Behavior.attach`, as today); a
factory's options that read a field `Input` lacks, name a slot the contract
does not publish, or return a Message outside the universe;
`behavior({ nope: … })`. Probe T1 compiled the first four against a model of
these types. **What it must keep:** inference through `pipe` for six attachments
without an annotation, tested inline and hoisted (the "curried generic's
return type" trap).

**Type cost.** U-WP9 writes the search field twice, explicit and bound, and
compares `tsc --extendedDiagnostics` (instantiations, check time) for the two
files alone. The bound form passes when it costs no more than 10% over the
explicit one; over that, the measured cost is the reason `over` is withdrawn
and the examples publish the explicit path, which the issue allows.

### Attachments are remembered (D3)

`Behavior.attach` passes `behavior.mixin` (`behavior.ts:164-169`), and a Mixin
is `{ name, contributions }` (`mixin.ts:189-192`), so the view cannot say what
an attachment required or supplies (probe K2). A Mixin gains:

```ts
interface MixinMeta {
  readonly kind: 'style' | 'behavior' | 'mixin'
  /** Per slot: what it asked of the slot, what it supplies (D16), and whether it reads the input. */
  readonly slots: Readonly<Record<string, {
    readonly requires: { readonly capability?: string; readonly events: ReadonlyArray<string>; readonly attributes: ReadonlyArray<string> }
    readonly provides: ReadonlyArray<string>
    readonly reads: 'static' | 'input'
  }>>
  /** The Mixins `Mixin.compose` joined, in order. */
  readonly parts?: ReadonlyArray<{ readonly name: string; readonly meta?: MixinMeta }>
}
```

`Behavior.forSlots` and `Style.forSlots` fill it; `Mixin.make` and
`Mixin.dynamic` leave it absent, which a description reports as `kind:
'mixin'` with nothing known. It is metadata of a frozen value, written once
where the Mixin is made.

```ts
SlotView.detach('Clears')            // a transform: the view without that attachment
SlotView.replace('Clears', other)    // the same place in the order, another Mixin
```

Both throw `mixins:unknown-attachment` for a name the view does not hold, and
`mixins:ambiguous-attachment` for a name it holds twice. An unnamed Behavior
(`"Behavior"`, K4) cannot be addressed, which is the reason to name one.

### The four words the docs must keep apart

| Doing | Touches | Never touches |
| --- | --- | --- |
| **Using** a widget | its view function, its recipe's selection | its slots |
| **Customizing** it | `Style.attach`, `Behavior.attach`, `detach`, `replace`, `.extend` on the recipe | its render function |
| **Assembling** one | `Slots.define`, `SlotView.over`, shipped primitives, a pattern (`A11y.conform`) | a primitive's `update` |
| **Authoring a primitive** | a Bundle, its Messages, its Behavior factory with `provides`, a Mount | any view |

### Examples (U-WP9)

`examples/authoring`: a search field (input, clear button, results), an
editable and dismissible list, and a popup with selection. Each shows the
shipped default, a recipe override, an attached Behavior, parent placement
and two independent instances on one page with ids of their own (the "two
runtimes share ids" trap applies to two instances too). Browser tests cover
what a person sees: type, arrow, Enter, Escape, clear, dismiss, focus after
each. The example lints with the scaffold's `@foldkit/oxlint-plugin` rules and
drives its primitives through the helpers #495 added, never a child Message
built in the root.

## 4. Focus recovery (#553): D9 to D12

### What exists

- `FollowTabStop` (`dom/follow-tab-stop.ts`): while focus is inside the
  container, a mutation moves a lost or passed-over focus to the descendant
  with `tabindex="0"`. Its one user is `TreeNavigation.behavior`
  (`tree-navigation.ts:265`).
- `FocusScope` (`dom/focus-scope.ts`): on insert remembers and takes focus, on
  unmount gives it back. It is about a scope appearing and going, not a part.
- `TagsInput` focuses its input by a Command after a removal
  (`tagsInput.ts:121-126`): the Message-driven path, written once, for one
  widget.

### The gap

Probes B2a to B2d: no fallback when no stop is left; none to a named part; a
nested stop taken by the outer container; the outer owner deciding for the
inner. Probe P2: a reordered row loses focus and `FollowTabStop` then drops
its claim (`:28-30` reads a connected element as "the user left").

### The primitive

```ts
// foldkit-primitives/interaction
const Recovers = FocusRecovery.behavior(Search)({
  owner: 'root',
  parts: {
    clear: [{ part: 'input' }],
    row: ['same', 'next', 'previous', { part: 'input' }],
  },
})
```

- `owner` and every key of `parts` are slot names of the contract, and so is
  `{ part: … }`: a misspelling is a type error (#251).
- The Behavior writes `data-fk-focus-owner` on the owner, and on each part
  `data-fk-focus-part="<slot>"` and, for a slot drawn per item,
  `data-fk-focus-key="<item.id>"`. `parent: (input, item) => id` adds
  `data-fk-focus-parent` for a tree drawn flat, where the parent row is not a
  DOM ancestor. Marks are attributes the view draws, so a server render has
  them and nothing is stamped by the Mount.
- The Mount (`foldkit-primitives/dom`'s `FocusRecovery`, args `{ fallback:
  Record<slot, Step[]> }`) reads marks by `getAttribute` and compares strings.
  It builds no selector from an id, so every id of B5 works.

**Steps**, tried in order until one finds a focusable, visible, connected
element (`focus-scope.ts`'s `isVisible`) that this owner owns:

| Step | Finds |
| --- | --- |
| `same` | the part with the held slot and key, drawn again (a reorder, P2) |
| `next`, `previous` | the nearest part of the same slot after or before the held one, in the order last seen while it was focused |
| `parent` | the part named by the held part's parent mark, else its closest ancestor part |
| `stop` | this owner's part with `tabindex="0"` (the roving stop) |
| `{ part }` | the first part of that slot |
| `owner` | the owner element, when it is focusable |

**The algorithm.**

1. On `focusin` inside the owner: record the held part (slot, key, element),
   its parent mark, and the chain of owner elements from the innermost
   outward. While it stays focused, each mutation refreshes the order of its
   sibling parts.
2. A decision is considered when a mutation (child list, or the attributes
   `inert`, `hidden`, `disabled`) leaves the held element disconnected or no
   longer focusable, or a `focusout` with no `relatedTarget` does.
3. It is made only when **all** hold: `document.activeElement` is `body` or
   null (focus is lost, not moved: B2e, B2f); this owner was the innermost in
   the recorded chain, or every owner inside it is disconnected; the held
   element is disconnected or unfocusable (a blur the user made on a healthy
   element is theirs).
4. The steps run. The target takes `focus({ preventScroll: true })` and then
   `scrollIntoView({ block: 'nearest', inline: 'nearest' })`, which moves
   nothing when it is in view (B4).
5. With no step left, the owner dispatches one bubbling
   `foldkit-plus:focus-unrecovered` from its element. The next owner out
   stops it and runs its own steps for the part of its own that contains the
   inner owner. With no owner left, focus stays on `body`: it never goes to
   an element outside the recorded chain.
6. On release the observer and three listeners are removed. A whole owner
   torn down decides nothing itself; its outer owner sees rule 3's second
   clause.

Rule 3 is what makes nested removal one decision: the outer observer runs
first (B2d) and declines, the inner one decides or passes outward
synchronously.

**Mount composition.** The owner slot may carry other Mounts; the resolver
composes them (M1). Until #531 is fixed (U-WP1), a `ChildAttribute` holding
an `OnMount` on the owner slot would drop one of the two, so U-WP5 lands after
U-WP1 and its browser test draws the owner with a second Mount.

**`FollowTabStop` (D11).** It keeps both jobs it has (follow a stop that
moved; follow after a removal when a stop remains). Its query changes from
"the first `[tabindex="0"]` below me" to "the first whose closest
`[data-fk-focus-owner]` is me", and `TreeNavigation.behavior` writes the mark
on its container. A bare Mount user adds the attribute; without it the query
is as before. That fixes B2c without changing what it means. A tree that also
wants `parent` or `{ part }` attaches `FocusRecovery` beside it: the two
never both act, since each acts only on lost focus and the first leaves none.

**Deferred focus (D12).** `next` finds only what is drawn. For a windowed
list the wanted row may not be: the step falls through (to `owner`, the
scroller), and the application's `update`, which knows the row it wants,
scrolls and focuses by Command (`ListNavigation`'s `helpers.focus(id)`, then
`Dom.focus` after `WindowList`'s scroll settles). A Mount that kept "focus
row 41 when it appears" would act frames later on a user who had moved on.

### How it differs, for the README

| | Acts when | Moves focus to | Holds |
| --- | --- | --- | --- |
| `FocusScope` | a scope is inserted, removed | first inside; back to what had it | the element focused before |
| `FollowTabStop` | the roving stop moved or its row went, focus inside | the element with `tabindex="0"` | whether focus is inside |
| `FocusRecovery` | a focused part was removed or made unfocusable, focus lost | the part's declared fallback | the held part, its neighbours, its owners |

## 5. Keys (#554): D5 to D8

### What exists

The resolver gives each event one owner (`resolver.ts:270-286`), and
`ListNavigation` is one Bundle rather than `RovingTabindex` plus `Typeahead`
for that reason (`list-navigation.ts:1-8`); its `commit` option exists because
Enter could not be a second handler (`:98-101`). About thirty source files in
the UI packages write an `OnKeyDown*`, each a closed table of its own.

### The gap

A search input wants Escape to clear, ArrowDown to open, and a primitive's
arrows. Today that is one hand-written handler or `mixins:event-conflict`,
whose text names tags (K1).

### The router

```ts
// foldkit-mixins: Behaviors.Keys
const EscapeClears = Keys.route<SearchInput, Message>('EscapeClears', {
  on: [Keys.chord('Escape')],
  handle: ({ input }) => (input.query === '' ? Option.none() : Option.some(Message.Cleared())),
})
const ArrowOpens = Keys.route<SearchInput, Message>('ArrowOpens', {
  on: [Keys.chord('ArrowDown', { alt: true })],
  handle: () => Option.some(Message.OpenedResults()),
})
const SearchKeys = Keys.behavior(Search)({
  slot: 'input',
  routes: [EscapeClears, ArrowOpens, ListNavigation.keys(Results, navArgs)({ … })],
})
```

- **A chord** is `{ key, shift, ctrl, alt, meta }`, modifiers false unless
  given, matched exactly. A `key` longer than one character must be one of the
  named keys of the UI Events specification (`Escape`, `ArrowDown`, `Enter`,
  …): `Keys.chord('Esc')` throws `mixins:unknown-key` where it is written.
  `Keys.printable` is the class of single characters with no `ctrl`, `alt` or
  `meta`. `Keys.where(predicate)` is an undeclared gesture.
- **A route** is `{ name, on, handle }`. `handle({ key, modifiers, input,
  item })` answers `Option<Message>` or `Option<{ message, focus }>`, `focus`
  being an element id (looked up as `idSelector` does, B5).
- **`Keys.behavior`** contributes one handler to one slot, always
  `OnKeyDownFocus`: a route that answers no `focus` gets the selector `:not(*)`,
  which matches nothing, so focus stays and Foldkit still prevents only on
  `Some`. It
  requires `Event.KeyDown` of the slot, like any Behavior, and a slot that
  protects `keydown` refuses it, like any Mixin. Nothing in the resolver
  changes for it.
- **Overlap.** When the Behavior is defined, every pair of routes is compared
  by declared chords (a character chord overlaps `printable`). An overlap
  throws `mixins:key-conflict` with `{ slot, event: 'keydown', chord,
  contributors: [a, b] }`. `Keys.first(a, b)` is the explicit precedence: one
  route named `a>b` whose handler asks `a` and then `b`.
- **Order at run time.** At most one declared route matches a press, by
  construction. It is asked first. If it answers `None`, the `where` routes
  are asked in list order. That order is a documented policy: two predicates
  are not claimed disjoint.
- **One Message per press.** The first `Some` ends the press. Nothing chains.

**Primitives export routes.** `ListNavigation.keys`, `RovingTabindex.keys`,
`TreeNavigation.keys`, `GridNavigation.keys`, `Typeahead.keys` and
`Behaviors.SpinValue.keys` each return the route their `behavior` installs
today, and each `behavior` is rebuilt on `Keys.behavior` with that one route,
so there is one implementation. `ListNavigation`'s `commit` option becomes a
route the caller lists; the option stays for a release and is deprecated.

**Two attachments that both own `keydown` still conflict.** That is the rule
kept. The diagnostic now says who (D4): `two owners for event "keydown" on
slot "input": "EscapeClears" and "ListNavigation"`, with `contributors` in
`details`, and its message points at `Keys.behavior`.

### Policies (D7)

| Matter | Policy | Why |
| --- | --- | --- |
| IME composition | No route sees a key of a composition. | Foldkit skips them for every `OnKeyDown*`. |
| Modifiers | A chord matches its modifiers exactly; `shift` is part of the chord. | A route for `ArrowDown` must not take `Alt+ArrowDown`. |
| Repeat | A held key runs its route on every repeat (P1b). A route that must act once is guarded in `update`. | Foldkit does not pass `repeat`. Appendix A asks for it. |
| `preventDefault` | A handled press is prevented. An unhandled one is untouched, so every text-editing key the routes decline keeps its native meaning. | `OnKeyDownPreventDefault` prevents only on `Some`. Handling without preventing is not expressible; Appendix A. |
| Propagation | Never stopped. An ancestor that should yield reads `defaultPrevented`. | P1, B6; and a native `<dialog>` does the same. |
| Authorization | A route decides which Message a key means. Whether the transition may happen is `update`'s and the domain's. | A view cannot refuse; it can only not send. |

### Observing, routing, replacing

- **Observing** a key is a Subscription (`foldkit-primitives/events`' keyboard
  stream, `matchHotkey` in `update`). It is given `repeat`, cannot cancel, and
  owns no slot's event.
- **Routing** is `Keys.behavior`.
- **Replacing** is `SlotView.replace('SearchKeys', other)`, or a new
  `Keys.behavior` over the shipped widget's exported routes with one left out.

### Escape in a layer (D8)

`DismissLayer` listens for Escape at the document in the capture phase
(`dismiss-layer.ts:143-147`), so it runs before any route and dismisses the
dialog whose search input just cleared itself. It moves to the bubble phase
and skips an event with `defaultPrevented`. A native `<dialog>` already
behaves so (P1). This is a behaviour change and gets a changelog line: a page
that prevented Escape on purpose and relied on the dismiss anyway stops
dismissing.

## 6. Presence, interaction and focus (#555): D13 to D15

### What exists

`Presence` (`motion/presence.ts`): `shown → hiding → hidden`, a generation on
every transition, a timed `Hidden` fact the generation can refuse, at once
under reduced motion. `isVisible` is "keep drawing". Nothing in the UI
packages uses it: `Overlay` says "Presence stays CSS" (`overlay.ts:10-11`),
and the popups leave through upstream's `data-closed` (`leaveDrawn.ts`). The
Toast marks a waiting toast `inert` (`toast.ts:874`), the one precedent.

### The five facts

| Fact | Read from | True while |
| --- | --- | --- |
| Desired visibility | the application's own Model (the row exists, the popup is open) | the user wants it |
| Retained rendering | `isVisible(presence)` | `shown` or `hiding` |
| Interaction eligibility | `presence.phase === 'shown'` | not exiting |
| Accessibility exposure | the same | not exiting |
| Actual removal | the view stops drawing it | `hidden` |

### The policy

Exiting content is **`inert`** for the whole `hiding` phase: no pointer, no
Tab, no programmatic focus, out of the accessibility tree (P4). It is not
`aria-hidden`, which leaves focus inside (B3), and not `hidden`, which would
end the animation.

```ts
// foldkit-primitives/interaction
const Leaves = Presence.behavior(List)({
  content: 'row',
  phase: (input, item) => input.rows[item.id].phase,
})
```

`Presence.behavior` is stateless: it reads a phase from the input and writes
`data-presence="shown|hiding"` and `h.Inert(true)` while hiding. It sends no
Message and mounts nothing, so it needs no placement and a Scene test resolves
it. A recipe styles the exit on `[data-presence="hiding"]`, its duration the
theme's motion token times `travel`, the same number the placement's
`durationMs` is given.

**Per row (D15):** `Bundle.each(Presence, link)` (`bundle.ts:183`) places one
Presence per key of the list. The parent's `update` sends `Hide` to a row's
placement on dismiss and removes the row from its own data on that
placement's `Hidden` out-fact. The row's data and its presence are two facts
with two owners, joined in one `update`.

### When focus moves (D14)

At `Hide`, in the frame that draws `inert`. `FocusRecovery` observes the
attribute, finds the held part unfocusable with focus still nominally on it,
and moves it in the mutation's microtask: before the browser's fix-up, which
would have put it on `body` a frame later (B3, P3). The steps are the part's
own (`next`, `previous`, `{ part: 'input' }`; a popup's trigger is
`FocusScope`'s `restore`, which already runs on unmount, so a popup uses
`{ part: 'trigger' }` here and turns `restore` off, one owner of the return).

- **Removal cannot decide twice.** At `Hidden` the row is removed; the held
  part is by then the fallback, connected and focusable, so rule 3 of §4
  fails. P3 measured exactly this.
- **Hide then Show.** `Show` bumps the generation and the late `Hidden` is
  refused (`presence.ts`, tested in `presence.test.ts`). `inert` goes with the
  next frame. Focus stays where recovery put it: nothing refocuses a reopened
  part, since `FocusRecovery` acts only on lost focus.
- **Reduced motion.** `Hide` yields `Hidden` at once, through the same two
  Messages; the row may be `inert` for one frame or none. Recovery then runs
  on the removal instead. Either way it runs once.
- **A new surface taking focus during the exit keeps it:** focus is not lost,
  so rule 3 fails.
- **Server markup.** A `shown` row draws `data-presence="shown"` and no
  `inert`; a row that is `hiding` in the served Model draws `inert`, which a
  parser keeps as a boolean attribute. U-WP6 renders to a string and parses it
  back.

The completion owner stays the timeout Command. The README's "a
`transitionend` Mount is a future opt-in" stays a sentence: it would be a
second completion owner beside the Command, and the issue rules that out.

## 7. Obligations (#552): D16 to D18

### What exists

`A11y.validate(pattern, slots)` (`a11y.ts:84-157`) checks that a contract
publishes slots, capabilities, events and attributes. `Patterns.catalog`
holds a pattern per adapted widget and a gate test validates each. Its own
header says it "checks the declared contract, not a rendered tree".

### The gap

A1 and A2: declaring `keydown` is not navigating, and declaring
`aria-selected` is not writing it.

### Obligations

```ts
// foldkit-mixins: A11y
export const Listbox = A11y.pattern({
  listbox: {
    capability: Capability.Interactive,
    events: [Event.KeyDown],
    obligations: [A11y.Navigation, A11y.Name],
  },
  option: {
    capability: Capability.Focusable,
    attributes: [Attr.AriaSelected],
    obligations: [A11y.FocusStrategy, A11y.Activation, A11y.State(Attr.AriaSelected)],
  },
})
```

| Obligation | Means | Supplied by, today |
| --- | --- | --- |
| `Navigation` | arrow keys, Home and End move among the items | `ListNavigation`, `RovingTabindex`, `TreeNavigation`, `GridNavigation` (their container slot) |
| `FocusStrategy` | each item is reachable: a roving stop, `aria-activedescendant`, or a native control | the same four (their item slot); `A11y.native` |
| `Activation` | Enter, Space or a press activates it | `Selection`, `Press`; `A11y.native` for a `<button>` or `<input>` |
| `State(attr)` | the attribute is written with a value on every draw | `Selection` (`aria-selected`), `Behaviors.ToggleState` (`aria-checked`, `aria-pressed`), `Behaviors.Disclosure` |
| `Name` | the element has an accessible name | `Behaviors.FieldAssociation`; the view's own `aria-label` |

They are metadata tokens like `Event` and `Attr`, compared by name. The set
is closed and small on purpose: an obligation is added when a pattern needs
to demand it and a primitive can supply it, the rule `docs/ui-architecture.md`
gives for capabilities. No role catalog is added; roles stay in
`Patterns.catalog`.

**Who supplies one.** Four sources, each recorded with its name:

```ts
Behavior.slot({ requires, provides: [A11y.Navigation], attributes })   // an attached Behavior
A11y.base({ listbox: [A11y.Name] })                // the view's own attributes: the author's word
A11y.native({ checkbox: [A11y.Activation, A11y.FocusStrategy] }, { element: 'input' })
A11y.delegated({ option: [A11y.Navigation] }, { to: 'listbox', provider: 'ListNavigation' })
```

The last three are Mixins that contribute nothing but `meta`. A delegation
whose provider is not attached, or does not supply that obligation on the
slot it names, is `a11y:delegation-unmet`.

**The check (D17).**

```ts
export const Results = Search.define(…).pipe(
  Behavior.attach(Keys), Behavior.attach(Picks),
  A11y.conform(Patterns.Listbox),
)
```

- At run time `A11y.conform` runs `A11y.check(pattern, view)` once, where the
  module loads, and throws a `DiagnosticError` for the first
  `a11y:unsatisfied-obligation` (`{ slot, obligation }`), listing all of them
  in `details`. It records the pattern on the view, so `SlotView.describe`
  reports it and `detach`/`replace` run the check again and refuse a view that
  no longer conforms.
- At the type level a `NamedBehavior` carries what it provides as a union of
  `` `${slot}/${obligation}` `` literals, and a SlotView accumulates the union
  through `attach` in a fourth type parameter that defaults to `never`.
  `conform` takes a view whose union covers the pattern's, and otherwise its
  parameter is `Invalid<'lacks option/focus-strategy'>` (probe T3). A factory
  reads its slot names from its options as literals (`const O`), on the
  binder overload only: `{ item: 'option' }` provides
  `'option/focus-strategy'`. A Behavior made through the old
  `(slots)<Input, Message>` call provides nothing at the type level and is
  checked at run time, where `meta.provides` holds the same names.
- `A11y.validate` stays as it is: the structural check of a bare contract.

**Type cost.** The fourth parameter touches every `SlotView` mention. U-WP4
measures `tsc --extendedDiagnostics` over `packages/mixins-ui` before and
after. Over 5% more check time, the type half is withdrawn for that measured
cost and the run-time check stands alone; the type tests then become run-time
tests.

**Incremental adoption.** A pattern with no `obligations` is checked as
today. A Behavior with no `provides` supplies nothing and breaks nothing
until a view calls `conform`.

### Three words (D18)

| Word | Established by | Says |
| --- | --- | --- |
| **Declared** | `Slots.define`, `provides` | the author says so |
| **Structural** | `A11y.validate`, `A11y.check`, `A11y.conform` | the declarations fit together |
| **Rendered** | a `Conformance` scenario, in Chromium | this behaviour happened on this page |

`Conformance` (`foldkit-mixins/testing`) is a set of scenarios over a mounted
widget, each a function of a small harness (`{ root, press, frames }`) that
returns its findings:

- `Conformance.listbox`: roles and names from Chromium's accessibility tree
  (`Accessibility.getFullAXTree`, the "Vitest names a button its own way"
  trap); arrows, Home and End move the stop or `aria-activedescendant`;
  mirrored arrows under `dir="rtl"`; a disabled option is skipped and not
  activated; Enter and Space activate; `aria-selected` has a value on every
  option after every step.
- `Conformance.checkbox`: role, name, Space toggles, `aria-checked` or the
  native `checked` follows, a disabled one does not toggle.
- `Conformance.tree`, `.dialog` (focus in, containment, Escape, restore, a
  nested layer), `.tabs`: #558's first item.
- Each has a server half: the widget rendered to a string, parsed back, and
  the roles, names and state attributes read from the parse.

A scenario's result is plain data. When the laws note's `Evidence` exists
(541 WP11, in `foldkit-metadata`), a `Rendered` record is issued by the
scenario runner; the `Evidence` type is that package's, so this note adds no
record type of its own.

## 8. Inspection (#556): D19, D4

### What exists

`Slots.describe`; `SurfaceView.inspect` (slots and attachment names,
`surfaceView.ts:62-68`); `SurfaceView.describe` (adds what the Surface
observes and emits); `Surface.inspect`; `Patterns.catalog`; `Module`.

### The gap

Names only: no kind, no requirement, no supply, no pattern, no link from a
slot to a field or an action, and a conflict that names tags.

### Two functions

```ts
SlotView.describe(view): ViewDescription        // static; never calls a contribution
SlotView.resolution(view, input): Resolution    // one input; calls contributions with the inert builder
```

```ts
interface ViewDescription {
  readonly name: string
  readonly slots: ReturnType<typeof Slots.describe>['slots']
  readonly attachments: ReadonlyArray<{
    readonly order: number
    readonly name: string
    readonly kind: 'style' | 'behavior' | 'mixin'
    readonly slots: Readonly<Record<string, {
      readonly requires: { readonly capability: string | null; readonly events: ReadonlyArray<string>; readonly attributes: ReadonlyArray<string> }
      readonly provides: ReadonlyArray<string>
      /** `unknown`: a function of the input, not called here. */
      readonly contributes: { readonly classes: ReadonlyArray<string>; readonly mounts: ReadonlyArray<string> } | 'unknown'
    }>>
  }>
  readonly pattern: null | {
    readonly obligations: ReadonlyArray<{
      readonly slot: string
      readonly obligation: string
      readonly suppliedBy: ReadonlyArray<{ readonly source: 'behavior' | 'base' | 'native' | 'delegated'; readonly name: string }>
    }>
  }
  /** Links a part binding declared (§9). A slot with none is not listed: unknown, not "none". */
  readonly links: ReadonlyArray<{ readonly slot: string; readonly part: string; readonly capability: string | null; readonly field: string | null }>
  readonly findings: ReadonlyArray<Diagnostic>
}
```

`null` here is JSON's: the value is a serialized document, the boundary that
speaks it.

- **Identity** is the attachment's name. `order` is reported and is not an
  identity. An unnamed attachment, or two with one name, is a
  `mixins:unnamed-attachment` or `mixins:ambiguous-attachment` finding of
  severity `warning`.
- **`resolution`** evaluates every contribution for `input` and reports, per
  slot: class tokens, style property names, attribute names, event names and
  Mount names, each with the attachment that owns it. It reports **no
  attribute value, no style value and no Mount args**: any of them may be the
  input's (a password in `Value`). It builds handlers with the inert builder
  and never calls one, runs no Mount, and returns conflicts as findings where
  `resolve` would throw.
- **Conflicts (D4).** `resolve` takes each contribution's source name
  (`buildersOver` has `mixin.name` in hand, `slotView.ts:108-121`), and every
  ownership diagnostic gains `details.contributors: [owner, claimant]`.
  `DevOverlay` already lists diagnostics, so it shows them unchanged.
- **Purity.** Neither function reads the DOM. A description holds strings,
  numbers, booleans and `null`: `JSON.parse(JSON.stringify(d))` equals `d`,
  which is a test.

`SurfaceView.describe` is rebuilt on `SlotView.describe` and gains
`attachments`, `pattern` and `links`; its `mixins: string[]` stays. Its
`inspect` only forwards after that and is deprecated for a release.
`SlotView.toMarkdown(description)` renders one; `SurfaceView.toMarkdown`
calls it for the slot half.

**The two consumers.** The search field's page in `examples/authoring` prints
`toMarkdown(describe(SearchField))` into its README by a test that fails on
drift, and the conflict fixture (two `keydown` owners) asserts the same
description's attachment names appear in the diagnostic's `contributors`.

**No second graph.** A description is a function of one view value. When
`Module.graph` exists (541 WP14), a Surface's node joins a description by the
Surface's name and each link by its capability's name; nothing is registered
anywhere now.

## 9. Parts for agents (#557): D20, D21

### What exists

`Agent.expose` and `Agent.action` (a capability is a Message), `available`,
`authorize`, completion contracts, `messages.available`, `Agent.toManifest`,
`AgentWebMcp.formTool` (a form's attributes from a capability,
`forms.ts:43-89`), `Data.can` (a hint that a write would be refused). Nothing
says which control on the screen a capability is.

### Parts

```ts
// foldkit-agent
const Parts = TodoAgent.parts(AppAgent, {
  search: Agent.part({ label: 'Search todos', role: 'searchbox', field: App.model.query, sets: Message.ChangedQuery }),
  save: Agent.part({ label: 'Save', role: 'button', invokes: Message.RequestedSave }),
  remove: Agent.part({
    role: 'button',
    invokes: Message.RequestedDeleteTodo,
    each: context => context.todos,
    key: todo => todo.id,
    label: todo => `Delete ${todo.title}`,
    input: todo => ({ id: todo.id }),
  }),
})
```

- `invokes` and `sets` take a constructor the definition **exposes**; another
  is a type error, and `parts` checks again when it runs. A part with neither
  is a read-only control.
- `field` is a reference inside the definition's `context` projection; one
  outside it throws when `parts` runs. `each` and `label` are given the
  projected context, never the Model, so a part cannot describe what the
  agent may not see.
- `Agent.bind({ definition, host, parts })` adds `runtime.parts`:

```ts
runtime.parts.list(invocation?)   // Effect<ReadonlyArray<PartDescriptor>>
runtime.parts.find({ label })     // Effect<Found>: One | Ambiguous | None
// PartDescriptor: { id, occurrence: Option<string>, label, role,
//   capability: Option<{ name, input: Option<unknown>, requiresAuthorization }>,
//   value: Option<unknown> }
```

**Rules.**

- **A part gives no authority.** It names a capability; calling it is
  `runtime.messages.dispatch(name, input)`, through resolve, `available`,
  decode, `authorize`, dispatch and completion, unchanged. No name is derived
  from a method, a label or an element.
- **Filtering.** `list` reads one Model snapshot. A part whose capability is
  not in `messages.available` for that snapshot is left out, as the tool list
  leaves the capability out. `value` is read through the context projection.
  `requiresAuthorization` is the static flag `Agent.messages` reports;
  `authorize` needs an input and runs at dispatch.
- **Identity (D21).** `id` is the declaration's key, stable across renders,
  routes and remounts. `occurrence` is `key(item)` for a part with `each`.
  `find({ label })` answers `Ambiguous` with every match when more than one
  has that label, and a caller disambiguates by `id` and `occurrence`.
- **Mounted or not.** A part is listed whether or not a page draws it: the
  capability works either way. In a page, `Parts.attributes(h, 'save', key?)`
  writes `data-fk-part` (and `data-fk-part-key`) on the control, as
  `formTool`'s `field` writes its attributes, so an in-page adapter or a test
  can find the element. It is optional and nothing reads it for authority.
- **Manifest.** `Agent.toManifest` gains `parts` (id, label when static, role,
  capability name, whether repeated). It is the JSON the capability catalog of
  #190 Phase 4 will read; that phase waits on foldkit/foldkit#1655, and this
  adds no catalog.
- **Adapters.** `foldkit-agent-mcp` serves `app://parts` as a resource.
  WebMCP registers nothing new: its tools are the capabilities.

### The Save fixture

`examples/authoring`'s editor saves through a declared write. One module of
assertions, `outcomes`, takes a driver `{ save(), state() }` and checks
requested, accepted, pending, succeeded and failed from the state the
application already holds (Remote's mutation state and the Model's field), a
refusal, a failure, and two overlapping saves. Three drivers run it: a
person's click in a browser test, the agent in the same browser test
(`Agent.host`), and the agent headless (`Agent.headless`). The capability
completes on the fact, correlated by `invocation.id`, so the agent's call
resolves on the applied answer and not on the dispatch. The server stays
authoritative: the fixture's refusal comes from the writer, and the client's
`Data.can` only hints.

## 10. The audit (#558): D22

| Item | Where it lands |
| --- | --- |
| 1. Rendered conformance scenarios | U-WP7 (`Conformance`: listbox, tree, dialog, tabs; RTL, disabled, names, nested overlays, server markup) |
| 2. Focus recovery | Audited by the probes of §2 (B2a to B2d, P2 are the reproducible gaps); built by U-WP5; deferred focus decided in D12 |
| 3. Reorder, tree moves, transfers, announcements, edge scrolling | U-WP11 records; U-WP12 builds the keyboard path, the one gap the source itself states (`pointer-drag.ts`'s header: a drop's meaning is the parent's, and no key path exists) |
| 4. Overlay nesting, dismissal, restoration, removed triggers, portaled themes | U-WP11 records as `Conformance.dialog` cases and failing tests; D8 fixes the one found here |
| 5. Virtual lists, bottom-following, spatial navigation, ranges, canvas | U-WP11 records |
| 6. Task-oriented discovery | U-WP10 (the guide and the skill references), and `describe` and `Conformance` results as their data |

**U-WP11's contract.** For each of items 3 to 5 it writes browser scenarios
against the shipped widgets and primitives. A scenario that passes is kept as
a test. One that fails is kept as `it.fails` with the observed value, and
drafted as an issue in the report (the session does not post). It writes
`docs/design/558-audit-FINDINGS.md`: per behaviour, what was run, what was
seen, and whether a primitive is missing, wrong or present. It proposes no
primitive from a name in UI SDK's index. A gap it finds is then built: the
note sizes the package, and the reason not to is one of the four.

**`Reorder` (U-WP12).** A Bundle in `foldkit-primitives/interaction`: Model
`{ held: Option<id>, over: Option<place> }`; Messages for pick up (Space or
Enter on a handle), move (arrows), drop (Space or Enter), cancel (Escape, or
focus leaving); an out-fact `Moved { id, to }` the parent applies or refuses
in `update`; its keys as a `Keys` route; announcements through
`LiveAnnounce`'s `announce` helper; the pointer path the existing
`PointerDrag` facts, mapped to the same Messages, so one draft has one owner.
Tree moves and cross-list transfer are the same Bundle with a `place` that
names a parent or a list; whether `place` needs more is U-WP11's finding, so
U-WP12 starts after it.

## 11. Not built, and the reason for each

| Item | Reason |
| --- | --- |
| A per-widget store, or a controller object | Design: a second owner beside the Model |
| A widget value beside the SlotView (D2) | Design: two ways to hold one assembly |
| Generic event chaining; a resolver that merges two owners | Design: last-writer-wins by another name; the issue excludes it |
| A `Keys` observer (D6) | Design: a Subscription already observes, and cannot cancel |
| A route that handles a key without preventing it; `repeat` in a route | Upstream: Foldkit's handler signature (Appendix A) |
| Focus kept across a keyed reorder without `same` | Upstream: the renderer could move with `moveBefore` (Appendix A). `same` covers it here |
| Deferred focus held by a Mount (D12) | Design: unsound across renders |
| A `transitionend` completion for Presence | Design: a second completion owner; the issue excludes it |
| A keyed Presence bundle (D15) | Design: `Bundle.each` is it |
| A role catalog; a static proof that a handler navigates | Design: the issue excludes both; `Conformance` is the evidence |
| An `Evidence` record for a rendered scenario | Ownership: `foldkit-metadata`'s `Evidence` is 541 WP11's |
| A capability catalog, graph nodes for parts | Upstream: #190 Phases 3 and 4 wait on foldkit/foldkit#1655 |
| DOM discovery of parts by label | Design: a label is not an identity, and a headless host has no DOM |
| Primitives for lasso, spatial navigation, canvas | Not decided here: U-WP11 records first, and what it finds missing is built |

## 12. Work packages

Rules for every package, from AGENTS.md, to be copied into each brief:

- The worktree and index are shared. Stage and commit in one command with
  explicit paths (`git add <new files> && git commit -m … -- <paths>`), diff
  your paths in that command; never `add -A`, stash, reset, rebase, amend,
  force or `pnpm format`. Format your own files with `pnpm exec oxfmt <paths>`.
  Push and report; do not wait for CI.
- Touch only the files the package owns. `CHANGELOG.md`, the skill references
  and `packages/plus` (generated exports) are shared: build them through the
  temporary-index recipe.
- Tests run from the repository root: `npx vitest run <path> --project unit`,
  and `--project browser --fsModuleCache=false` with
  `PLAYWRIGHT_BROWSERS_PATH` at a Chromium of build 1248. Then
  `pnpm typecheck:force`, `pnpm format:check`, `pnpm paths:check`,
  `pnpm tags:check`, `pnpm mutate:check`.
- A claim about focus, keys reaching an element, or layout is a browser test.
  A claim about server markup renders to a string and parses it back.
- Every test must be able to fail: `test/<area>.mutations.ts`, run with
  `pnpm mutate <spec>`.
- A change to a package's exports runs `npx jev-pref review --hunks --include
  <file>` with the README and the skill reference included, one `--include`
  per file; exit code 2 is "not reviewed", said in the report. Then
  `pnpm --filter foldkit-plus generate` and `pnpm paths`.
- Every public change adds its line under Unreleased in `CHANGELOG.md`.

```text
U-WP1 (mixins: attachments, contributors, #531, over)
 ├── U-WP1b (every factory takes the binder)
 ├── U-WP2 (describe) ──────────────────────────────┐
 ├── U-WP3 (Keys) ── U-WP3b (primitives' routes, D8; after U-WP1b) ┤
 ├── U-WP4 (obligations) ── U-WP7 (Conformance) ─────┤
 └── U-WP5 (FocusRecovery) ── U-WP6 (Presence) ──────┼── U-WP9 (examples) ── U-WP10 (docs)
U-WP8 (Agent parts)  ────────────────────────────────┘
U-WP11 (audit) ── U-WP12 (Reorder; after U-WP3b too)
```

First, in parallel: U-WP1, U-WP8, U-WP11.

### U-WP1. Attachments a view remembers; contributors in conflicts; #531; `SlotView.over`

- **Issues:** #556 (part), #551 (the binder), #554 (the diagnostic), #531.
- **Model:** default (a published API's shape, across three packages' contracts).
- **Owns:** `packages/mixins/src/{mixin,behavior,slotView,resolver,diagnostics}.ts`,
  `packages/mixins/src/style.ts` (the `meta` it sets, nothing else),
  `packages/mixins-surface/src/surfaceView.ts` (`over` only),
  `packages/mixins/test/{attachments,over}.test.ts`, `over.test-d.ts`,
  `attachments.mutations.ts`, `packages/mixins/test/childMount.browser.test.ts`.
- **Build:** `MixinMeta` (§3) with `provides` plumbed and empty; `detach`,
  `replace`; `over` and `SurfaceView.over`; `resolve` given each
  contribution's source, `details.contributors` on every ownership diagnostic
  and the names in the message; a `ChildAttribute`'s `OnMount` composed with
  the rest (#531), tested on a real runtime with two Mounts that both run.
- **Done when:** K1's text names both Behaviors; M2's output is one `OnMount`;
  the four rejections of §3 are `@ts-expect-error` cases and each goes unused
  when its constraint is widened; six attachments infer through `pipe` inline.
- **Mutations:** drop the source name; skip the child `OnMount`; `detach`
  removing every match; `replace` appending instead of keeping the place.

### U-WP1b. Every Behavior factory takes the binder

- **Issues:** #551.
- **Model:** Sonnet (one overload per factory, the design fixed by U-WP1).
- **After:** U-WP1.
- **Owns:** the `behavior` signatures in
  `packages/primitives/src/interaction/*.ts` and
  `packages/mixins/src/behaviors/*.ts`, a shared `bound` helper in
  `packages/primitives/src/internal.ts`, `packages/primitives/test/bound.test-d.ts`.
  It lands before U-WP3b, U-WP5 and U-WP12 open those files.
- **Done when:** each factory accepts `Bound` first and the slots as before;
  T1's cases hold for `ListNavigation`, `Selection`, `TreeNavigation`,
  `FocusScope` and `Behaviors.Disclosure` on the real types, inline and
  hoisted; `examples/tree` compiles unchanged, and compiles rewritten on the
  binder with no `Model` or `Message` named after it.
- **Mutations:** none of its own (types); each `@ts-expect-error` is shown to
  go unused when its constraint is widened.

### U-WP2. `SlotView.describe`, `SlotView.resolution`

- **Issues:** #556.
- **Model:** Sonnet.
- **After:** U-WP1.
- **Owns:** `packages/mixins/src/describe.ts` (new), its export line in
  `index.ts`, `packages/mixins-surface/src/surfaceView.ts` (`describe`,
  `inspect`, `toMarkdown`), `packages/mixins/test/describe.{test,mutations}.ts`.
- **Done when:** a description survives a JSON round trip; `resolution` of an
  input holding a secret string contains that string nowhere; a spy Mount and
  a spy handler are never called; removing a Behavior changes the description
  and leaves the first view's unchanged; a dynamic contribution reads
  `'unknown'`.
- **Mutations:** report a dynamic contribution as empty; include an attribute
  value; lose `order`.

### U-WP3. `Behaviors.Keys`

- **Issues:** #554.
- **Model:** default (a published API's shape).
- **After:** U-WP1.
- **Owns:** `packages/mixins/src/behaviors/keys.ts` (new) and its line in
  `behaviors/index.ts`, `packages/mixins/test/keys.{test,test-d,mutations}.ts`,
  `packages/mixins/test/keys.browser.test.ts`.
- **Build:** §5's `chord`, `printable`, `where`, `route`, `first`, `behavior`.
- **Done when (browser, real key presses):** Escape-to-clear and
  Alt+ArrowDown-to-open on one input send one Message each; a letter, Home,
  Backspace and a selection with Shift+ArrowLeft keep their native effect; a
  held ArrowDown runs its route per repeat; a protected `keydown` refuses the
  Behavior; two Escape routes throw naming both, and `Keys.first` accepts
  them. A composition test drives `Input.imeSetComposition` over CDP and sees
  no Message; if CDP cannot produce a composing `keydown`, the test says so
  and the policy stays cited from source.
- **Mutations:** ask every route (no first-wins); ignore a modifier; skip the
  overlap check; ask `where` routes first.

### U-WP3b. The primitives' routes, and Escape in a layer

- **Issues:** #554 (D5, D8).
- **Model:** Sonnet.
- **After:** U-WP3, U-WP1b.
- **Owns:** `packages/primitives/src/interaction/{list-navigation,roving-tabindex,tree-navigation,grid-navigation,typeahead,dismiss-layer}.ts`,
  `packages/mixins/src/behaviors/spin-value.ts`, their tests and mutation
  specs.
- **Done when:** each `behavior` is `Keys.behavior` over its exported `keys`
  and every existing test of it passes unchanged; a search input with
  `ListNavigation.keys` and `EscapeClears` in one router works in a browser;
  Escape in an input inside a `DismissLayer` layer clears and does not
  dismiss, and with nothing to clear dismisses.
- **Mutations:** the layer ignoring `defaultPrevented`; the layer back in the
  capture phase.

### U-WP4. Obligations

- **Issues:** #552.
- **Model:** default (a published API's shape; a type parameter on `SlotView`).
- **After:** U-WP1. `behavior.ts` and `slotView.ts` are U-WP1's first; this
  package edits them after it lands.
- **Owns:** `packages/mixins/src/a11y.ts`, the `provides` types in
  `behavior.ts` and the fourth parameter in `slotView.ts`,
  `packages/mixins-ui/src/patterns.ts` (`Listbox`, `Checkbox` only),
  `provides` on the six suppliers of §7 (one line each, after U-WP3b),
  `packages/mixins/test/a11y.*`.
- **Done when:** a listbox with no navigation and an option with no focus
  strategy each report slot and obligation, at the type level for a literal
  assembly and as a diagnostic for one built from a `Record<string, …>`;
  `ListNavigation` supplies both without the widget restating them; `detach`
  of it is refused; `A11y.native` and `A11y.delegated` each satisfy a case and
  an unmet delegation names its provider; the type-cost numbers are in the
  report.
- **Mutations:** treat any `provides` as covering; skip the re-check on
  `detach`; accept a delegation without its provider.

### U-WP5. `FocusRecovery`

- **Issues:** #553.
- **Model:** Sonnet.
- **After:** U-WP1 (#531), U-WP3b (`tree-navigation.ts`).
- **Owns:** `packages/primitives/src/dom/{focus-recovery,follow-tab-stop}.ts`,
  `packages/primitives/src/interaction/focus-recovery.ts`, the owner mark in
  `tree-navigation.ts`, their index lines,
  `packages/primitives/test/focus-recovery.{browser.test,mutations}.ts`,
  `follow-tab-stop.browser.test.ts`.
- **Done when (browser, pointer and keyboard activation each):** every row of
  §2's focus table that is a gap has a test that fails before and passes
  after (B2a, B2b, B2c, B2d, P2); a dialog opened by the removing action keeps
  focus; ids from B5 work; a disconnected fallback falls to the next step; a
  torn-down widget moves focus nowhere outside its chain; no scroll when the
  target is in view; after release, `getEventListeners`-free proof: a
  mutation and a `focusout` after teardown call nothing (spied).
- **Mutations:** act when focus moved elsewhere; let the outer owner decide;
  drop `preventScroll`; build a selector from the key; keep listening after
  release.

### U-WP6. Presence with interaction and recovery

- **Issues:** #555.
- **Model:** Sonnet.
- **After:** U-WP5.
- **Owns:** `packages/primitives/src/interaction/presence.ts` (new) and its
  index line, `packages/primitives/motion/README.md`,
  `packages/primitives/test/presence-behavior.{test,browser.test,mutations}.ts`.
- **Done when:** a hiding row takes no click, Tab or focus; focus leaves it in
  the frame it turns `inert` and the removal moves nothing (a focus spy counts
  one call); Hide then Show within the duration leaves the row, removes
  `inert`, and refocuses nothing; a `TestClock` test covers the generation and
  `Motion.reduced`; a dialog opened during the exit keeps focus; server markup
  round-trips; two lists on one page do not touch each other.
- **Mutations:** `aria-hidden` for `inert`; `inert` kept after Show; recovery
  on removal as well.

### U-WP7. `Conformance`

- **Issues:** #552 (rendered), #558 item 1.
- **Model:** Sonnet.
- **After:** U-WP4 (obligation names). The dialog scenario's nested-layer case
  after U-WP3b.
- **Owns:** `packages/mixins/src/conformance.ts` (new), its export in
  `testing.ts`, `packages/mixins-ui/test/conformance/*.browser.test.ts` and
  `*.ssr.test.ts`, `conformance.mutations.ts`.
- **Done when:** listbox, checkbox, tree, dialog and tabs each run against the
  shipped widget and against a hand-built view from primitives; each
  assertion is killed by a mutation of the widget (a role dropped, an arrow
  inverted under RTL, a disabled option activated).

### U-WP8. Agent parts

- **Issues:** #557.
- **Model:** default (authorization and principal filtering).
- **After:** none.
- **Owns:** `packages/agent/src/parts.ts` (new),
  `packages/agent/src/{agent,runtime,docs,types,forApplication,forModel}.ts`,
  `packages/agent-mcp/src` (the resource), `packages/agent/test/parts.*`.
- **Done when:** a part over an unexposed constructor is a type error and a
  run-time error; a field outside the context throws; a part of an unavailable
  capability is not listed; `value` never holds an unprojected field; two
  parts with one label answer `Ambiguous`; a repeated part's occurrences
  follow the context; listing sends no Message (`observe` sees none); the
  manifest diff shows parts.
- **Mutations:** list an unavailable part; read `value` from the Model; answer
  the first of two labels.

### U-WP9. `examples/authoring`

- **Issues:** #551, #557 (the Save fixture), #556 (the two consumers).
- **Model:** Sonnet.
- **After:** U-WP2, U-WP3b, U-WP6, U-WP8.
- **Owns:** `examples/authoring/**`, its `pnpm-lock.yaml` entry (alone: no
  other package here adds a dependency).
- **Done when:** §3's examples and §9's fixture pass in a browser and
  headless; the type-cost comparison is in its README; it passes the scaffold
  lint; its bundle has a budget (`#229`'s convention).

### U-WP10. The guide, the skill, the READMEs

- **Issues:** #551, #558 item 6, and every issue's documentation.
- **Model:** Sonnet.
- **After:** all but U-WP11 and U-WP12.
- **Owns:** `docs/ui-authoring.md` (new; using, customizing, assembling,
  authoring a primitive), `docs/ui-architecture.md`,
  `skills/foldkit-plus/references/{mixins,primitives,agent}.md` and
  `SKILL.md`'s rows, the package READMEs. Every snippet compiled in a
  temporary `*.test-d.ts` in `examples/kitchen-sink`.

### U-WP11. The audit of items 3 to 5

- **Issues:** #558.
- **Model:** Sonnet.
- **After:** none.
- **Owns:** `docs/design/558-audit-FINDINGS.md` (new),
  `packages/mixins-ui/test/audit/*.browser.test.ts`,
  `packages/primitives/test/audit-*.browser.test.ts`. No source file.

### U-WP12. `Reorder`

- **Issues:** #558 item 3.
- **Model:** default (a published API's shape).
- **After:** U-WP11, U-WP3b.
- **Owns:** `packages/primitives/src/interaction/reorder.ts` (new), its index
  line, its tests, a section of `examples/authoring` after U-WP9.

### File order

- `packages/mixins/src/behavior.ts`, `slotView.ts`: U-WP1, then U-WP4.
- `packages/mixins/src/index.ts`, `behaviors/index.ts`, `testing.ts`: one
  export line each from U-WP2, U-WP3, U-WP7; each through a temporary index.
- `packages/mixins-surface/src/surfaceView.ts`: U-WP1 (`over`), then U-WP2.
- `packages/primitives/src/interaction/*.ts` and
  `packages/mixins/src/behaviors/*.ts`: U-WP1b's signatures first.
  `tree-navigation.ts` then U-WP3b, then U-WP5. `index.ts`: one line each from U-WP5, U-WP6, U-WP12.
- `packages/mixins-ui/src/patterns.ts`: U-WP4 alone.
- `packages/agent/**`: U-WP8 alone. The laws note's WP9 (Agent `applies`)
  edits `expose.ts` and `runtime.ts`: whichever starts second rebases on the
  first, and U-WP8 adds no field to a variant.
- `examples/authoring`: U-WP9, then U-WP12's section.
- Nothing here touches `packages/remote`, `packages/entity`, `packages/sync`
  or `packages/guard`.

## 13. What needs the maintainer

1. **Upstream reports** (Appendix A), which a cloud session may not post.
2. **Two defects found here**, to file or to let the packages close:
   `FollowTabStop` takes a nested widget's stop (B2c; fixed by U-WP5), and
   `DismissLayer` dismisses on an Escape a descendant handled (D8; fixed by
   U-WP3b, a behaviour change).
3. **Deprecations** this plan starts: `ListNavigation`'s `commit` option
   (U-WP3b) and `SurfaceView.inspect` (U-WP2), each for one release.
4. **Jev.** U-WP1, U-WP3, U-WP4, U-WP8 and U-WP12 change published exports.
   Without `TYPESAFE_API_KEY` they report "not reviewed".
5. **A type parameter on `SlotView`** (D17). It is the largest type change
   here and has a measured way out; the numbers come with U-WP4's report.

## Appendix A. Upstream reports (drafts; not posted)

### A1. Foldkit: tell a key handler `repeat`, and let it handle without preventing

> `OnKeyDown`, `OnKeyDownPreventDefault` and `OnKeyDownFocus` call their
> function with `(key, modifiers)`. Two things a handler cannot do follow.
>
> 1. It cannot tell a held key from a press: `event.repeat` is not passed. A
>    route for Enter that must act once has to be guarded in `update`, where
>    the fact that the key repeated is already lost.
> 2. `OnKeyDown` must return a Message for every key, and
>    `OnKeyDownPreventDefault` prevents the default whenever it returns one.
>    There is no way to send a Message for one key and leave its default
>    alone, while declining the rest.
>
> Proposal: pass a third argument `{ repeat: boolean }` to the three
> handlers, and add a variant whose function answers
> `Option<{ message, preventDefault: boolean }>`. Both are additive.
>
> Context: a keyboard router in `foldkit-mixins` composes named routes into
> one handler per element. With neither it documents "a held key runs its
> route on every repeat" and "a handled key is always prevented".

### A2. Foldkit: move a keyed child with `moveBefore` where the browser has it

> When a keyed reorder moves the element that has focus, `insertBefore`
> blurs it: in Chromium `document.activeElement` is `body` at once, with a
> `focusout` whose `relatedTarget` is null, and the element is connected
> again in the next microtask. `parent.moveBefore(node, ref)` keeps focus
> (and a running animation, and an iframe's document). Measured in the
> Chromium the test suite runs: after `insertBefore` of the focused row,
> `activeElement` is `body`; after `moveBefore`, it is the row.
>
> Proposal: in the keyed-children reorder, call `moveBefore` when
> `'moveBefore' in Element.prototype`, and `insertBefore` otherwise.

### A3. Foldkit: two Mounts on one element

> `OnMount` sets the vnode's `insert` hook, so a second `OnMount` on an
> element replaces the first with no report. `foldkit-mixins` composes the
> Mounts its Mixins contribute into one, but cannot reach one an upstream
> component's attribute bundle already holds (an anchor on a listbox's
> `items`), nor one inside a `ChildAttribute`. Either composing them in
> `OnMount` itself or failing loudly on the second would do. The Blocks
> branch's plan asks the same question ("Can two Mounts share an element?").

Nothing in these eight issues needs a report to `@foldkit/ui`: the overlay
and popup findings wait on U-WP11's record.
