# foldkit-react

Use React components inside a Foldkit view, and Foldkit programs inside a React
app. Each side keeps its own renderer and its own state; they meet at a single
DOM element, and only Messages and Ports cross it.

```text
React inside Foldkit                     Foldkit inside React

Model ─▶ view ─▶ ReactComponent.view     <Counter step={2} onCount={…} />
                   │ props (a DOM prop)       │ props ─▶ inbound Ports
                   ▼                          ▼
          <foldkit-react-host>          <div> (React owns)
                   │ React root               │ Runtime.embed
                   ▼                          ▼
             React component              Foldkit program
                   │ event                    │ outbound Ports
                   ▼                          ▼
         Message ─▶ update                callback props
```

## Who owns what

- **React inside Foldkit.** The Foldkit Model owns every value it passes as a
  prop. React owns the component's internal state (`useState`, focus, a
  library's selection), which survives Foldkit renders. A React event never
  changes the Model directly: you map it to a Message and `update` decides.
- **Foldkit inside React.** The Foldkit program owns its Model. React props
  reach it only through the program's inbound Ports, and it reports back only
  through outbound Ports. There is no access to its Model from React.

Neither renderer ever touches the other's DOM subtree, so there is no second
reconciler and no shared ownership to reason about.

## Install

```sh
pnpm add foldkit-react foldkit effect react react-dom
```

React 19 is required. [`examples/react`](../../examples/react) runs both
directions, plus codegen, as a pinned transcript.

## React inside Foldkit

```ts
import { ReactComponent } from 'foldkit-react'
import { DatePicker } from 'some-react-library'

// Name the props that are events. Any other function prop (renderDay,
// getOptionLabel, …) stays an ordinary prop.
const ReactDatePicker = ReactComponent.define(DatePicker, { events: ['onChange'] })

const view = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [],
    [
      h.h2([], ['Due date']),
      ReactDatePicker.view(
        {
          props: { value: model.dueDate },
          messages: { onChange: date => ChangedDueDate({ date }) },
        },
        h,
      ),
    ],
  )
```

What happens:

- `define` does no rendering. It records the component and which props are
  events. Events must be callbacks returning `void`; a callback that returns a
  value (`shouldClose: () => boolean`) is a normal prop.
- `view` returns ordinary Foldkit `Html`: a `<foldkit-react-host>` element whose
  `input` DOM property carries the props. Foldkit diffs that property like any
  other, so a new Model re-renders the same React root. It does not remount.
- `messages` maps each event's arguments to a Message. The Message reaches
  `update` through Foldkit's normal event path, so inside a Submodel it is lifted
  by `toParentMessage` like a click would be. An event without a mapper is not
  passed to the component.
- The Message type comes from `h`, so a mapper returning the wrong Message is a
  type error.

### Suspense and errors

Each island is its own React root, so it has its own Suspense boundary: `lazy`,
`use(promise)`, and libraries that suspend all work, showing
`suspenseFallback` (default: nothing) meanwhile.

```ts
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

Without `errorBoundary`, a render error is uncaught at the island's React root,
which React handles as in any app: it removes that root's tree and reports the
error. With it, the island shows `fallback` and, if given,
`toMessage` dispatches a Message so the Model can record the crash. The
fallback stays until the island is removed.

### The host element

`hostAttributes` go on `<foldkit-react-host>`, which Foldkit owns: keys for
keyed lists, classes, ARIA labels. The host is `display: inline` by default, as
every unknown element is; style it if the component needs a block.

```ts
ReactCounter.view({ props: { id: row.id }, hostAttributes: [h.Key(row.id), h.Class('row')] }, h)
```

An island removed by Foldkit unmounts its React tree, running effect cleanups.
A keyed move keeps it mounted, because the host defers unmounting until after
the move completes.

## Foldkit inside React

```ts
import { FoldkitComponent } from 'foldkit-react'

const Counter = FoldkitComponent.define({
  // Runs once per runtime. Props here are initial configuration only.
  make: (container, props: CounterProps) => makeCounter(container, props.initialCount),
  // Re-sent whenever the selected value changes (Object.is).
  inbound: { stepChanged: props => props.step },
  // Called with the latest props, so a new onCountChange needs no resubscribe.
  outbound: { countChanged: (count, props) => props.onCountChange?.(count) },
})

// <Counter initialCount={10} step={2} onCountChange={setCount} />
```

`makeCounter` returns a program from `Runtime.makeElement` with `ports`. Port
names and value types are checked against it: bindings send and receive each
Port's **Encoded** side, the same values `EmbedHandle.ports` uses.

The component renders a `<div>` (it accepts `className` and `style`) and embeds
the program in a child element React never renders. On unmount it disposes the
runtime, stopping its Subscriptions, Managed Resources, and in-flight
Commands.

- **Strict Mode** mounts, disposes, and mounts again; only the second runtime
  keeps running.
- **Initial values arrive in order.** Inbound values sent before the program's
  Subscriptions start are buffered, and outbound values emitted by `init`
  Commands are delivered after the listeners are attached.
- **Invalid inbound values** fail the Port's Schema, are logged, and never reach
  the app. The same invalid value is not re-sent on every render.

### Custom equality and restarts

```ts
FoldkitComponent.define({
  make: (container, props: DashboardProps) => makeDashboard(container, props.userId),
  inbound: { filtersChanged: { select: props => props.filters, equals: shallowEqual } },
  // A different user is a different program, not a new Port value.
  restartKey: props => props.userId,
})
```

When `restartKey` changes (compared with `Object.is`), the runtime is disposed
and a fresh one is made with the current props, which also receives every
inbound value.

### `useFoldkitElement`

The hook under `FoldkitComponent`, for components that need the Port handles
themselves:

```ts
const { ref, handle } = useFoldkitElement({
  make: container => makeCounter(container, 0),
})
useEffect(() => {
  handle?.ports.stepChanged.send(step)
}, [handle, step])
return createElement('div', { ref })
```

`handle` is `undefined` before the first effect and after unmount. `onEmbed`
runs synchronously after `embed`, the place to subscribe to an outbound Port
without missing emissions from `init`. Give the ref'd element no React
children.

## Limits

- No Foldkit children inside a React island: pass React children as
  `props.children`, and place Foldkit content beside the island.
- Foldkit Commands are not React Suspense. An outer `<Suspense>` does not wait
  for an embedded program; the program shows its own loading states from its
  Model.
- A server render emits an empty `<foldkit-react-host>`; the React component
  renders on the client.
- The event mapper's argument types come from the last overload of an
  overloaded callback prop.
