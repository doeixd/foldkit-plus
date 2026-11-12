/**
 * The agent's create completes on the note's state, since the caller names
 * the id and `update` adds the note at once: no fact Message follows.
 */
import { Effect } from 'effect'
import { Agent, type StateOutcome } from 'foldkit-agent'
import { afterEach, describe, expect, expectTypeOf, it } from 'vitest'
import { AppAgent, bindAgent } from '../src/agent.js'
import { App, Message, serverClient, update } from '../src/stack.js'

const first = { id: 'n1', body: 'First note' }
const second = { id: 'n2', body: 'Second note' }

let dispose: () => Promise<void> = async () => {}
afterEach(() => dispose())

const boot = () => {
  const app = Agent.headless({
    init: () => ({ model: { ...App.initial, notes: [first, second] } }),
    update,
    resources: serverClient('u1'),
  })
  dispose = app.dispose
  const agent = bindAgent({
    definition: AppAgent,
    host: { ...app.host, principal: () => ({ canWrite: true }) },
  })
  const create = (input: { readonly id: string; readonly body: string }) =>
    Effect.runPromise(Effect.result(agent.messages.dispatch(Message.RequestedCreateNote, input)))
  return { app, agent, create }
}

describe("the agent's create", () => {
  it('completes when the note it named holds its body, with no fact to read', async () => {
    const { app, agent } = boot()
    const result = await Effect.runPromise(
      agent.messages.dispatch(Message.RequestedCreateNote, { id: 'n3', body: 'Third' }),
    )
    // A state contract's outcome is typed as a state reached: there is no Message on it.
    expectTypeOf(result.completion).toEqualTypeOf<StateOutcome | undefined>()
    expect(result.completion).toEqual({ status: 'completed' })
    expect(app.host.model().notes).toContainEqual({ id: 'n3', body: 'Third' })
  })

  it('ends at its timeout when `update` drops a create over a taken id', async () => {
    const { app, create } = boot()
    const result = await create({ id: 'n1', body: 'Overwritten?' })
    expect(result._tag).toBe('Failure')
    if (result._tag === 'Failure') expect(result.failure._tag).toBe('AgentCompletionTimeoutError')
    expect(app.host.model().notes).toEqual([first, second])
  })

  it('is not completed by another note holding the same body', async () => {
    const { app, create } = boot()
    // n1 is taken, so the create is dropped; n2 already holds this body.
    const result = await create({ id: 'n1', body: second.body })
    expect(result._tag).toBe('Failure')
    expect(app.host.model().notes).toEqual([first, second])
  })
})
