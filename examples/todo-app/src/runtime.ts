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
import { Effect, Match, Option, Schema, Stream } from 'effect'
import { modifyFields } from 'foldkit/struct'
import * as Subscription from 'foldkit/subscription'
import { KeyValueStore } from 'effect/persistence'
import type { Mounted, Replica } from 'foldkit-sync'
import { Message, initialModel, type Model, type Shared } from './app.js'
import type { Network } from './network.js'
import { wiring } from './surface.js'
import { mountTodos } from './sync.js'
import { viewWith } from './view.js'

export const mountApp = (
  replica: Replica<Message, Shared>,
  container: HTMLElement,
  options: {
    /** Who the page is signed in as, for the intro to say. */
    readonly as?: string
    /** The switch the "go offline" button moves; without it the button only shows. */
    readonly network?: Network
  } = {},
): Mounted<Model, Message> => {
  const storage = KeyValueStore.layerStorage(() => window.localStorage)
  const start = wiring.initial(initialModel)
  // The replica's status and the connection switch are not Model fields the
  // mount reads: they enter the Model as local Messages, and the Model's
  // `offline` drives the switch. Neither is shared state.
  const connection = Subscription.make<Model, Message, never>()(() => ({
    status: Subscription.persistentEntry(
      replica.statusChanges.pipe(
        Stream.map(status =>
          Message.SyncStatusChanged({
            pending: status.pending,
            failed: status.lastError !== undefined,
          }),
        ),
      ),
    ),
    network: {
      dependenciesSchema: Schema.Struct({ offline: Schema.Boolean }),
      modelToDependencies: (model: Model) => ({ offline: model.offline }),
      dependenciesToStream: ({ offline }: { readonly offline: boolean }) =>
        Stream.fromEffect(Effect.sync(() => options.network?.set(offline))).pipe(Stream.drain),
    },
  }))
  const mounted = mountTodos(replica, {
    container,
    view: viewWith(Option.fromUndefinedOr(options.as)),
    subscriptions: Subscription.aggregate<Model, Message, KeyValueStore.KeyValueStore>()(
      wiring.subscriptions(),
      connection,
    ),
    resources: storage,
    url: wiring.url(url => Message.UrlChanged({ url })),
    onPersistenceFailure: (model, error) =>
      modifyFields(model, {
        lastError: () =>
          Option.some(
            Match.value(error).pipe(
              Match.tag('ReplayError', ({ message }) => `Refused: ${message}`),
              Match.orElse(() => 'Could not save this change; it was reverted.'),
            ),
          ),
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
