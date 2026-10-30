# foldkit-react

Checked against `foldkit-react` 0.4.1 and `foldkit-react-codegen` 0.3.0.

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

<!-- docs-check
import { Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import type { ReactNode } from 'react'
declare const DatePicker: (props: {
  readonly value: Date
  readonly onChange?: (date: Date) => void
}) => ReactNode
declare const Spinner: () => ReactNode
const Model = Schema.Struct({ dueDate: Schema.Date })
type Model = typeof Model.Type
const Message = defineMessageUnion({
  ChangedDueDate: { date: Schema.Date },
  PickerCrashed: { reason: Schema.String },
})
type Message = typeof Message.Type
const { ChangedDueDate, PickerCrashed } = Message
-->

```ts
import { createElement } from 'react'
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

<!-- docs-check
import * as Port from 'foldkit/port'
import type * as Runtime from 'foldkit/runtime'
const ports = {
  inbound: { stepChanged: Port.inbound(Schema.Number) },
  outbound: { countChanged: Port.outbound(Schema.Number) },
}
declare const makeCounter: (
  container: HTMLElement,
  initialCount: number,
) => Runtime.MakeRuntimeReturn<typeof ports, void, never, 'Element'>
interface CounterProps {
  readonly initialCount: number
  readonly step: number
  readonly userId: string
  readonly onCountChange?: (count: number) => void
}
-->

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

## Known traps

Met in applications on this stack: what failed, and what to do instead.

- **A runtime embedded by hand needs a container with an id.** Without one
  Foldkit fails asynchronously before rendering, and the page stays blank (a
  CMS studio did for a week; every test mounted its own container).
  `useFoldkitElement` gives its container one; a `Runtime.makeElement` you
  `embed` yourself needs one too.
- **`embed` replaces its container with the rendering.** A test that kept the
  container and read `container.querySelector(...)`, or `getElementById` of the
  staged div, saw an empty page. Query the drawn page from `document`.
- **Strict Mode can dispose a runtime before its Subscriptions start**, so a
  `Stream.ensuring` on one never runs. Do not take "my stream ended" as the only
  stop signal.
- **An inbound Port takes the Encoded form.** Sending a decoded value with an
  `Option` field failed with a `SchemaError` and was dropped; tests with plain
  strings passed. Encode before `send`, and test one transforming field.

See also: https://github.com/doeixd/foldkit-plus/blob/main/packages/react/README.md
