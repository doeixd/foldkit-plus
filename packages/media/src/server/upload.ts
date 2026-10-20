/**
 * Where an original enters: `POST /_media/upload` takes an image's bytes,
 * reads its facts (`describe`, through the `Inspector`), keeps the bytes
 * under their content hash (`Uploads`), and answers the facts as an
 * `ImageAsset`, for whoever registers them (a CMS's asset row). The bytes
 * travel once, over HTTP; only the facts go on to the application's data.
 */
import { Context, Effect, Layer, Option, Schema, Stream } from 'effect'
import { HttpServerResponse, type HttpServerRequest } from 'effect/http'
import { HttpApi, HttpApiBuilder, HttpApiEndpoint, HttpApiGroup } from 'effect/http-api'
import { KeyValueStore } from 'effect/persistence'
import { ImageAsset } from '../asset.js'
import { describe, type Inspector } from './describe.js'
import { fetchOf } from './handlers.js'
import { OriginalTooLarge } from './errors.js'
import { Answer, headersFor, statusOf } from './headers.js'

/** The upload route's API, apart from `MediaApi`, so the variant server needs none of its services. */
export const UploadApi = HttpApi.make('foldkit-media-upload').add(
  HttpApiGroup.make('uploads').add(HttpApiEndpoint.post('upload', '/_media/upload')),
)

/** Keeps an uploaded original under its content hash: the one writer of what `Originals` reads. */
export class Uploads extends Context.Service<
  Uploads,
  { readonly put: (hash: string, bytes: Uint8Array<ArrayBuffer>) => Effect.Effect<void> }
>()('foldkit-media/Uploads') {}

/** The request may not upload. Why stays with the policy: the answer says only no. */
export class UploadForbidden extends Schema.TaggedError<UploadForbidden>()(
  'UploadForbidden',
  {},
  { httpApiStatus: 403 },
) {}

/**
 * Who may upload, asked of every request before its body is read. The route
 * has no default: an application that serves uploads says who may (a
 * `foldkit-guard` policy over the session, an API key), so a server is never
 * open to every upload by omission.
 */
export class UploadPolicy extends Context.Service<
  UploadPolicy,
  {
    readonly admit: (
      request: HttpServerRequest.HttpServerRequest,
    ) => Effect.Effect<void, UploadForbidden>
  }
>()('foldkit-media/UploadPolicy') {}

/** The Cloudflare Images binding reads at most 20 MB; so does the variant server by default. */
const DEFAULT_MAX_BYTES = 20 * 1024 * 1024

export interface UploadOptions {
  /** The largest upload read, in bytes; a larger one is a 413, read no further. */
  readonly maxBytes?: number
}

const answered = (answer: Answer, body: unknown) =>
  HttpServerResponse.jsonUnsafe(body, { status: statusOf(answer), headers: headersFor(answer) })

const refused = (answer: Answer) => answered(answer, { error: answer._tag })

/** The body, refused past `maxBytes` as it streams: a declared length is the client's to write, so it is not read. */
const bodyOf = (request: HttpServerRequest.HttpServerRequest, maxBytes: number) =>
  Effect.gen(function* () {
    const chunks: Array<Uint8Array> = []
    let size = 0
    yield* request.stream.pipe(
      Stream.runForEach(chunk =>
        Effect.suspend(() => {
          size += chunk.byteLength
          if (size > maxBytes) {
            return Effect.fail(new OriginalTooLarge({ size, limit: maxBytes, unit: 'bytes' }))
          }
          chunks.push(chunk)
          return Effect.void
        }),
      ),
    )
    const bytes = new Uint8Array(size)
    let at = 0
    for (const chunk of chunks) {
      bytes.set(chunk, at)
      at += chunk.byteLength
    }
    return bytes
  })

/**
 * The upload route's handler. It asks the `UploadPolicy` first; takes only
 * an `image/*` body, which a browser cannot send to another origin without a
 * preflight this route never answers, so a cookie alone cannot upload from
 * another site; reads at most `maxBytes`; and refuses what the `Inspector`
 * cannot read as an image (415). Its answer is the facts, with the hash as
 * the key, `201`.
 */
export const uploadHandlers = (options: UploadOptions = {}) => {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  const encode = Schema.encodeSync(ImageAsset)
  return HttpApiBuilder.group(UploadApi, 'uploads', group =>
    Effect.gen(function* () {
      const uploads = yield* Uploads
      const policy = yield* UploadPolicy
      const services = yield* Effect.context<Inspector>()
      return group.handle('upload', ({ request }) =>
        Effect.gen(function* () {
          yield* policy.admit(request)
          if (!(request.headers['content-type'] ?? '').startsWith('image/')) {
            return refused(Answer.cases.Unsupported.make({}))
          }
          const bytes = yield* bodyOf(request, maxBytes)
          const described = yield* describe('upload', bytes)
          const hash = Option.getOrThrow(described.hash)
          yield* uploads.put(hash, bytes)
          return answered(Answer.cases.Uploaded.make({}), encode({ ...described, key: hash }))
        }).pipe(
          Effect.provide(services),
          Effect.catchTags({
            UploadForbidden: () => Effect.succeed(refused(Answer.cases.Forbidden.make({}))),
            OriginalTooLarge: () => Effect.succeed(refused(Answer.cases.TooLarge.make({}))),
            TransformFailed: () => Effect.succeed(refused(Answer.cases.Unsupported.make({}))),
            // The body broke off or could not be read: the request's fault, not the server's.
            HttpServerError: () => Effect.succeed(refused(Answer.cases.Malformed.make({}))),
          }),
          Effect.withSpan('Media.upload'),
        ),
      )
    }),
  )
}

/**
 * The upload route as an Effect HTTP application, registered with the
 * `HttpRouter` beside the variant server's, needing `Uploads`, an
 * `Inspector` and the `UploadPolicy`.
 */
export const uploadLayer = (options: UploadOptions = {}) =>
  HttpApiBuilder.layer(UploadApi).pipe(Layer.provide(uploadHandlers(options)))

/**
 * The upload route as a Worker's fetch handler, its services from each
 * environment's bindings (`uploadsR2`, `inspectorImages`, and the
 * application's `UploadPolicy`). Route `/_media/upload` to it.
 */
export const serveUploadFetch = <Env extends object>(
  options: UploadOptions & {
    readonly layer: (env: Env) => Layer.Layer<Uploads | Inspector | UploadPolicy, unknown>
  },
): ((request: Request, env: Env) => Promise<Response>) =>
  fetchOf(env => uploadLayer(options).pipe(Layer.provide(options.layer(env))))

/**
 * Uploads kept in the application's `KeyValueStore`, each under its content
 * hash after `prefix`: the same keys `originalsKeyValueStore` reads, with the
 * same `prefix`. A store that fails is a defect: an upload it dropped is lost.
 */
export const uploadsKeyValueStore = (
  options: { readonly prefix?: string } = {},
): Layer.Layer<Uploads, never, KeyValueStore.KeyValueStore> =>
  Layer.effect(
    Uploads,
    Effect.gen(function* () {
      const store = KeyValueStore.prefix(yield* KeyValueStore.KeyValueStore, options.prefix ?? '')
      return {
        put: (hash: string, bytes: Uint8Array<ArrayBuffer>) =>
          store.set(hash, bytes).pipe(Effect.orDie),
      }
    }),
  )
