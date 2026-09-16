# React interop: `@foldkit/react` and `@foldkit/react-codegen`

> **Status: runtime bridge implemented as
> [`foldkit-react`](../../packages/react/README.md); codegen not started.**
> Sections 1–19 are built (package name `foldkit-react`, not `@foldkit/react`),
> with these deviations: the host binding uses Foldkit's public
> `CustomElement.define` (property `input`, not `__foldkitReact`); sources are
> `.ts` using `createElement`, so the package needs no JSX build step; the
> Foldkit peer is `^0.158.2`, the version the repository pins.
>
> **Codegen: view mode implemented as
> [`foldkit-react-codegen`](../../packages/react-codegen/README.md).** Sections
> 21–24 are built: TypeScript AST lowering with a located diagnostic for each
> refusal, plus a CLI that writes only when every file compiles and skips
> unchanged bytes. The builder parameter becomes `dispatch` on the same
> function rather than a `View` component, so helper views keep composing.
> `wrapper` mode (section 25) is not built: `FoldkitComponent.define({ make })`
> is already the one-line wrapper, so generating it adds no semantics. Source maps and watch mode (26) are built. Submodel, lazy, and CustomElement lowering (24)
> are built. Section 20 (Resource bridge) remains a proposal.
> Step 9's examples live in [`examples/react`](../../examples/react), with plain
> React components rather than MUI or Base UI to keep dependencies small.

Based on Foldkit's current architecture, this would be implemented as **two
packages**, deliberately avoiding a second renderer in the first release.

Foldkit already has most of the hard lifecycle machinery needed. `Runtime.embed`
is explicitly designed for embedding a Foldkit app inside another host
application, and the Foldkit repo already contains a React example using
`useEffect`, `Runtime.embed`, typed ports, and `dispose()`. The host connector
also buffers inbound port sends until the Foldkit runtime is ready and defers
outbound delivery to a microtask, which is almost ideal behavior for React
integration.

## Proposed packages

```text
@foldkit/react
    Runtime interoperability
    ├── React components inside Foldkit
    ├── Foldkit applications/components inside React
    ├── Suspense support for React islands
    ├── Error boundaries
    ├── typed event/message mapping
    └── typed Port ↔ React prop mapping

@foldkit/react-codegen
    Build-time interoperability
    ├── Foldkit view → TSX
    ├── Foldkit attributes → React props
    ├── Foldkit events → dispatch(...)
    ├── source maps
    └── diagnostics for unsupported Foldkit constructs
```

Not initially implemented:

```text
Foldkit Html
     ↓
completely separate React renderer
     ↓
React reconciler
```

Foldkit's current VDOM is Snabbdom-based and its patcher has a deliberately
ordered fixed module stack for attributes, classes, datasets, events, Mounts,
props and styles. Inserting React at that level immediately creates a second
implementation of controlled DOM semantics, Mount semantics, Submodels,
hydration, CustomElements, DevTools replay, etc.

The existing boundaries give a cleaner solution.

---

## 1. `@foldkit/react`

The top-level API is symmetrical:

```ts
import { ReactComponent, FoldkitComponent } from "@foldkit/react"
```

```text
ReactComponent     React → Foldkit
FoldkitComponent   Foldkit → React
```

### React → Foldkit

Desired user experience:

```ts
import { ReactComponent } from "@foldkit/react"
import { DatePicker as ReactDatePicker } from "some-react-library"

const DatePicker = ReactComponent.define(ReactDatePicker, {
  events: ["onChange", "onOpenChange"],
})
```

Then inside a normal Foldkit view:

```ts
const view = (model: Model, h: HtmlBuilder<Message>): Html =>
  DatePicker.view(
    {
      props: {
        value: model.date,
        minDate: model.minDate,
      },
      messages: {
        onChange: date => Message.ChangedDate({ date }),
        onOpenChange: open => Message.ChangedDatePickerOpen({ open }),
      },
      suspenseFallback: <Spinner />,
    },
    h,
  )
```

