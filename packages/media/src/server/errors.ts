import { Schema } from 'effect'

/** No original is stored under this hash. */
export class OriginalNotFound extends Schema.TaggedError<OriginalNotFound>()(
  'OriginalNotFound',
  { hash: Schema.String },
  { httpApiStatus: 404 },
) {}

/** The original is larger than the server will read: in bytes, or in pixels once decoded. */
export class OriginalTooLarge extends Schema.TaggedError<OriginalTooLarge>()(
  'OriginalTooLarge',
  { size: Schema.Number, limit: Schema.Number, unit: Schema.Literals(['bytes', 'pixels']) },
  { httpApiStatus: 413 },
) {}

/**
 * The transformer could not make the variant: the original is not an image it
 * reads, or it failed. Its reason stays in the server's log, not the response.
 */
export class TransformFailed extends Schema.TaggedError<TransformFailed>()(
  'TransformFailed',
  {},
  { httpApiStatus: 502 },
) {}

/** The host's transformation allowance is spent; variants already made still serve. */
export class QuotaExhausted extends Schema.TaggedError<QuotaExhausted>()(
  'QuotaExhausted',
  {},
  { httpApiStatus: 503 },
) {}
