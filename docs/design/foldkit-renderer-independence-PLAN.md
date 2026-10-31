# Foldkit programs independent of the renderer

**Status:** plan, 2026-10-30. R0 is built and R1 measured (§10); nothing else is. Tracks #376; related to
#148, #149 and #190. Every claim about Foldkit is checked against the
published `foldkit@0.170.0` (`node_modules/.pnpm/foldkit@0.170.0_*/node_modules/foldkit/dist`),
and every claim about Blocks against the canary `0.169.0-canary.90746b32d2ca`
that `examples/foldkit/domains` pins. Paths below are relative to `dist/`
unless they start with `packages/` or `examples/`. Every TypeScript signature
in §4 is a **proposal**: none of it exists in Foldkit or in this repository.

Background: [reactivity-DESIGN.md](./reactivity-DESIGN.md) (fine-grained
propagation inside today's renderer, three core primitives),
[platform-DESIGN.md](./platform-DESIGN.md) and
[../native-cross-platform.md](../native-cross-platform.md) (portable Style,
Behavior and native targets), [react-DESIGN.md](./react-DESIGN.md),
[solid-2-optimistic-COMPARISON.md](./solid-2-optimistic-COMPARISON.md), and
[contract-layer-PLAN.md](./contract-layer-PLAN.md) (Foldkit Plus after Blocks).

**How this relates to reactivity-DESIGN.md.** That design keeps snabbdom and
asks core for three primitives: observable Model transitions (its §25, here
Proposal B), a persistent render region (§26, here a renderer-owned
`Boundary`), and a managed renderer leaf (§27, which a fine-grained renderer
makes unnecessary). Its Phase 1, Projection-keyed lazy slots in package
views, is built and took page-builder events from about 50 ms to 17 ms. This
plan is the larger step that design defers: the renderer itself becomes a
Layer, so regions and leaves are features of a renderer rather than holes in
snabbdom's ownership.

## 1. Goal and non-goals

**Goal.** A Foldkit program (Model Schema, Message, `init`, `update`, `view`,
`subscriptions`, Commands, Mounts, Ports) runs on another renderer and
runtime host without changes to `init`, `update`, Commands or Subscriptions,
and with its views either unchanged or mechanically compiled. The renderers
in view:

| Renderer | What it is | How a view reaches it |
| --- | --- | --- |
| snabbdom (today) | vdom diff and patch | unchanged |
| fine-grained DOM (Solid 2.0 style) | DOM bound to Model paths, no diff | unchanged, with regions; or compiled |
| React | a host component tree | compiled (`foldkit-react-codegen` precedent) or interpreted |
| native (GPUI, #149) | a non-DOM widget tree | compiled through a semantic layer (#148) |
| string | server rendering | unchanged |
| Scene | a test renderer with no DOM | unchanged |

"Independent" means three things, in this order of value:

1. The **runtime's parts are services**: the renderer, the frame scheduler and
   the Model store are Effect `Context` services, provided by Layers, so a
   host picks them the way it picks an `HttpClient`.
2. **`Html` is a description, not a snabbdom `VNode`**: every renderer
   interprets the same value, and Key, lazy, submodel and Mount are defined
   by what they mean, not by snabbdom hooks.
3. **A conformance suite** says what "the same program" means: a scripted run
   gives the same Messages, the same Models and the same serialized output on
   every renderer.

**Non-goals.**

- **No change to the program model.** The Model stays an immutable value,
  `update` stays pure and returns `[Model, Commands]`, Messages stay facts.
  Sync replays durable Messages through `update`, SSR hands the Model to the
  client, devtools time-travels by re-rendering past Models, and `Law.check`
  compares two runs; all four need this.
- **No mutable store and no signals in application code.** A fine-grained
  renderer may use signals internally; the program never writes one.
- **HTML stays the vocabulary of web views.** Mapping `div` to a native stack
  is refused (#148 says so). A native renderer needs a semantic layer above
  `h` (`ui.Stack`, `ui.Text`); this plan supplies the seams that layer plugs
  into, not the layer.
- **No compiler of TypeScript to native code.** reffect (#149) is its own
  project; this plan ends at "a renderer can be provided".
- **No promise of speed for existing apps.** The snabbdom Layer stays the
  default and behaves as today.

## 2. What this would enable

1. **Fine-grained updates for large views.** Today every dirtying Message
   re-runs the whole view and diffs the result: `processMessagePlain` sets the
   Model and calls `scheduleRenderFrame`, and the frame runs
   `view(model, htmlBuilder)` from the root and `__patchVNode` over the whole
   tree (`runtime/runtime.js`, `runtime/renderer.js`). `createLazy` and
   `createKeyedLazy` skip subtrees, but they are easy to get wrong: a slot
   misses when its function or any argument is a new reference (AGENTS.md: "A
   lazy slot compares its function too"), a cached drawing is reused at one
   position only ("Foldkit's lazy slots throw outside a runtime render"), and
   a memo test needs a second change to fail ("A memo test needs a second
   change"). Path-level updates touch only the DOM that reads a changed path,
   and applications stop choosing lazy keys by hand. It would show first
   where the vdom does most work per Message: domains-plus's results list (556
   names, prices arriving as live reads, `examples/foldkit/domains-plus`) and
   the data grid over 100,000 rows (`examples/data-grid`), though the grid
   already virtualizes (`packages/data-grid/src/virtual.ts`), so its cost is
   the view over the Model, not the DOM it draws.
2. **One program, several renderers.** Native apps (desktop through GPUI,
   later iOS and Android; #148, #149) with the same Model, `update`, Commands,
   Remote and Sync and a different `h`. A Foldkit program inside a Solid or
   React app as a component of that renderer, rather than an island bridged
   by Ports, which is what `foldkit-react` does today (§3.4). SSR as one more
   Renderer Layer that writes strings, so streaming or partial hydration
   become features of a renderer instead of code in `foldkit-ssr`.
3. **Tests that cannot drift from the browser.** Scene becomes a renderer
   under the same contract, so a conformance suite catches where Scene and
   the browser disagree (AGENTS.md: "Scene does not model keys"; "A Mount
   that sends no Message must not be on by default", because Scene cannot
   resolve it), and each new renderer proves it behaves the same.
4. **Mounts without snabbdom's limits.** Three constraints exist only because
   a Mount is a snabbdom `insert`/`destroy` hook (`html/index.js`, the
   `OnMount` handler): one Mount per element (a second replaces the hooks;
   "An element holds one Mount"), args read once ("Mount args are captured at
   insert, never refreshed"; "A Mount reads its args once"), and no update
   hook, so a Model-driven DOM effect must be a Command. A Mount defined by
   meaning (§4.3) removes all three.
5. **Performance chosen per app.** The frame scheduler and the Model store as
   Layers: animation-frame or microtask batching; a whole-Model store or a
   reference-diff store. A deterministic scheduler for tests would replace the
   timing workarounds in browser tests (AGENTS.md: "A negative assertion
   needs a settle, not a sleep"; "`setTimeout(0)` does not wait for a forked
   fiber"; "A settle on animations passes before the animation starts").
6. **An exit from upstream timing.** With the seams upstream, this repository
   can ship and prove a renderer (the fine-grained one first) as a Layer,
   without forking Foldkit.

### What it would not do

- **It does not make existing apps faster by itself.** The snabbdom Layer
  stays the default. The speed needs the fine-grained renderer plus views
  that read lazily: by regions with declared dependencies, by accessors, or
  through a compiler (§4.6).
- **It does not change the program model.** Immutable Model, pure `update`,
  Messages and Commands stay; Sync replay, the SSR handoff, `Law.check` and
  devtools depend on them.
- **It costs upkeep.** A conformance suite every renderer passes, and every
  view feature (Mounts, Slots, Behaviors, Scene's queries) needs an
  equivalent per renderer.

**The decision rule.** The spike decides (Phase R2): a fine-grained renderer
measured on the data grid and domains-plus. If updates get much cheaper with
the program unchanged, the rest is worth doing. If not, native renderers
(#148, #149) are the remaining reason, and they need only the seams of
Phases U1 to U4, not a fine-grained store.

## 3. Inventory: where a program meets snabbdom and the runtime

### 3.1 The view's value and its builder

| Coupling | Where | What it means for another renderer |
| --- | --- | --- |
| `export type Html = VNode \| null` | `html/index.d.ts:61` | The public result of every view is a snabbdom VNode. `Child = Html \| string`. |
| `Attribute<Message>` is a `Data.TaggedEnum` | `html/index.d.ts:174` | **Already a description**: `OnClick({ message })`, `Class({ value })`, `OnInput({ f })`. Another renderer can interpret it unchanged. |
| Elements apply attributes at once | `html/index.js` `buildVNodeData` (line 1176), `applyAttribute`, `attributeHandlers` (line 375) | `h.div(attrs, children)` turns attributes into snabbdom `VNodeData` (`on`, `props`, `attrs`, `class`, `style`, `hook`) when called, then calls snabbdom's `h`. The description is lost at element construction. |
| Handlers capture dispatch from a module frame | `html/runtimeSingleton.js` (`setRuntime`, `pushBoundary`, `requireDispatch`) | An event handler closes over the dispatcher on top of a process-wide frame stack when the element is built. Only the runtime, Scene and the server push frames (`__setRuntime` is not exported from `foldkit/html`'s public entry). **Code outside Foldkit cannot run a view with live handlers.** |
| One builder object for every frame | `html/index.js` `cachedHtmlBuilder`, `__htmlBuilder` (line 2265) | `h` is a singleton retyped per Message; lazy slots rely on its identity. `inertHtml` is the same object (AGENTS.md: "`inertHtml` is every view's `h`"). |
| `h.keyed`, `h.Key` | `html/index.js` `keyed` (line 1535), `Key` handler | Snabbdom `data.key`. |
| `createLazy`, `createKeyedLazy` | `html/lazy.js` | Cache the VNode by function, args (`===`), dispatcher and Mount owner; reuse relies on snabbdom's same-vnode short-circuit and on one position per cached vnode. Throw outside a runtime frame. |
| `h.submodel` | `html/submodel.js:177` | Pushes a boundary (slot id plus `toParentMessage`) onto the frame stack and evicts it with a snabbdom `postdestroy` hook on the child vnode. View inputs with nested functions throw (AGENTS.md: "A view input may hold no nested function"). |
| `OnMount` | `html/index.js:957` | Writes `data.hook.insert`, `postpatch`, `destroy` and a `foldkitMount` marker that Scene reads. A second `OnMount` replaces the first's `insert`. `postpatch` only hands a replay-owned Mount to the live runtime; it never reads new args. |
| `MountAction.f(element: Element, …)` | `mount/index.d.ts` | The Mount receives a DOM `Element`. |
| `OnUnmount` | `onUnmountModule.js` | A snabbdom module hook. |
| Controlled props, IDL checks, content ownership | `html/index.js` `assertElementStateIsRepresentable`, `markUnreflectedHtmlPropertiesClientOnly`, `attachControlledContentOwnershipHook` | DOM rules (a `select`'s `value`, client-only properties) enforced at element build. A renderer of its own must enforce or re-derive them. |
| `customElement` | `customElement/index.d.ts` | A spec of Schema properties and events: data. Builds through the same `createElement`. |
| `Canvas.view` | `canvas/view.js` | Shapes are data; painting is snabbdom `insert`/`postpatch` on a `canvas` built with snabbdom's `h` directly. |
| `Document` | `html/index.d.ts:125` | `{ title, lang, dir, canonical, ogUrl, body: Html }`: data, applied by `runtime/documentMetadata.js` to `document.head`. |

### 3.2 The runtime loop

`makeApplication`/`makeElement` build a program; `run`, `embed` and
`hydrate` start it (`runtime/start.js`). The whole runtime is one
`Effect.scoped` generator in `runtime/runtime.js` (`makeRuntime` →
`startWith`). End to end:

| Step | Where | Renderer-bound? |
| --- | --- | --- |
| Effect's fiber scheduler: microtasks | `runtime/browserScheduler.js`, provided as a `Layer.succeed(Scheduler.Scheduler, …)` in `start.js` | No: already a service, though internal. |
| Ports bound to a host connector | `runtime/hostConnector.js` | No. |
| `resources`, `managedResources` | `runtime/resourceProvider.js` | No. |
| Hydration handoff: stamp, build id, Flags | `runtime/hydrationHandoff.js` | Reads the DOM root; the build-id check itself is renderer-independent. |
| `init` or a preserved Model (HMR) | `runtime.js`, `modelPreservationBridge.js` | No (HMR is Vite's). |
| Message queue, boot barrier, drain budget | `runtime/messageQueue.js` | No, but Messages dispatched during a patch are buffered by `status.isRenderingFrame`. |
| `processMessagePlain`: `update`, freeze, publish | `runtime.js` | The Model is closure state (`liveModel`); a change is `currentModel !== nextModel`, published on a `PubSub` and followed by `scheduleRenderFrame()`. |
| Commands | `runtime.js` `forkCommand` | No: forked a microtask later into the runtime scope with `resources`. |
| Subscriptions | `runtime/subscriptionFibers.js` | No: one fiber per entry, `modelToDependencies` on each published Model, `Stream.changesWith(equivalence)`, `Stream.switchMap`. Starts after the first render. |
| Render frame | `runtime/renderer.js` `scheduleRenderFrame`, `renderFramePlain` | **Yes**: `requestAnimationFrame` directly; at most one frame pending; the frame renders the latest Model. |
| View and patch | `renderer.js` `renderSync` | **Yes**: `view(model, h)` under the frame, then `__patchVNode` (or `__hydrateVNode` on the first hydrating render), then `applyDocumentMetadata`. |
| Commit signal | `render/commit.js` (`RenderCommit`, internal) and `render/render.js` (`afterCommit`, `afterPaint`) | Already a `Context` service; falls back to `requestAnimationFrame` outside a runtime. The `Dom` helpers wait on it. |
| Mount events, view state | `renderer.js` `attachRenderedMounts`, `mount/index.js` (`MountTracker`, `MountRuntime`, internal services) | Mounts acquire on `insert`. |
| View Transitions | `runtime/viewTransition.js`, `renderer.js` `startFrameViewTransition` | `document.startViewTransition` around the patch. |
| Crash view | `runtime/crashUI.js` `renderCrashView` | `__patchVNode` of a crash VNode. |
| Devtools replay | `renderer.js` `devToolsRenderBridge.renderReplay` | Re-renders a past Model with `noOpDispatch`. |
| Navigation | `runtime/browserListeners.js` | `popstate`, link clicks, `foldkit:urlchange` on `window`; a Command's URL write comes back as `UrlChanged` (AGENTS.md: "A URL a Command writes comes back as a `UrlChanged`"). |
| Teardown | `renderer.js` finalizer | Patches to an empty tree (snabbdom `destroy` hooks release Mounts) and restores the container. Embed replaces its container with the rendering (AGENTS.md: "`embed` replaces its container"). |

Foldkit already runs its internals as `Context` services: `Dispatch` (public,
`runtime/dispatch.d.ts`), `RenderCommit`, `DialogRuntime`, `MountTracker`,
`MountRuntime` and Effect's `Scheduler`. The seams in §4 extend a pattern the
runtime uses, rather than introducing one.

### 3.3 Server rendering, hydration, Scene

| Coupling | Where | Note |
| --- | --- | --- |
| `renderToString` runs the view under a no-op frame | `experimental/server/server.js` `runView` (line 767) | Same frame push as the runtime; a synchronous bracket. |
| Serializer reads snabbdom `VNodeData` | `experimental/server/serialize.js` | `attrs`, `props`, `class`, `style`, `dataset`, client-only props skipped (AGENTS.md: "Check whether a Foldkit builder reaches server markup"). |
| Parse check | `server.js` `assertStructureMatches`, `assertParsedRootMatchesView` | parse5 re-parses the output and refuses a view whose parse differs from its vnode (AGENTS.md: "Server markup has to be what a parser builds from it"). |
| Hydration adopts DOM against a vnode | `hydrate.js` `__hydrateVNode` (line 848) | Build id compared first (`data-foldkit-build`), then tag, namespace, key and identity per element; insert hooks fired in render order. |
| Scene renders into a VNode and walks it | `test/scene.js` `renderView` (line 159), `maybeCaptureFromElement` | Calls `data.on[eventName]` with a fake event; queries match `sel`, `data.attrs`, `data.props` (`test/query.js`); Mounts are found by the `foldkitMount` marker. Keys are not modelled. |
| Story | `test/story.js` | `update` and Commands only, no view: already renderer-free. |

### 3.4 This repository

No package under `packages/*/src` imports `snabbdom`, `foldkit/dist`, an
internal `__` export, or reads `.elm` or `.data.on`. The couplings are
narrower than that, and most are to `Html` being a VNode:

| Package | Coupling | Where |
| --- | --- | --- |
| `foldkit-mixins` | Resolves Slots by matching `Attribute._tag` (`Class`, `Style`, `OnMount`, `Key`, `On*`): works on the description, not on VNodes. Composes several Mounts into one `OnMount` whose `f` merges their streams, because an element holds one Mount. Builds `{ _tag: 'OnMount', action }` by hand because `inertHtml.OnMount` takes only `MountAction<never>`. | `packages/mixins/src/resolver.ts:162-322`, `packages/mixins/src/attribute.ts:33-39` |
| `foldkit-mixins/testing` | Walks the inert `Html`'s `.sel`, `.children`, `.text`, `.data.attrs`, `.data.props`, `.data.class`, `.data.style`; `Frames.track` wraps `requestAnimationFrame` because Foldkit draws on it. | `packages/mixins/src/testing.ts:20-218`, `:303-388` |
| `foldkit-composition` | `Renderer.fields` draws a view inert and reads `html.data?.attrs` and `html.children` to find editable fields. | `packages/composition/src/foldkit/index.ts:494-502` |
| `foldkit-ssr` | Renders and hydrates through Foldkit's own `renderToString` and `hydrate`. `Resume.builder` writes a slot attribute into the `data.attrs` of the VNode a child view returns. Spells `data-foldkit-build` (upstream proposal 1 of [upstream-foldkit-ssr.md](../upstream-foldkit-ssr.md)). | `packages/ssr/src/resumable.ts:511-538`, `packages/ssr/src/client.ts:56-62` |
| `foldkit-react` | Hosts a program in React through the public `Runtime.embed` into a `div` it owns, and React inside Foldkit through a custom element holding a React root. No VNodes. | `packages/react/src/useFoldkitElement.ts:53-62`, `packages/react/src/host.ts` |
| `foldkit-react-codegen` | Compiles views from the TypeScript syntax tree (no type checker) to `view(model, dispatch): ReactNode`, matching names imported from `foldkit/html`. Handles tags, `h.keyed`, `h.empty`, `h.submodel` (dispatch lifted), lazy slots (memoization dropped), custom elements, and the common attributes and events. Refuses with located codes `FKREACT0001`-`0007`: a non-literal submodel config, `OnMount`, `OnUnmount`, `OnChange`, `InnerHTML` and any attribute outside its table, a computed attribute array, a builder stored or passed, a lazy slot used other than `const slot = createLazy()`, a custom element defined elsewhere. Messages are built when the event fires, not at render. | `packages/react-codegen/src/transform.ts:30-38`, `:324-344`; its README |
| `foldkit-surface` | No rendering coupling. Reads the Model through optics with string-array paths (`ModelRef.fromOptic`, `ModelRef.focus`, `Projection.pick` keyed by `dependency.join('.')`), which is what a path store needs. | `packages/surface/src/index.ts:96-123`, `:559-577` |
| `foldkit-sync` | Starts a replica's application with `makeApplication` and `embed`. | `packages/sync/src/mount.ts:591-606` |
| `foldkit-richtext-dom` | Owns a subtree inside a host element through an `OnMount`; snabbdom never patches inside it. The pattern a non-snabbdom renderer needs for any foreign subtree. | `packages/richtext-dom/src/host.ts` |
| Mount users | `OnMount`/`Mount.define` in mixins-ui (28 files), primitives (26), mixins-data-grid (6), richtext-dom (4); `Render.afterCommit` in six mixins-ui components. | grep over `packages/*/src` |

[react-DESIGN.md](./react-DESIGN.md) §22 chose the syntax tree over runtime
VNodes ("loses names, control flow and helpers"), and §24 made the compiler
strict: Mounts, imperative DOM and VNode manipulation are unsupported, and
nothing is dropped silently. [platform-DESIGN.md](./platform-DESIGN.md) found
the same five web-bound encodings in Mixins and picked codegen hosts over a
neutral element vocabulary. This plan agrees for native targets and adds
the runtime seams both assume.

### 3.5 Blocks, the canary

`examples/foldkit/domains` pins `foldkit@0.169.0-canary.90746b32d2ca`, the
Blocks preview (foldkit/foldkit#1655). **0.170.0 has no `block` module**; the
canary does (`dist/block/`). What it changes that matters here:

- **Effects implemented by Layers.** A Command, Mount, Subscription or
  ManagedResource is defined with a `handler` generator and gets a `layer`;
  omitting the handler declares a "host contract" whose implementation is
  supplied with `toLayer` (canary `command/index.d.ts` lines 75 to 86,
  `mount/handler.d.ts` `makeEffectHandler`, `makeStreamHandler`). domains
  provides fourteen Command Layers as one `EffectsLayer`
  (`examples/foldkit/domains/src/client/command.ts:254`). This is the
  pattern §4 asks for, applied to effects: what a program asks for is
  separate from how a host does it.
- **Mount requirements are typed in the builder.**
  `HtmlBuilder<Message, AllowedMountRequirements>` (canary
  `html/index.d.ts:6399`); a Block view whose Mounts are not registered fails
  to compile.
- **Two `OnMount`s on one element now throw** ("An element can have only one
  OnMount attribute … Combine both behaviors in one Mount", canary
  `html/index.js` near line 961) and a snabbdom module releases Mounts on
  `destroy` (`mountModule.js`). The constraint is loud now, not lifted.
- **`h.submodel` becomes `h.block`**, still VNode-based: `BlockView` returns
  `VNode | null` (canary `html/block.d.ts`). The Mount handler's input is
  still `{ element: Element; viewStateChanges }`.
- `NativeHtmlBuilder` in the canary means "the builder before boundary
  checks" for renderer fixtures, not a native platform.

So Blocks moves effects onto Layers and leaves rendering as it was. A host
contract Mount is half of §4.3: a GPUI host could provide its own handler
for the same Mount name, if the element it receives were the renderer's
type rather than a DOM `Element`.

## 4. The proposed seams

All signatures here are proposals.

### 4.1 `Html` as a description

Two shapes were considered.

**Tagless (each renderer implements `h`).** `HtmlBuilder<Message, Node>`
with every element constructor returning the renderer's node. Views already
receive `h` as a parameter, so most code would not change. It fails on
module-level markup: `inertHtml` builds static fragments at import time
(the crash view, `const PagefindBody = ih.DataAttribute(…)`, prose fragments,
noted in `html/index.js` beside `fallbackDispatch`), and those would be bound
to one renderer before any renderer is chosen.

**A description every renderer interprets (proposed).** Attributes are
already data. Make elements data too, and lower to snabbdom in the snabbdom
renderer instead of in `h.div`:

```ts
// Proposal: foldkit/html
declare const HtmlTypeId: unique symbol
/** Opaque. Renderers read it through `Html.match`; applications never do. */
export interface Html {
  readonly [HtmlTypeId]: HtmlTypeId
}

// Proposal: foldkit/html/internal, for renderers only
export type Node<Message> = Data.TaggedEnum<{
  Element: {
    readonly tag: TagName | string
    readonly namespace: Option.Option<'svg' | 'math'>
    readonly key: Option.Option<string>
    readonly attributes: ReadonlyArray<Attribute<Message> | ChildAttribute>
    readonly children: ReadonlyArray<Node<Message>>
  }
  Text: { readonly text: string }
  Empty: {}
  Lazy: {
    readonly key: Option.Option<string>
    readonly fn: (...args: ReadonlyArray<unknown>) => Html
    readonly args: ReadonlyArray<unknown>
  }
  Boundary: {
    readonly slotId: string
    readonly toParentMessage: (message: unknown) => unknown
    readonly render: (h: HtmlBuilder<unknown>) => Html
  }
  Foreign: { readonly kind: 'canvas' | 'custom'; readonly spec: unknown }
}>
```

What changes:

- **Handlers bind at render, not at build.** An `OnClick({ message })` stays a
  value until a renderer attaches it, and the renderer resolves dispatch
  from the boundary path it is drawing. That removes the module frame stack
  from element construction, removes `FrameChanged` misses from lazy slots
  (`html/lazy.js` `findMissReason`), and lets code outside Foldkit run a view.
- **`Boundary` holds the child's view as a function the renderer calls**, so a
  fine-grained renderer can re-run one boundary alone.
- **`Lazy` is a node**, not a cached VNode (§4.2).
- **The element checks move to one place** both the snabbdom lowering and the
  serializer read, so the DOM rules (`assertElementStateIsRepresentable`) stay
  written once.

Cost: one allocation per element more than today in the snabbdom renderer
(the description, then the VNode). Phase U1 makes `Html` opaque first, with
the VNode still underneath, so the cost question waits for a measurement.

### 4.2 Key, lazy and submodel by meaning

| Construct | Meaning every renderer keeps | snabbdom | fine-grained | string | Scene |
| --- | --- | --- | --- | --- | --- |
| Key | Siblings with the same key are the same thing across renders; its state (focus, Mounts, inputs) moves with it | `data.key` | keyed list reconcile (Solid's `For` by key) | ignored | **must** model: a keyed move keeps Mount status (today it does not) |
| Lazy | `fn(...args)` is a pure function of `args`; a renderer may reuse the last result when every arg is `===` | cached VNode | a memo over the args | may ignore | may ignore |
| Boundary | Messages from inside pass through `toParentMessage`; the boundary's identity is its slot path | frame push plus `postdestroy` eviction | a component scope | rendered inline | rendered inline, mappers recorded |

Lazy keeps its meaning but loses its position rule: a description can sit at
two positions because the renderer, not the cached value, owns the DOM it
became. The "one position per cached vnode" rule in `html/lazy.js` is a
snabbdom fact.

### 4.3 Mounts by meaning

A Mount is: "while this element is drawn, run this Effect or Stream with
these args, and send what it emits as Messages". Proposed:

```ts
// Proposal: foldkit/mount
export interface Mount<Name extends string, Args, Message, Handle> {
  readonly name: Name
  readonly args: Args
  /** Args as the Model moves them. A renderer emits the current args at
   *  acquire and again whenever a render gives the same element new args
   *  that are not equal under `argsEquivalence`. */
  readonly run: (
    input: Readonly<{
      element: Handle
      args: Stream.Stream<Args>
      viewStateChanges: Stream.Stream<ViewState>
    }>,
  ) => Stream.Stream<Message>
  readonly argsEquivalence: Equivalence.Equivalence<Args>
}
```

`Handle` is the renderer's element type: `Element` for the DOM renderers,
a widget handle for a native one. `argsEquivalence` comes from the args'
Schema (`Mount.define` already takes args as Schema fields), the way the
Subscription runtime derives `Schema.toEquivalence(dependenciesSchema)`
(`runtime/subscriptionFibers.js`).

- **Args that follow the Model.** `args` is a Stream: a Mount that wants the
  first value only takes `Stream.take(1)`, which is today's behaviour. The
  snabbdom renderer emits on `postpatch` (the hook exists and is unused for
  this, `html/index.js:985`). This removes the trap "Mount args are captured
  at insert, never refreshed", whose workaround was to drive a DOM effect from
  `update` as a Command.
- **Several Mounts per element.** The attribute list holds each; the renderer
  runs each as its own fiber under one acquire and one release. The mixins
  resolver already composes Mounts this way by hand.
- **The element's type comes from the renderer.** A web Mount needs a DOM
  `Element`; with Blocks' handler Layers (§3.5), a native host provides its
  own handler for the same name, receiving its own handle, or the program
  fails to build for that host because the requirement is unmet. That is
  #148's "Platform capability validation" as a type error.
- **Unresolved Mounts in Scene** stay a Scene rule; the conformance suite
  (§4.7) states it.

### 4.4 The runtime as services

Today's loop (§3.2) splits along the lines it already has. The proposal is
four services, not six: Commands and Subscriptions never touch the renderer,
so they stay inside the runtime.

```ts
// Proposal: foldkit/runtime
export class ModelStore extends Context.Service<
  ModelStore,
  {
    readonly get: () => unknown
    /** Called once per `update` whose Model is a new reference. */
    readonly replace: (next: unknown, message: unknown) => void
    readonly transitions: Stream.Stream<ModelTransition>
  }
>()('@foldkit/ModelStore') {}

export type ModelTransition = Readonly<{
  previous: unknown
  current: unknown
  message: Option.Option<unknown>
}>

export class FrameScheduler extends Context.Service<
  FrameScheduler,
  {
    /** At most one pending request; returns a cancel. */
    readonly request: (frame: () => void) => () => void
  }
>()('@foldkit/FrameScheduler') {}

export class Renderer extends Context.Service<
  Renderer,
  {
    readonly mount: (
      root: RenderRoot,
      initial: unknown,
      mode: 'Fresh' | 'Hydrate',
    ) => Effect.Effect<void, RenderError, Scope.Scope | Dispatch>
    readonly commit: (
      model: unknown,
      message: Option.Option<unknown>,
    ) => Effect.Effect<void, RenderError>
    readonly replay: (model: unknown) => Effect.Effect<void, RenderError>
    readonly crash: (context: CrashContext) => Effect.Effect<void>
  }
>()('@foldkit/Renderer') {}

export class Host extends Context.Service<
  Host,
  {
    readonly urlChanges: Stream.Stream<Url>
    readonly applyDocument: (document: DocumentMetadata) => void
    readonly startTransition: Option.Option<
      (update: () => void) => ViewTransitionHandle
    >
  }
>()('@foldkit/Host') {}
```

| Service | Default Layer (today's behaviour) | Other Layers |
| --- | --- | --- |
| `ModelStore` | `ModelStore.whole`: one value; `transitions` is today's `modelPubSub` | `ModelStore.paths`: reference-diff notification (§4.5) |
| `FrameScheduler` | `FrameScheduler.animationFrame` | `.microtask`; `.manual` for tests (`flush()`) |
| `Renderer` | `SnabbdomRenderer.layer` (today's `renderer.js`) | fine-grained, React host, string, Scene, GPUI |
| `Host` | `BrowserHost.layer` (`browserListeners.js`, `documentMetadata.js`, `viewTransition.js`) | `ServerHost`, `NativeHost`, `TestHost` |

The program becomes a value run against Layers:

```ts
// Proposal
const program = Runtime.program({ Model, init, update, view, subscriptions })

Runtime.run(program).pipe(
  Effect.provide(Layer.mergeAll(
    SnabbdomRenderer.layer({ container: '#app' }),
    FrameScheduler.animationFrame,
    ModelStore.whole,
    BrowserHost.layer,
  )),
)
```

`makeApplication`, `run`, `embed` and `hydrate` keep their signatures and
provide these four defaults, so nothing changes for an application that
does not opt in.

`afterCommit` and the `Dom` helpers keep reading `RenderCommit`; each
Renderer provides it. A renderer that commits synchronously (a fine-grained
one in a microtask) settles it at once.

### 4.5 Fine-grained renderers: reading paths lazily, notifying by reference

A fine-grained renderer needs two things the vdom does not: which Model
paths each piece of output read, and which paths changed.

**Which paths changed, with an immutable Model.** After each `update`, walk
the new Model against the old along the paths someone registered, and stop
at the first branch that is the same reference. Structural sharing makes
the walk proportional to what changed. It is demand-driven
([reactivity-DESIGN.md](./reactivity-DESIGN.md) §24): only registered paths
are compared, never "every structural difference". It needs nothing of the
program that Foldkit does not already require: a no-op must return the
Model it was given (AGENTS.md: "A no-op must return the Model it was
given"). An `update` that rebuilds an unchanged branch (`{ ...model }`)
costs a false change, never a missed one. `ModelStore.paths`:

```ts
// Proposal
interface PathStore extends ModelStoreService {
  readonly watch: (
    path: ReadonlyArray<PropertyKey>,
    listener: () => void,
  ) => () => void
}
```

`Sync` replay, the SSR handoff, devtools and `Law.check` are unaffected:
the Model is still one immutable value replaced once per Message.

**Which paths a view read.** Three options, cheapest first:

1. **Regions with declared dependencies** (no view change). A region is a
   `Boundary` or `Lazy` whose inputs are a Surface `Projection`
   (`packages/surface`: `ModelRef.focus` and Projections already declare the
   paths they read). The renderer re-runs a region only when one of its
   paths changed, and diffs inside it. This is
   [reactivity-DESIGN.md](./reactivity-DESIGN.md) Phase 2 and its "persistent
   render region" (§26), on a renderer that owns its regions. It keeps every
   view as written; the gain is bounded by region size.
2. **An accessor `h`** (views change). Attribute values and children may be
   functions of the Model (`h.Text(m => m.count)`), the view runs once, and
   each accessor becomes a computation that tracks the paths it reads. Fast,
   but every view is rewritten, and a Model read outside an accessor silently
   stops updating.
3. **A compiler** (views unchanged). Like `foldkit-react-codegen`, compile
   `model.a.b` reads in a view into accessors for Solid. Mechanical, and the
   compiler refuses what it cannot translate with a located diagnostic, as
   react-codegen does.

The plan takes 1 first (it works on unchanged views and needs only the
seams), measures it, and spikes 3 in this repository in parallel (Phase R2)
because react-codegen shows the shape.

### 4.6 Server rendering and hydration per renderer

- **Serialize** is the string Renderer: the description in, markup out. The
  parse check (`server.js` `assertStructureMatches`) stays, run against the
  description instead of the vnode, so "server markup is what a parser
  builds" holds for every renderer that shares the serializer.
- **Hydrate** is per renderer. Snabbdom adopts DOM against a vnode
  (`hydrate.js`); a fine-grained renderer claims nodes in document order and
  binds them; a React host calls `hydrateRoot`. The **build-id check moves
  out of the renderer** into the runtime's handoff, where it already runs
  first (`hydrationHandoff.js`), so every renderer refuses a stale page the
  same way (AGENTS.md: "`new URL` keeps Windows backslashes", the build-id
  mismatch that refused every page on Windows).
- **Streaming and partial hydration** become a renderer's features: a string
  renderer that flushes per boundary, and a hydrating renderer that adopts a
  boundary when its code arrives. Neither needs `foldkit-ssr` to own a
  renderer.

### 4.7 Scene as a renderer, and the conformance suite

Scene today renders the VNode and calls `data.on[eventName]` with a fake
event (`test/scene.js:200`). As a renderer it interprets the description:
a click on an element calls its `OnClick`'s message through the boundary's
mappers, and `OnInput({ f })` is called with the typed value. That is closer
to meaning than invoking a DOM handler with a synthetic event.

**The conformance suite** is a `Law.check` for views:

```ts
// Proposal: foldkit/test/conformance
export const conformance: <Model, Message>(
  program: Program<Model, Message>,
  script: ReadonlyArray<Step<Message>>,
  renderers: ReadonlyArray<Layer.Layer<Renderer | FrameScheduler | Host>>,
) => Effect.Effect<void, ConformanceFailure>
```

Every renderer, given the same program and script (interactions by role
and label, Mount resolutions, Subscription emissions), must produce:

1. the same sequence of Messages reaching `update`, hence the same Models;
2. the same serialized output after each step (by the string serializer
   over the renderer's own reading of its output: `innerHTML` for DOM
   renderers, the description for Scene);
3. the same Mount lifecycle per keyed element (started, args, ended),
   including across keyed moves, which Scene fails today.

The suite runs on this repository's examples first (Phase R0): Scene and the
jsdom runtime and `renderToString` already exist, so disagreements show
before any new renderer does.

## 5. Compatibility

**Today's apps keep working.** `makeApplication`, `makeElement`, `run`,
`embed` and `hydrate` keep their signatures and provide the snabbdom
renderer, `FrameScheduler.animationFrame`, `ModelStore.whole` and
`BrowserHost` themselves. A view that only calls `h` and returns its result
does not change.

**What breaks, in order of reach:**

| Change | Breaks | Migration |
| --- | --- | --- |
| `Html` opaque (U1) | Code that reads `.sel`, `.data`, `.children`, `.elm` of a view's result: Scene's internals (upstream); here `foldkit-mixins/testing`, `foldkit-composition`'s `Renderer.fields`, `foldkit-ssr`'s `Resume.builder` | Read through `Html.match` or a renderer-specific `toVNode` |
| Handlers bound at render (U4) | Nothing that only builds markup; code relying on `FrameChanged` misses | none |
| Mount args as a Stream (U5) | Mounts typed against today's `MountAction.f` signature | `Mount.define` keeps its signature; the Stream is new input beside it |
| Several Mounts per element (U5) | Code relying on the canary's throw | none |
| `Renderer` service (U6) | Packages calling Foldkit internals | §3.4's rows each name their replacement |

**This repository's packages.**

- `foldkit-mixins`' resolver keeps working: it reads and writes `Attribute`
  values, which stay. With U5 its Mount composition becomes a list of
  `OnMount` attributes and `mountAttribute`'s hand-built object goes away.
- `foldkit-mixins/testing` and `foldkit-composition`'s `Renderer.fields`
  read VNode data. Both want "the attributes and children of a drawn
  element", which `Html.match` over the description gives directly; until
  U7 they read through a snabbdom-specific `toVNode`.
- `foldkit-ssr`'s `Resume.builder` writes into a child view's VNode. With a
  description it adds a `DataAttribute` to the `Boundary` node instead,
  which every renderer then draws.
- `foldkit-react` keeps `embed`. A React renderer Layer would let it host a
  program as React components instead of an embedded container; that is
  optional and comes after U6.
- `foldkit-react-codegen` is unaffected, and its front end is the starting
  point for R2's Solid compiler.
- Mount users across mixins-ui and primitives keep `Mount.define`; the
  args Stream is additive.

## 6. Phases

Each phase ships alone, has a "done when" and a test, and says whether it
needs upstream. Value arrives early: R0 and R1 need nothing new from Foldkit.

### This repository alone

**R0. The conformance suite over what exists.** Write `conformance` against
today's three ways to draw a view: Scene, the jsdom runtime
(`Runtime.makeElement` plus `embed`, as `packages/bundle/test/runtime.test.ts`
does), and `renderToString`. Run it on three examples (todo, domains-plus's
filters, the data grid's header).
*Done when* it runs in CI and either passes or records each disagreement as
an issue. *Test:* a mutation that drops a key in one example's list makes the
suite fail on the Mount-lifecycle check, and the same mutation passes Scene
alone (proving the suite sees what Scene cannot).

**R1. Baseline.** Measure view time and patch time per Message with
Foldkit's own `slow` thresholds (`runtime/slowPhase.js` reports `View` and
`Patch` durations), on domains-plus (a live price arriving, a filter
change) and the data grid (a selection, a scroll by one page, an edit), in
headless Chromium, as `docs/benchmarks.md` does.
*Done when* the numbers are committed with the script that reproduces them.
*Test:* the script fails when a run reports no `View` phase.

**R2. The spike: a fine-grained renderer on the same program.** Two halves,
both in a scratch package, neither published:

- **A runtime of our own.** The loop of §3.2 over public shapes: `init`,
  `update`, Commands (`command.effect` with `resources`), Subscriptions
  (`modelToDependencies` and `dependenciesToStream` are public fields of an
  entry), Mounts (`MountAction.f` is callable), with `ModelStore.paths` and a
  microtask `FrameScheduler`. It cannot run a Foldkit view with live handlers
  (§3.1: the frame is internal), so the view comes from the second half.
- **A compiler to Solid**, built on `foldkit-react-codegen`'s front end
  (the syntax-tree reader and the `FKREACT` refusals,
  `packages/react-codegen/src/transform.ts`), emitting Solid components whose Model reads are accessors.
  Scope: domains-plus's results list and the data grid's body; everything
  else refused.

*Done when* both screens run on the spike with `init`, `update`, Commands and
Subscriptions imported unchanged, and R1's measurements are repeated on it.
*Test:* R0's suite passes for both screens on the spike renderer.
*Decision:* if a live price or a selection costs a fraction of R1's numbers,
continue to U1; if not, record why, keep R0, and pursue only what native
renderers need (U1 to U4).

**R3. Regions on today's renderer.** Independently of R2: the
Projection-keyed regions of reactivity-DESIGN Phase 1 for application
views (`Reactive.view`, not built; the package-view form is), so apps stop
writing lazy keys by hand even on snabbdom.
*Done when* domains-plus's list and the grid's rows use it with no
`createLazy` written in the example. *Test:* a mutation that drops a region's
dependency fails a test that changes that dependency twice (AGENTS.md: "A
memo test needs a second change").

### Needs Foldkit

**U1. `Html` opaque.** Type-only: the VNode stays underneath. *Done when*
Foldkit's own packages compile against it. *Test:* a `@ts-expect-error` on
reading `.sel` from a view's result.

**U2. Transitions observable.** Expose the runtime's `modelPubSub` as
`ModelStore.transitions` (reactivity-DESIGN §25). *Done when* a Layer can
subscribe and see `{ previous, current, message }` once per changed Model.
*Test:* two Messages in one frame give two transitions; a no-op gives none.

**U3. `FrameScheduler` as a service.** Replace the direct
`requestAnimationFrame` calls in `runtime/renderer.js` and
`render/render.js` with the service, default unchanged. *Done when* a test
runtime renders on `flush()`. *Test:* with `.manual`, no frame renders until
`flush()`, and `afterCommit` resumes after it.

**U4. Run a view with a dispatcher, from outside.** Export the frame as a
function (`View.render(view, model, dispatch) => Html`) or bind handlers at
render (§4.1). *Done when* this repository's spike renders Foldkit views
with live handlers without internal imports. *Test:* a click through the
spike reaches `update`.

**U5. Mounts by meaning.** Args as a Stream, several per element, the handle
type from the renderer; built on Blocks' handler Layers. *Done when* the
mixins resolver no longer composes Mounts by hand. *Test:* a Mount whose args
follow the Model sees the second value; two Mounts on one element both run.

**U6. The `Renderer` and `Host` services** (§4.4), with snabbdom as the
default Layer. *Done when* `makeApplication` is defined as "provide the four
defaults and run". *Test:* R0's suite, moved upstream, passes for the
snabbdom Layer and for Scene as a Layer.

**U7. Elements as a description** (§4.1), lowering in the snabbdom renderer.
Last, because it costs an allocation per element and needs U1's measurement.

## 7. Upstream proposals

Written to Foldkit in the form of [upstream-foldkit-ssr.md](../upstream-foldkit-ssr.md):
one ask per seam, the smallest change that unblocks it, the code here that
needs it, and the route (issue or pull request). Foldkit's `AGENTS.md`
refuses speculative complexity justified by hypothetical consumers, so each
ask names a consumer that exists. None is filed.

### Proposal A: an opaque `Html` (U1)

**Ask.** Declare `Html` as an opaque interface in `foldkit/html`, with the
VNode as its runtime value, and keep `VNode` out of the public types.

**Why Foldkit would want it.** Nothing public needs `VNode`: `foldkit/vdom`
and `foldkit/snabbdom` are not package exports. The alias leaks an
implementation detail every later rendering change would break.

**Why we need it.** It is the first step that makes every other seam
non-breaking, and it shows which code reads vnodes (§3.4).

**Route.** An issue first; it shapes the most-used type in the API.

### Proposal B: observable Model transitions (U2)

**Ask.** A runtime-scoped Stream of `{ previous, current, message }`, one per
`update` whose Model changed, with documented order relative to Commands and
the render frame.

**Why Foldkit would want it.** Devtools, profiling and analytics adapters
read the same thing (reactivity-DESIGN §25). The runtime already has it as
`modelPubSub` (`runtime/runtime.js`).

**Why we need it.** `ModelStore.paths` and R3's regions.

**Route.** An issue with the Blocks thread linked; the smallest version is
an option on `makeApplication`.

### Proposal C: the frame scheduler as a service (U3)

**Ask.** Read the render frame's scheduler from a `Context` service
defaulting to `requestAnimationFrame`, as `RenderCommit` and Effect's
`Scheduler` already are.

**Why Foldkit would want it.** Its own tests count frames; a manual scheduler
makes render timing deterministic, and a hidden tab never runs
`requestAnimationFrame` (AGENTS.md: "A hidden browser tab shows its first
frame for good").

**Why we need it.** The browser-test timing traps in §2 (item 5), and a microtask
scheduler for a fine-grained renderer.

**Route.** A pull request: two call sites, one service, default unchanged.

### Proposal D: render a view from outside the runtime (U4)

**Ask.** A public, documented way to run a view with a given dispatcher and
get its `Html`, the bracket `runView` already is in
`experimental/server/server.js:767` and `renderView` in `test/scene.js:159`.

**Why Foldkit would want it.** Its server and Scene each reimplement the
bracket; one exported function removes two copies.

**Why we need it.** Any renderer outside Foldkit, the spike first, and
`foldkit-react` (§3.4).

**Route.** An issue; the shape depends on whether handlers stay bound at
build.

### Proposal E: Mounts by meaning (U5)

**Ask.** On Blocks' Mount handlers: (1) a Stream of args beside the first
value, emitted when a render gives the same element new args; (2) several
Mounts per element instead of the canary's throw; (3) the element type a
parameter of the handler, defaulting to `Element`.

**Why Foldkit would want it.** (1) removes the documented pattern of
driving a DOM effect from `update` as a Command because args are not
refreshed; (2) removes "Combine both behaviors in one Mount", which makes
two independent libraries' Mounts conflict; (3) is what "host contract"
needs off the web.

**Why we need it.** The mixins resolver composes Mounts by hand (§3.4); the
OTP field, the block handle and the Measure Behavior hit (1) (AGENTS.md:
"Mount args are captured at insert", "A Mount reads its args once").

**Route.** A comment on foldkit/foldkit#1655, since Blocks is reshaping
Mounts now.

### Proposal F: the runtime as services (U6)

**Ask.** `Renderer`, `Host`, `FrameScheduler` and `ModelStore` as `Context`
services with today's behaviour as default Layers; `makeApplication`
provides them.

**Why Foldkit would want it.** Blocks already moved effects onto Layers; the
render side is the remaining part of the runtime that a host cannot replace.

**Why we need it.** A renderer Layer from this repository without a fork.

**Route.** An issue, after R2 shows numbers. It is the largest ask and the
one most likely to be declined; Proposals A to E are useful without it.

## 8. Risks and open questions

- **The spike may not pay.** Most views here are small; the vdom costs
  where a list redraws (R1 says how much). If regions on snabbdom (R3) take
  most of the gain, the fine-grained renderer is not worth its upkeep.
- **Two renderers drift.** Every view feature needs an equivalent per
  renderer: Mounts, Slots, Behaviors, controlled inputs, IME composition
  (`imeComposition.js`), focus restoration, dialogs (`dom/dialogRuntime.js`),
  drag zones (`html/dragZoneTracking.js`). The conformance suite catches
  output differences, not timing ones (AGENTS.md: "Keys faster than a frame
  meet the last frame's view").
- **DOM-specific Commands.** The `Dom` helpers (`dom/dom.js`: focus by
  selector, `scrollIntoView`, dialogs) are Commands that assume a document.
  Off the web they need host contracts (Blocks' `toLayer`); on a
  fine-grained web renderer they work unchanged.
- **Controlled DOM state.** `html/index.js` enforces which properties are
  client-only and which a parse reflects; a second web renderer must enforce
  the same rules, or the parse check and hydration disagree.
- **Allocation cost of a description** (U7). Unmeasured.
- **Upstream appetite.** Foldkit is mid-way through Blocks; a renderer seam
  competes with it for review. Proposals C and D are small enough to land
  regardless.
- **Open: where does `Document` metadata go** for a native host (title as a
  window title)? `Host.applyDocument` is a guess.
- **Open: devtools replay** on a fine-grained renderer: re-render a past
  Model by replacing the store's value, with Mounts muted as today
  (`noOpDispatch`)?
- **Open: should Scene become a Layer upstream**, or stay a VNode walker with
  the conformance suite here pinning it to the browser?

## 9. Recommendation

Start with **R0, the conformance suite over Scene, the jsdom runtime and
`renderToString`**. It needs nothing from Foldkit, catches disagreements that
exist today (keys in Scene), and is the test every later phase is judged by.
Then **R1**, a baseline from Foldkit's own `slow` phases, and **R2**, the
spike that decides the rest. In parallel, file **Proposal C** (frame
scheduler) and comment **Proposal E** on #1655 while Blocks is still
reshaping Mounts: both are small, useful without the rest, and get cheaper to
ask for the earlier they are asked.

## 10. Results

### R0: the conformance suite

**Where.** `packages/plus/test/conformance/`, test support beside
`foldkit-plus`'s own tests, published nowhere. `harness.ts` is the contract
a renderer implements (`LiveDrawer`: play a script and report what it drew,
the Messages that reached `update`, the Mounts that started and ended;
`StaticDrawer`: draw a Model) and `conform`, which compares every drawer to
a reference. `drawers.ts` holds today's three: the runtime
(`Runtime.makeElement` and `embed`, the reference), Scene, and the server
(`renderToString` as static markup, parsed back with `DOMParser`).
`markup.ts` reads every drawing into one canonical text: elements, sorted
attributes and classes, style declarations, the value a field holds (its
property, not its attribute) and joined text; Scene's VNode is built into an
element from its description first, so all three are read the same way.
`cases.ts` holds the cases, `known.ts` the disagreements found, `suite.ts`
the Vitest form. `conformance.test.ts` runs it in jsdom with all three
drawers; `conformance.browser.test.ts` runs the runtime in Chromium against
Scene. A future renderer adds a drawer and runs `conformanceSuite`.

**Cases** (each a program whose `update` issues no Commands, and a script of
clicks, typing and Messages sent as a Subscription would):

| Case | What it holds |
| --- | --- |
| elements and attributes | properties and attributes (`Id`, `Title`, `Hidden`, `Tabindex`, `For`, `Href`, `Disabled`), classes, style, data and ARIA attributes, a text field, a checkbox, a `select` and a `textarea`, each changed by typing or a Message |
| text and whitespace | adjacent and empty strings, whitespace between elements, escaped characters, emoji, a `pre` whose text starts with a newline |
| table | `caption`, `thead`, `tbody`, `colspan`, a row added |
| table rows outside a tbody | the same rows put straight in the `table` |
| keyed list with Mounts | rows keyed by id, each holding a Mount: the first dropped, the list reversed, a row added at the front |
| positional list with Mounts | the same list without keys |
| lazy slots | `createLazy` and `createKeyedLazy`, redrawn by their arguments |
| submodels | two `h.submodel`s of one view, their Messages wrapped for the parent |
| event handlers | a click bubbling from a child to its parent's handler, elements added and removed |
| KeepTyped | a field built by foldkit-ssr's `Resume.builder`, marked `KeepTyped` |
| data grid header | foldkit-mixins-data-grid's grid, sorted by its header's buttons |

**Found** (each pinned in `known.ts`; an entry that stops appearing fails
the suite):

- **Scene does not model keys** (Foldkit). Scene tracks a Mount by name and
  position, so dropping the first keyed row ends the *last* row's Mount, and
  adding a row at the front starts the Mount of a row that was already
  there, answering that row's Message. The runtime ends and starts the rows'
  own. Scene draws the keyed and the positional list identically; the
  runtime does not. This is the disagreement §4.7 predicted.
- **Scene could not draw the data grid** (this repository, #380, fixed).
  The grid drew three Mounts that answered no Message when they started
  (`DataGridHeaderDrag`, a `Move` per resize handle, `DataGridCellPress`),
  and Scene resolves every Mount with one. The header row's and the body's
  listeners now send `PressListening` when they start, and the header row's
  follows a resize handle's drag too, so a handle holds no Mount; the case
  agrees on all three drawers. It also showed that the runtime starts an
  element's Mounts after its children's (snabbdom's `insert` hooks), where
  Scene lists them parent first, so the Scene drawer resolves them in the
  runtime's order: their start Messages are compared in order.
- **The server refuses a table without a `tbody`** (Foldkit, by design):
  a parser would insert one, so `renderToString` fails with
  `SerializationError` where the runtime and Scene draw the rows as written.
  A page drawn on the client only is the one place the two disagree.

Everything else agrees on all three drawers, in jsdom and in Chromium:
markup, Messages (including a click bubbling to a parent, a submodel's
wrapped Message, typing) and probed Mount lifecycles. The server keeps a
`pre`'s leading newline and whitespace between elements as the runtime
draws them.

**Test.** `conformance.mutations.ts`: dropping the keyed list's key makes
the runtime end the last row's Mount, as Scene does, so the recorded
disagreement vanishes and the suite fails, while Scene's own reading is the
same with the key or without it (`conformance.test.ts`, "keys"). The other
mutations break the comparison, Scene's report of ended Mounts and the
reading of a field's value; all four are killed.

**Not covered.** Commands (a case's `update` issues none, so components
whose `update` focuses or scrolls, such as the Listbox behind domains-plus's
filters, are not cases yet; Scene resolves Commands by description, the
runtime runs them, and a drawer pair for them is the next step), hydration
(`Runtime.hydrate` returns no handle to dispose, so a hydrating drawer
would leak a runtime per case), foldkit-ssr's own `SSR.render` (where
`KeepTyped` writes its marker; outside it, as here, the marker is not
written by any drawer), timing (AGENTS.md: "Keys faster than a frame meet
the last frame's view"), and the todo and domains-plus examples the plan
named: their views are bound to their applications' Models and Commands,
so the cases use the components they draw instead.


### R1: the render baseline

**What is measured.** Foldkit's own `slow` timings (`runtime/slowPhase.js`,
`runtime/renderer.js` `renderSync`): `View` is the time in the program's
`view(model, h)` under the render frame, `Patch` the time in snabbdom's
patch of the result into the DOM, `Update` the time in `update`. Every
budget is set below zero, so every call is reported, not only slow ones.
Each frame reports the Message that last dirtied it (Foldkit's own
attribution; Messages landing in one frame share it). Not measured: style,
layout and paint after the patch, Commands, Subscriptions' streams, and
the network.

**How.** `pnpm bench:render` (`scripts/render-baseline.mjs`):

1. Builds each app for production with `vite build`'s path (the Foldkit
   plugin's client, Worker and prerendering for domains-plus), into the
   app's `node_modules/.render-baseline`. The one change to the app is a
   transform adding `slow: <config the page installs>` to the runtime
   config its entry passes (`SSR.hydrate`'s for domains-plus,
   `makeApplication`'s for the grid). Nothing else in the build differs.
2. Serves it as it ships: the grid with `vite preview`; domains-plus with
   `wrangler dev --local` running the built Worker, so prices come from its
   `/remote` (sample prices, local workerd).
3. Drives headless Chromium at 1440×900. Each interaction runs 3 unrecorded
   warm-ups, then 30 recorded repetitions; each repetition waits until the
   runtime has reported nothing for 400 ms and keeps every phase reported.
4. Prints, per interaction and per frame's last Message, the frames, the
   median and p10–p90 of `View` and `Patch`, their maxima, and the median
   `update` of that Message. `--out` writes every sample; the script fails
   when an interaction reports no `View` (the probe did not reach the
   runtime: checked by building without it).

Interactions. **Grid** (`examples/data-grid`, 100,000 rows): a click on a
cell; the scroll container moved by one viewport and back; one price
edited (click, Enter, type, Enter). **domains-plus** (opened at
`/?q=acmeaa`, 556 extensions, All Results in a `WindowList`): two
Backspaces and two letters in search, each repetition ending on a query not
asked before, so the names are checked and the rows in view read their
prices afresh (`ReadStarted`, `ReadReceived`: a price arriving); the window
scrolled by a viewport and back; the availability dropdown opened and
Available or Show All chosen.

**Environment.** Windows 11 (10.0.26100), AMD Ryzen 7 6800U (8 cores, 16
threads), 28 GiB, Node 26.5.0, Chromium 156.0.8078.4 (Playwright),
headless, on a laptop with other sessions' work running. Chromium is not
cross-origin isolated here, so `performance.now()` reports whole tenths of
a millisecond: a 0.6 ms patch is ±0.1 ms. Samples:
`docs/design/renderer-baseline/2026-10-30-cpu1x-a.json`,
`-cpu1x-b.json` (the same run again) and `-cpu4x.json`
(`--throttle 4`, `Emulation.setCPUThrottlingRate`, standing in for a
phone).

**Results**, ms, median (p10–p90), run a; run b's medians are within 0.3 ms
of these for every row with 20 or more frames.

| app | interaction | frame's last Message | frames | view | patch | update |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| grid | select a cell | `CellPressed` | 30 | 3.1 (2.7–3.8) | 0.7 (0.6–0.7) | 0.1 |
| grid | scroll a page | `Measured` | 30 | 2.8 (2.3–3.3) | 1.5 (1.3–1.7) | 0.0 |
| grid | edit a cell | `EditStarted` | 30 | 2.7 (2.5–3.1) | 1.5 (1.4–1.8) | 0.1 |
| grid | edit a cell | `EditCommitted` | 30 | 8.3 (7.8–9.0) | 1.6 (1.4–1.7) | 1.8 |
| domains-plus | keystroke | `UpdatedSearch` | 30 | 3.6 (3.2–4.2) | 2.3 (2.1–2.5) | 0.0 |
| domains-plus | names checked | `ReadStarted` | 27 | 8.4 (8.0–9.0) | 0.6 (0.5–0.7) | 0.1 |
| domains-plus | prices arrive | `ReadReceived` | 30 | 7.2 (6.7–9.2) | 3.0 (2.7–3.3) | 0.6 |
| domains-plus | scroll a page | `WindowList Placed` | 22 (run b) | 8.3 (7.3–10.8) | 2.8 (2.2–3.7) | 0.0 |
| domains-plus | open the filter | `PressedPointerOnButton` | 30 | 8.2 (7.8–9.1) | 2.9 (2.6–3.0) | 0.1 |
| domains-plus | choose a filter | `SelectedItem` | 30 | 8.4 (7.7–10.3) | 2.6 (2.4–2.9) | 0.1 |

With the CPU slowed four times:

| app | frame's last Message | view | patch |
| --- | --- | ---: | ---: |
| grid | `CellPressed` (select) | 28.7 (25.3–32.2) | 4.5 (3.6–6.6) |
| grid | `Measured` (scroll) | 27.1 (22.5–33.2) | 13.3 (10.7–17.5) |
| grid | `EditCommitted` | 61.3 (53.7–70.6) | 8.6 (7.7–10.9) |
| domains-plus | `UpdatedSearch` | 21.2 (18.1–27.4) | 17.4 (15.1–19.6) |
| domains-plus | `ReadReceived` | 61.7 (53.9–68.6) | 27.9 (25.5–31.6) |
| domains-plus | `Placed` (scroll) | 54.6 (48.9–72.6) | 20.0 (13.5–31.0) |
| domains-plus | `SelectedItem` | 59.9 (52.6–68.8) | 17.9 (16.3–22.2) |

**Reading it.**

- **`view` is most of a frame's work, `patch` the lesser part.** On the
  desktop CPU `view` is 61–93% of view plus patch (a keystroke's 3.6 ms
  against 2.3 ms is the closest; a selected cell's 3.1 against 0.7 the
  widest). Building the whole VNode tree for a Message that changes one
  cell or one price is the cost a fine-grained renderer removes; diffing
  it is the smaller part.
- **Neither app is slow on a desktop.** Every median frame is under 12 ms
  of view and patch together, inside a 16 ms frame, and `update` is under
  2 ms everywhere. Scrolling 100,000 rows costs no more than a click,
  since only the window is drawn; committing an edit is the grid's
  costliest frame (8.3 ms of view); why was not measured.
- **On a slower CPU the frame budget is gone.** At 4× throttling a price
  arriving on domains-plus takes about 90 ms of view and patch, a filter
  about 78 ms, a scroll about 75 ms, and the grid's commit about 70 ms.
  The scaling is worse than 4× (view 6–10×), so the throttled numbers are an
  order of magnitude for a phone, not a prediction.
- **What R2 has to beat:** a price arriving (7.2 + 3.0 ms; 61.7 + 27.9 ms
  throttled) and a selected cell (3.1 + 0.7 ms; 28.7 + 4.5 ms throttled),
  both Messages that change a few nodes of a page drawn whole. R3
  (Projection-keyed regions on snabbdom) attacks the same `view` time
  without a new renderer, so R2's decision should be taken against R3's
  estimate as well as this baseline.

**Limits** (after foldkit/foldkit#805's critique of performance claims):
two machines would say more than two runs on one; the frame's attribution
is its last Message; Foldkit's measurement covers `view` and `patch` only,
so a renderer that moves work into layout or into Mounts would look better
here than it is; domains-plus ships Foldkit's DevTools in Inspect mode, as
upstream does, which records every Message outside these phases; the
throttled run is one run.
