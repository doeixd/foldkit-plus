// @vitest-environment node
/**
 * An agent's capability gated by the `may` the server answered: offered and
 * allowed where the row lets the principal, refused before dispatch where it
 * does not, or where there is no answer yet.
 */
import { Effect, Option, Record, Schema } from 'effect'
import { Agent } from 'foldkit-agent'
import { RemoteData } from 'foldkit-remote'
import { Projection, Surface } from 'foldkit-surface'
import { defineMessageUnion } from 'foldkit/message'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { GuardAgent } from '../src/agent.js'
import { Guards, Interaction, MaySchema, type MayAnswer } from '../src/index.js'

const User = Schema.Struct({ id: Schema.String })
const G = Guards.declare('Todos', User, guard => ({ isAdmin: guard.principal() }), {
  key: user => user.id,
})
const Archive = Interaction.make('Archive')

const Row = RemoteData.schema(Schema.Struct({ may: MaySchema }))
type Row = typeof Row.Type
const Model = Schema.Struct({ todos: Schema.Record(Schema.String, Row), selected: Schema.String })
type Model = typeof Model.Type

const may = (archive: boolean, reason?: string): MayAnswer => ({
  row: { Update: true, Delete: false, Archive: archive },
  reasons: reason === undefined ? {} : { Archive: reason },
  members: {},
  relations: {},
})
const ready = (archive: boolean): Row => ({ _tag: 'Ready', value: { may: may(archive) } })

const Message = defineMessageUnion({ RequestedArchive: { id: Schema.String } })
const App = Surface.application({ Model, Message })

// The principal is the one the server reads: an Option of the guard set's.
const TodoAgent = Agent.forApplication(App).withPrincipal(G.Principal)

const rowOf = (model: Model, id: string) =>
  Option.getOrElse(Record.get(model.todos, id), (): typeof Row.Type => ({ _tag: 'Initial' }))

const bound = (model: Model) => {
  const dispatched: Array<typeof Message.Type> = []
  const runtime = Agent.bind({
    definition: TodoAgent.make({
      context: Projection.fromReader(Schema.Struct({}), () => ({})),
      messages: TodoAgent.expose(Message, {
        RequestedArchive: {
          description: 'Archive a todo',
          authorize: GuardAgent.authorize(Archive.key, ({ input, model }) => {
            expectTypeOf(input.id).toEqualTypeOf<string>()
            // The id is the agent's: read it as an own key, never off Object's prototype.
            return rowOf(model, input.id)
          }),
          available: GuardAgent.available(Archive.key, (model: Model) =>
            rowOf(model, model.selected),
          ),
        },
      }),
    }),
    host: {
      model: () => model,
      principal: () => Option.some({ id: 'ada' }),
      dispatch: (message: typeof Message.Type) => {
        dispatched.push(message)
      },
    },
  })
  const archive = (id: string) =>
    Effect.runSync(
      Effect.result(
        runtime.messages.dispatch('requested_archive', { id }, { id: 'i', transport: 'webmcp' }),
      ),
    )
  const offered = () => Effect.runSync(runtime.messages.available).map(each => each.name)
  return { dispatched, archive, offered }
}

describe('GuardAgent', () => {
  it('lets the agent do what the row lets its principal, and refuses the rest before dispatch', () => {
    const { dispatched, archive } = bound({
      todos: {
        t1: ready(true),
        t2: ready(false),
        t4: { _tag: 'Ready', value: { may: may(false, 'Only its owner may archive it.') } },
        // Being read again: the answer it has is still the answer.
        t3: { _tag: 'Refreshing', value: { may: may(true) } },
      },
      selected: 't1',
    })
    expect(archive('t1')._tag).toBe('Success')
    expect(archive('t3')._tag).toBe('Success')
    expect(archive('t2')).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'AgentAuthorizationError' },
    })
    // A refusal its rule explained says why.
    expect(archive('t4')).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'AgentAuthorizationError', message: 'Only its owner may archive it.' },
    })
    expect(dispatched).toEqual([
      Message.RequestedArchive({ id: 't1' }),
      Message.RequestedArchive({ id: 't3' }),
    ])
  })

  it('refuses where there is no answer: not read yet, or a read that failed', () => {
    const { dispatched, archive } = bound({
      todos: {
        t1: { _tag: 'Loading' },
        t2: {
          _tag: 'Failed',
          error: { _tag: 'RemoteReadError', message: 'offline' },
          previous: { may: may(true) },
        },
        // Offered, so a refusal is the row's to make.
        t3: ready(true),
      },
      selected: 't3',
    })
    const refused = { _tag: 'Failure', failure: { _tag: 'AgentAuthorizationError' } }
    expect(archive('t1')).toMatchObject(refused)
    expect(archive('t2')).toMatchObject(refused)
    expect(dispatched).toEqual([])
  })

  it('offers the capability only while the row the Model names allows it', () => {
    expect(bound({ todos: { t1: ready(true) }, selected: 't1' }).offered()).toEqual([
      'requested_archive',
    ])
    expect(bound({ todos: { t1: ready(false) }, selected: 't1' }).offered()).toEqual([])
    expect(bound({ todos: {}, selected: 't1' }).offered()).toEqual([])
  })
})
