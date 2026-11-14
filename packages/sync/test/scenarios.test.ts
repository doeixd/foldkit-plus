/**
 * The guide's cap on a document, as Message scenarios: a history of Messages
 * applied from `initial`, one more, and what the Model reads and the
 * document's law says of the step (#538).
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { Scenario } from 'foldkit-remote/testing'
import { MessageSet, Projection, Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Sync, documentId } from '../src/index.js'

const Todo = Schema.Struct({ id: Schema.String, title: Schema.String })
const Model = Schema.Struct({ todos: Schema.Array(Todo), filter: Schema.String })
type Model = typeof Model.Type
const Message = defineMessageUnion({
  CreatedTodo: { id: Schema.String, title: Schema.String },
  ChangedFilter: { filter: Schema.String },
})
type Message = typeof Message.Type

const update = (model: Model, message: Message): Update.Return<Model, Message> =>
  Message.match<Update.Return<Model, Message>>(message, {
    CreatedTodo: ({ id, title }) => ({
      model: { ...model, todos: [...model.todos, { id, title }] },
    }),
    ChangedFilter: ({ filter }) => ({ model: { ...model, filter } }),
  })
const App = Surface.application({ Model, Message, initial: { todos: [], filter: '' }, update })
const shared = Projection.pick(App.model.todos)

const Capped = Sync.forApplication(App)
  .withPrincipal<string>()
  .make({
    documentId: documentId('todos-capped'),
    shared,
    durable: MessageSet.make(App, [Message.CreatedTodo]),
    laws: {
      atMost3Todos: {
        holds: ({ after }) => after.todos.length <= 3,
        message: 'A list holds 3 todos',
        path: ['todos'],
      },
    },
  })

const options = {
  app: App,
  readers: { todos: (model: Model) => model.todos.length, filter: (model: Model) => model.filter },
  // The contract judges the shared slice, which the Model projects.
  judge: (before: Model, after: Model) => Capped.judge(shared.get(before), shared.get(after)),
  evidence: { transition: 'durable:CreatedTodo', laws: ['sync:todos-capped.atMost3Todos'] },
}

const created = (n: number) =>
  Array.from({ length: n }, (_, index) => Message.CreatedTodo({ id: `t${index}`, title: 'chore' }))

describe('the cap on a document, as Message scenarios', () => {
  it('a third todo reads three and breaks no law, which is evidence for the durable Message', () => {
    const result = Scenario.runMessages(
      Scenario.messages<Message>({
        name: 'a third todo',
        given: created(2),
        when: Message.CreatedTodo({ id: 'last', title: 'chore' }),
        expect: Scenario.reads('todos', 3),
      }),
      options,
    )
    expect(result.mismatches).toEqual([])
    expect(result.evidence.map(({ _tag }) => _tag)).toEqual(['Scenario'])
  })

  it('a fourth todo breaks the cap, by its id', () => {
    const result = Scenario.runMessages(
      Scenario.messages<Message>({
        name: 'a fourth todo',
        given: created(3),
        when: Message.CreatedTodo({ id: 'over', title: 'chore' }),
        expect: Scenario.breaks('atMost3Todos'),
      }),
      options,
    )
    expect(result.mismatches).toEqual([])
    expect(result.evidence).toEqual([])
  })

  it('a Message outside the shared slice leaves the cap alone, whatever the list holds', () => {
    const result = Scenario.runMessages(
      Scenario.messages<Message>({
        name: 'a filter beside a full list',
        given: created(3),
        when: Message.ChangedFilter({ filter: 'done' }),
        expect: Scenario.reads('filter', 'done'),
      }),
      options,
    )
    expect(result.mismatches).toEqual([])
  })

  it('a fourth todo expected to read four is a mismatch on the law', () => {
    const result = Scenario.runMessages(
      Scenario.messages<Message>({
        name: 'a fourth todo, expected to land',
        given: created(3),
        when: Message.CreatedTodo({ id: 'over', title: 'chore' }),
        expect: Scenario.reads('todos', 4),
      }),
      options,
    )
    expect(result.mismatches).toEqual([
      {
        backend: 'messages',
        step: 'law',
        expected: 'none',
        actual: 'atMost3Todos',
      },
    ])
  })
})
