import { Effect } from 'effect'
import type { Agent } from 'foldkit-agent'
import type { RemoteClient } from 'foldkit-remote'
import { AppAgent, Parts, bindAgent } from '../src/save/agent.js'
import { Message, stateOf, type Model } from '../src/save/app.js'
import type { Driver } from './outcomes.js'

/** The host an agent reads and writes through, in a page or without one. */
type Host = ReturnType<typeof Agent.headless<Model, Message, RemoteClient>>['host']

/** An agent's way of editing and saving: the same in a page and without one. */
export const agentDriver = (host: Host): Driver => {
  const agent = bindAgent({ definition: AppAgent, host, parts: Parts })
  return {
    edit: async text => {
      await Effect.runPromise(agent.messages.dispatch(Message.ChangedDraft, { text }))
    },
    save: async () => {
      const result = await Effect.runPromise(agent.messages.dispatch(Message.RequestedSave, {}))
      return result.completion?.status === 'completed' ? 'completed' : 'failed'
    },
    state: () => stateOf(host.model()),
  }
}