React callbacks don't directly mutate Foldkit state:

```text
React event → event mapper → Foldkit Message → update → Model
```

So the TEA boundary remains intact.

### Type design

Given:

```ts
type Props = {
  value: Date
  onChange?: (date: Date) => void
  renderDay?: (date: Date) => ReactNode
}
```

and `ReactComponent.define(Component, { events: ["onChange"] })`, the resulting
Foldkit API infers:

```ts
props: {
  value: Date
  renderDay?: (date: Date) => ReactNode
}

messages: {
  onChange?: (date: Date) => Message
}
```

We **cannot** assume every function-valued React prop is an event. `renderItem`,
`getOptionLabel`, `filterOption`, `children`, `rowRenderer` are normal React
computation/render props. Event props must therefore be declared explicitly.

Declared events are initially restricted to callbacks whose React return value
is `void` (`onChange: (value) => void`). Callbacks like
`shouldClose: () => boolean` remain ordinary raw React props.

---

## 2. Don't use reactive `Mount` args for React props

`h.OnMount(MountReact({ props }))` is not sufficient. Foldkit documents that
Mount args are captured when the element mounts and **do not refresh when later
renders reuse that DOM element**.

We need Model A → React props A, Model B → React props B, without unmounting and
remounting React. So React props travel through Foldkit's **normal reactive
VNode property mechanism**: arbitrary JS `Prop`s.

Foldkit's custom-element implementation already uses this mechanism for
declarative third-party components: JS properties are written onto the live
element and diffed as Foldkit renders change.

---

## 3. Internal `<foldkit-react-host>`

`@foldkit/react` registers one generic custom element, `<foldkit-react-host>`.
The consumer never needs to know about it.

```ts
class FoldkitReactHost extends HTMLElement {
  #root?: Root
  #input?: ReactHostInput

  set __foldkitReact(input: ReactHostInput) {
    this.#input = input
    this.#render()
  }

  connectedCallback() {
    this.#root ??= createRoot(this)
    this.#render()
  }

  disconnectedCallback() {
    // deferred cleanup — see section 8
    this.#disposeIfStillDisconnected()
  }

  #render() {
    if (!this.#root || !this.#input) return
    this.#root.render(
      <Suspense fallback={this.#input.suspenseFallback}>
        <Bridge input={this.#input} />
      </Suspense>
    )
  }
}
```

`ReactComponent.view()` essentially generates:

```ts
h.customElement("foldkit-react-host")(
  [
    h.Prop("__foldkitReact", input),
    h.OnCustomEvent(INTERNAL_MESSAGE_EVENT, message => ...),
  ],
  [],
)
```

Ownership:

```text
Foldkit / Snabbdom
        │ owns
        ▼
<foldkit-react-host>
        │ React owns
        ▼
   entire subtree
```

Neither renderer touches the other's subtree.

---

## 4. React props become reactive automatically

Initial insertion:

```text
Snabbdom creates host → Prop writes input → custom element connects
→ createRoot() → root.render(input)
```

Subsequent updates:

```text
new Model → new ReactHostInput → h.Prop("__foldkitReact", newInput)
→ element property setter → root.render(newInput)
```

No new React root, so React internal state (`useState`, selections, etc.)
survives while Foldkit changes external props. That is essential.

---

## 5. React events → Foldkit Messages

Do **not** call Foldkit's internal dispatcher directly. The host emits an
internal CustomEvent:

```ts
this.dispatchEvent(
  new CustomEvent(INTERNAL_MESSAGE_EVENT, { detail: message })
)
```

The VNode already has an `OnCustomEvent` handler attached, and Foldkit's event
machinery routes the resulting Messages through its normal dispatch path:

```tsx
onChange={(value) => {
  const message = input.messages.onChange(value)
  host.dispatchEvent(
    new CustomEvent(INTERNAL_MESSAGE_EVENT, { detail: message })
  )
}}
```

