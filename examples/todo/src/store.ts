import type { Agent } from 'foldkit-agent'
import { type Message, type Model, initialModel, update } from './app.js'

/**
 * The seam between the agent contract and a running application, written by
 * hand to show its shape: a tiny loop over the same `update`, running no
 * Commands. A real application takes its host from `Agent.host(config)` (a
 * page) or `Agent.headless(config)` (a test or a server), which read the
 * Model the runtime holds and send Messages into it.
 */
export interface Store {
  readonly host: Agent.AgentHost<Model, Message>
  readonly model: () => Model
  /** Dispatch from the UI side, to show both surfaces driving one state machine. */
  readonly dispatch: (message: Message) => void
}

export const makeStore = (initial: Model = initialModel): Store => {
  let model = initial
  const listeners = new Set<() => void>()

  const dispatch = (message: Message): void => {
    model = update(model, message)
    for (const listener of listeners) listener()
  }

  return {
    model: () => model,
    dispatch,
    host: {
      model: () => model,
      dispatch,
      subscribe: listener => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    },
  }
}
