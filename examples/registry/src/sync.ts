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
  Products,
  replacedOf,
  retiredOf,
  retiresAny,
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
    // table's revision is compared with to know which edits a row holds, and
    // who committed it, so a device can tell another's edit from its own.
    stamp: {
      EditedProducts: ({ changes }, { sequence, actorId }) =>
        Message.EditedProducts({ changes, at: sequence, by: actorId }),
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
          changes.flatMap(change =>
            [
              { column: 'description' as const, changed: Option.isSome(change.description) },
              { column: 'cents' as const, changed: Option.isSome(change.cents) },
              { column: 'line' as const, changed: Option.isSome(change.line) },
              { column: 'status' as const, changed: Option.isSome(change.status) },
            ].flatMap(({ column, changed }) => (changed ? [{ id: change.id, column }] : [])),
          ),
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
    /** The name this device commits as, so its own edits are told from another's. */
    readonly device: string
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
    // And in the same transition, an edit of this device's that another
    // device's later commit replaced is said, not silently overwritten.
    // An edit newly retired is asked of the table again rather than shown
    // as saved until some other read: a later edit may have replaced it, and
    // only the row says so once the journal has absorbed both (`settledOf`).
    onReinstall: (next, previous) => {
      const retired = retiredOf(previous, next)
      const replaced = replacedOf(previous, next)
      if (retired.length === 0 && next.retired.length === 0 && replaced.length === 0) {
        return { model: next }
      }
      const kept = modifyFields(next, {
        retired: () => retired,
        replaced: before => [...before, ...replaced],
      })
      return { model: retiresAny(previous, retired) ? Products.refresh(kept) : kept }
    },
  })
  // Dispatched before any exchange can reinstall, so every reinstall knows
  // which edits are this device's.
  mounted.dispatch(Message.DeviceNamed({ device: options.device }))
  // Each refusal carries the operation it refused, so the cells it undid are
  // read from it. The status lists the latest refusals, so the ones said
  // already are kept only while it still lists them.
  let reported = new Set<string>()
  const status = Effect.runFork(
    Stream.runForEach(replica.statusChanges, ({ pending, lastError, rejected }) =>
      Effect.sync(() => {
        const refusals = rejected.flatMap(({ opId, reason, operation }) =>
          reported.has(opId)
            ? []
            : changedCells(operation).map(cell => ({
                opId,
                ...cell,
                reason: Option.getOrElse(reason, () => 'Refused by the server'),
              })),
        )
        reported = new Set(rejected.map(({ opId }) => opId))
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