```text
React callback → Message mapper → CustomEvent → Foldkit OnCustomEvent
→ Submodel mapping → dispatch → update
```

This is much better than importing `__requireDispatch`, and keeps the
integration inside Foldkit's existing event semantics.

---

## 6. Suspense support

Every `<foldkit-react-host>` is a **separate React root**, so it needs its own
Suspense boundary; Suspense cannot bubble into an unrelated root. Every island is
wrapped by default:

```tsx
<Suspense fallback={input.suspenseFallback ?? null}>
  <Component {...props} />
</Suspense>
```

So `lazy(() => import("./HeavyComponent"))`, React 19 `use(promise)`, and
libraries that suspend internally all work normally.

```ts
DatePicker.view({
  props: {...},
  messages: {...},
  suspenseFallback: <LoadingDatePicker />,
}, h)
```

No special Foldkit async machinery required.

---

## 7. Error boundaries

A React root is also an error boundary island:

```ts
Editor.view({
  props: {...},
  errorBoundary: {
    fallback: error => <EditorCrashed error={error} />,
    toMessage: error => Message.EditorCrashed({ message: String(error) }),
  },
}, h)
```

```text
React error
   ↓
React ErrorBoundary
   ├── render fallback
   └── optionally emit Foldkit Message
```

The Foldkit application decides whether a React crash affects its Model.

---

## 8. Custom element lifecycle details

DOM nodes can be temporarily disconnected while being moved/reordered. Calling
`root.unmount()` immediately from `disconnectedCallback()` could destroy React
state unnecessarily. Use deferred disposal:

```ts
disconnectedCallback() {
  queueMicrotask(() => {
    if (!this.isConnected) {
      this.#root?.unmount()
      this.#root = undefined
    }
  })
}
```

```text
temporary move:  disconnect → connect → microtask → isConnected === true  → keep root
real removal:    disconnect → microtask → isConnected === false → unmount
```

Keyed Foldkit list reordering gets a dedicated test.

---

## 9. Host attributes

Consumers still control the Foldkit-owned host:

```ts
Editor.view(
  {
    props: {...},
    messages: {...},
    hostAttributes: [
      h.Key(editor.id),
      h.Class("editor"),
      h.AriaLabel("Document editor"),
    ],
  },
  h,
)
```

React never owns these attributes:

```text
<foldkit-react-host class="editor">
     └── React tree
```

---

## 10. No Foldkit children inside a React island in v1

Explicitly disallowed:

```ts
ReactThing.view({
  children: [h.div(...)],
})
```

because both reconcilers would co-own the same subtree. React children are React
children (`props: { children: <SomeReactThing /> }`). Foldkit content lives
beside the island:

```ts
h.div([], [
  normalFoldkitView(...),
  ReactEditor.view(...),
  anotherFoldkitView(...),
])
```

Portals could bridge these worlds later; v1 stays simple.

---

## 11. Foldkit → React

Builds directly on `Runtime.embed`, which Foldkit documents as the
host-controlled lifecycle entry point: the host communicates only through typed
Ports and calls `dispose()` on unmount. The existing React example demonstrates
this pattern; the package turns it into an ergonomic typed API.

```tsx
import { FoldkitComponent } from "@foldkit/react"

const Counter = FoldkitComponent.define({
  make: (container, props: CounterProps) =>
    makeCounterElement(container, { initialCount: props.initialCount }),

  inbound: {
    stepChanged: props => props.step,
  },

  outbound: {
    countChanged: (count, props) => {
      props.onCountChange?.(count)
    },
  },
})
```

```tsx
<Counter initialCount={10} step={2} onCountChange={setCount} />
```

---

## 12. Props → Foldkit Ports

The wrapper distinguishes **initial configuration** from **reactive values**.
`make` is evaluated when the runtime is created; `inbound` selectors stay
reactive:

```text
React render #1: step = 1 → handle.ports.stepChanged.send(1)
React render #2: step = 2 → handle.ports.stepChanged.send(2)
```

