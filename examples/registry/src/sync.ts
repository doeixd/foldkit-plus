/**
 * The edits as a Sync document, derived from the application: `edits` is the
 * replicated slice and `EditedProducts` the one durable Message. Replay is the
 * application's own `update`, so the server's journal and every replica fold
 * the same operations the same way.
 */
import { Effect, Fiber, Layer, Match, Option, Schema, Stream } from 'effect'
import { modifyFields } from 'foldkit/struct'
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
  Transport,
  TransportError,
} from 'foldkit-sync'
import {
  App,
  Message,
  type Model,
  type ProductEdit,
  type Refusal,
  placements,
  retiredOf,
} from './app.js'
import { view } from './view.js'

export type Shared = { readonly edits: ReadonlyArray<ProductEdit> }

/** Who an exchange is from: there is no sign-in, so every client is one author. */
export interface Principal {
  readonly actorId: string
}
export const everyone: Principal = { actorId: 'registry' }
/** The server itself, which alone records what the table has absorbed. */
export const server: Principal = { actorId: 'registry-server' }

const definition = Sync.forApplication(App)
  .withPrincipal<Principal>()
  .make({
    // Versioned with the shape of `edits`: a replica stored under the last one
    // does not decode as this one, so it is a document of its own.
    documentId: DocumentId.make('registry-edits-2'),
    shared: Projection.pick(App.model.edits),
    durable: MessageSet.make(App, [Message.EditedProducts, Message.AbsorbedEdits]),
    // Dropping edits from every replica is the server's: a client's would drop
    // someone else's edits before their rows were read.
    authorize: { AbsorbedEdits: ({ principal }) => principal.actorId === server.actorId },
    // The journal writes in the sequence each edit committed at, which the
    // table's revision is compared with to know which edits a row holds.
    stamp: {
      EditedProducts: ({ changes }, { sequence }) =>
        Message.EditedProducts({ changes, at: sequence }),
    },
  })

/**
 * Annotated: the inferred type expands a Foldkit-private alias that
 * declaration emit cannot name. It is the same value.
 */
export const RegistrySync: SyncContract<Message, Shared> = definition

/** The journal's codecs, initial snapshot and reducer, for `Journal.make`. */
export const journalContract = (): PolicyJournalContract<Operation, Shared, Principal> =>
  definition.journalContract()

const decodeMessage = Schema.decodeUnknownOption(Message)

/** The cells an operation's edit changes: each product's fields it holds. */
const changedCells = (operation: Operation): ReadonlyArray<Pick<Refusal, 'id' | 'column'>> =>
  Option.match(decodeMessage(operation.message), {
    onNone: () => [],
    onSome: message =>
      Match.value(message).pipe(
        Match.tag('EditedProducts', ({ changes }) =>
          changes.flatMap(change => [
            ...(Option.isSome(change.description)
              ? [{ id: change.id, column: 'description' as const }]
              : []),
            ...(Option.isSome(change.cents) ? [{ id: change.id, column: 'cents' as const }] : []),
          ]),
        ),
        Match.orElse(() => []),
      ),
  })

/**
 * The transport, paused while `paused()` says so: an exchange fails as the
 * server being unreachable would, so the replica keeps its edits on the
 * device. A notice that arrives meanwhile only starts an exchange that fails
 * the same way. The offline switch's.
 */
export const pausable = <E>(
  transport: Layer.Layer<Transport, E>,
  paused: () => boolean,
): Layer.Layer<Transport, E> =>
  Layer.effect(
    Transport,
    Effect.gen(function* () {
      const shape = yield* Transport
      return {
        ...shape,
        exchange: (cursor: number, pending: ReadonlyArray<Operation>, epoch?: string) =>
          paused()
            ? Effect.fail(new TransportError({ message: 'working offline' }))
            : shape.exchange(cursor, pending, epoch),
      }
    }),
  ).pipe(Layer.provide(transport))

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
    // In the transition that replaces the edits, so no frame draws a cached
    // row without an edit the journal absorbed after that row was read.
    onReinstall: (next, previous) => {
      const retired = retiredOf(previous, next)
      return {
        model:
          retired.length === 0 && next.retired.length === 0
            ? next
            : modifyFields(next, { retired: () => retired }),
      }
    },
  })
  // The replica drops a refused operation, so the cells each pending one
  // changed are read while it is still pending, to say which a refusal undid.
  const cellsOf = new Map<string, ReadonlyArray<Pick<Refusal, 'id' | 'column'>>>()
  const reported = new Set<string>()
  const status = Effect.runFork(
    Stream.runForEach(replica.statusChanges, ({ pending, lastError, rejected }) =>
      Effect.gen(function* () {
        for (const operation of yield* replica.pending)
          if (!cellsOf.has(operation.opId)) cellsOf.set(operation.opId, changedCells(operation))
        const refusals = rejected.flatMap(({ opId, reason }) => {
          if (reported.has(opId)) return []
          reported.add(opId)
          return (cellsOf.get(opId) ?? []).map(cell => ({
            opId,
            ...cell,
            reason: Option.getOrElse(reason, () => 'Refused by the server'),
          }))
        })
        if (refusals.length > 0) mounted.dispatch(Message.EditsRefused({ refusals }))
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
