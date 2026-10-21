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
  /**
   * No URL of this server's grammar. A later release may read it (a new format
   * or parameter, in a rollout), so it is kept as briefly as `NotFound`.
   */
  Malformed: {},
  /** No original under the hash: an upload may yet put one there. */
  NotFound: {},
  /**
   * A spelling of the grammar outside this space: another release (the next
   * one, in a rollout) may offer it, so it is kept as briefly as `NotFound`.
   */
  Unoffered: {},
  /**
   * A variant of an earlier revision, made no longer and not kept: its URL now names the
   * current revision's, at `location`. A 302 kept briefly, since a rollback to that revision,
   * or a server of it still in the rollout, answers the old URL again.
   */
  Moved: { location: Schema.String },
  /** The original is larger than the server reads: a server configured to read more may. */
  TooLarge: {},
  /** The transformer failed: perhaps not for good. */
  Failed: {},
  /** The client has had too many variants made lately. */
  RateLimited: { retryAfterSeconds: Schema.Number },
  /** The host's allowance is spent. */
  Exhausted: {},
  /** An upload kept; its facts are the body. */
  Uploaded: {},
  /** The upload policy refused who is asking. */
  Forbidden: {},
  /** The upload policy could not tell who is asking: an untrusted origin, a session ended. */
  Unauthenticated: {},
  /** An upload that is not an image the server reads. */
  Unsupported: {},
  /** The facts of an image named by URL; the facts are the body. */
  Described: {},
  /** No facts could be read for that URL: a host not allowed, a read that failed, no image. */
  Unavailable: {},
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
  Moved: () => 302,
  TooLarge: () => 413,
  Failed: () => 502,
  RateLimited: () => 429,
  Exhausted: () => 503,
  Uploaded: () => 201,
  Forbidden: () => 403,
  Unauthenticated: () => 401,
  Unsupported: () => 415,
  Described: () => 200,
  Unavailable: () => 422,
})

/**
 * Every response's headers, decided in one place, so the server, the edge
 * and a static host cannot disagree. A variant's URL names the variant, and
 * a new way of making it is a new revision, so it is kept for a year. A refusal of a variant is not: another release, or the
 * same one configured otherwise, may answer it, so only a CDN keeps it,
 * briefly; a failure is never kept. Every image may be read by a canvas on
 * another origin, and its type is never sniffed.
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
    Malformed: (): Record<string, string> => BRIEFLY,
    NotFound: (): Record<string, string> => BRIEFLY,
    Unoffered: (): Record<string, string> => BRIEFLY,
    Moved: ({ location }): Record<string, string> => ({ ...BRIEFLY, location }),
    TooLarge: (): Record<string, string> => BRIEFLY,
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
    Unauthenticated: (): Record<string, string> => ({ 'cache-control': 'no-store' }),
    Unsupported: (): Record<string, string> => ({ 'cache-control': 'no-store' }),
    Described: (): Record<string, string> => ({ 'cache-control': 'no-store' }),
    Unavailable: (): Record<string, string> => ({ 'cache-control': 'no-store' }),
  }),
})

/** Whether an `If-None-Match` names `etag` (weakly, as a GET compares, or `*`). */
export const matches = (ifNoneMatch: string | undefined, etag: string): boolean =>
  ifNoneMatch !== undefined &&
  ifNoneMatch
    .split(',')
    .map(tag => tag.trim().replace(/^W\//, ''))
    .some(tag => tag === '*' || tag === etag)
