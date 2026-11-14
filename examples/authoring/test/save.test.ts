/**
 * The save fixture with no page: the agent drives a headless runtime over the
 * in-process writer. The same assertions run for a person and for the agent in
 * a browser (`save.browser.test.ts`).
 */
import { Effect, Option } from 'effect'
import { Agent } from 'foldkit-agent'
import { describe, expect, it } from 'vitest'
import { AppAgent, Parts, bindAgent } from '../src/save/agent.js'
import { Message, initial, update } from '../src/save/app.js'
import { makeServer } from '../src/save/server.js'
import { agentDriver } from './drivers.js'
import { outcomes } from './outcomes.js'

outcomes('by the agent, headless', async () => {
  const server = makeServer()
  const app = Agent.headless({ init: initial, update, resources: server.layer })
  return { driver: agentDriver(app.host), server, dispose: app.dispose }
})

describe('the editor, to an agent', () => {
  it('lists its two parts, the title with its value, and finds Save by label', async () => {
    const server = makeServer()
    const app = Agent.headless({ init: initial, update, resources: server.layer })
    try {
      const agent = bindAgent({ definition: AppAgent, host: app.host, parts: Parts })
      await Effect.runPromise(agent.messages.dispatch(Message.ChangedDraft, { text: 'Hello' }))
      const listed = await Effect.runPromise(agent.parts.list)
      expect(listed.map(part => [part.id, part.role, part.value])).toEqual([
        ['title', 'textbox', Option.some('Hello')],
        ['save', 'button', Option.none()],
      ])
      const found = await Effect.runPromise(agent.parts.find({ label: 'Save' }))
      expect(
        Agent.Found.$match(found, {
          One: ({ part }) => part.capability.pipe(Option.map(capability => capability.name)),
          Ambiguous: () => Option.none(),
          None: () => Option.none(),
        }),
      ).toEqual(Option.some('save'))
    } finally {
      await app.dispose()
    }
  })
})
