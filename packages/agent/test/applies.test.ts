/**
 * `applies` (#533, D11): a capability judged against its input, after
 * `authorize` and over the one Model snapshot the invocation read.
 */
import { Effect, Option, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Agent } from '../src/index.js'
import { type Message, type Model, Message as MessageUnion, modelWith } from './todoApp.js'

interface Principal {
  readonly canRename: boolean
}

interface Seen {
  readonly step: 'available' | 'authorize' | 'applies' | 'toMessage'
  readonly model: Model
}

/** A rename that applies only to a todo the Model holds, with every hook recording what it saw. */
const renameAgent = (
  options: {
    readonly authorize?: (principal: Principal) => Effect.Effect<boolean> | boolean
    readonly reason?: boolean
  } = {},
) => {
  let model = modelWith({
    todos: [{ id: 'held', title: 'Milk', completed: false }],
    selectedTodoId: Option.some('held'),
  })
  let principal: Principal = { canRename: true }
  const seen: Array<Seen> = []
  const applied: Array<{ readonly input: unknown; readonly principal: Principal }> = []
  const dispatched: Array<Message> = []
  let modelReads = 0

  const definition = Agent.make({
    messages: Agent.forModel<Model, Principal>().expose(MessageUnion, {
      RequestedRenameTodo: {
        name: 'rename_todo',
        description: 'Rename a todo',
        input: Schema.Struct({ id: Schema.String, title: Schema.NonEmptyString }),
        available: m => {
          seen.push({ step: 'available', model: m })
          return true
        },
        authorize: ({ principal: asked, model: m }) => {
          seen.push({ step: 'authorize', model: m })
          return options.authorize?.(asked) ?? asked.canRename
        },
        applies: ({ input, principal: asked, model: m }) => {
          seen.push({ step: 'applies', model: m })
          applied.push({ input, principal: asked })
          if (m.todos.some(todo => todo.id === input.id)) return true
          return options.reason === false
            ? false
            : { applies: false, reason: `There is no todo ${input.id}` }
        },
        toMessage: ({ id, title }, context) => {
          seen.push({ step: 'toMessage', model: context.model })
          return { id, title }
        },
      },
    }),
  })

  const runtime = Agent.bind({
    definition,
    host: {
      model: () => {
        modelReads += 1
        return model
      },
      principal: () => principal,
      dispatch: (message: Message) => void dispatched.push(message),
    },
  })

  return {
    definition,
    runtime,
    seen,
    applied,
    dispatched,
    modelReads: () => modelReads,
    setModel: (next: Model) => {
      model = next
    },
    setPrincipal: (next: Principal) => {
      principal = next
    },
    rename: (input: unknown) =>
      Effect.runPromise(
        Effect.result(
          runtime.messages.dispatchUnknown('rename_todo', input, { id: 'i', transport: 'mcp' }),
        ),
      ),
  }
}

const failure = (result: { readonly _tag: string }) => {
  if (result._tag !== 'Failure') throw new Error('Expected a failure')
  return (result as unknown as { readonly failure: { _tag: string; message: string } }).failure
}

describe('applies', () => {
  it('dispatches a call it admits', async () => {
    const agent = renameAgent()
    const result = await agent.rename({ id: 'held', title: 'Oat milk' })
    expect(result._tag).toBe('Success')
    expect(agent.dispatched).toEqual([
      { _tag: 'RequestedRenameTodo', id: 'held', title: 'Oat milk' },
    ])
  })

  it('refuses a call it does not admit as unavailable, with its reason as the message', async () => {
    const agent = renameAgent()
    const refused = failure(await agent.rename({ id: 'nobody', title: 'Oat milk' }))
    expect(refused).toMatchObject({
      _tag: 'AgentCapabilityUnavailableError',
      message: 'There is no todo nobody',
    })
    expect(agent.dispatched).toEqual([])
  })

  it('refuses without a reason in the words availability uses', async () => {
    const agent = renameAgent({ reason: false })
    expect(failure(await agent.rename({ id: 'nobody', title: 'Oat milk' }))).toMatchObject({
      _tag: 'AgentCapabilityUnavailableError',
      message: 'Capability "rename_todo" is not available right now',
    })
  })

  it('is never asked for a principal authorize refused, so the refusal says nothing of the row', async () => {
    const agent = renameAgent()
    agent.setPrincipal({ canRename: false })
    const held = failure(await agent.rename({ id: 'held', title: 'Oat milk' }))
    const absent = failure(await agent.rename({ id: 'nobody', title: 'Oat milk' }))
    expect(agent.applied).toEqual([])
    // The same answer whether the row is there or not.
    expect(held).toEqual(absent)
    expect(held._tag).toBe('AgentAuthorizationError')
  })

  it('is asked with the decoded input and the principal, once authorize allowed', async () => {
    const agent = renameAgent()
    await agent.rename({ id: 'held', title: 'Oat milk' })
    expect(agent.applied).toEqual([
      { input: { id: 'held', title: 'Oat milk' }, principal: { canRename: true } },
    ])
  })

  it('is not asked for input the Schema refuses', async () => {
    const agent = renameAgent()
    const refused = failure(await agent.rename({ id: 'held', title: '' }))
    expect(refused._tag).toBe('AgentInvalidInputError')
    expect(agent.applied).toEqual([])
  })

  it('judges the Model the invocation read, as every other step does, while authorize suspends', async () => {
    let approve: () => void = () => {}
    const pending = new Promise<boolean>(resolve => {
      approve = () => resolve(true)
    })
    const agent = renameAgent({ authorize: () => Effect.promise(() => pending) })
    const running = agent.rename({ id: 'held', title: 'Oat milk' })
    // The row is gone from the live Model before authorize answers.
    agent.setModel(modelWith({}))
    approve()
    expect((await running)._tag).toBe('Success')

    expect(agent.seen.map(each => each.step)).toEqual([
      'available',
      'authorize',
      'applies',
      'toMessage',
    ])
    const [first] = agent.seen
    for (const each of agent.seen) expect(each.model).toBe(first!.model)
    expect(agent.modelReads()).toBe(1)
  })

  it('is described as input-dependent, and a capability without it is not', () => {
    const agent = renameAgent()
    expect(Agent.messages(agent.definition)[0]!.inputDependent).toBe(true)
    expect(Agent.toManifest(agent.definition).capabilities[0]!.inputDependent).toBe(true)
    expect(Agent.toMarkdown(agent.definition)).toContain(
      'Refused for some inputs, judged after authorization.',
    )
    const plain = Agent.make({
      messages: Agent.expose(MessageUnion, { RequestedCreateTodo: 'Create a todo' }),
    })
    expect(Agent.messages(plain)[0]!.inputDependent).toBe(false)
    expect(Agent.toMarkdown(plain)).not.toContain('Refused for some inputs')
  })

  it('stays in discovery: only a call knows its input', async () => {
    const agent = renameAgent()
    const listed = await Effect.runPromise(agent.runtime.messages.available)
    expect(listed.map(each => each.name)).toEqual(['rename_todo'])
    expect(agent.applied).toEqual([])
  })
})
