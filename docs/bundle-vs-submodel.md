# Bundle versus Submodel: the same child, wired once

A Submodel is how Foldkit nests one state machine inside another. The parent
holds the child's Model in a field, wraps the child's Messages in one of its
own variants, and forwards them in its `update`. That is the right design, and
a Bundle keeps every part of it. The cost is in the wiring. **The parent wires
the child by hand, in up to five places, and it has to know what the child
contains to do it**: whether it has Subscriptions and what they are called,
whether it holds a resource, and whether its `init` returns Commands.

That knowledge is copied into every parent, and nothing checks it. A Bundle
moves it back into the child:

```text
Submodel = the child's parts, wired into each parent by hand
Bundle   = the child's parts in one value; a placement wires them for the parent
```

Ownership does not change. In both, **the parent Model owns the child's
state**, the child's Messages travel as a variant of the parent Message, and
every transition goes through the parent's `update`. A Bundle adds no store,
no reducer and no runtime. A placement compiles to the same Foldkit calls you
would write by hand.

## Why package a child

### The child can change without breaking its parents

A hand-wired parent encodes what the child is today. Suppose the timer
child below gains a Managed Resource. Every parent now needs a
`ManagedResource.lift`, and a parent that does not get one still compiles: the
resource is never acquired, and nothing says so. Suppose it gains a second
Subscription. A parent that lifted its entries by name, as the example below
has to, never runs the new one.

A placement lifts whatever the child has. A new Subscription arrives through
`placements.subscriptions()` with no edit to any parent. A new resource arrives
through `placements.runtime`; in a config checked by `placements.complete`, a
parent with no `managedResources` becomes a type error that names the
property. The child's author changes the child, and its users hear about it
from the compiler instead of from a bug report.

### A missing piece is a type error, not a quiet bug

Wired by hand, each of these compiles and fails only at runtime, if anyone
notices. With a Bundle, each is either impossible or reported:

| Mistake | By hand | Through `placements.complete` |
| --- | --- | --- |
| A Subscription not lifted | never runs | type error at `subscriptions` |
| A Managed Resource not lifted | never acquired | type error at `managedResources` |
| A wrapper with no route in `update`, behind a catch-all branch | its Messages are dropped | no route to write: `placements.update` routes every wrapper |
| Two placements on one wrapper or one resource tag | Messages misrouted, or one resource replacing the other | startup error naming both |

### A second placement is one line, not a second copy

In the example below, the second placement (`rest`) costs about twenty
lines by hand: a field, a wrapper, its init and Command mapping, a fold, a
route in `update`, a Subscription lift, a renamed key and an `h.submodel`. Each repeats the
field name, and the usual way to write them is to copy the first placement
and rename. Miss one rename, say `read: model => Option.some(model.work)` in
the `rest` fold, and it compiles, because both fields hold the same type;
the rest timer is then updated from the work timer's state.

With a Bundle the second placement is one `Bundle.withChild('rest', Timer)`
line. The field name is written once, and the Model field, the wrapper, the
fold, the lifts and the Subscription keys (`Timer@rest/ticks`) are
all derived from it. `Bundle.withEach` does the same for a record of children,
one per key.

### Configuration and outputs cannot be left out

A child's configuration (`args`) is a Schema, and every placement must supply
it when `init` takes it. A child with an OutMessage must be placed with an
`onOut`, so its outputs cannot be dropped by forgetting to handle them.

## One child, placed twice

A timer: a button that starts and pauses it, and a Subscription that ticks
once a second while it runs. A page places it twice, for work and for rest.

### The child: an ordinary Submodel

This is a plain Foldkit Submodel, with nothing from `foldkit-bundle` in it: a
Model, a Message, `init`, `update`, Subscriptions, and a view made
with `Submodel.defineView` so a parent can embed it with `h.submodel`.

