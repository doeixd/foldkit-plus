/**
 * What Sync meets and keeps going past. A replica whose exchange failed (also
 * in `status.lastError`), or whose server's history changed under it; a
 * document host that answered an upgrade "Internal error" or closed a socket
 * as one, whose cause neither the replica nor the response carries; and a
 * listener the application gave that threw. Each is reported through
 * `Diagnostics.report`.
 */
import { Cause, Effect } from 'effect'
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

/** Every diagnostic Sync reports. */
export type SyncDiagnostic = ExchangeFailed | HistoryRebuilt | HostDefect | ListenerFailed

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

const stageText: Record<HostStage, string> = {
  Upgrade: 'making or accepting the socket broke, and the upgrade was answered "Internal error"',
  Resolve:
    'building the layer or resolving the principal broke, and the upgrade was answered "Internal error"',
  Journal: 'opening the journal failed, and the upgrade was answered "Internal error"',
  Exchange: 'opens or settle threw, and the upgrade was answered "Internal error"',
  Revalidate: 'asking the resolver again broke, and the socket was closed with 1011',
  Notice: 'asking opens before a commit notice failed, and the notice was not sent',
  Changes: "the journal's stream of commits broke, and this connection hears of no more commits",
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
