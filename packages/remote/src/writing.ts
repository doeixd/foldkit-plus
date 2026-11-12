import { Option, Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'
import type { EntityRef } from './entity.js'
import type { Registered, MutationName } from './domain.js'
import { assertRegistered } from './registered.js'
import type { MutationDescriptor } from './mutationDescriptor.js'
import type { RemoteModel } from './model.js'
import { OutboxItemState, statusOf } from './outboxStatus.js'
import { operationOf } from './queue.js'
import { remoteErrorSchema } from './remoteData.js'

const requestIds = Schema.Array(Schema.String)

/**
 * What saving a domain's writes looks like right now, the worst of them
 * (`writing`). Every id is a request id, the one `Data.mutate` returned and
 * `Data.mutation` reads: a durable write's operation id is its request id.
 * Matched with `Writing.match`.
 */
export const Writing = defineTaggedUnion({
  /** Nothing is being saved. */
  None: {},
  /**
   * Sent, or about to be, and no answer is due yet: a write on its way. Say
   * nothing for this alone, as every write passes through it.
   */
  Sending: { requestIds },
  /**
   * A durable write whose send went unanswered and will be tried again, so
   * the server may have it already. A "waiting to send" line reads this.
   * `error` is why the last send failed, when it did.
   */
  Unanswered: { requestIds, error: Schema.Option(remoteErrorSchema) },
  /** Held until someone signs in: `Data.signedIn` reports it. */
  WaitingForSignIn: { requestIds },
  /** Stored by a version of the app this one cannot read: kept, never sent; `Data.dismiss` it. */
  Unreadable: { requestIds },
  /** The server answered no: `Data.retry` or `Data.dismiss` it. */
  Failed: { requestIds },
})
export type Writing = typeof Writing.Type

type Saving = Exclude<Writing, { readonly _tag: 'None' }>

// Typed by the tags, so a new variant must be ranked.
const rank: Record<Saving['_tag'], number> = {
  Sending: 1,
  Unanswered: 2,
  WaitingForSignIn: 3,
  Unreadable: 4,
  Failed: 5,
}

/** What `writing` reads of a domain. */
export interface WritingDomain<
  AppModel,
  Mutations extends readonly MutationDescriptor<any, any, any>[],
> {
  readonly store: { get(model: AppModel): RemoteModel }
  readonly contract: { readonly name: string }
  readonly mutations: Mutations
  readonly registry: {
    readonly mutations: ReadonlyMap<string, MutationDescriptor<any, any, any>>
  }
}

/** Which writes `writing` reads: those matching every field given. */
export interface WritingFilter<M> {
  /** Writes of this Mutation, as `Data.mutate` was given it. */
  readonly mutation?: M
  /** Writes whose pending layer patches or deletes this row. */
  readonly row?: EntityRef<string, any>
}

interface Write {
  readonly requestId: string
  readonly mutation: Option.Option<string>
  readonly saying: Saving
}

/**
 * What is being saved, in one value, derived from the ledger and the outbox
 * and so right after a reload and in a second tab: a plain write is
 * `Sending` until its answer, a durable one is read from `outboxStatus`'s
 * states. The worst state of the matching writes is the answer, in the
 * order `Failed`, `Unreadable`, `WaitingForSignIn`, `Unanswered`, `Sending`,
 * and its `requestIds` are those writes alone: plain ones in the order they
 * were started, then durable ones in the order the outbox sends them.
 * Reads, never writes.
 *
 * `Sending` is every write's first state, so a view that says "waiting to
 * send" reads `Unanswered`. `filter.mutation` takes a Mutation the domain
 * registers; one it does not register throws, as `Data.failedWrites` does.
 */
export const writing = <
  AppModel,
  const Mutations extends readonly MutationDescriptor<any, any, any>[],
  M extends MutationDescriptor<any, any, any> = never,
>(
  domain: WritingDomain<AppModel, Mutations>,
  model: AppModel,
  filter?: WritingFilter<M & Registered<M['name'], MutationName<Mutations[number]>, 'Mutation'>>,
): Writing => {
  const mutation = filter?.mutation
  if (mutation !== undefined) {
    assertRegistered(domain, 'Mutation', domain.registry.mutations, mutation.name)
  }
  const remote = domain.store.get(model)
  const { mutations, outbox } = remote
  const queued = new Set(outbox.queue.map(operationOf))
  const named = (requestId: string): Option.Option<string> =>
    Option.fromUndefinedOr(mutations.writes.get(requestId)?.mutation)

  const plain: ReadonlyArray<Write> = [
    ...mutations.pending,
    // A retry in flight is pending again, not failed.
    ...[...mutations.failed].filter(requestId => !mutations.pending.has(requestId)),
  ]
    .filter(requestId => !queued.has(requestId))
    .map(requestId => ({
      requestId,
      mutation: named(requestId),
      saying: mutations.pending.has(requestId)
        ? Writing.Sending({ requestIds: [requestId] })
        : Writing.Failed({ requestIds: [requestId] }),
    }))
  const durable: ReadonlyArray<Write> = statusOf(outbox).items.map(item => ({
    requestId: item.requestId,
    mutation: item.mutation,
    saying: OutboxItemState.$match(item.state, {
      Waiting: ({ attempt, error }) =>
        attempt > 0
          ? Writing.Unanswered({ requestIds: [item.requestId], error })
          : Writing.Sending({ requestIds: [item.requestId] }),
      Failed: () => Writing.Failed({ requestIds: [item.requestId] }),
      WaitingForSignIn: () => Writing.WaitingForSignIn({ requestIds: [item.requestId] }),
      Unreadable: () => Writing.Unreadable({ requestIds: [item.requestId] }),
    }),
  }))

  const { row } = filter ?? {}
  const layered =
    row === undefined
      ? undefined
      : new Set(
          remote.optimistic.layers
            .filter(
              layer =>
                layer.patches.some(patch => patch.entity === row.entity && patch.id === row.id) ||
                layer.deletes.some(drop => drop.entity === row.entity && drop.id === row.id),
            )
            .map(layer => layer.id),
        )
  const matching = [...plain, ...durable].filter(
    write =>
      (mutation === undefined || Option.contains(write.mutation, mutation.name)) &&
      (layered === undefined || layered.has(write.requestId)),
  )
  const sayings = matching.map(write => write.saying)
  const worst = sayings.reduce<Saving | undefined>(
    (leading, saying) =>
      leading === undefined || rank[saying._tag] > rank[leading._tag] ? saying : leading,
    undefined,
  )
  return worst === undefined
    ? Writing.None()
    : {
        ...worst,
        requestIds: sayings
          .filter(saying => saying._tag === worst._tag)
          .flatMap(saying => saying.requestIds),
      }
}