```ts
import { Option, Schema, Stream } from 'effect'
import * as Command from 'foldkit/command'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Submodel from 'foldkit/submodel'
import * as Subscription from 'foldkit/subscription'
import * as Update from 'foldkit/update'

const TimerModel = Schema.Struct({ seconds: Schema.Number, running: Schema.Boolean })
type TimerModel = typeof TimerModel.Type
const TimerMessage = defineMessageUnion({ ClickedToggle: {}, Ticked: {} })
type TimerMessage = typeof TimerMessage.Type

const init = (): Update.Return<TimerModel, TimerMessage> => ({
  model: { seconds: 0, running: false },
})

const update = (model: TimerModel, message: TimerMessage) =>
  TimerMessage.match<Update.Return<TimerModel, TimerMessage>>(message, {
    ClickedToggle: () => ({ model: { ...model, running: !model.running } }),
    Ticked: () => ({ model: { ...model, seconds: model.seconds + 1 } }),
  })

const subscriptions = Subscription.make<TimerModel, TimerMessage>()(entry => ({
  ticks: entry(
    { running: Schema.Boolean },
    {
      modelToDependencies: model => ({ running: model.running }),
      dependenciesToStream: ({ running }) =>
        running ? Stream.map(Stream.tick('1 second'), () => TimerMessage.Ticked()) : Stream.empty,
    },
  ),
}))

const view = Submodel.defineView<TimerModel, TimerMessage>((model, h) =>
  h.button(
    [h.OnClick(TimerMessage.ClickedToggle())],
    [`${model.seconds}s ${model.running ? 'Pause' : 'Start'}`],
  ),
)
```

Both versions below use this child unchanged. Only the parent differs.

### Placed by hand

The parent declares a field and a wrapper Message for each placement, then
wires each one in four places:

```ts
const Model = Schema.Struct({ work: TimerModel, rest: TimerModel })
type Model = typeof Model.Type
const Message = defineMessageUnion({
  GotWorkMessage: { message: TimerMessage },
  GotRestMessage: { message: TimerMessage },
})
type Message = typeof Message.Type

// 1. init: each child's Model, and its Commands lifted
const parentInit = (): Update.Return<Model, Message> => {
  const work = init()
  const rest = init()
  return {
    model: { work: work.model, rest: rest.model },
    commands: [
      ...Command.mapMessages(work.commands, message => Message.GotWorkMessage({ message })),
      ...Command.mapMessages(rest.commands, message => Message.GotRestMessage({ message })),
    ],
  }
}

// 2. update: one fold per placement, and a route to each
const foldWork = Update.foldChild({
  update,
  read: (model: Model) => Option.some(model.work),
  write: (model: Model, work: TimerModel) => ({ ...model, work }),
  toParentMessage: (message: TimerMessage): Message => Message.GotWorkMessage({ message }),
})
const foldRest = Update.foldChild({
  update,
  read: (model: Model) => Option.some(model.rest),
  write: (model: Model, rest: TimerModel) => ({ ...model, rest }),
  toParentMessage: (message: TimerMessage): Message => Message.GotRestMessage({ message }),
})
const parentUpdate = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    GotWorkMessage: ({ message }) => foldWork(model, message),
    GotRestMessage: ({ message }) => foldRest(model, message),
  })

// 3. subscriptions: one lift per placement, renamed so the keys do not collide
const work = Subscription.lift(subscriptions)({
  read: (model: Model) => Option.some(model.work),
  toParentMessage: (message: TimerMessage): Message => Message.GotWorkMessage({ message }),
})
const rest = Subscription.lift(subscriptions)({
  read: (model: Model) => Option.some(model.rest),
  toParentMessage: (message: TimerMessage): Message => Message.GotRestMessage({ message }),
})
const parentSubscriptions = { workTicks: work.ticks, restTicks: rest.ticks }

// 4. view: one h.submodel per placement
const parentView = (model: Model, h: HtmlBuilder<Message>) =>
  h.div(
    [],
    [
      h.submodel({
        slotId: 'work',
        model: model.work,
        view,
        toParentMessage: message => Message.GotWorkMessage({ message }),
      }),
      h.submodel({
        slotId: 'rest',
        model: model.rest,
        view,
        toParentMessage: message => Message.GotRestMessage({ message }),
      }),
    ],
  )
```

Every line is correct, and nothing checks that it is complete. Leave out the
`rest` lift and the page still compiles; the rest timer's button toggles, but
the timer never counts. Both lifts produce a key `ticks`, so they have to be
renamed before they can share one record.