`Object.is` is the default to avoid redundant sends, with an override:

```ts
inbound: {
  filtersChanged: {
    select: props => props.filters,
    equals: shallowEqual,
  },
}
```

The host connector already buffers inbound sends made before the runtime
finishes binding, so the wrapper can send initial values immediately after
`embed()`.

---

## 13. Foldkit Ports → React callbacks

```ts
outbound: {
  countChanged: (count, props) => props.onCountChange?.(count),
  submitted: (result, props) => props.onSubmit?.(result),
}
```

Subscriptions are created once. Listeners read `latestPropsRef.current` rather
than capturing mount-time props, so changing `onCountChange` doesn't require
destroying and re-subscribing the port.

Foldkit's connector delays outbound delivery to a microtask, so a listener
installed synchronously right after `embed()` won't miss emissions from
initialization Commands.

---

## 14. React Strict Mode

An explicitly supported invariant. The existing React embedding example calls
`handle.dispose()` from effect cleanup, and `Runtime.embed` already handles the
immediate mount → dispose → mount sequence Strict Mode performs in development.

`FoldkitComponent.define()` is tested under `<StrictMode><Counter /></StrictMode>`
as a hard acceptance criterion.

---

## 15. Restart semantics

Some props represent Foldkit runtime identity (`<UserDashboard userId={userId} />`):
changing them should create a new app rather than feed a port.

```ts
FoldkitComponent.define({
  ...
  restartKey: props => props.userId,
})
```

```text
same restartKey      → preserve runtime → update ports
different restartKey → dispose → create fresh program → embed
```

This maps cleanly to React's keyed identity.

---

## 16. Lower-level hook

Alongside `FoldkitComponent.define(...)`, expose `useFoldkitElement(...)` for
complex cases:

```tsx
const { ref, handle } = useFoldkitElement({
  make: container => makeElement(container, flags),
})
```

Advanced consumers talk directly through `handle?.ports.foo.send(...)`.
**No direct Model access** — Ports remain the boundary.

---

## 17. Package structure

```text
packages/react/
├── package.json
├── README.md
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── ReactComponent.ts
│   ├── FoldkitComponent.tsx
│   ├── useFoldkitElement.tsx
│   ├── reactHostElement.tsx
│   ├── ReactErrorBoundary.tsx
│   ├── eventBridge.ts
│   └── types.ts
└── test/
    ├── reactComponent.test.tsx
    ├── foldkitComponent.test.tsx
    ├── suspense.test.tsx
    ├── strictMode.test.tsx
    ├── events.test.tsx
    ├── ports.test.tsx
    └── lifecycle.test.tsx
```

Registration is lazy (`ensureReactHostElementDefined()`) rather than at import
time, so the package stays `"sideEffects": false` like the existing Foldkit
packages (e.g. `@foldkit/ui`).

---

## 18. React version

Target React 19 first; Foldkit's React comparison app already uses 19.2.x.

```json
{
  "peerDependencies": {
    "foldkit": ">=0.160.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}
```

React 18 support is probably achievable later, but not before the API settles.

---

## 19. What Suspense means in each direction

This distinction should be prominent in the user docs:

| Integration | Async behavior |
| --- | --- |
| React inside Foldkit | **Native React Suspense** |
| React `lazy()` inside Foldkit | **Works** |
| React `use(promise)` inside Foldkit | **Works** |
| React ErrorBoundary | **Works locally** |
| Foldkit inside React | **Foldkit retains its own async semantics** |
| Outer React Suspense waits for Foldkit Commands | **No, not automatically** |
| Foldkit Command = Promise/Suspense | **No** |

Foldkit Commands are **not** turned into Suspense. A Command could be analytics,
save draft, navigation, network mutation, load user, or write storage — only one
of those might represent data blocking rendering. Foldkit keeps its explicit
Effect → Message → Model → View semantics.

---

## 20. Future `Resource` → Suspense bridge

A later feature:

