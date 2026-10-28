/**
 * What a Remote server answers past without telling the caller why: a defect
 * it answered "Internal error", and a committed mutation whose answer's read
 * or live publish failed. Each is reported through `Diagnostics.report`, so a
 * host's log (a Worker's `wrangler tail`) shows it by default.
 */
import { Cause } from 'effect'
import type { Diagnostic } from 'foldkit-remote'

const source = 'foldkit-remote-server'

/** A failure on this side, answered "Internal error"; the caller is told nothing of it. */
export interface ServerDefect extends Diagnostic {
  readonly _tag: 'ServerDefect'
  readonly cause: Cause.Cause<unknown>
}

/** A mutation that committed, answered without the read of the rows it names: the client reads them again. */
export interface AnswerUnread extends Diagnostic {
  readonly _tag: 'AnswerUnread'
  readonly mutation: string
  /** Why the read failed. */
  readonly reason: string
}

/** A mutation that committed, whose live publish failed: live subscribers do not hear it. */
export interface PublishFailed extends Diagnostic {
  readonly _tag: 'PublishFailed'
  readonly mutation: string
  readonly cause: Cause.Cause<unknown>
}

/** Every diagnostic a Remote server reports. */
export type RemoteServerDiagnostic = ServerDefect | AnswerUnread | PublishFailed

export const serverDefect = (cause: Cause.Cause<unknown>): ServerDefect => ({
  _tag: 'ServerDefect',
  source,
  level: 'error',
  message: `a request failed on this side, and its caller was answered "Internal error"\n${Cause.pretty(cause)}`,
  cause,
})

export const answerUnread = (mutation: string, reason: string): AnswerUnread => ({
  _tag: 'AnswerUnread',
  source,
  level: 'warning',
  message: `${mutation} committed, but reading its answer failed (${reason}): the client reads the rows it names again.`,
  mutation,
  reason,
})

export const publishFailed = (mutation: string, cause: Cause.Cause<unknown>): PublishFailed => ({
  _tag: 'PublishFailed',
  source,
  level: 'error',
  message: `${mutation} committed, but its live publish failed, so live subscribers do not hear it\n${Cause.pretty(cause)}`,
  mutation,
  cause,
})
