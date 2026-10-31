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
  /** The stream's key, as `liveStatus` and the Model's `streams` name it. */
  readonly stream: string
  readonly error: RemoteError
}

/**
 * A durable write the outbox read back and cannot send: stored by a version
 * of the application that registered a Mutation this one lacks, or whose
 * input this one's `Input` no longer decodes. It is kept, shown no layer and
 * never sent, and the writes after it are sent.
 */
export interface OutboxUnreadable extends Diagnostic {
  readonly _tag: 'OutboxUnreadable'
  /** Its operation id, which `Data.dismiss` takes. */
  readonly requestId: string
  readonly reason: string
}

/**
 * The outbox could not write its store (it is full, or the browser refuses
 * storage): its writes are still sent, but a reload before they are answered
 * loses them.
 */
export interface OutboxUnsaved extends Diagnostic {
  readonly _tag: 'OutboxUnsaved'
  readonly key: string
  readonly reason: string
}

/** Every diagnostic Remote's client records. */
export type RemoteDiagnostic =
  | LiveRefused
  | OutboxUnreadable
  | OutboxUnsaved
  | PredictionMismatch
  | WriteUnheard

const named = (mutation: Option.Option<string>, requestId: string): string =>
  Option.match(mutation, {
    onNone: () => `Request ${requestId}`,
    onSome: name => `${name} (request ${requestId})`,
  })

const shownAs = (value: unknown): string => JSON.stringify(value) ?? String(value)

export const predictionMismatch = (part: PredictionPart): PredictionMismatch => ({
  _tag: 'PredictionMismatch',
  source,
  // A disagreement is a defect of the prediction or of the server, not advice:
  // it reaches `console.error`, where a test and a browser look.
  level: 'error',
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

/**
 * The parts of a prediction the server is meant to answer otherwise, each
 * with the reason, by the domain's own mutation and query names: a mutation's
 * `Value` (the server writes another value than the client shows, such as a
 * time it stamps) or `Gap` (its answer leaves out fields the client showed),
 * and a query's `Placement` (the server orders the list by what the client
 * cannot judge). An expected part records no `PredictionMismatch`.
 */
export interface ExpectedDisagreements<
  MutationName extends string = string,
  QueryName extends string = string,
> {
  readonly mutations?: {
    readonly [Name in MutationName]?: { readonly Value?: string; readonly Gap?: string }
  }
  readonly queries?: { readonly [Name in QueryName]?: { readonly Placement: string } }
}

/**
 * `verifyPredictions` with what the server is meant to answer otherwise.
 * `on` is the application's mode, which no package reads for itself: pass
 * `import.meta.env?.DEV === true` where the domain is declared, so Vite's
 * dev server and Vitest verify and a production build does not.
 */
export interface VerifyPredictions<
  MutationName extends string = string,
  QueryName extends string = string,
> {
  readonly on: boolean
  readonly expected?: ExpectedDisagreements<MutationName, QueryName>
}

/**
 * Whether predictions are verified, and which parts are expected to
 * disagree, refused where the domain is made when an expected part names
 * a mutation or a query the domain lacks, or gives no reason.
 */
export const verification = (
  verify: boolean | VerifyPredictions | undefined,
  registered: { readonly mutations: ReadonlySet<string>; readonly queries: ReadonlySet<string> },
): {
  readonly on: boolean
  readonly expects: (part: PredictionPart['_tag'], name: Option.Option<string>) => boolean
} => {
  if (verify === undefined || typeof verify === 'boolean')
    return { on: verify === true, expects: () => false }
  const expected = new Map<string, string>()
  const declare = (kind: 'mutations' | 'queries', parts: object | undefined) => {
    for (const [name, reasons] of Object.entries(parts ?? {})) {
      if (!registered[kind].has(name))
        throw new Error(
          `[foldkit-remote] verifyPredictions.expected.${kind} names "${name}", which this domain does not register.`,
        )
      for (const [part, reason] of Object.entries(reasons as Record<string, unknown>)) {
        if (typeof reason !== 'string' || reason.trim() === '')
          throw new Error(
            `[foldkit-remote] verifyPredictions.expected.${kind}.${name}.${part} gives no reason: say why the server answers otherwise.`,
          )
        expected.set(`${part} ${name}`, reason)
      }
    }
  }
  declare('mutations', verify.expected?.mutations)
  declare('queries', verify.expected?.queries)
  return {
    on: verify.on,
    expects: (part, name) => Option.exists(name, each => expected.has(`${part} ${each}`)),
  }
}

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

export const outboxUnreadable = (
  facts: Pick<OutboxUnreadable, 'requestId' | 'reason'>,
): OutboxUnreadable => ({
  _tag: 'OutboxUnreadable',
  source,
  level: 'warning',
  message: `A stored write (${facts.requestId}) cannot be sent: ${facts.reason}. It was made by an earlier version of the application; it is kept until Data.dismiss, and the writes after it are sent.`,
  ...facts,
})

export const outboxUnsaved = (facts: Pick<OutboxUnsaved, 'key' | 'reason'>): OutboxUnsaved => ({
  _tag: 'OutboxUnsaved',
  source,
  level: 'warning',
  message: `The outbox could not write ${facts.key} (${facts.reason}). Its writes are sent, but a reload before they are answered loses them.`,
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
