/**
 * A todo list whose form works without scripts: Phase E's application. Adding
 * a todo runs a Command that needs a service, whose Message `update` folds
 * back in, so the server's loop is the runtime's.
 */
import { Context, Effect, Layer, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Projection, Surface } from 'foldkit-surface'
import { Resume, SSR } from 'foldkit-ssr'

export const Model = Schema.Struct({
  draft: Schema.String,
  todos: Schema.Array(Schema.String),
  noted: Schema.Number,
  booted: Schema.Boolean,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  Typed: { value: Schema.String },
  Added: { title: Schema.String },
  Noted: { count: Schema.Number },
  Booted: {},
  Cleared: {},
  Pinged: {},
  Polled: {},
})
export type Message = typeof Message.Type

/** A service only the server's `resources` provide. */
export class Counter extends Context.Service<Counter, { readonly count: (of: number) => number }>()(
  'Counter',
) {}

export const initial: Model = { draft: '', todos: [], noted: 0, booted: false }
export const App = Surface.application({ Model, Message, initial, update: model => ({ model }) })

export const Todos = App.surface('Todos', {
  model: ({ model }) => ({ draft: model.draft, todos: model.todos, noted: model.noted }),
  messages: [
    Message.Typed,
    Message.Added,
    Message.Noted,
    Message.Booted,
    Message.Pinged,
    Message.Polled,
  ],
})

const note = (of: number) => ({
  name: 'Note',
  effect: Effect.gen(function* () {
    const counter = yield* Counter
    return Message.Noted({ count: counter.count(of) })
  }),
})

const booted = { name: 'Booted', effect: Effect.succeed(Message.Booted()) }

/** Fired and forgotten: it yields no Message. */
const ping = { name: 'Ping', effect: Effect.void }

/** Schedules itself again, as a poll does: fine in the browser, endless on the server. */
const poll = { name: 'Poll', effect: Effect.succeed(Message.Polled()) }

export const config = {
  Model,
  init: () => ({ model: { ...initial, todos: ['Served'] } }),
  update: (model: Model, message: Message) =>
    Message.match(message, {
      Typed: ({ value }) => ({ model: { ...model, draft: value } }),
      Added: ({ title }) => ({
        model: { ...model, draft: '', todos: [...model.todos, title] },
        commands: [note(model.todos.length + 1)],
      }),
      Noted: ({ count }) => ({ model: { ...model, noted: count } }),
      Booted: () => ({ model: { ...model, booted: true } }),
      Cleared: () => ({ model: { ...model, todos: [] } }),
      Pinged: () => ({ model, commands: [ping] }),
      Polled: () => ({ model, commands: [poll] }),
    }),
  view: (model: Model, h: HtmlBuilder<Message>) => {
    const rh = Resume.builder(h)
    return {
      title: 'Todos',
      body: rh.main(
        [],
        [
          rh.form(
            [rh.Id('add'), rh.OnSubmit(Message.Added({ title: model.draft }))],
            [
              rh.input([rh.Name('title'), rh.Value(model.draft), rh.OnInput(Message.Typed)]),
              rh.button([rh.Type('submit')], ['Add']),
            ],
          ),
          rh.ul(
            [rh.Id('todos')],
            model.todos.map(todo => rh.li([], [todo])),
          ),
          rh.p([rh.Id('noted')], [String(model.noted)]),
          rh.p([rh.Id('booted')], [String(model.booted)]),
        ],
      ),
    }
  },
  container: null,
  resources: Layer.succeed(Counter)({ count: of => of * 10 }),
}

export const plan = SSR.plan(App, {
  id: 'todos',
  state: Projection.pick(App.model.draft, App.model.todos, App.model.noted, App.model.booted),
  surfaces: [Surface.at(Todos, undefined)],
  boot: () => [booted],
  fallback: 'server',
})

export const template =
  '<!doctype html><html><head><title></title></head><body><div id="root"></div></body></html>'