```ts
const User = Resource.define({
  key: id => ["user", id],
  load: id => Api.getUser(id),
})
```

Foldkit:

```ts
User.match(id, {
  pending: () => loadingView(h),
  success: user => userView(user, h),
  error: error => errorView(error, h),
})
```

React:

```tsx
const user = FoldkitReact.useResource(User, id)
```

```text
                  Resource
                     │
          ┌──────────┴──────────┐
          ↓                     ↓
       Foldkit                 React
 explicit status            Suspense/use()
```

This deserves its own design and does **not** block `@foldkit/react` v1. (See
also [async-semantics-DESIGN.md](./async-semantics-DESIGN.md).)

---

## 21. `@foldkit/react-codegen`

A separate concern. The runtime package answers *how can the two ecosystems
coexist?* Codegen answers *how can Foldkit-authored views become actual TSX
source?*

CLI:

```bash
pnpm foldkit-react-codegen src/components --out-dir src/generated
foldkit-react-codegen src/Button.ts --mode view
```

Library API:

```ts
import { transformSourceFile, transformProgram } from "@foldkit/react-codegen"
```

---

## 22. Don't generate TSX from runtime VNodes

Reverse-engineering source from runtime `Html` loses variable names, control-flow
intent, comments, generic types, imports, helper boundaries, and source
expressions. Operate on the TypeScript AST instead.

Input:

```ts
const view = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.button(
    [
      h.Class("button"),
      h.Disabled(model.saving),
      h.OnClick(Message.Saved()),
    ],
    ["Save"],
  )
```

Output:

```tsx
const View = ({ model, dispatch }: FoldkitReact.ViewProps<Model, Message>) => (
  <button
    className="button"
    disabled={model.saving}
    onClick={() => dispatch(Message.Saved())}
  >
    Save
  </button>
)
```

---

## 23. Attribute lowering table

One canonical lowering table:

```text
h.Class(x)       → className={x}
h.Id(x)          → id={x}
h.Title(x)       → title={x}
h.Style(x)       → style={x}
h.Disabled(x)    → disabled={x}
h.Checked(x)     → checked={x}
h.Value(x)       → value={x}
h.Key(x)         → key={x}
h.Data(k, v)     → data-* attribute
h.Aria*(x)       → aria-* attribute

h.OnClick(msg)   → onClick={() => dispatch(msg)}
h.OnInput(f)     → onInput={event => dispatch(f(extractInputValue(event)))}
```

For tricky Foldkit event semantics, generated code imports helpers from
`@foldkit/react` rather than duplicating logic:

```tsx
onClick={FoldkitReact.event(
  { defaultAction: "Prevent", propagation: "Stop" },
  () => Message.Clicked(),
  dispatch,
)}
```

---

## 24. Compiler support tiers

The compiler is strict.

Straightforward: HTML elements, SVG, MathML, attributes, classes, styles, keys,
events, conditional expressions, arrays, maps, helper view calls, controlled
inputs.

Possible with helper lowering: CustomElement, Submodel, lazy views, OnUnmount.

Initially unsupported: Mount, arbitrary imperative DOM integrations, Canvas
internals, runtime-sensitive VNode manipulation, unknown custom attributes with
renderer-specific behavior.

```text
ERROR FKREACT0042

Cannot compile h.OnMount(...) to standalone React JSX.

Use ReactComponent/FoldkitComponent runtime interop,
or provide a React-specific implementation.
```

**Never silently drop semantics.**

---

## 25. Two codegen modes

- **`--mode wrapper`** (default): generates a React component around the Foldkit
  runtime using `@foldkit/react`. 100% semantic preservation; the Foldkit runtime
  remains.
- **`--mode view`**: actual Foldkit-template → TSX transpilation. Portable
  standalone rendering, stricter supported subset (section 24).

This prevents codegen from pretending it can translate every
Effect/Mount/Subscription into idiomatic React.

---

## 26. Source maps and generated-file hygiene

