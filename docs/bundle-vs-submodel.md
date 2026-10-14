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

A hand-wired parent encodes what the child is today. Suppose the media-query
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

In the example below, the second placement (`narrow`) costs about fifteen
lines by hand: a field, a wrapper, its init and Command mapping, a fold, a
route in `update`, a Subscription lift and a renamed key. Each repeats the
field name, and the usual way to write them is to copy the first placement
and rename. Miss one rename, say `read: model => Option.some(model.dark)` in
the `narrow` fold, and it compiles, because both fields hold the same type;
the narrow child is then updated from the dark child's state.

With a Bundle the second placement is one `Bundle.withChild('narrow', …)`
line. The field name is written once, and the Model field, the wrapper, the
fold, the lifts and the Subscription keys (`MediaQuery@narrow/changes`) are
all derived from it. `Bundle.withEach` does the same for a record of children,
one per key.

### Configuration and outputs cannot be left out

A child's configuration (`args`) is a Schema, and every placement must supply
it when `init` takes it. A child with an OutMessage must be placed with an
`onOut`, so its outputs cannot be dropped by forgetting to handle them.

## One child, placed twice

A media-query child, placed for dark mode and for a narrow screen.
`matchMediaChanges` stands for your own `Stream<boolean>` over `matchMedia`.

### By hand

The child is plain Foldkit: a Model, a Message, `init`, `update` and
Subscriptions.

```ts
import { Option, Schema, Stream } from 'effect'
import * as Command from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import * as Update from 'foldkit/update'

const MediaQueryModel = Schema.Struct({ matches: Schema.Boolean })
type MediaQueryModel = typeof MediaQueryModel.Type
const MediaQueryMessage = defineMessageUnion({ Changed: { matches: Schema.Boolean } })
type MediaQueryMessage = typeof MediaQueryMessage.Type

const initMediaQuery = (): Update.Return<MediaQueryModel, MediaQueryMessage> => ({
  model: { matches: false },
})
const updateMediaQuery = (
  _model: MediaQueryModel,
  message: MediaQueryMessage,
): Update.Return<MediaQueryModel, MediaQueryMessage> => ({ model: { matches: message.matches } })
const mediaQuerySubscriptions = (query: string) =>
  Subscription.make<MediaQueryModel, MediaQueryMessage>()(() => ({
    changes: Subscription.persistentEntry(
      Stream.map(matchMediaChanges(query), matches => MediaQueryMessage.Changed({ matches })),
    ),
  }))
```

The parent declares a field and a wrapper per placement, then wires each one
three times:

```ts
const Model = Schema.Struct({
  dark: MediaQueryModel,
  narrow: MediaQueryModel,
  helpOpen: Schema.Boolean,
})
type Model = typeof Model.Type
const Message = defineMessageUnion({
  GotDarkMessage: { message: MediaQueryMessage },
  GotNarrowMessage: { message: MediaQueryMessage },
  ClickedHelp: {},
})
type Message = typeof Message.Type

// 1. init: each child's Model, and its Commands lifted
const init = (): Update.Return<Model, Message> => {
  const dark = initMediaQuery()
  const narrow = initMediaQuery()
  return {
    model: { dark: dark.model, narrow: narrow.model, helpOpen: false },
    commands: [
      ...Command.mapMessages(dark.commands, message => Message.GotDarkMessage({ message })),
      ...Command.mapMessages(narrow.commands, message => Message.GotNarrowMessage({ message })),
    ],
  }
}

// 2. update: one fold per placement, and a route to each
const foldDark = Update.foldChild({
  update: updateMediaQuery,
  read: (model: Model) => Option.some(model.dark),
  write: (model: Model, dark: MediaQueryModel) => ({ ...model, dark }),
  toParentMessage: (message: MediaQueryMessage): Message => Message.GotDarkMessage({ message }),
})
const foldNarrow = Update.foldChild({
  update: updateMediaQuery,
  read: (model: Model) => Option.some(model.narrow),
  write: (model: Model, narrow: MediaQueryModel) => ({ ...model, narrow }),
  toParentMessage: (message: MediaQueryMessage): Message => Message.GotNarrowMessage({ message }),
})
const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    GotDarkMessage: ({ message }) => foldDark(model, message),
    GotNarrowMessage: ({ message }) => foldNarrow(model, message),
    ClickedHelp: () => ({ model: { ...model, helpOpen: !model.helpOpen } }),
  })

// 3. subscriptions: one lift per placement, renamed so the keys do not collide
const dark = Subscription.lift(mediaQuerySubscriptions('(prefers-color-scheme: dark)'))({
  read: (model: Model) => Option.some(model.dark),
  toParentMessage: (message: MediaQueryMessage): Message => Message.GotDarkMessage({ message }),
})
const narrow = Subscription.lift(mediaQuerySubscriptions('(max-width: 40rem)'))({
  read: (model: Model) => Option.some(model.narrow),
  toParentMessage: (message: MediaQueryMessage): Message => Message.GotNarrowMessage({ message }),
})
const subscriptions = { darkChanges: dark.changes, narrowChanges: narrow.changes }
```

Every line is correct, and nothing checks that it is complete. Drop the
`narrow` lift and the page compiles and never learns the screen is narrow.
Both lifts produce a key `changes`, so they have to be renamed before they
can share one record.

### With a Bundle

The child's parts go into one value, with its configuration (`query`) as a
Schema:

```ts
import type { HtmlBuilder } from 'foldkit/html'
import { Bundle } from 'foldkit-bundle'

const MediaQuery = Bundle.make('MediaQuery', {
  Model: MediaQueryModel,
  Message: MediaQueryMessage,
  args: Schema.Struct({ query: Schema.String }),
  init: () => ({ model: { matches: false } }),
  update: (_model, message) => ({ model: { matches: message.matches } }),
  subscriptions: ({ query }) =>
    Subscription.make<MediaQueryModel, MediaQueryMessage>()(() => ({
      changes: Subscription.persistentEntry(
        Stream.map(matchMediaChanges(query), matches => MediaQueryMessage.Changed({ matches })),
      ),
    })),
})
```

The parent places it twice and wires the assembly once:

```ts
const Page = Bundle.compose({ helpOpen: Schema.Boolean }).pipe(
  Bundle.withMessages({ ClickedHelp: {} }),
  Bundle.withChild('dark', MediaQuery, { args: { query: '(prefers-color-scheme: dark)' } }),
  Bundle.withChild('narrow', MediaQuery, { args: { query: '(max-width: 40rem)' } }),
)
type Model = typeof Page.Model.Type
type Message = typeof Page.Message.Type
const { placements } = Page

const config = placements.complete({
  init: () => placements.initial({ helpOpen: false }),
  update: placements.update(model => ({ model: { ...model, helpOpen: !model.helpOpen } })),
  subscriptions: placements.subscriptions(),
  view: (model: Model, h: HtmlBuilder<Message>) =>
    h.button([h.OnClick(Page.Message.ClickedHelp())], [model.dark.matches ? 'Help (dark)' : 'Help']),
})
```

`Bundle.compose` derives the same parent the hand-wired version declared: the
fields `dark`, `narrow` and `helpOpen`, and the Message with `GotDarkMessage`,
`GotNarrowMessage` and `ClickedHelp`. The parent's own `update` sees only
`ClickedHelp`; the assembly routes each wrapper to its placement.

## What it does not change

- **State and transitions.** `model.dark` is an ordinary field, and a
  `GotDarkMessage` goes through the parent's `update` like any other Message.
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
