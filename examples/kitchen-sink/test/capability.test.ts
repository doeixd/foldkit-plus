/**
 * An agent capability over a declared write (#533, D11): `complete_task` takes
 * its checks from `CompleteTask`'s `when`, with no condition written beside it.
 */
import { Effect, Option, Schema } from 'effect'
import { Agent } from 'foldkit-agent'
import { describe, expect, it } from 'vitest'
import { AppAgent, bindAgent } from '../src/agent.js'
import { App, CompleteTask, Data, Message, type Model } from '../src/stack.js'

/** The tasks as the client holds them once a view has read them. */
const held: Model = Data.reduce(App.initial, {
  _tag: 'ReadReceived',
  requests: ['t1', 't2'].map(id => ({ entity: 'Task', id, fields: ['id', 'title', 'status'] })),
  result: {
    entities: [
      { entity: 'Task', id: 't1', values: { id: 't1', title: 'Draft the brief', status: 'open' } },
      { entity: 'Task', id: 't2', values: { id: 't2', title: 'Book the room', status: 'done' } },
    ],
    settled: [],
  },
  now: 0,
})

const bound = (canWrite: boolean) => {
  const dispatched: Array<Message> = []
  const agent = bindAgent({
    definition: AppAgent,
    host: {
      model: () => held,
      dispatch: (message: Message) => void dispatched.push(message),
      principal: () => ({ canWrite }),
      subscribe: () => () => {},
    },
  })
  const complete = (id: string) =>
    Effect.runPromise(
      Effect.result(agent.messages.dispatchUnknown('complete_task', { id }, { transport: 'mcp' })),
    )
  return { dispatched, complete }
}

const refusal = (result: { readonly _tag: string }) =>
  result._tag === 'Failure'
    ? (result as unknown as { readonly failure: { _tag: string; message: string } }).failure
    : undefined

describe('complete_task, over CompleteTask', () => {
  it('dispatches for an open task', async () => {
    const agent = bound(true)
    expect((await agent.complete('t1'))._tag).toBe('Success')
    expect(agent.dispatched).toEqual([Message.RequestedCompleteTask({ id: 't1' })])
  })

  it('is unavailable for a task the when refuses, saying why', async () => {
    const agent = bound(true)
    expect(refusal(await agent.complete('t2'))).toMatchObject({
      _tag: 'AgentCapabilityUnavailableError',
      message: 'Task t2 does not hold what CompleteTask asks of it',
    })
    expect(agent.dispatched).toEqual([])
  })

  it('sends a task the client does not hold, for the server to decide', async () => {
    const agent = bound(true)
    expect((await agent.complete('t9'))._tag).toBe('Success')
  })

  it('tells a caller who may not write nothing of the task', async () => {
    const agent = bound(false)
    const open = refusal(await agent.complete('t1'))
    expect(open?._tag).toBe('AgentAuthorizationError')
    expect(refusal(await agent.complete('t2'))).toEqual(open)
  })

  it('is described as depending on its input', () => {
    const described = Agent.messages(AppAgent).find(each => each.name === 'complete_task')!
    expect(described).toMatchObject({ inputDependent: true, requiresAuthorization: true })
  })
})

describe('Data.available over CompleteTask', () => {
  // The task a screen has selected; the Model would hold it.
  let selected = 't1'
  const Selected = Agent.forModel<Model>().expose(Message, {
    RequestedCompleteTask: {
      name: 'complete_selected_task',
      description: 'Complete the selected task',
      input: Schema.Struct({}),
      toMessage: () => ({ id: selected }),
      available: Data.available(CompleteTask, () => Option.some({ id: selected })),
    },
  })
  const runtime = Agent.bind({
    definition: Agent.make({ messages: Selected }),
    host: { model: () => held, dispatch: () => {} },
  })
  const listed = () => Effect.runSync(runtime.messages.available).map(capability => capability.name)

  it('offers the capability while the selected task is open, and withholds it once it is not', () => {
    selected = 't1'
    expect(listed()).toEqual(['complete_selected_task'])
    selected = 't2'
    expect(listed()).toEqual([])
  })
})
