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
import { HashedAsset, ImageAsset } from '../asset.js'
import { describe, type Inspector } from '../describe.js'
import { nonNegativeInteger } from '../limits.js'
import { OriginalTooLarge } from './errors.js'
import { factsOf, type FactsOptions } from './facts.js'
import { Answer, headersFor, statusOf } from './headers.js'

/**
 * Where an original's facts enter, apart from `MediaApi`, so the variant server needs none of
 * its services: an upload, and the facts of an image named by URL.
 */
export const UploadApi = HttpApi.make('foldkit-media-upload').add(
  HttpApiGroup.make('uploads').add(
    HttpApiEndpoint.post('upload', '/_media/upload'),
    HttpApiEndpoint.get('facts', '/_media/facts'),
  ),
)

/**
 * Keeps an uploaded original under its content hash, and the facts the
 * server read from it beside it: the one writer of what `Originals` and
 * `StoredFacts` read. The bytes are kept first, so kept facts mean kept bytes.
 */
export class Uploads extends Context.Service<
  Uploads,
  {
    readonly put: (
      hash: string,
      bytes: Uint8Array<ArrayBuffer>,
      facts: ImageAsset,
    ) => Effect.Effect<void>
  }
>()('foldkit-media/Uploads') {}

/**
 * The facts the upload route read from an original, by its hash: what an
 * application stores, rather than facts a client sends back. None for a hash
 * nobody uploaded, or one kept before facts were.
 */
export class StoredFacts extends Context.Service<
  StoredFacts,
  { readonly get: (hash: string) => Effect.Effect<Option.Option<HashedAsset>> }
>()('foldkit-media/StoredFacts') {}

/** Where an upload's facts are kept, beside its bytes under the same prefix. */
export const factsKey = (hash: string): string => `facts/${hash}`

export const encodeFacts = (facts: ImageAsset): string =>
  JSON.stringify(Schema.encodeSync(ImageAsset)(facts))

// Facts the route wrote are hashed; any other entry is a defect, never a silent none.
export const decodeFacts = (stored: string): HashedAsset =>
  Schema.decodeUnknownSync(Schema.fromJsonString(HashedAsset))(stored)

/** The request may not upload. Why stays with the policy: the answer says only no. */
export class UploadForbidden extends Schema.TaggedError<UploadForbidden>()(
  'UploadForbidden',
  {},
  { httpApiStatus: 403 },
) {}

/**
 * The policy could not tell who is asking (an untrusted origin, a session
 * that ended), so the client should sign in again rather than give up.
 */
export class UploadUnauthenticated extends Schema.TaggedError<UploadUnauthenticated>()(
  'UploadUnauthenticated',
  {},
  { httpApiStatus: 401 },
) {}

/** Which route the policy is asked about: an upload, or the facts of an image named by URL. */
export type UploadRoute = 'Upload' | 'DescribeUrl'

/**
 * Who may upload, asked of every request before its body is read, with the
 * route it is for. The route has no default: an application that serves
 * uploads says who may (`foldkit-guard/media` over the session, a secret), so
 * a server is never open to every upload by omission.
 */
export class UploadPolicy extends Context.Service<
  UploadPolicy,
  {
    readonly admit: (
      request: HttpServerRequest.HttpServerRequest,
      route: UploadRoute,
    ) => Effect.Effect<void, UploadForbidden | UploadUnauthenticated>
  }
>()('foldkit-media/UploadPolicy') {}

/** The Cloudflare Images binding reads at most 20 MB; so does the variant server by default. */
const DEFAULT_MAX_BYTES = 20 * 1024 * 1024

