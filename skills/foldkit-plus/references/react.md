# foldkit-react

React components inside a Foldkit view, and Foldkit programs inside a React app.
Each side keeps its renderer and its state; only Messages and Ports cross.

## Mental model

```text
React inside Foldkit:  Model ─▶ view ─▶ <foldkit-react-host> ─▶ React root
                       React event ─▶ Message ─▶ update
Foldkit inside React:  props ─▶ inbound Ports ─▶ Runtime.embed program
                       outbound Ports ─▶ callback props
```

- The Foldkit Model owns every prop it passes to an island; React owns the
  component's internal state, which survives Foldkit renders (no remount).
- An embedded Foldkit program owns its Model; React never reads it.

## React inside Foldkit

```ts
import { ReactComponent } from 'foldkit-react'

// Name the event props. Other function props (renderDay, …) stay plain props.
const ReactDatePicker = ReactComponent.define(DatePicker, { events: ['onChange'] })

const view = (model: Model, h: HtmlBuilder<Message>): Html =>
  ReactDatePicker.view(
    {
      props: { value: model.dueDate },
      messages: { onChange: date => ChangedDueDate({ date }) },
      suspenseFallback: createElement(Spinner),
      errorBoundary: {
        fallback: () => createElement('p', null, 'Crashed.'),
        toMessage: error => PickerCrashed({ reason: String(error) }),
      },
      hostAttributes: [h.Key('due'), h.Class('picker')],
    },
    h,
  )
```

- Events must return `void`; `() => boolean` callbacks are ordinary props.
- The Message type comes from `h`; messages go through Foldkit's event path,
  so Submodel `toParentMessage` lifts them.
- Each island is its own React root with its own Suspense boundary.
- `readAsyncData(model.user)` suspends an island on Model-owned `AsyncData`
  (Idle/Loading suspend, Failure throws `AsyncDataFailure`, Refreshing and
  Stale keep data). It starts no work: a Command loads.

## Foldkit inside React

```ts
import { FoldkitComponent, useFoldkitElement } from 'foldkit-react'

const Counter = FoldkitComponent.define({
  make: (container, props: CounterProps) => makeCounter(container, props.initialCount), // once per runtime
  inbound: { stepChanged: props => props.step }, // re-sent when changed (Object.is)
  outbound: { countChanged: (count, props) => props.onCountChange?.(count) }, // latest props
  restartKey: props => props.userId, // a change replaces the runtime
})
// <Counter initialCount={10} step={2} userId="ada" onCountChange={setCount} />
```

`makeCounter` returns `Runtime.makeElement({ …, ports })`. Bindings use each
Port's Encoded type. `{ select, equals }` overrides equality. Strict Mode and
unmount dispose the runtime. For direct handle access, use
`useFoldkitElement({ make, restartKey?, onEmbed? })`, which returns
`{ ref, handle }`.

## Compiling views to TSX: foldkit-react-codegen

A build-time tool, not runtime interop. It turns each function with an
`HtmlBuilder` parameter into one taking `dispatch` and returning `ReactNode`:

```sh
pnpm foldkit-react-codegen src --out-dir generated
```

- It lowers elements, `h.keyed`, `h.empty`, `h.submodel`, lazy slots, custom elements, a table of attributes (`Class` to
  `className`, `Aria*`, `Style`), and message events (`OnInput` becomes React
  `onChange`).
- It refuses with `file:line:column - error FKREACT000N` for `OnMount`,
  `OnChange` (native change), computed attribute arrays, and
  anything not in its table. It writes nothing and exits 1 on any refusal.
- The output is only the view. State, `update`, Commands, and Subscriptions stay
  with whatever calls it; to keep Foldkit semantics, embed the program with
  `FoldkitComponent` instead.

## Gotchas

- No Foldkit children inside an island; pass React children in `props`.
- `make` reads props once. Values that change belong in `inbound`; identity
  belongs in `restartKey`.
- Foldkit Commands are not Suspense: an outer `<Suspense>` does not wait for an
  embedded program.
- `<foldkit-react-host>` is `display: inline` unless styled.
- React 19 only.

See also: https://github.com/doeixd/foldkit-plus/blob/main/packages/react/README.md
