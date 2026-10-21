import { Layer } from 'effect'
import type { Inspector } from '../describe.js'
import * as Variant from '../variant.js'
import { fetchOf, layer, type Options } from './handlers.js'
import type { Originals, Transformer, Variants } from './services.js'
import { uploadLayer, type UploadOptions, type UploadPolicy, type Uploads } from './upload.js'

const IMAGES = Variant.PATH.slice(0, Variant.PATH.indexOf(':'))
const UPLOADS = '/_media/'

/** What `serveFetch` answers, each side's services built from the request's bindings. */
export interface FetchOptions<Env> {
  /** `GET /_image/…`: the variants. A Worker request cannot wait on another's, so nothing coalesces. */
  readonly images?: Omit<Options, 'coalesce'> & {
    readonly layer: (env: Env) => Layer.Layer<Originals | Transformer | Variants, unknown>
  }
  /** `POST /_media/upload` and `GET /_media/facts`: originals entering. */
  readonly uploads?: UploadOptions & {
    readonly layer: (env: Env) => Layer.Layer<Uploads | Inspector | UploadPolicy, unknown>
  }
  /** Every path outside `/_image/` and `/_media/`: the application's own routes. A 404 when omitted. */
  readonly otherwise?: (request: Request, env: Env) => Promise<Response>
}

/**
 * The media server as a Worker's fetch handler. It owns `/_image/` and
 * `/_media/`: a route of either it was not given, another method (a
 * preflight, which the upload route never answers), or another path under
 * them is a 404, and everything else goes to `otherwise`. The services are
 * built from each environment's bindings once and kept; a layer that fails
 * to build answers a 500.
 */
export const serveFetch = <Env extends object>(
  options: FetchOptions<Env>,
): ((request: Request, env: Env) => Promise<Response>) => {
  const { images, uploads, otherwise } = options
  if (images === undefined && uploads === undefined) {
    throw new Error('serveFetch: give it `images`, `uploads`, or both')
  }
  const media = fetchOf<Env>(env =>
    Layer.mergeAll(
      images === undefined
        ? Layer.empty
        : layer({ ...images, coalesce: false }).pipe(Layer.provide(images.layer(env))),
      uploads === undefined
        ? Layer.empty
        : uploadLayer(uploads).pipe(Layer.provide(uploads.layer(env))),
    ),
  )
  return (request, env) => {
    const { pathname } = new URL(request.url)
    if (pathname.startsWith(IMAGES) || pathname.startsWith(UPLOADS)) return media(request, env)
    return otherwise === undefined
      ? Promise.resolve(new Response(null, { status: 404 }))
      : otherwise(request, env)
  }
}
