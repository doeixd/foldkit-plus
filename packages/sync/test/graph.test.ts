/**
 * A document's laws in the Module graph (#537): every durable Message writes
 * the shared slice and every law reads it, so a durable Message added later
 * is `law-unwitnessed` until a walk or a scenario draws it, or a line says
 * the journal's judge is its only evidence.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { Scenario } from 'foldkit-remote/testing'
import {
  Evidence,
  Graph,
  GraphEdge,
  MessageSet,
  Module,
  Projection,
  Surface,
} from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Sync, documentId } from '../src/index.js'

const Todo = Schema.Struct({ id: Schema.String, title: Schema.String })
const Model = Schema.Struct({ todos: Schema.Array(Todo), filter: Schema.String })
type Model = typeof Model.Type
const Message = defineMessageUnion({
  CreatedTodo: { id: Schema.String, title: Schema.String },
  RemovedTodo: { id: Schema.String },
  ImportedTodo: { id: Schema.String, title: Schema.String },
  ChangedFilter: { filter: Schema.String },
})
type Message = typeof Message.Type

const update = (model: Model, message: Message): Update.Return<Model, Message> =>
  Message.match<Update.Return<Model, Message>>(message, {
    CreatedTodo: ({ id, title }) => ({
      model: { ...model, todos: [...model.todos, { id, title }] },
    }),
    ImportedTodo: ({ id, title }) => ({
      model: { ...model, todos: [...model.todos, { id, title }] },
    }),
    RemovedTodo: ({ id }) => ({
      model: { ...model, todos: model.todos.filter(todo => todo.id !== id) },
    }),
    ChangedFilter: ({ filter }) => ({ model: { ...model, filter } }),
  })
const App = Surface.application({ Model, Message, initial: { todos: [], filter: '' }, update })
const shared = Projection.pick(App.model.todos)

const capped = (durable: ReadonlyArray<typeof Message.CreatedTodo | typeof Message.RemovedTodo>) =>
  Sync.forApplication(App)
    .withPrincipal<string>()
    .make({
      documentId: documentId('todos-capped'),
      shared,
      durable: MessageSet.make(App, [...durable]),
      serverOnly: MessageSet.make(App, [Message.ImportedTodo]),
      laws: {
        atMost3Todos: {
          holds: ({ after }) => after.todos.length <= 3,
          message: 'A list holds 3 todos',
          path: ['todos'],
        },
      },
    })

const law = 'sync:todos-capped.atMost3Todos'

/** The cap's scenario of a third todo, whose run issues a `Scenario` record for `CreatedTodo`. */
const createdEvidence = (document: ReturnType<typeof capped>) =>
  Scenario.runMessages(
    Scenario.messages<Message>({
      name: 'a third todo',
      given: [
        Message.CreatedTodo({ id: 't0', title: 'chore' }),
        Message.CreatedTodo({ id: 't1', title: 'chore' }),
      ],
      when: Message.CreatedTodo({ id: 'last', title: 'chore' }),
      expect: Scenario.reads('todos', 3),
    }),
    {
      app: App,
      readers: { todos: (model: Model) => model.todos.length },
      judge: (before: Model, after: Model) => document.judge(shared.get(before), shared.get(after)),
      evidence: { transition: 'durable:CreatedTodo', laws: [law] },
    },
  ).evidence

/** The server-only import is judged by the journal alone, and says so. */
const imported = Evidence.runtimeOnly({
  transition: 'durable:ImportedTodo',
  law,
  why: 'the server appends it through the journal, whose judge refuses a fourth todo',
})

const unwitnessed = (
  findings: ReadonlyArray<{ readonly rule: string; readonly message: string }>,
) => findings.filter(finding => finding.rule === 'law-unwitnessed').map(finding => finding.message)

describe('a capped document in the Module graph', () => {
  it('contributes its law, a transition per durable and server-only tag, and what each reads and writes', () => {
    const document = capped([Message.CreatedTodo])
    const graph = Module.graph(Module.make(App, [document]))
    expect(Graph.breakersOf(graph, law).map(each => [each.transition, each.paths])).toEqual([
      ['durable:CreatedTodo', [['todos']]],
      ['durable:ImportedTodo', [['todos']]],
    ])
    expect(graph.edges.filter(GraphEdge.$is('Reads')).map(edge => ({ ...edge }))).toEqual([
      { _tag: 'Reads', law, space: 'model', path: ['todos'] },
    ])
  })

  it('is clean once each durable Message has evidence', () => {
    const document = capped([Message.CreatedTodo])
    const findings = Module.validate(Module.make(App, [document]), {
      evidence: [...createdEvidence(document), imported],
    })
    expect(findings).toEqual([])
  })

  it('reports a durable Message added with no evidence', () => {
    const document = capped([Message.CreatedTodo, Message.RemovedTodo])
    const findings = Module.validate(Module.make(App, [document]), {
      evidence: [...createdEvidence(document), imported],
    })
    expect(unwitnessed(findings)).toEqual([
      `durable:RemovedTodo writes todos, which ${law} reads, and no evidence shows it keeps ${law}`,
    ])
    expect(findings[0]!.contracts).toEqual(['sync:todos-capped'])
  })

  it('contributes nothing of a document with no laws but its transitions', () => {
    const plain = Sync.forApplication(App).make({
      documentId: documentId('todos'),
      shared,
      durable: MessageSet.make(App, [Message.CreatedTodo]),
    })
    expect(Module.validate(Module.make(App, [plain]))).toEqual([])
  })
})
