/**
 * The edits as a Sync document, derived from the application: `edits` is the
 * replicated slice and `EditedProducts` the one durable Message. Replay is the
 * application's own `update`, so the server's journal and every replica fold
 * the same operations the same way.
 */
import { Effect, Fiber, Layer, Option, Stream } from 'effect'
import type { RemoteClient } from 'foldkit-remote'
import { MessageSet, Projection } from 'foldkit-surface'
import {
  DocumentId,
  Sync,
  type Mounted,
  type Operation,
  type PolicyJournalContract,
  type Replica,
  type Sync as SyncContract,
} from 'foldkit-sync'
import { App, Message, type Model, placements } from './app.js'
import type { ProductChange } from './domain.js'
import { view } from './view.js'

export type Shared = { readonly edits: ReadonlyArray<ProductChange> }

const definition = Sync.forApplication(App).make({
  documentId: DocumentId.make('registry-edits'),
  shared: Projection.pick(App.model.edits),
  durable: MessageSet.make(App, [Message.EditedProducts]),
})

/**
 * Annotated: the inferred type expands a Foldkit-private alias that
 * declaration emit cannot name. It is the same value.
 */
export const RegistrySync: SyncContract<Message, Shared> = definition

/** The journal's codecs, initial snapshot and reducer, for `Journal.make`. */
export const journalContract = (): PolicyJournalContract<Operation, Shared, unknown> =>
  definition.journalContract()

/**
 * The application over an open replica: an edit applies at once and is
 * persisted to the replica after, an exchange or a rejection reinstalls the
 * edits, and the replica's status reaches the Model as `ExchangeChanged`.
 * Remote's reads run beside it, through `resources`.
 */
export const mountRegistry = (
  replica: Replica<Message, Shared>,
  options: {
    readonly container: HTMLElement
    readonly resources: Layer.Layer<RemoteClient>
  },
): { readonly mounted: Mounted<Model, Message>; readonly dispose: () => Promise<void> } => {
  const mounted = Sync.mount(App, definition, {
    replica,
    container: options.container,
    view,
    subscriptions: placements.subscriptions(),
    resources: options.resources,
  })
  const status = Effect.runFork(
    Stream.runForEach(replica.statusChanges, ({ pending, lastError }) =>
      Effect.sync(() => {
        mounted.dispatch(
          Message.ExchangeChanged({ pending, error: Option.fromUndefinedOr(lastError) }),
        )
      }),
    ),
  )
  return {
    mounted,
    dispose: async () => {
      await Effect.runPromise(Fiber.interrupt(status))
      await mounted.dispose()
    },
  }
}
