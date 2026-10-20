import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api'
import * as Variant from '../variant.js'
import type { Widths } from '../widths.js'

/**
 * The media server's HTTP API: one route, a variant of an original named by
 * its content hash. Its params decode with the same `Variant.schema` that
 * `Provider.hosted` encodes with, over the same ladder, so the URLs a page
 * writes are the URLs this answers, and a width off the ladder is refused
 * before any work.
 */
export const makeApi = (widths: Widths) =>
  HttpApi.make('foldkit-media').add(
    HttpApiGroup.make('images').add(
      HttpApiEndpoint.get('variant', Variant.PATH, {
        params: { variant: Variant.schema(widths), hash: Variant.ContentHash },
        success: HttpApiSchema.StreamUint8Array(),
      }),
    ),
  )
