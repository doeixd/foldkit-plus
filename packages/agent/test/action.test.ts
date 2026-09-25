/**
 * Agent.action: a foldkit-surface Action exposed as a capability, ending in
 * the Message it makes, with what only an agent needs added beside it.
 */
import { Effect, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Action, Projection } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Agent } from '../src/index.js'
import { Message, emptyModel, type Model } from './todoApp.js'

const Rename = Action.define({
  name: 'rename_todo',
  description: 'Rename a todo',
  input: Schema.Struct({ id: Schema.String }),
  toMessage: ({ id }) => Message.RequestedRenameTodo({ id, title: 'Renamed' }),
})

const bound = (allowed: boolean) => {
  const dispatched: Array<typeof Message.Type> = []
  const runtime = Agent.bind({
    definition: Agent.make({
      context: Projection.fromReader(Schema.Struct({}), (_: Model) => ({})),
      messages: Agent.expose(Message, {
        RequestedRenameTodo: Agent.action(Rename, { authorize: () => allowed }),
      }),
    }),
    host: {
      model: () => emptyModel,
      dispatch: (message: typeof Message.Type) => {
        dispatched.push(message)
      },
    },
  })
  return { dispatched, runtime }
}
const invocation = { id: 'invocation-1', transport: 'webmcp' }

describe('Agent.action', () => {
  it('is the Action’s name, description and input, and dispatches the Message it makes', () => {
    const { dispatched, runtime } = bound(true)
    const [variant] = Agent.messages(runtime.definition)
    expect(variant).toMatchObject({ name: 'rename_todo', description: 'Rename a todo' })
    Effect.runSync(runtime.messages.dispatch('rename_todo', { id: 'a' }, invocation))
    expect(dispatched).toEqual([Message.RequestedRenameTodo({ id: 'a', title: 'Renamed' })])
  })

  it('is exposed only under the tag of the Message it makes', () => {
    const Delete = Action.define({
      name: 'delete_todo',
      description: 'Delete a todo',
      input: Schema.Struct({ id: Schema.String }),
      toMessage: ({ id }) => Message.RequestedDeleteTodo({ id }),
    })
    // A delete is not a create: the payload has no title.
    // @ts-expect-error the Action makes RequestedDeleteTodo, not RequestedCreateTodo
    Agent.expose(Message, { RequestedCreateTodo: Agent.action(Delete) })
    expect(
      Agent.expose(Message, { RequestedDeleteTodo: Agent.action(Delete) }).variants,
    ).toHaveLength(1)
  })

  it('refuses the key of another Message even when the payloads match, at compile and run time', () => {
    const Twins = defineMessageUnion({
      Deleted: { id: Schema.String },
      Archived: { id: Schema.String },
    })
    const Delete = Action.define({
      name: 'delete',
      description: 'Delete',
      input: Schema.Struct({ id: Schema.String }),
      toMessage: ({ id }) => Twins.Deleted({ id }),
    })
    const dispatched: Array<typeof Twins.Type> = []
    const runtime = Agent.bind({
      definition: Agent.make({
        context: Projection.fromReader(Schema.Struct({}), () => ({})),
        // @ts-expect-error the Action makes Deleted, so it is not Archived's
        messages: Agent.expose(Twins, { Archived: Agent.action(Delete) }),
      }),
      host: {
        model: () => ({}),
        dispatch: (message: typeof Twins.Type) => {
          dispatched.push(message)
        },
      },
    })
    expect(() =>
      Effect.runSync(runtime.messages.dispatch('delete', { id: 'a' }, invocation)),
    ).toThrow('"delete" made a "Deleted" Message, but is exposed as "Archived"')
    expect(dispatched).toEqual([])
  })

  it('keeps what only an agent adds: an authorization refused dispatches nothing', () => {
    const { dispatched, runtime } = bound(false)
    const result = Effect.runSync(
      Effect.result(runtime.messages.dispatch('rename_todo', { id: 'a' }, invocation)),
    )
    expect(result._tag).toBe('Failure')
    expect(dispatched).toEqual([])
  })
})
