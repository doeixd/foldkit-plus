/**
 * What the durable outbox holds, read from the Model alone: `outboxStatus`,
 * and `writing` over it. Apart from `outbox.ts` so a page that only reads the
 * state loads none of the outbox's store, locks or sending (#378).
 */
import { Data, Match, Option, Schema } from 'effect'
import { remoteError } from './client.js'
import type { RemoteModel } from './model.js'
import { Queued, sendable, signedKey, signedOwner, type OutboxState } from './queue.js'
import type { StoredWrite } from './outboxStore.js'
import type { RemoteError } from './remoteData.js'
import { RemotePrincipalChanged } from './wire.js'

/** One item of `outboxStatus`. */
export interface OutboxItem {
  readonly requestId: string
  /** The Mutation it names; none where the stored entry names none this version can read. */
  readonly mutation: Option.Option<string>
  readonly state: OutboxItemState
}

export type OutboxItemState = Data.TaggedEnum<{
  /** Not answered yet: `attempt` sends nothing answered so far, `error` the last one's. */
  Waiting: { readonly attempt: number; readonly error: Option.Option<RemoteError> }
  /** The server answered no: `Data.retry` or `Data.dismiss` it. */
  Failed: { readonly error: RemoteError }
  /**
   * The server could not tell who sent it (`Unauthenticated`), or it was made
   * for someone other than who is signed in now (`PrincipalChanged`, #405):
   * kept, and the writes after it held, until `Data.signedIn` reports a
   * sign-in. `error` says which.
   */
  WaitingForSignIn: { readonly error: RemoteError }
  /** Stored by a version of the app this one cannot read: `Data.dismiss` it. */
  Unreadable: { readonly reason: string }
}>
export const OutboxItemState = Data.taggedEnum<OutboxItemState>()

/** What the outbox holds, for a view: "3 changes waiting". */
export interface OutboxStatus {
  readonly waiting: number
  readonly failed: number
  /** Writes waiting for a sign-in; the `waiting` ones after them are held behind them. */
  readonly waitingForSignIn: number
  /** Every durable write not yet settled, in the order they are sent. */
  readonly items: ReadonlyArray<OutboxItem>
}

const MutationName = Schema.Struct({ mutation: Schema.String })

/**
 * The durable writes a domain has not yet settled, every tab's, in the order
 * the outbox sends them: how many wait, how many the server refused, and each
 * one's state, for a "3 changes waiting" line.
 */
export const outboxStatus = <AppModel>(
  domain: { readonly store: { get(model: AppModel): RemoteModel } },
  model: AppModel,
): OutboxStatus => statusOf(domain.store.get(model).outbox)

/**
 * Whether `write` was made for someone other than whom the page heard last:
 * held, not sent, until they are heard again. So is a visitor's or an
 * unstamped one in a queue someone else signed in owns; elsewhere such a
 * write is not held but claimed (`outbox.adopt`).
 */
export const heldFrom = (write: StoredWrite, outbox: OutboxState): boolean =>
  !sendable(write.madeAs, outbox.principal) &&
  (write.madeAs?._tag === 'Signed' ||
    (signedOwner(outbox.owner) &&
      !Option.exists(Option.flatMap(outbox.principal, signedKey), heard =>
        Option.contains(Option.flatMap(outbox.owner, signedKey), heard),
      )))

/** Why a write made for someone else than whom the page heard last waits. */
const heldFor = remoteError(
  new RemotePrincipalChanged({
    message: 'It was made for someone other than who is signed in now',
  }),
)

export const statusOf = (outbox: OutboxState): OutboxStatus => {
  const items = outbox.queue.map(
    Queued.$match({
      Readable: ({ write, attempt, delayed }): OutboxItem => ({
        requestId: write.operation,
        mutation: Option.some(write.mutation),
        state: Match.valueTags(write.state, {
          // Held for whom it was made for, as a refusal from the server would leave it.
          Waiting: () =>
            heldFrom(write, outbox)
              ? OutboxItemState.WaitingForSignIn({ error: heldFor })
              : OutboxItemState.Waiting({ attempt, error: delayed }),
          Failed: ({ error }) => OutboxItemState.Failed({ error }),
          WaitingForSignIn: ({ error }) => OutboxItemState.WaitingForSignIn({ error }),
        }),
      }),
      Unreadable: ({ operation, raw, reason }): OutboxItem => ({
        requestId: operation,
        mutation: Option.map(
          Schema.decodeUnknownOption(MutationName)(raw),
          ({ mutation }) => mutation,
        ),
        state: OutboxItemState.Unreadable({ reason }),
      }),
    }),
  )
  return {
    waiting: items.filter(item => item.state._tag === 'Waiting').length,
    failed: items.filter(item => item.state._tag === 'Failed').length,
    waitingForSignIn: items.filter(item => item.state._tag === 'WaitingForSignIn').length,
    items,
  }
}
