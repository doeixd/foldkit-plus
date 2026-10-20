import { Schema } from 'effect'
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api'
import * as Variant from '../variant.js'

/**
 * The media server's HTTP API: one route, a variant of an original named by
 * its content hash. The route takes its params as text, and the handler
 * decodes them with the space's Schema, the one `Provider.hosted` encodes
 * with, so a variant outside the space is refused before any work, and that
 * refusal, like every answer, carries the headers `headersFor` decides.
 */
export const MediaApi = HttpApi.make('foldkit-media').add(
  HttpApiGroup.make('images').add(
    HttpApiEndpoint.get('variant', Variant.PATH, {
      params: { hash: Schema.String, variant: Schema.String },
      success: HttpApiSchema.StreamUint8Array(),
    }),
  ),
)
