/**
 * The edits as a Sync document, derived from the application: `edits` is the
 * replicated slice and `EditedProducts` the one durable Message. Replay is the
 * application's own `update`, so the server's journal and every replica fold
 * the same operations the same way.
 */
import { Effect, Fiber, Layer, Match, Option, Schema, Stream } from 'effect'
import { modifyFields } from 'foldkit/struct'
import type { RemoteClient } from 'foldkit-remote'
import { BundleSurface } from 'foldkit-bundle-surface'
import { type Contract, MessageSet, Module, Projection } from 'foldkit-surface'
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
  type Refusal,
  placements,
  Products,
  replacedOf,
  Shown,
  shownWith,
} from './app.js'
import { type ProductEdit, ProductEdits } from './domain.js'
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
    documentId: DocumentId.make('registry-edits-4'),
    shared: Projection.pick(App.model.edits),
    durable: MessageSet.make(App, [Message.EditedProducts, Message.AbsorbedEdits]),
    // Dropping edits from every replica is the server's: a client's would drop
    // someone else's edits before their rows were read.
    authorize: { AbsorbedEdits: ({ principal }) => principal.actorId === server.actorId },
    // The journal writes in the sequence each edit committed at, which the
    // table's revision is compared with to know which edits a row holds, and
    // who committed it and from which replica, so a page can tell another's
    // edit from its own, though it be the same person's in another tab.
    stamp: {
      EditedProducts: ({ changes }, commit) =>
        Message.EditedProducts({ changes, ...ProductEdits.stamped(commit) }),
    },
  })

/**
 * Annotated: the inferred type expands a Foldkit-private alias that
 * declaration emit cannot name. It is the same value.
 */
export const RegistrySync: SyncContract<Message, Shared> = definition

/** For `Module`: this contract owns `edits` and records the durable tags. */
export const contract: Contract = definition.contract

/**
 * Who owns each Model field, from the contracts that claim them: the grid's
 * placement, Remote's wiring and this document. The page's panel lists it.
 */
export const manifest = Module.manifest(BundleSurface.module(App, placements, [contract]))

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
          ProductEdits.cellsOf(changes).map(({ id, member }) => ({ id, column: member })),
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
    view: (model, h) => view(model, h, manifest),
    subscriptions: placements.subscriptions(),
    resources: options.resources,
    // An edit of this device's that another device's later commit replaced
    // is said, not silently overwritten.
    // A server reset starts the journal's sequence over, so the revisions on
    // the rows read before it count a history that is gone: an edit committed
    // at a low sequence since would look absorbed. Nothing is held over it;
    // the rows are read again.
    onReinstall: (next, previous, { reset }) => {
      if (reset) return { model: Products.refresh(Shown.clear(next)) }
      const replaced = replacedOf(previous, next)
      return {
        model:
          replaced.length === 0
            ? next
            : modifyFields(next, { replaced: before => [...before, ...replaced] }),
      }
    },
    // In the same update as every change to the edits or the rows, so no
    // frame draws a cached row without an edit the journal absorbed after
    // that row was read. Not in `update`: replay may not touch Remote.
    afterUpdate: model => ({ model: shownWith(model) }),
  })
  // Dispatched before any exchange can reinstall, so every reinstall knows
  // which edits are this device's.
  mounted.dispatch(Message.ReplicaNamed({ replica: replica.replicaId }))
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
