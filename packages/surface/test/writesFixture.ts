/**
 * One application for the `Writes` tests: a Model with a nested struct, a
 * Message per kind of write, and a Surface per kind of read.
 */
import { Result, Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { Num, Transition } from '@doeixd/metakit'
import * as Machine from '@doeixd/metakit/machine'
import { Projection, Surface } from '../src/index.js'
import { Writes } from '../src/writes.js'

const Account = Schema.Struct({ balance: Schema.Number, owner: Schema.String })

export const Model = Schema.Struct({
  title: Schema.String,
  count: Schema.Number,
  account: Account,
  note: Schema.String,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  Renamed: { title: Schema.String },
  Counted: {},
  Deposited: { amount: Schema.Number },
  Moved: { account: Account },
  Pinged: {},
  // No transition is declared for it: nothing is known of what it writes.
  Noted: { note: Schema.String },
  // No transition either, and its update changes nothing.
  Ignored: {},
  // Declared to write `count`, and its update writes `title` as well.
  Sneaked: {},
})
export type Message = typeof Message.Type

export const initial: Model = {
  title: 'Untitled',
  count: 0,
  account: { balance: 0, owner: 'ada' },
  note: '',
}

export const App = Surface.application({ Model, Message })

export const transitions = {
  Renamed: Transition.make({
    state: Model,
    input: Message.Renamed,
    apply: ({ state, input }) => [Transition.set(state.title, input.title)],
  }),
  Counted: Transition.make({
    state: Model,
    input: Message.Counted,
    apply: ({ state }) => [Transition.set(state.count, Num.add(state.count, 1))],
  }),
  // Writes below `account`: a field of it.
  Deposited: Transition.make({
    state: Model,
    input: Message.Deposited,
    apply: ({ state, input }) => [
      Transition.set(state.account.balance, Num.add(state.account.balance, input.amount)),
    ],
  }),
  // Writes `account` whole, which is above `account.owner`.
  Moved: Transition.make({
    state: Model,
    input: Message.Moved,
    apply: ({ state, input }) => [Transition.set(state.account, input.account)],
  }),
  Pinged: Transition.make({ state: Model, input: Message.Pinged, apply: () => [] }),
  Sneaked: Transition.make({
    state: Model,
    input: Message.Sneaked,
    apply: ({ state }) => [Transition.set(state.count, Num.add(state.count, 1))],
  }),
}

export const Declared = Machine.make({ state: Model, transitions })

const run = <Input>(
  transition: Transition.Transition<Model, Input>,
  model: Model,
  input: Input,
): Model => Result.getOrElse(Transition.run(transition, model, input), () => model)

/** Each declared Message runs its transition; `Sneaked` writes more than it declares. */
export const update = (model: Model, message: Message): { readonly model: Model } => ({
  model: Message.match(message, {
    Renamed: renamed => run(transitions.Renamed, model, renamed),
    Counted: counted => run(transitions.Counted, model, counted),
    Deposited: deposited => run(transitions.Deposited, model, deposited),
    Moved: moved => run(transitions.Moved, model, moved),
    Pinged: pinged => run(transitions.Pinged, model, pinged),
    Noted: ({ note }) => modifyFields(model, { note: () => note }),
    Ignored: () => model,
    Sneaked: sneaked =>
      modifyFields(run(transitions.Sneaked, model, sneaked), { title: () => 'sneaked' }),
  }),
})

export const Header = App.surface('Header', {
  model: ({ model }) => ({ title: model.title }),
  messages: [Message.Renamed],
  closed: true,
})
export const Tally = App.surface('Tally', {
  model: ({ model }) => ({ count: model.count }),
  messages: [Message.Counted, Message.Sneaked],
})
/** Reads `account` whole. */
export const AccountPanel = App.surface('AccountPanel', {
  model: ({ model }) => ({ account: model.account }),
})
/** Reads one field of `account`. */
export const Owner = App.surface('Owner', {
  model: ({ model }) => ({ owner: model.account.owner }),
})
/** Reads through a function that names no path. */
export const Loose = App.surface('Loose', {
  model: () => Projection.fromReader(Schema.String, (model: Model) => model.note),
})

/** How often each Surface's renderer ran. */
export type Draws = Map<string, number>

/**
 * The application's parts made afresh: the writes hold which Model is the
 * current one, so each test has its own. `skip: false` draws with
 * `Surface.rootView`, which keeps nothing.
 */
export const make = (
  options: { readonly skip?: boolean } = {},
): {
  readonly writes: Writes<Model, Message, keyof typeof transitions>
  readonly draws: Draws
  readonly view: (model: Model, h: HtmlBuilder<Message>) => Html
} => {
  const writes = Writes.of(App, Declared)
  const draws: Draws = new Map()
  const drawn = (name: string): number => {
    const next = (draws.get(name) ?? 0) + 1
    draws.set(name, next)
    return next
  }
  const rootView: typeof writes.rootView =
    options.skip === false ? Surface.rootView : writes.rootView
  // Each drawing says which one it is, so a kept one is told from a new one on the page.
  const header = rootView(Header, undefined, (model, h) =>
    h.h1([h.Id('header'), h.DataAttribute('drawn', String(drawn('Header')))], [model.title]),
  )
  const tally = rootView(Tally, undefined, (model, h) =>
    h.button(
      [
        h.Id('tally'),
        h.DataAttribute('drawn', String(drawn('Tally'))),
        h.OnClick(Message.Counted()),
      ],
      [String(model.count)],
    ),
  )
  const account = rootView(AccountPanel, undefined, (model, h) => {
    drawn('AccountPanel')
    return h.p([h.Id('account')], [`${model.account.owner}: ${model.account.balance}`])
  })
  const owner = rootView(Owner, undefined, (model, h) => {
    drawn('Owner')
    return h.p([h.Id('owner')], [model.owner])
  })
  const loose = rootView(Loose, undefined, (note, h) => {
    drawn('Loose')
    return h.p([h.Id('loose')], [note])
  })
  const view = (model: Model, h: HtmlBuilder<Message>): Html =>
    h.main(
      [],
      [header(model, h), tally(model, h), account(model, h), owner(model, h), loose(model, h)],
    )
  return { writes, draws, view }
}