Generated output carries:

```ts
// @generated by @foldkit/react-codegen
// Source: src/components/Button.ts
// Do not edit manually.
```

Support source maps, stable formatting, stable import ordering, deterministic
output, incremental builds, and watch mode. Don't rewrite a generated file whose
bytes haven't changed — that matters for git diffs and Vite HMR.

---

## 27. Testing strategy

Release-blocking integration tests:

| Test | Required result |
| --- | --- |
| Foldkit updates React prop | React rerenders, root does not remount |
| React internal `useState` | survives Foldkit renders |
| React event | produces exactly one Foldkit Message |
| React inside Submodel | message reaches correct parent mapping |
| `React.lazy()` | Suspense fallback then resolved UI |
| React `use()` | Suspense works |
| React exception | ErrorBoundary fallback works |
| Foldkit removes island | React effects clean up |
| Foldkit keyed reorder | React state preserved where identity preserved |
| Two islands | roots isolated |
| Raw function prop | not treated as Message event |
| Foldkit in React | `Runtime.embed` starts once |
| React prop → inbound Port | new value sent |
| outbound Port → callback | latest callback invoked |
| React Strict Mode | setup/cleanup/setup works |
| restart key changes | runtime replaced once |
| React parent rerender | Foldkit runtime remains alive |
| unmount React component | Foldkit runtime disposed |
| invalid inbound value | Schema error behavior preserved |
| codegen golden files | deterministic TSX |
| unsupported codegen construct | compile-time diagnostic |

---

## 28. Implementation order

1. **Scaffold `@foldkit/react`:** package metadata, JSX build config, React 19
   peers, test environment.
2. **Implement React → Foldkit host:** `<foldkit-react-host>`, reactive `Prop`
   input, root lifecycle, CustomEvent → Message bridge.
3. **Implement `ReactComponent.define`:** event-key inference, typed `props`,
   typed `messages`, host attributes.
4. **Add Suspense/ErrorBoundary:** local Suspense by default, configurable
   fallback, optional error → Message translation.
5. **Implement Foldkit → React:** `FoldkitComponent.define`, backed entirely by
   `Runtime.embed`.
6. **Implement Port mapping:** reactive inbound props, latest-ref outbound
   callbacks, `restartKey`.
7. **Implement `useFoldkitElement`:** lower-level escape hatch.
8. **Stress-test lifecycles:** Strict Mode, keyed moves, disposal, Suspense,
   async React effects, Submodels and DevTools replay.
9. **Add docs/examples:** MUI/Base UI component inside Foldkit; Foldkit counter
   inside React; Suspense example; controlled React component example.
10. **Ship `@foldkit/react` before codegen.**
11. **Build `@foldkit/react-codegen`:** TypeScript AST scanner, HTML lowering,
    attributes, events, source maps, diagnostics.
12. **Add advanced lowering incrementally:** controlled inputs → CustomElement →
    Submodel → lazy helpers.

---

## Architectural result

```text
                    FOLDKIT

             Model → update → view
                           │
          ┌────────────────┴────────────────┐
          │                                 │
          ▼                                 ▼
   Foldkit-native UI              ReactComponent.view()
                                            │
                                            ▼
                                <foldkit-react-host>
                                            │
                                            ▼
                                     React ecosystem
                                  MUI / Base UI / charts
                                  editors / maps / etc.


                    REACT

                    <App>
                      │
                      ▼
               <FoldkitWidget>
                      │
                      ▼
                Runtime.embed()
                      │
                typed Ports
                      │
                      ▼
                 Foldkit app
```

`@foldkit/react` can probably be implemented **without changing Foldkit core at
all**. `Prop`, custom events, CustomElements, `Runtime.embed`, and Ports already
provide essentially every primitive necessary; the package turns them into a
polished, type-safe bidirectional bridge.

Ship the runtime bridge first. Once it exists, codegen becomes an
optimization/portability tool rather than something Foldkit needs for React
compatibility.
