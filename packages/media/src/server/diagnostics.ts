/**
 * What the media server answers past without telling the caller why: a store
 * or rate limiter that broke and was worked around, an image it could not
 * transform or inspect, facts it could not read, and a defect answered 500.
 * Each is reported through `Diagnostics.report`, so a host's log (a Worker's
 * `wrangler tail`) shows it by default.
 */
import { Cause } from 'effect'
import type { Diagnostic } from 'foldkit-surface'

const source = 'foldkit-media'

/**
 * A store that failed and was worked around: a read is taken as a miss and a
 * write is dropped, since what it keeps (a variant, an edge copy, an
 * original's facts) is made again when missed.
 */
export interface StoreFailed extends Diagnostic {
  readonly _tag: 'StoreFailed'
  /** `variants` (the `Variants` store), `edge` (the Workers cache in front of it), `facts` (`factsOf`'s `cache`). */
  readonly store: 'variants' | 'edge' | 'facts'
  readonly operation: 'read' | 'write'
  readonly key: string
  readonly cause: unknown
}

/** A rate limiter that failed, so the request was admitted unlimited. */
export interface AdmissionFailed extends Diagnostic {
  readonly _tag: 'AdmissionFailed'
  /** `RateLimiter` (`admissionRateLimiter`) or `binding` (`admissionRateLimit`). */
  readonly limiter: 'RateLimiter' | 'binding'
  readonly client: string
  readonly cause: unknown
}

/**
 * An image the transformer could not transform, or the inspector could not
 * read, answered `TransformFailed` with no cause. An inspection is most often
 * a file that is no image, so it is a warning; a transform, of an original
 * already taken in, is an error.
 */
export interface ImageFailed extends Diagnostic {
  readonly _tag: 'ImageFailed'
  readonly step: 'transform' | 'inspect'
  readonly cause: unknown
}

/** The facts route answered `Unavailable`, whose reason the caller is not told. */
export interface FactsUnanswered extends Diagnostic {
  readonly _tag: 'FactsUnanswered'
  readonly url: string
  readonly reason: string
}

/** A defect `serveFetch` answered 500, which its caller is told nothing of. */
export interface RequestDefect extends Diagnostic {
  readonly _tag: 'RequestDefect'
  readonly cause: Cause.Cause<unknown>
}

/** Every diagnostic the media server reports. */
export type MediaDiagnostic =
  | StoreFailed
  | AdmissionFailed
  | ImageFailed
  | FactsUnanswered
  | RequestDefect

export const storeFailed = (
  facts: Pick<StoreFailed, 'store' | 'operation' | 'key' | 'cause'>,
): StoreFailed => ({
  _tag: 'StoreFailed',
  source,
  level: 'error',
  message: `the ${facts.store} store failed a ${facts.operation} of ${facts.key} (${String(facts.cause)}), ${facts.operation === 'read' ? 'which was taken as a miss' : 'which was dropped'}: the request was answered, and what it keeps is made again.`,
  ...facts,
})

export const admissionFailed = (
  facts: Pick<AdmissionFailed, 'limiter' | 'client' | 'cause'>,
): AdmissionFailed => ({
  _tag: 'AdmissionFailed',
  source,
  level: 'error',
  message: `the ${facts.limiter === 'binding' ? 'rate limit binding' : 'RateLimiter'} failed (${String(facts.cause)}), so ${facts.client} was admitted with no limit.`,
  ...facts,
})

export const imageFailed = (step: ImageFailed['step'], cause: unknown): ImageFailed => ({
  _tag: 'ImageFailed',
  source,
  level: step === 'inspect' ? 'warning' : 'error',
  message: `Media.${step} failed (${String(cause)}), and was answered TransformFailed${step === 'inspect' ? ': most often a file that is no image' : ''}.`,
  step,
  cause,
})

export const factsUnanswered = (url: string, reason: string): FactsUnanswered => ({
  _tag: 'FactsUnanswered',
  source,
  level: 'warning',
  message: `the facts of ${url} were answered Unavailable: ${reason}.`,
  url,
  reason,
})

export const requestDefect = (cause: Cause.Cause<unknown>): RequestDefect => ({
  _tag: 'RequestDefect',
  source,
  level: 'error',
  message: `a media request failed on this side, and its caller was answered 500\n${Cause.pretty(cause)}`,
  cause,
})
