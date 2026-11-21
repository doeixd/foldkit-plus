# Draw only the parts of a page a Message can change

In a [Foldkit](https://foldkit.dev/) application every event (a click, a key, a server's answer) is a Message. Your `update` function turns the Model, which is the application's state, and a Message into the next Model, and your view function then builds the whole page from it. So a key typed in a search box builds the header, the sidebar and twenty panels again, and Foldkit compares each with what is on the page to find that nothing changed. On a page with many parts, most of that work is for parts the Message never touched.

If you say which fields of the Model each Message writes, and which fields each part of the page reads, the two can be matched once, ahead of time. A Message then draws only the parts that read something it writes. A "drawing" here is one run of a part's view function.

`foldkit-surface` already has the reads: a **Surface** names a part of the page and the Model fields it reads ([its README](../packages/surface/README.md) starts from nothing). `foldkit-surface/writes` adds the writes and joins the two. The test [`packages/surface/test/writes.test.ts`](../packages/surface/test/writes.test.ts) runs five Surfaces through fifty Messages in a running Foldkit application and counts the drawings.

```bash
pnpm add foldkit-surface metakit
```

## Keep a Surface's drawing until a Message writes what it reads

This page has a title and a counter. The blocks below are one file. The first is an application as you would already have it: a Model, two Messages, and a Surface with a view function (a renderer) for each part. `App.surface`'s `model` picks the fields the part reads.

```ts
import { Result, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Surface, type Renderer } from 'foldkit-surface'

const Model = Schema.Struct({ title: Schema.String, count: Schema.Number })
type Model = typeof Model.Type
const Message = defineMessageUnion({ Renamed: { title: Schema.String }, Counted: {} })
type Message = typeof Message.Type
const App = Surface.application({ Model, Message })

const Header = App.surface('Header', { model: ({ model }) => ({ title: model.title }) })
const Tally = App.surface('Tally', { model: ({ model }) => ({ count: model.count }) })
const drawHeader: Renderer<{ readonly title: string }, never> = (model, h) =>
  h.h1([], [model.title])
const drawTally: Renderer<{ readonly count: number }, never> = (model, h) =>
  h.p([], [String(model.count)])
```

Now declare what each Message writes. A **Transition**, from the `metakit` package, is a Message's change written as data: `Transition.set(state.count, …)` says "this sets `count`", and the path is checked against the Model's Schema. A **Machine** is a record of Transitions, one under each Message's name.

```ts
import { Num, Transition } from 'metakit'
import * as Machine from 'metakit/machine'
import { Writes } from 'foldkit-surface/writes'

const Renamed = Transition.make({
  state: Model,
  input: Message.Renamed,
  apply: ({ state, input }) => [Transition.set(state.title, input.title)],
})
const Counted = Transition.make({
  state: Model,
  input: Message.Counted,
  apply: ({ state }) => [Transition.set(state.count, Num.add(state.count, 1))],
})
const writes = Writes.of(App, Machine.make({ state: Model, transitions: { Renamed, Counted } }))

const header = writes.rootView(Header, undefined, drawHeader)
const tally = writes.rootView(Tally, undefined, drawTally)

const run = <Input>(transition: Transition.Transition<Model, Input>, model: Model, input: Input) =>
  Result.getOrElse(Transition.run(transition, model, input), () => model)
const appUpdate = (model: Model, message: Message) => ({
  model: Message.match(message, {
    Renamed: renamed => run(Renamed, model, renamed),
    Counted: counted => run(Counted, model, counted),
  }),
})
const update = writes.track(appUpdate)

writes.regions().map(region => [region.name, region.redrawnBy])
// [['Header', ['Renamed']], ['Tally', ['Counted']]]
```

What happened:

- `Writes.of(App, machine)` reads each Transition's writes. A Transition under a name that is not one of the application's Messages does not compile; from plain JavaScript, `Writes.of` throws.
- `writes.rootView(Header, undefined, drawHeader)` makes the header's view; `undefined` is for a Surface that takes no params. It takes what `Surface.rootView` takes and gives the same view. `Header` reads `title`, and of the two Transitions only `Renamed` sets `title`. That match is made here, once.
- Your application's view calls `header(model, h)` and `tally(model, h)` with the Model and the builder `h` Foldkit hands it, as it would without `writes`.
- `writes.track(appUpdate)` is the `update` you give Foldkit. It notes which Message made each Model. After a `Counted`, `header` hands Foldkit the drawing it made last time: the header's fields are not read from the Model, `drawHeader` does not run, and Foldkit skips comparing the header with the page. What that costs instead is a counter raised for each view a Message reaches, and two numbers compared per view.
- `writes.regions()` lists the result, so you can see which Messages draw each Surface again.

In the counting test, fifty `Counted` Messages draw the five Surfaces 105 times with `writes` and 255 times without. The header, drawn once, is the same DOM element with no change recorded on it ([`writes.browser.test.ts`](../packages/surface/test/writes.browser.test.ts)).

## What still draws every time

A drawing is kept only when it is known that nothing it reads was written. Everything else is drawn again:

- **A Message with no Transition.** A Machine may hold Transitions for three of your forty Messages. Each of the other thirty-seven draws every Surface, as it does today, and the next declared Message keeps drawings again.
- **A Model `track` did not see made.** The first Model, one your application installs from storage or a server render, or one from an `update` you did not wrap draws every Surface once. Wrap the outermost `update`, once.
- **A Surface that reads through a function.** A Surface whose `model` reads with `Projection.fromReader`, or picks a field with `true` in `Projection.of`, names no Model field. Every Message that changes the Model draws such a Surface.
- **A Surface that shows server data through a `foldkit-remote` read.** Such a read does name the field its store sits in, but the store also changes with Remote's own Messages and with any of yours that starts a write, so the field's name is not trusted: every Message that changes the Model draws the Surface, and a panel of server rows is drawn as often as before. This covers a Surface whose `model` holds the read itself (`Data.get`, `Data.query`). A value you derive from one with `Projection.derive`, or a plain reference to the store's field, is matched by that field like any other, so a Message of yours that has a Transition and also writes the store must declare it.
- **A page rendered on a server, and a view called outside a running application** (in a unit test), where no drawing can be kept.

Fields inside a struct match by where they sit. Say the Model has `account: { owner, balance }`. A Message that sets `account` draws a Surface that reads `account.owner`, and one that sets `account.owner` draws a Surface that reads `account`. A Message that sets `account.balance` does not draw the Surface that reads `account.owner`.

Three rules for the views themselves:

- A renderer reads only the Model it is given. If it also reads a variable from outside, that variable can change with no Message declared to write it, and the old drawing stays.
- Each view from `writes.rootView` stands at one place on the page. For the same Surface in two places, call `writes.rootView` twice.
- Call `writes.rootView` once, at the top of a module, as above. A view made inside another view is new on every render and keeps nothing.

## The header shows an old title

A part of the page that shows an old value kept a drawing it should not have. The usual cause is a wrong declaration: a Message changed a field its Transition does not list. (The other cause is a renderer that reads something besides its Model; see the rules above.) Nothing reports a wrong declaration in production, so in development check every Message:

<!-- docs-check
declare global {
  interface ImportMeta {
    readonly env?: { readonly DEV?: boolean }
  }
}
-->

```ts
import { WritesCheck } from 'foldkit-surface/writes'

const checkedUpdate = writes.track(
  import.meta.env?.DEV === true
    ? WritesCheck.verify(writes, appUpdate, { surfaces: [Header, Tally] })
    : appUpdate,
)
```

`WritesCheck.verify` compares the Model before and after each Message with the writes its Transition declares. For a `Counted` that also set the title it throws:

```text
[foldkit-surface] "Counted" changed title, and its transition declares it writes count. A view kept on the declared writes would show its last drawing: declare the write, or stop making it.
```

A struct rebuilt with the fields it had is not a change, and a change is named by the deepest path that differs (`account.owner`, not `account`). Messages with no Transition have nothing to be compared with.

`surfaces` adds a second check. A Surface declared `closed: true` promises that only the Messages in its `messages` list change what it shows; `verify` reports any other Message that does.

Options:

- `report` decides what happens to a finding. Left out, it is `WritesCheck.fail`, which throws, so a test that sends the Message fails. Pass `WritesCheck.warn` to log a warning and carry on, which suits a running development server. Pass your own function to send findings elsewhere.
- `surfaces` is the list of Surfaces to hold to their `closed` promise. Left out, only the declared writes are checked.

The check walks the Model on every Message, so keep it behind `import.meta.env?.DEV === true` as above. A production build then leaves the check's code out of the page.

## Next

- What a Surface, a Projection and `closed` are: [`foldkit-surface`](../packages/surface/README.md).
- What else a Transition gives you (guards, proofs, SQL): [`metakit`](../packages/metakit/README.md).
- Keep part of a single view on the values it reads, with no declared writes: `SlotView.region` in [`foldkit-mixins`](../packages/mixins/README.md).
