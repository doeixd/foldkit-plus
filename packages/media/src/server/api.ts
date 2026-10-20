import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api'
import * as Variant from '../variant.js'
import { OriginalNotFound, OriginalTooLarge, QuotaExhausted, TransformFailed } from './errors.js'

/**
 * The media server's HTTP API: one route, a variant of an original named by
 * its content hash. Its params decode with the same space's Schema that
 * `Provider.hosted` encodes with, so the URLs a page writes are the URLs this
 * answers, and a variant outside the space is refused before any work.
 */
export const makeApi = (space: Variant.Space) =>
  HttpApi.make('foldkit-media').add(
    HttpApiGroup.make('images').add(
      HttpApiEndpoint.get('variant', Variant.PATH, {
        params: { hash: Variant.ContentHash, variant: space.schema },
        success: HttpApiSchema.StreamUint8Array(),
        error: [OriginalNotFound, OriginalTooLarge, TransformFailed, QuotaExhausted],
      }),
    ),
  )

export type MediaApi = ReturnType<typeof makeApi>
