/**
 * What Sync meets and keeps going past. A replica whose exchange failed (also
 * in `status.lastError`), whose server's history changed under it, or whose
 * server refused an operation with a refusal it cannot read; a
 * document host that answered an upgrade "Internal error" or closed a socket
 * as one, whose cause neither the replica nor the response carries; and a
 * listener the application gave that threw. Each is reported through
 * `Diagnostics.report`.
 */
import { Cause, Effect, Option } from 'effect'
import { Diagnostics, type Diagnostic, type ReportDiagnostic } from 'foldkit-surface'
import type { ReplicaError } from './errors.js'
import type { TransportError } from './transport.js'

const source = 'foldkit-sync'

/** An exchange failed; the replica shows it in `status.lastError` and tries again on a backoff. */
export interface ExchangeFailed extends Diagnostic {
  readonly _tag: 'ExchangeFailed'
  readonly documentId: string
  readonly replicaId: string
  readonly error: ReplicaError | TransportError
}

/**
 * The server answered from another epoch: its history is not the one the
 * replica's cursor points into (it was reset), so the committed state was
 * rebuilt from its answer. The outbox is kept.
 */
export interface HistoryRebuilt extends Diagnostic {
  readonly _tag: 'HistoryRebuilt'
  readonly documentId: string
  readonly replicaId: string
}

/**
 * The server rejected an operation with a refusal this build cannot read: a
 * newer server's case, or one that does not decode. The rejection stands, and
 * reads with no refusal.
 */
export interface UnknownRefusal extends Diagnostic {
  readonly _tag: 'UnknownRefusal'
  readonly documentId: string
  readonly replicaId: string
  readonly opId: string
  /** Why it did not decode, cut to 500 characters: the value is the server's, of any size. */
  readonly issue: string
}

/** Where a document host broke. */
export type HostStage =
  /** Making or accepting the socket pair (`foldkit-sync/do`). */
  | 'Upgrade'
  /** Building `layer`, or `resolvePrincipal` dying or throwing. */
  | 'Resolve'
  /** Opening the journal. */
  | 'Journal'
  /** The application's `opens` or `settle` throwing as the exchange was made. */
  | 'Exchange'
  /** `revalidate` asking the resolver again, which died: the socket closed with 1011. */
  | 'Revalidate'
  /** Asking `opens` before a commit notice, which failed: the notice was not sent. */
  | 'Notice'
  /** The journal's stream of commits, which broke: the connection hears of no more commits. */
  | 'Changes'
  /** A Durable Object's pass of reactions, after an exchange or in `alarm()`, which broke: the alarm comes back later. */
  | 'Alarm'

/**
 * A document host broke on its own side: the upgrade was answered 500
 * "Internal error", the socket closed with 1011, or a notice went unsent. The
 * replica is told nothing of the cause.
 */
export interface HostDefect extends Diagnostic {
  readonly _tag: 'HostDefect'
  readonly stage: HostStage
  readonly cause: Cause.Cause<unknown>
}

/** Where a listener the application gave was called. */
export type ListenerSite =
  /** `Presence.subscribe`'s listener, after a peer changed. */
  | 'Presence'
  /** A listener on the socket transport's shared `socket` (`onMessage`), for another protocol's frames. */
  | 'Socket'
  /** `journalChanges`' listener, after a commit: the next commit calls it again. */
  | 'Notice'

/** A listener the application gave threw; the rest still ran, and so did Sync. */
export interface ListenerFailed extends Diagnostic {
  readonly _tag: 'ListenerFailed'
  readonly site: ListenerSite
  /** What it threw. */
  readonly thrown: unknown
}

/**
 * A replica sent a Message only the server appends: rejected as `Forbidden`.
 * No honest client sends one, so it is worth a look. It names the operation and
 * the replica it claims, never the payload.
 */
export interface ServerOnlySubmitted extends Diagnostic {
  readonly _tag: 'ServerOnlySubmitted'
  readonly documentId: string
  readonly opId: string
  /** The replica id the entry claims: what the sender wrote, not proof of who it is. */
  readonly replicaId: string
}

/**
 * A reaction's run failed, threw or timed out: that reaction waits at the
 * operation, on a backoff, and the others go on.
 */
export interface ReactionFailed extends Diagnostic {
  readonly _tag: 'ReactionFailed'
  readonly documentId: string
  readonly reaction: string
  /** None when the commit itself would not read, so no operation can be named. */
  readonly opId: Option.Option<string>
  readonly sequence: Option.Option<number>
  /** Why, cut to 500 characters. */
  readonly cause: string
}

/** A reaction's run was set aside, for a person (`parked`); the reaction went on without it. */
export interface ReactionParked extends Diagnostic {
  readonly _tag: 'ReactionParked'
  readonly documentId: string
  readonly reaction: string
  readonly opId: string
  readonly sequence: number
  /** Why, cut to 500 characters. */
  readonly cause: string
}

/**
 * The log was compacted past a reaction's cursor, against `settledThrough`:
 * the commits between were never reacted to, and the reaction resumes at the
 * floor.
 */
export interface ReactionSkipped extends Diagnostic {
  readonly _tag: 'ReactionSkipped'
  readonly documentId: string
  readonly reaction: string
  readonly from: number
  readonly to: number
}

