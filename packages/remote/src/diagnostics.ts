/**
 * What Remote's client meets and keeps going past, as diagnostics: a
 * prediction the server's answer disagreed with (`verifyPredictions`), a
 * failed write the application does not hear, and a live stream refused. The
 * reducer records each in the Model's `diagnostics`; the wiring and
 * `Remote.fold` report what an update recorded.
 */
import { Data, Option } from 'effect'
import type { Diagnostic } from 'foldkit-surface'
import type { RemoteError } from './remoteData.js'

const source = 'foldkit-remote'

/**
 * Which part of a prediction the server's answer disagreed with. `Value`: a
 * field a pending write showed, answered with another value. `Placement`: a
 * list the client placed rows in, which the server's first page lists
 * otherwise. `Gap`: a row whose answer left out fields the client showed,
 * so they are read again and the row reads `Loading` meanwhile.
 */
export type PredictionPart = Data.TaggedEnum<{
  Value: {
    /** The request the answer settled, as `Data.mutate` returned it. */
    readonly requestId: string
    /** The mutation's name, when the request was started with one (`Data.mutate` always is). */
    readonly mutation: Option.Option<string>
    readonly entity: string
    readonly id: string
    readonly field: string
    /** What the client showed while the write was pending, encoded. */
    readonly shown: unknown
    /** What the answer holds, encoded. */
    readonly answered: unknown
  }
  Placement: {
    readonly connection: string
    /** The keys as placed, as far as the server's page reached. */
    readonly placed: ReadonlyArray<string>
    /** The keys of the server's first page. */
    readonly served: ReadonlyArray<string>
  }
  Gap: {
    readonly requestId: string
    readonly mutation: Option.Option<string>
    readonly entity: string
    readonly id: string
    /** The fields shown and not answered, which the store does not otherwise hold. */
    readonly fields: ReadonlyArray<string>
  }
}>
export const PredictionPart = Data.taggedEnum<PredictionPart>()

/**
 * Under `verifyPredictions`, a part the client predicted that the server's
 * answer disagreed with: where the client's evaluation is not unknown, it
 * should equal the server's (operations-phase6-DESIGN §2).
 */
export interface PredictionMismatch extends Diagnostic {
  readonly _tag: 'PredictionMismatch'
  readonly part: PredictionPart
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

/**
 * A live stream the server refused for what it asks (`RemoteLiveRefused`):
 * more rows of one Entity than its `maxIdsPerEntity`. It is not reopened
 * until what it asks changes, so those rows are not live meanwhile.
 */
export interface LiveRefused extends Diagnostic {
  readonly _tag: 'LiveRefused'
  /** The stream's key, as `Data.liveStatus` and the Model's `streams` name it. */
  readonly stream: string
  readonly error: RemoteError
}

/** Every diagnostic Remote's client records. */
export type RemoteDiagnostic = LiveRefused | PredictionMismatch | WriteUnheard

const named = (mutation: Option.Option<string>, requestId: string): string =>
  Option.match(mutation, {
    onNone: () => `Request ${requestId}`,
    onSome: name => `${name} (request ${requestId})`,
  })

const shownAs = (value: unknown): string => JSON.stringify(value) ?? String(value)

export const predictionMismatch = (part: PredictionPart): PredictionMismatch => ({
  _tag: 'PredictionMismatch',
  source,
  level: 'warning',
  message: PredictionPart.$match(part, {
    Value: facts =>
      `${named(facts.mutation, facts.requestId)} showed ${facts.entity}:${facts.id}.${facts.field} as ${shownAs(facts.shown)} while it was pending, and the server answered ${shownAs(facts.answered)}: the client's prediction and the server's write disagree.`,
    Placement: facts =>
      `The client placed rows in ${facts.connection} as [${facts.placed.join(', ')}], and the server's first page lists [${facts.served.join(', ')}]: the client's order and the server's disagree.`,
    Gap: facts =>
      `${named(facts.mutation, facts.requestId)} answered ${facts.entity}:${facts.id} without ${facts.fields.join(', ')}, which the client showed while it was pending. They are read again, so the row reads Loading meanwhile: answer with them, or select fewer.`,
  }),
  part,
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

export const liveRefused = (facts: Pick<LiveRefused, 'stream' | 'error'>): LiveRefused => ({
  _tag: 'LiveRefused',
  source,
  level: 'warning',
  message: `The server refused a live stream (${facts.error.message}), so what it asks is not live and is not asked again until it changes. Watch fewer rows at once, or raise the server's maxIdsPerEntity.`,
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
