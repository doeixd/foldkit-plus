/**
 * A tiny in-memory runtime for the demo: `update`, Commands, and the host seam
 * an agent binds to. In the browser `Sync.mount` provides the same shape over
 * the real Foldkit runtime and the replica; here the loop is a few lines so the
 * transcript can run without a DOM.
 *
 * It runs Commands, because the example's intent-to-fact pattern depends on
 * them: `RequestedTodo` mints its fact in a Command, and `dispatch` settles
 * only once the fact has been applied.
 */
import { Effect } from 'effect'
import { KeyValueStore } from 'effect/unstable/persistence'
import type { Agent } from 'foldkit-agent'
import { type Message, type Model, initialModel } from './app.js'
import { update } from './surface.js'

export interface Store {
  readonly host: Agent.AgentHost<Model, Message>
  readonly model: () => Model
  /** Dispatches and waits for the Commands it caused, and theirs. */
  readonly dispatch: (message: Message) => Promise<void>
}

export const makeStore = (initial: Model = initialModel): Store => {
  let model = initial
  const modelListeners = new Set<() => void>()
  const messageListeners = new Set<(message: Message) => void>()

  const dispatch = async (message: Message): Promise<void> => {
    for (const listener of messageListeners) listener(message)
    const result = update(model, message)
    model = result.model
    for (const listener of modelListeners) listener()
    await Promise.all(
      // `update`'s Commands carry the assembly's services in their type; `update`
      // itself never emits one that touches the store, so a fresh memory layer
      // satisfies the type without changing behaviour.
      (result.commands ?? []).map(command =>
        Effect.runPromise(command.effect.pipe(Effect.provide(KeyValueStore.layerMemory))).then(
          dispatch,
        ),
      ),
    )
  }

  return {
    model: () => model,
    dispatch,
    host: {
      model: () => model,
      dispatch,
      subscribe: listener => {
        modelListeners.add(listener)
        return () => modelListeners.delete(listener)
      },
      observe: listener => {
        messageListeners.add(listener as (message: Message) => void)
        return () => messageListeners.delete(listener as (message: Message) => void)
      },
    },
  }
}
