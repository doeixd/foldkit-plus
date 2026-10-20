import { Schema } from 'effect'

/** Where a variant came from: the edge's cache, the server's store, or made for this request. */
export const From = Schema.Literals(['edge', 'store', 'made'])
export type From = typeof From.Type

/** Every answer the media server gives, and nothing else: each has its status and its headers. */
export const Answer = Schema.TaggedUnion({
  /** A variant's bytes. */
  Variant: { etag: Schema.String, from: From },
  /** The variant the request's `If-None-Match` already holds. */
  NotModified: { etag: Schema.String },
  /** A URL outside the space, or no URL of this server at all. */
  Malformed: {},
  /** No original under the hash: an upload may yet put one there. */
  NotFound: {},
  /**
   * A spelling of the grammar outside this space: another release (the next
   * one, in a rollout) may offer it, so it is kept as briefly as `NotFound`.
   */
  Unoffered: {},
  /** The original is larger than the server reads: its bytes, and so this, never change. */
  TooLarge: {},
  /** The transformer failed: perhaps not for good. */
  Failed: {},
  /** The client has had too many variants made lately. */
  RateLimited: { retryAfterSeconds: Schema.Number },
  /** The host's allowance is spent. */
  Exhausted: {},
  /** An upload kept; its facts are the body. */
  Uploaded: {},
  /** The upload policy refused the request. */
  Forbidden: {},
  /** An upload that is not an image the server reads. */
  Unsupported: {},
})
export type Answer = typeof Answer.Type

const YEAR = 'public, max-age=31536000, immutable'

// What may yet be answered: the browser keeps nothing, and the edge a minute, to blunt a crawler.
const BRIEFLY: Readonly<Record<string, string>> = {
  'cache-control': 'no-store',
  'cdn-cache-control': 'public, max-age=60',
}

// Retry a spent allowance after an hour: the host's window is not known here.
const EXHAUSTED_RETRY_SECONDS = '3600'

/** The status of each answer. */
export const statusOf: (answer: Answer) => number = Answer.match({
  Variant: () => 200,
  NotModified: () => 304,
  Malformed: () => 400,
  NotFound: () => 404,
  Unoffered: () => 404,
  TooLarge: () => 413,
  Failed: () => 502,
  RateLimited: () => 429,
  Exhausted: () => 503,
  Uploaded: () => 201,
  Forbidden: () => 403,
  Unsupported: () => 415,
})

/**
 * Every response's headers, decided in one place, so the server, the edge
 * and a static host cannot disagree. A variant's URL names its bytes, so it
 * is kept for a year, and so are refusals that cannot change (a malformed URL,
 * an original too large). A missing original may appear, so only a CDN keeps
 * its 404, briefly; a failure is never kept. Every image may be read by a
 * canvas on another origin, and its type is never sniffed.
 */
export const headersFor = (answer: Answer): Readonly<Record<string, string>> => ({
  'x-content-type-options': 'nosniff',
  'access-control-allow-origin': '*',
  'cross-origin-resource-policy': 'cross-origin',
  'timing-allow-origin': '*',
  ...Answer.match(answer, {
    Variant: ({ etag, from }): Record<string, string> => ({
      'cache-control': YEAR,
      etag,
      'server-timing': `media;desc="${from}"`,
    }),
    NotModified: ({ etag }): Record<string, string> => ({ 'cache-control': YEAR, etag }),
    Malformed: (): Record<string, string> => ({ 'cache-control': YEAR }),
    NotFound: (): Record<string, string> => BRIEFLY,
    Unoffered: (): Record<string, string> => BRIEFLY,
    TooLarge: (): Record<string, string> => ({ 'cache-control': YEAR }),
    Failed: (): Record<string, string> => ({ 'cache-control': 'no-store' }),
    RateLimited: ({ retryAfterSeconds }): Record<string, string> => ({
      'cache-control': 'no-store',
      'retry-after': String(retryAfterSeconds),
    }),
    Exhausted: (): Record<string, string> => ({
      'cache-control': 'no-store',
      'retry-after': EXHAUSTED_RETRY_SECONDS,
    }),
    // An upload's answers are about one request, and are never kept.
    Uploaded: (): Record<string, string> => ({ 'cache-control': 'no-store' }),
    Forbidden: (): Record<string, string> => ({ 'cache-control': 'no-store' }),
    Unsupported: (): Record<string, string> => ({ 'cache-control': 'no-store' }),
  }),
})

/** Whether an `If-None-Match` names `etag` (weakly, as a GET compares, or `*`). */
export const matches = (ifNoneMatch: string | undefined, etag: string): boolean =>
  ifNoneMatch !== undefined &&
  ifNoneMatch
    .split(',')
    .map(tag => tag.trim().replace(/^W\//, ''))
    .some(tag => tag === '*' || tag === etag)