export interface UploadOptions {
  /** The largest upload read, in bytes; a larger one is a 413, read no further. */
  readonly maxBytes?: number
  /**
   * How `GET /_media/facts?url=` reads an image named by URL (`factsOf`): the hosts it may
   * fetch from, and a cache. No hosts unless given, so a server names every host it reads.
   */
  readonly facts?: Omit<FactsOptions, 'allow'> & { readonly allow?: ReadonlyArray<string> }
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
  const maxBytes = nonNegativeInteger('maxBytes', options.maxBytes ?? DEFAULT_MAX_BYTES)
  const encode = Schema.encodeSync(ImageAsset)
  return HttpApiBuilder.group(UploadApi, 'uploads', group =>
    Effect.gen(function* () {
      const uploads = yield* Uploads
      const policy = yield* UploadPolicy
      const services = yield* Effect.context<Inspector>()
      const facts = { ...options.facts, allow: options.facts?.allow ?? [] }
      return group
        .handle('upload', ({ request }) =>
          Effect.gen(function* () {
            yield* policy.admit(request, 'Upload')
            if (!(request.headers['content-type'] ?? '').startsWith('image/')) {
              return refused(Answer.cases.Unsupported.make({}))
            }
            const bytes = yield* bodyOf(request, maxBytes)
            const described = yield* describe('upload', bytes)
            const hash = Option.getOrThrow(described.hash)
            const facts = { ...described, key: hash }
            yield* uploads.put(hash, bytes, facts)
            return answered(Answer.cases.Uploaded.make({}), encode(facts))
          }).pipe(
            Effect.provide(services),
            Effect.catchTags({
              UploadForbidden: () => Effect.succeed(refused(Answer.cases.Forbidden.make({}))),
              UploadUnauthenticated: () =>
                Effect.succeed(refused(Answer.cases.Unauthenticated.make({}))),
              OriginalTooLarge: () => Effect.succeed(refused(Answer.cases.TooLarge.make({}))),
              TransformFailed: () => Effect.succeed(refused(Answer.cases.Unsupported.make({}))),
              // The body broke off or could not be read: the request's fault, not the server's.
              HttpServerError: () => Effect.succeed(refused(Answer.cases.Malformed.make({}))),
            }),
            Effect.withSpan('Media.upload'),
          ),
        )
        .handle('facts', ({ request }) =>
          Effect.gen(function* () {
            yield* policy.admit(request, 'DescribeUrl')
            const url = new URL(request.url, 'http://media.invalid').searchParams.get('url')
            if (url === null) return refused(Answer.cases.Malformed.make({}))
            return answered(Answer.cases.Described.make({}), encode(yield* factsOf(url, facts)))
          }).pipe(
            Effect.provide(services),
            Effect.catchTags({
              UploadForbidden: () => Effect.succeed(refused(Answer.cases.Forbidden.make({}))),
              UploadUnauthenticated: () =>
                Effect.succeed(refused(Answer.cases.Unauthenticated.make({}))),
              // Why stays in the server: a host refused, a read failed, a file that is no image.
              FactsUnavailable: () => Effect.succeed(refused(Answer.cases.Unavailable.make({}))),
            }),
            Effect.withSpan('Media.facts'),
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
 * Policies tried in turn, the first to admit winning: a deployment's secret
 * for scripts beside sessions for editors. A refusal tries the next; when
 * every one refuses, the last refusal is the answer. Each is built once, with
 * the combined layer, and closes with it.
 */
export const uploadPolicyAny = <E, R>(
  ...policies: readonly [
    Layer.Layer<UploadPolicy, E, R>,
    Layer.Layer<UploadPolicy, E, R>,
    ...ReadonlyArray<Layer.Layer<UploadPolicy, E, R>>,
  ]
): Layer.Layer<UploadPolicy, E, R> =>
  Layer.effect(
    UploadPolicy,
    Effect.gen(function* () {
      const [head, ...tail] = policies
      const first = Context.get(yield* Layer.build(head), UploadPolicy)
      const rest: Array<typeof UploadPolicy.Service> = []
      for (const policy of tail) rest.push(Context.get(yield* Layer.build(policy), UploadPolicy))
      return {
        admit: (request, route) =>
          rest.reduce(
            (asked, next) => Effect.catch(asked, () => next.admit(request, route)),
            first.admit(request, route),
          ),
      }
    }),
  )

const digestOf = (text: string) =>
  Effect.promise(() => crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))).pipe(
    Effect.map(digest => new Uint8Array(digest)),
  )

/**
 * Admits a request whose `Authorization` is `Bearer <token>`, and with no
 * token (unset or empty) admits nobody, whatever it sends. The two are
 * compared by digest, every byte, so the time taken says nothing of the
 * token. For a deployment's secret (`wrangler secret put`); who may upload
 * by session is the application's own `UploadPolicy`.
 */
export const uploadPolicyBearer = (token: string | undefined): Layer.Layer<UploadPolicy> =>
  Layer.succeed(UploadPolicy, {
    admit: request =>
      Effect.all([
        digestOf(request.headers['authorization'] ?? ''),
        digestOf(`Bearer ${token}`),
      ]).pipe(
        Effect.flatMap(([given, expected]) => {
          let difference = token === undefined || token === '' ? 1 : 0
          for (let at = 0; at < expected.length; at++) difference |= given[at]! ^ expected[at]!
          return difference === 0 ? Effect.void : Effect.fail(new UploadForbidden({}))
        }),
      ),
  })

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
        put: (hash: string, bytes: Uint8Array<ArrayBuffer>, facts: ImageAsset) =>
          store
            .set(hash, bytes)
            .pipe(Effect.andThen(store.set(factsKey(hash), encodeFacts(facts))), Effect.orDie),
      }
    }),
  )

/**
 * Upload facts read back from the application's `KeyValueStore`, under the
 * same `prefix` as `uploadsKeyValueStore`. A store that fails is a defect.
 */
export const storedFactsKeyValueStore = (
  options: { readonly prefix?: string } = {},
): Layer.Layer<StoredFacts, never, KeyValueStore.KeyValueStore> =>
  Layer.effect(
    StoredFacts,
    Effect.gen(function* () {
      const store = KeyValueStore.prefix(yield* KeyValueStore.KeyValueStore, options.prefix ?? '')
      return {
        get: (hash: string) =>
          store.get(factsKey(hash)).pipe(
            Effect.map(found => Option.map(Option.fromNullishOr(found), decodeFacts)),
            Effect.orDie,
          ),
      }
    }),
  )
