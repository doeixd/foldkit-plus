/**
 * Mounting the app in a browser.
 *
 * `Sync.mount` (through `mountTodos`) runs the application with one reducer: a
 * durable Message applies through `update` at once and is persisted afterwards
 * in a Command; a failed persist reverts it and reports through
 * `onPersistenceFailure`; the shared slice is re-installed when an exchange or
 * a rejection moves the replica. The returned `Mounted` is also the host an
 * agent binds to: `model`, `dispatch`, `subscribe`, and `observe`.
 *
 * The mirrors ride along: their Subscription entries write the URL and Web
 * Storage as the Model changes; the URL is reduced into the Model at start
 * (`url.init`) and on every navigation (`url.onUrlChange`); the store is read
 * once at start and its Message dispatched.
 */
import { Effect } from 'effect'
import { KeyValueStore } from 'effect/unstable/persistence'
import type { Mounted, Replica } from 'foldkit-sync'
import { Message, initialModel, type Model, type Shared } from './app.js'
import { wiring } from './surface.js'
import { mountTodos } from './sync.js'
import { view } from './view.js'

export const mountApp = (
  replica: Replica<Message, Shared>,
  container: HTMLElement,
): Mounted<Model, Message> => {
  const storage = KeyValueStore.layerStorage(() => window.localStorage)
  const start = wiring.initial(initialModel)
  const mounted = mountTodos(replica, {
    container,
    view,
    subscriptions: wiring.subscriptions(),
    resources: storage,
    url: wiring.url(url => Message.UrlChanged({ url })),
    onPersistenceFailure: (model, error) => ({
      ...model,
      lastError:
        error._tag === 'ReplayError'
          ? `Refused: ${error.message}`
          : 'Could not save this change; it was reverted.',
    }),
  })
  // Store → Model, once: the draft is restored while it is still empty.
  for (const command of start.commands ?? []) {
    void Effect.runPromise(command.effect.pipe(Effect.provide(storage))).then(message =>
      mounted.dispatch(message),
    )
  }
  return mounted
}
