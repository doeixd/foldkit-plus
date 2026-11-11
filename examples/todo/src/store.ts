import type { Agent } from 'foldkit-agent'
import { Effect } from 'effect'
import { type Message, type Model, initialModel, update } from './app.js'

/**
 * The seam between the agent contract and a running application, written by
 * hand to show its shape: a tiny loop over the same `update`. A real
 * application takes its host from `Agent.host(config)` (a page) or
 * `Agent.headless(config)` (a test or a server), which read the Model the
 * runtime holds and send Messages into it.
 */
export interface Store {
  readonly host: Agent.AgentHost<Model, Message>
  readonly model: () => Model
  /** Dispatch from the UI side, to show both surfaces driving one state machine. */
  readonly dispatch: (message: Message) => void
  /** Resolves once every Command started so far has sent its Message. */
  readonly settled: () => Promise<void>
}

export const makeStore = (initial: Model = initialModel): Store => {
  let model = initial
  const changed = new Set<() => void>()
  const observers = new Set<(message: Message) => void>()
  const running = new Set<Promise<void>>()

  const dispatch = (message: Message): void => {
    const next = update(model, message)
    model = next.model
    for (const observer of observers) observer(message)
    for (const listener of changed) listener()
    // As in a Foldkit runtime, a Command runs after the transition that asked
    // for it, and its Message arrives later as a dispatch of its own.
    for (const command of next.commands ?? []) {
      const run: Promise<void> = Effect.runPromise(command.effect)
        .then(dispatch)
        .finally(() => running.delete(run))
      running.add(run)
    }
  }

  const settled = async (): Promise<void> => {
    // A Command's Message can start another, so wait until none is left.
    while (running.size > 0) await Promise.all(running)
  }

  return {
    model: () => model,
    dispatch,
    settled,
    host: {
      model: () => model,
      dispatch,
      subscribe: listener => {
        changed.add(listener)
        return () => changed.delete(listener)
      },
      // A completion contract waits for a Message, so the host reports each one.
      observe: observer => {
        observers.add(observer)
        return () => observers.delete(observer)
      },
    },
  }
}