/** Every diagnostic Sync reports. */
export type SyncDiagnostic =
  | ExchangeFailed
  | HistoryRebuilt
  | HostDefect
  | ListenerFailed
  | ReactionFailed
  | ReactionParked
  | ReactionSkipped
  | ServerOnlySubmitted
  | UnknownRefusal

export const exchangeFailed = (
  documentId: string,
  replicaId: string,
  error: ReplicaError | TransportError,
): ExchangeFailed => ({
  _tag: 'ExchangeFailed',
  source,
  level: 'warning',
  message: `${documentId} (replica ${replicaId}) failed an exchange (${error._tag}: ${error.message}); it is in status.lastError and tried again on a backoff.`,
  documentId,
  replicaId,
  error,
})

export const historyRebuilt = (documentId: string, replicaId: string): HistoryRebuilt => ({
  _tag: 'HistoryRebuilt',
  source,
  level: 'warning',
  message: `${documentId} (replica ${replicaId}): the server's history changed (another epoch), so the committed state was rebuilt from it; unsent edits were kept.`,
  documentId,
  replicaId,
})

export const unknownRefusal = (
  documentId: string,
  replicaId: string,
  opId: string,
  issue: string,
): UnknownRefusal => ({
  _tag: 'UnknownRefusal',
  source,
  level: 'warning',
  message: `${documentId} (replica ${replicaId}): the server rejected ${opId} with a refusal this build cannot read (${issue}); it reads with none.`,
  documentId,
  replicaId,
  opId,
  issue,
})

export const serverOnlySubmitted = (
  documentId: string,
  opId: string,
  replicaId: string,
): ServerOnlySubmitted => ({
  _tag: 'ServerOnlySubmitted',
  source,
  level: 'warning',
  message: `${documentId}: ${opId}, sent as replica ${replicaId}, carries a Message only the server appends; it was rejected as Forbidden.`,
  documentId,
  opId,
  replicaId,
})

export const reactionFailed = (
  documentId: string,
  reaction: string,
  at: Option.Option<{ readonly opId: string; readonly sequence: number }>,
  cause: string,
): ReactionFailed => ({
  _tag: 'ReactionFailed',
  source,
  level: 'warning',
  message: `${documentId}: reaction ${reaction} failed${Option.match(at, {
    onNone: () => ' reading the log',
    onSome: ({ opId, sequence }) => ` at ${opId} (${sequence})`,
  })} (${cause}); it waits there on a backoff.`,
  documentId,
  reaction,
  opId: Option.map(at, ({ opId }) => opId),
  sequence: Option.map(at, ({ sequence }) => sequence),
  cause,
})

export const reactionParked = (
  documentId: string,
  reaction: string,
  opId: string,
  sequence: number,
  cause: string,
): ReactionParked => ({
  _tag: 'ReactionParked',
  source,
  level: 'error',
  message: `${documentId}: reaction ${reaction} set ${opId} (${sequence}) aside (${cause}); it is in parked, and the reaction went on.`,
  documentId,
  reaction,
  opId,
  sequence,
  cause,
})

export const reactionSkipped = (
  documentId: string,
  reaction: string,
  from: number,
  to: number,
): ReactionSkipped => ({
  _tag: 'ReactionSkipped',
  source,
  level: 'error',
  message: `${documentId}: the log was compacted past reaction ${reaction}; commits ${from + 1} to ${to} were never reacted to.`,
  documentId,
  reaction,
  from,
  to,
})

const stageText: Record<HostStage, string> = {
  Upgrade: 'making or accepting the socket broke, and the upgrade was answered "Internal error"',
  Resolve:
    'building the layer or resolving the principal broke, and the upgrade was answered "Internal error"',
  Journal: 'opening the journal failed, and the upgrade was answered "Internal error"',
  Exchange: 'opens or settle threw, and the upgrade was answered "Internal error"',
  Revalidate: 'asking the resolver again broke, and the socket was closed with 1011',
  Notice: 'asking opens before a commit notice failed, and the notice was not sent',
  Changes: "the journal's stream of commits broke, and this connection hears of no more commits",
  Alarm: 'running the reactions broke, and the alarm was set to run them again later',
}

export const hostDefect = (stage: HostStage, cause: Cause.Cause<unknown>): HostDefect => ({
  _tag: 'HostDefect',
  source,
  level: 'error',
  message: `a document host broke: ${stageText[stage]}\n${Cause.pretty(cause)}`,
  stage,
  cause,
})

const siteText: Record<ListenerSite, string> = {
  Presence: 'a presence listener',
  Socket: "a listener on the replica's socket",
  Notice: 'the listener woken by a commit',
}

export const listenerFailed = (site: ListenerSite, thrown: unknown): ListenerFailed => ({
  _tag: 'ListenerFailed',
  source,
  level: 'error',
  message: `${siteText[site]} threw (${String(thrown)}); the other listeners ran.`,
  site,
  thrown,
})

/** Reports `diagnostic` to `reporter` when a host gave one, else to the reporter in context. */
export const reportTo = (
  reporter: ReportDiagnostic | undefined,
  diagnostic: SyncDiagnostic,
): Effect.Effect<void> => {
  const reported = Diagnostics.report(diagnostic)
  return reporter === undefined
    ? reported
    : Effect.provideService(reported, Diagnostics.Reporter, reporter)
}
