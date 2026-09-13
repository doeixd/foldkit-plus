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
 * Storage as the Model changes, the URL is read into the Model at start and on
 * every navigation, and the store is read once at start.
 */
import { Effect } from 'effect'
import { KeyValueStore } from 'effect/unstable/persistence'
import * as Subscription from 'foldkit/subscription'
import type { Mounted, Replica } from 'foldkit-sync'
import { Message, type Model, type Shared } from './app.js'
import { Filters, Prefs } from './surface.js'
import { mountTodos } from './sync.js'
import { view } from './view.js'

const currentHref = (): string =>
  `${window.location.pathname}${window.location.search}${window.location.hash}`

export const mountApp = (
  replica: Replica<Message, Shared>,
  container: HTMLElement,
): Mounted<Model, Message> => {
  const storage = KeyValueStore.layerStorage(() => window.localStorage)
  const mounted = mountTodos(replica, {
    container,
    view,
    subscriptions: Subscription.make<Model, Message, KeyValueStore.KeyValueStore>()(() => ({
      ...Filters.subscriptions,
      ...Prefs.subscriptions,
    })),
    resources: storage,
    onPersistenceFailure: (model, error) => ({
      ...model,
      lastError:
        error._tag === 'ReplayError'
          ? `Refused: ${error.message}`
          : 'Could not save this change; it was reverted.',
    }),
  })

  // URL → Model: at start, and on every navigation (back, forward, a link, a
  // mirror's own write, which the runtime reduces to the same keys).
  const onUrl = () => void mounted.dispatch(Message.UrlChanged({ href: currentHref() }))
  onUrl()
  window.addEventListener('popstate', onUrl)
  window.addEventListener('foldkit:urlchange', onUrl)
  // Store → Model, once: the draft is restored while it is still empty.
  void Effect.runPromise(Prefs.restore.effect.pipe(Effect.provide(storage))).then(message =>
    mounted.dispatch(message),
  )

  return {
    ...mounted,
    dispose: async () => {
      window.removeEventListener('popstate', onUrl)
      window.removeEventListener('foldkit:urlchange', onUrl)
      await mounted.dispose()
    },
  }
}
