/**
 * What a Remote server answers past without telling the caller why: a defect
 * it answered "Internal error", a committed mutation whose answer's read or
 * live publish failed, and a client's time it would not take. Each is
 * reported through `Diagnostics.report`, so a host's log (a Worker's
 * `wrangler tail`) shows it by default.
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

/**
 * A write sent at a time further from this server's clock than its
 * `clockSkew`: the server wrote its own time instead, so what the client
 * predicted of it is off until the answer lands.
 */
export interface ClockSkewed extends Diagnostic {
  readonly _tag: 'ClockSkewed'
  readonly mutation: string
  /** The client's time, in milliseconds since the epoch. */
  readonly sent: number
  /** This server's clock when it read the write, which it wrote instead. */
  readonly own: number
  /** The bound, in milliseconds. */
  readonly bound: number
}

/** Every diagnostic a Remote server reports. */
export type RemoteServerDiagnostic = ServerDefect | AnswerUnread | PublishFailed | ClockSkewed

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

export const clockSkewed = (
  facts: Pick<ClockSkewed, 'mutation' | 'sent' | 'own' | 'bound'>,
): ClockSkewed => ({
  _tag: 'ClockSkewed',
  source,
  level: 'warning',
  message: `${facts.mutation} was sent at ${facts.sent}, ${Math.abs(facts.sent - facts.own)} ms from this server's clock (${facts.own}), past its clockSkew of ${facts.bound} ms: it was written at the server's time, so the client's prediction of it moves when the answer lands. The client's clock is off, or the request waited that long.`,
  ...facts,
})
