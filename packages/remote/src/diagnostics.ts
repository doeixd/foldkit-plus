/**
 * What Remote's client meets and keeps going past, as diagnostics: an answer
 * that left out what the client showed (`verifyAnswers`), a placement the
 * server's order disagreed with (`verifyPlacement`), and a failed write the
 * application does not hear. The reducer records each in the Model's
 * `diagnostics`; the wiring and `Remote.fold` report what an update recorded.
 */
import { Option } from 'effect'
import type { Diagnostic } from 'foldkit-surface'
import type { RemoteError } from './remoteData.js'

const source = 'foldkit-remote'

/** A row a mutation's answer left without fields the client showed while it was pending. */
export interface AnswerGap extends Diagnostic {
  readonly _tag: 'AnswerGap'
  /** The request the answer settled, as `Data.mutate` returned it. */
  readonly requestId: string
  /** The mutation's name, when the request was started with one (`Data.mutate` always is). */
  readonly mutation: Option.Option<string>
  readonly entity: string
  readonly id: string
  /** The fields shown and not answered, which the store does not otherwise hold. */
  readonly fields: ReadonlyArray<string>
}

/** A list the client placed rows in one order and the server then listed in another. */
export interface PlacementMismatch extends Diagnostic {
  readonly _tag: 'PlacementMismatch'
  readonly connection: string
  /** The keys as placed, as far as the server's page reached. */
  readonly placed: ReadonlyArray<string>
  /** The keys of the server's first page. */
  readonly served: ReadonlyArray<string>
}

/**
 * A write that failed while the application's own `update` does not receive
 * `MutationFailed`: its optimistic change went, and nothing answered it.
 */
export interface WriteUnheard extends Diagnostic {
  readonly _tag: 'WriteUnheard'
  readonly requestId: string
  readonly mutation: Option.Option<string>
  readonly error: RemoteError
}

/** Every diagnostic Remote's client records. */
export type RemoteDiagnostic = AnswerGap | PlacementMismatch | WriteUnheard

const named = (mutation: Option.Option<string>, requestId: string): string =>
  Option.match(mutation, {
    onNone: () => `Request ${requestId}`,
    onSome: name => `${name} (request ${requestId})`,
  })

export const answerGap = (
  facts: Pick<AnswerGap, 'requestId' | 'mutation' | 'entity' | 'id' | 'fields'>,
): AnswerGap => ({
  _tag: 'AnswerGap',
  source,
  level: 'warning',
  message: `${named(facts.mutation, facts.requestId)} answered ${facts.entity}:${facts.id} without ${facts.fields.join(', ')}, which the client showed while it was pending. They are read again, so the row reads Loading meanwhile: answer with them, or select fewer.`,
  ...facts,
})

export const placementMismatch = (
  facts: Pick<PlacementMismatch, 'connection' | 'placed' | 'served'>,
): PlacementMismatch => ({
  _tag: 'PlacementMismatch',
  source,
  level: 'warning',
  message: `The client placed rows in ${facts.connection} as [${facts.placed.join(', ')}], and the server's first page lists [${facts.served.join(', ')}]: the client's order and the server's disagree.`,
  ...facts,
})

export const writeUnheard = (
  facts: Pick<WriteUnheard, 'requestId' | 'mutation' | 'error'>,
): WriteUnheard => ({
  _tag: 'WriteUnheard',
  source,
  level: 'warning',
  message: `${named(facts.mutation, facts.requestId)} failed (${facts.error._tag}: ${facts.error.message}) and the application's update does not hear it, so its change went with no word. Share MutationFailed (Data.wiring(actives, { shared: ['MutationFailed'] })) and show Data.failedWrites.`,
  ...facts,
})

/**
 * How many diagnostics the Model keeps, the newest. Each was reported as it
 * was recorded; the bound keeps a long session's failed writes from growing it.
 */
const DIAGNOSTIC_WINDOW = 256

/** `kept` with `recorded` after it, within the window; `kept` itself when nothing was recorded. */
export const withDiagnostics = (
  kept: ReadonlyArray<RemoteDiagnostic>,
  recorded: ReadonlyArray<RemoteDiagnostic>,
): ReadonlyArray<RemoteDiagnostic> =>
  recorded.length === 0 ? kept : [...kept, ...recorded].slice(-DIAGNOSTIC_WINDOW)