### Placed as a Bundle

`Bundle.make` collects the same child's parts into one value:

```ts
import { Bundle } from 'foldkit-bundle'

const Timer = Bundle.make('Timer', {
  Model: TimerModel,
  Message: TimerMessage,
  init,
  update,
  subscriptions: () => subscriptions,
  view,
})
```

The parent places it twice and wires the assembly once:

```ts
const Page = Bundle.compose({}).pipe(
  Bundle.withChild('work', Timer),
  Bundle.withChild('rest', Timer),
)
type Model = typeof Page.Model.Type
type Message = typeof Page.Message.Type
const { children, placements } = Page

const config = placements.complete({
  init: () => placements.initial({}),
  update: placements.update(),
  subscriptions: placements.subscriptions(),
  view: (model: Model, h: HtmlBuilder<Message>) =>
    h.div([], [children.work.view(model, h), children.rest.view(model, h)]),
})
```

`Bundle.compose` derives the same parent the hand-wired version declared: the
fields `work` and `rest`, and the Message with `GotWorkMessage` and
`GotRestMessage`. Each placement is still the Submodel above:
`children.work.view` draws it with `h.submodel`, `placements.update` folds it
with Foldkit's fold, and `placements.subscriptions` lifts its `ticks` under
the key `Timer@work/ticks`. The difference is that you did not write any of
it, so none of it can be left out.

## What it does not change

- **State and transitions.** `model.work` is an ordinary field, and a
  `GotWorkMessage` goes through the parent's `update` like any other Message.
  The package's parity test runs one Message script through a placement and
  through the same child wired by hand with Foldkit's lifts, and requires the
  same Models, Command Messages and Subscription dependencies at every step
  ([`test/parity.test.ts`](../packages/bundle/test/parity.test.ts)).
- **Tooling.** DevTools, replay and Scene tests see a placement as the
  Submodel it compiles to: `Update.foldChildStep` for update,
  `Update.foldChildInit` for init, `Subscription.lift`, `ManagedResource.lift`
  and `h.submodel`.
- **What it costs.** One more package and one more concept. For a child used
  once, with nothing to forget, the hand wiring is short and plain, and
  that is fine (below).

## When to use which

| Situation | Use |
| --- | --- |
| A child placed two or more times, or published for others | a Bundle |
| A child with Subscriptions or resources that are easy to forget to lift | a Bundle, checked by `placements.complete` |
| A one-off child in a single place, such as one `@foldkit/ui` component | a hand-wired Submodel |
| Something with no Model of its own: a one-shot effect, a DOM attachment | a Command or a Mount, neither |

There is a middle path for the one-off case. A `Link` names where a child
lives (`read`, `write`, `toParentMessage`), and spreads straight into
`Update.foldChild`; `Link.child` yields the fold and the `h.submodel` drawing
from one statement. A page of a dozen `@foldkit/ui` components is usually
wired that way, without a Bundle each. See
[A Link without a Bundle](../packages/bundle/README.md#a-link-without-a-bundle-updatefoldchild).

An existing Submodel does not have to be rewritten to become a Bundle.
`Bundle.fromParts` takes a component's `Model`, `Message`, `init` and its
`{ update, view }` pair as they are, which is how `@foldkit/ui` components
are placed ([`Bundle.fromParts`](../packages/bundle/README.md#components-with-separate-parts-bundlefromparts)).

## Limits

- **Managed Resources are provided by tag.** Two placements of one bundle that
  use the same resource tag would replace each other, so `assemble` refuses
  them; make such a bundle from a function that takes the tag.
- **Collections cannot hold resources,** for the same reason.

Both limits come from the runtime, not from Bundles: a hand-wired Submodel
placed twice with the same tag has the same problem, without the startup
error.

## See also

- [`foldkit-bundle`](../packages/bundle/README.md): the full API, from one
  placement to collections, wiring and lazy bodies.
- [Surface and Bundle](./surface-vs-bundles.md): a Bundle owns transitions; a
  Surface observes state owned elsewhere.
