# foldkit-react

Teams migrating incrementally between Foldkit and React—or adopting a specialized React widget like a rich editor or chart inside a Foldkit screen—need both frameworks to share one page without fighting over the same DOM subtree or duplicating state.

`foldkit-react` runs React components inside Foldkit views (`ReactComponent.define`) and embeds Foldkit programs inside React apps (`FoldkitComponent.define`). Each side keeps its own renderer and internal state; they meet at a single host element where only props, Messages (events sent to Foldkit's `update`), and Foldkit Ports cross the boundary. See both directions wired together in [`examples/react`](../../examples/react).

## Install

```sh
pnpm add foldkit-react foldkit effect react react-dom
```

React 19 is required.

## Start with a React widget in Foldkit

### React inside Foldkit

Wrap a React component with `ReactComponent.define`, list its event callback props, and render it from a Foldkit `view`:

```ts
import { Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { ReactComponent } from 'foldkit-react'
import { createElement } from 'react'

const Button = (props: { readonly label: string; readonly onPress?: () => void }) =>
  createElement('button', { onClick: props.onPress }, props.label)
const ReactButton = ReactComponent.define(Button, { events: ['onPress'] })
const Model = Schema.Struct({ count: Schema.Number })
type Model = typeof Model.Type
const Message = defineMessageUnion({ Incremented: {} })
type Message = typeof Message.Type

const update = (model: Model, _message: Message) => ({ model: { count: model.count + 1 } })
const view = (model: Model, h: HtmlBuilder<Message>): Html =>
  ReactButton.view(
    { props: { label: `Count: ${model.count}` }, messages: { onPress: () => Message.Incremented() } },
    h,
  )
```

Rendered in a Foldkit program initialized at `{ count: 0 }`, `ReactButton.view` mounts a `<foldkit-react-host>` element containing the React button. Clicking it calls `onPress`, dispatches `Message.Incremented()`, increments `count` in `update`, and re-renders the same React root with `"Count: 1"` without remounting.

Ownership stays cleanly separated across both directions:

- **React inside Foldkit:** Your Foldkit `Model` owns prop values; React owns internal widget state (`useState`, focus, library selections) inside `<foldkit-react-host>`. Events return `void` callbacks (callbacks returning values such as `shouldClose: () => boolean` stay ordinary props) and reach `update` through `messages`.
- **Foldkit inside React:** The embedded Foldkit program owns its `Model`; React communicates exclusively through inbound and outbound Foldkit Ports.

### Add Suspense and error boundaries

Each React island owns its own React root, so `lazy`, `use(promise)`, and suspending libraries show `suspenseFallback` while waiting, and `errorBoundary` catches render failures and optionally emits a Foldkit Message (in the snippet below, `model` and `h` come from your Foldkit `view`, and `Editor` / `Spinner` are your React components):

<!-- docs-check standalone
import { Schema } from 'effect'
import type * as AsyncData from 'foldkit/asyncData'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { AsyncDataFailure, ReactComponent, readAsyncData } from 'foldkit-react'
import { createElement, type ReactNode } from 'react'
declare const Editor: (props: { readonly document: string }) => ReactNode
declare const Counter: (props: { readonly id: string }) => ReactNode
declare const Spinner: () => ReactNode
const Message = defineMessageUnion({ EditorCrashed: { reason: Schema.String } })
type Message = typeof Message.Type
const { EditorCrashed } = Message
declare const model: {
  readonly document: string
  readonly user: AsyncData.AsyncData<{ readonly name: string }, string>
}
declare const h: HtmlBuilder<Message>
-->
```ts
const ReactEditor = ReactComponent.define(Editor)

ReactEditor.view(
  {
    props: { document: model.document },
    suspenseFallback: createElement(Spinner),
    errorBoundary: {
      fallback: () => createElement('p', null, 'The editor crashed.'),
      toMessage: error => EditorCrashed({ reason: String(error) }),
    },
  },
  h,
)
```

Without `errorBoundary`, render errors remove the island root and propagate normally; with it, `fallback` stays mounted until the island unmounts.

### Suspend on `AsyncData` with `readAsyncData`

When Foldkit Commands manage loading via `AsyncData` in your `Model`, `readAsyncData` lets a React island read that value directly through Suspense and `errorBoundary`:

<!-- docs-check
interface User { readonly name: string }
-->
```ts
const Profile = ({ user }: { readonly user: AsyncData.AsyncData<User, string> }) => {
  const { data, isRefreshing } = readAsyncData(user)
  return createElement('p', null, isRefreshing ? `${data.name} (refreshing)` : data.name)
}
const ReactProfile = ReactComponent.define(Profile)

ReactProfile.view(
  {
    props: { user: model.user },
    suspenseFallback: createElement(Spinner),
    errorBoundary: {
      fallback: error => (error instanceof AsyncDataFailure ? `Not found: ${error.error}` : 'Crashed'),
    },
  },
  h,
)
```

| `AsyncData` state | `readAsyncData` behavior |
| --- | --- |
| `Initial` / `Loading` | Suspends to `suspenseFallback` |
| `Failure(error)` | Throws `AsyncDataFailure` to `errorBoundary` |
| `Success(data)` | Returns `{ data }` |
| `Refreshing(data)` | Returns `{ data, isRefreshing: true }` |
| `Stale(error, data)` | Returns `{ data, maybeStaleError: Some(error) }` |

Pass `AsyncData` values through island props or React state (such as outbound Ports) so updates retry suspended components automatically.

### Style and key the host element

Pass `hostAttributes` to attach Foldkit keys, classes, or ARIA attributes onto `<foldkit-react-host>` (which defaults to `display: inline`):

<!-- docs-check
const ReactCounter = ReactComponent.define(Counter)
declare const row: { readonly id: string }
-->
```ts
ReactCounter.view({ props: { id: row.id }, hostAttributes: [h.Key(row.id), h.Class('row')] }, h)
```

Keyed moves keep the React tree mounted; removing the island unmounts React and runs effect cleanups. Under Foldkit DevTools time travel, jumping to past Models updates island props while leaving React's internal state alone.

## Foldkit inside React

Embed a Foldkit `Runtime.makeElement` program with Ports inside any React component using `FoldkitComponent.define` (assuming `makeCounter` and `makeDashboard` return `Runtime.makeElement` programs with matching `inbound`/`outbound` Ports):

<!-- docs-check standalone
import { Schema } from 'effect'
import * as Port from 'foldkit/port'
import type * as Runtime from 'foldkit/runtime'
const ports = {
  inbound: {
    stepChanged: Port.inbound(Schema.Number),
    filtersChanged: Port.inbound(Schema.Array(Schema.String)),
  },
  outbound: { countChanged: Port.outbound(Schema.Number) },
}
declare const makeCounter: (
  container: HTMLElement,
  initialCount: number,
) => Runtime.MakeRuntimeReturn<typeof ports, void, never, 'Element'>
declare const makeDashboard: (
  container: HTMLElement,
  userId: string,
) => Runtime.MakeRuntimeReturn<typeof ports, void, never, 'Element'>
declare const shallowEqual: <A>(a: A, b: A) => boolean
interface CounterProps {
  readonly initialCount: number
  readonly step: number
  readonly onCountChange?: (count: number) => void
}
interface DashboardProps {
  readonly userId: string
  readonly filters: ReadonlyArray<string>
}
-->
```ts
import { FoldkitComponent } from 'foldkit-react'

const Counter = FoldkitComponent.define({
  make: (container, props: CounterProps) => makeCounter(container, props.initialCount),
  inbound: { stepChanged: props => props.step },
  outbound: { countChanged: (count, props) => props.onCountChange?.(count) },
})

// Usage in JSX: <Counter initialCount={10} step={2} onCountChange={setCount} />
```

`make` runs once per mounted runtime; `inbound` selects prop slices to push into inbound Ports whenever `Object.is` changes; `outbound` invokes the latest prop callback without resubscribing. Bindings validate against each Port's encoded Schema type.

`FoldkitComponent` renders a `<div>` (accepting `className` and `style`) and embeds Foldkit inside a child container React leaves alone, buffering early inbound/outbound values across startup, handling React Strict Mode double-mounts cleanly, logging invalid inbound values without re-sending them on every render, and disposing Subscriptions and Commands on unmount.

### Customize equality and restart keys

```ts
const Dashboard = FoldkitComponent.define({
  make: (container, props: DashboardProps) => makeDashboard(container, props.userId),
  inbound: { filtersChanged: { select: props => props.filters, equals: shallowEqual } },
  restartKey: props => props.userId,
})
```

When `restartKey` changes (`Object.is`), the previous Foldkit runtime disposes and a fresh runtime starts with current props and inbound values.

### Use `useFoldkitElement` for direct Port handles

```ts
import { useFoldkitElement } from 'foldkit-react'
import { createElement, useEffect } from 'react'

const HookCounter = ({ step }: { readonly step: number }) => {
  const { ref, handle } = useFoldkitElement({
    make: container => makeCounter(container, 0),
  })
  useEffect(() => {
    handle?.ports.stepChanged.send(step)
  }, [handle, step])
  return createElement('div', { ref })
}
```

`handle` is `undefined` before mount and after unmount; pass `onEmbed` to subscribe immediately after `embed` before `init` Commands emit. Keep the `ref` element free of React children.

## Limits

- **React children only inside islands:** Pass React elements via `props.children` and place Foldkit markup alongside the island.
- **No cross-framework Suspense:** Outer React `<Suspense>` boundaries wait on React resources, while embedded Foldkit programs render loading states from their own `Model`.
- **Client-rendered islands:** Server rendering emits an empty `<foldkit-react-host>`; the React island mounts on the client.
- **Overloaded event callbacks:** Event argument types infer from the last overload of an overloaded callback prop.

## Next

- Compile pure Foldkit views to static React TSX source: [`foldkit-react-codegen`](../react-codegen)
- Run the interactive React bridge and codegen examples: [`examples/react`](../../examples/react)
