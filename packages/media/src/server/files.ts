/**
 * Where any file enters and leaves: `POST /_media/files` keeps one under a
 * key the server mints, and `GET /_media/files/:key` serves it back as a
 * download to whoever `FileReadPolicy` lets read it. Apart from `UploadApi`,
 * so a server that mounts only the image routes serves no file.
 */
import { Context, Data, Duration, Effect, Layer, Option, Schema, Semaphore, Stream } from 'effect'
import { HttpServerResponse, type HttpServerRequest } from 'effect/http'
import { HttpApi, HttpApiBuilder, HttpApiEndpoint, HttpApiGroup } from 'effect/http-api'
import { Diagnostics } from 'foldkit-surface'
import { FileAsset } from '../file.js'
import { nonNegativeInteger, positiveInteger } from '../limits.js'
import { Admission } from './admission.js'
import { ownerMissing } from './diagnostics.js'
import {
  acceptor,
  fileHeaders,
  fileNameOf,
  isFileKey,
  mediaTypeOf,
  type Accept,
} from './fileRules.js'
import { FileStore } from './fileStore.js'
import { UploadForbidden, UploadUnauthenticated } from './upload.js'

/** The file routes, mounted alone: `fileLayer`. */
export const FileApi = HttpApi.make('foldkit-media-files').add(
  HttpApiGroup.make('files').add(
    HttpApiEndpoint.post('upload', '/_media/files'),
    HttpApiEndpoint.get('download', '/_media/files/:key', { params: { key: Schema.String } }),
  ),
)

/**
 * Who may upload a file, asked before the body is read, answering the
 * uploader's id: only that id may later claim the file. It must be stable
 * and never given to anyone else; an empty id is refused. No default, so a
 * server is never open to uploads by omission.
 */
export class FileUploadPolicy extends Context.Service<
  FileUploadPolicy,
  {
    readonly admit: (
      request: HttpServerRequest.HttpServerRequest,
    ) => Effect.Effect<string, UploadForbidden | UploadUnauthenticated>
  }
>()('foldkit-media/FileUploadPolicy') {}

/** The read policy could not tell who is asking: the download answers 401. */
export class FileUnauthenticated extends Schema.TaggedError<FileUnauthenticated>()(
  'FileUnauthenticated',
  {},
) {}

/** Whether the asker may read the file under a key. */
export type FileReader = (key: string) => Effect.Effect<boolean>

/**
 * Who may read which file, asked before the store is read: `resolve` says who
 * is asking from the request alone, never the key, and answers what they may
 * read. Build it with `fileReadPolicy`.
 */
export class FileReadPolicy extends Context.Service<
  FileReadPolicy,
  {
    readonly resolve: (
      request: HttpServerRequest.HttpServerRequest,
    ) => Effect.Effect<FileReader, FileUnauthenticated>
  }
>()('foldkit-media/FileReadPolicy') {}

/**
 * A `FileReadPolicy` in its two steps: `resolve` says who is asking (a
 * principal, a visitor) or fails `FileUnauthenticated`; `read` says whether
 * they may read a key, typically by finding the application's row that holds
 * it. A no is a 404, as an unknown key is.
 */
export const fileReadPolicy = <Asker>(policy: {
  readonly resolve: (
    request: HttpServerRequest.HttpServerRequest,
  ) => Effect.Effect<Asker, FileUnauthenticated>
  readonly read: (asker: Asker, key: string) => Effect.Effect<boolean>
}): Layer.Layer<FileReadPolicy> =>
  Layer.succeed(FileReadPolicy, {
    resolve: request =>
      Effect.map(policy.resolve(request), asker => (key: string) => policy.read(asker, key)),
  })

/** An `inspect` hook's refusal of an upload: answered 415, with nothing kept. */
export class FileRefused extends Schema.TaggedError<FileRefused>()('FileRefused', {}) {}

export interface FileOptions {
  /**
   * The declared types an upload may have: media types or `type/*` patterns,
   * or `'*'` for any. The client writes the type, so this shapes the product
   * and secures nothing: a download is never served as its type.
   */
  readonly accept: Accept
  /** The largest file read, in bytes, counted as it streams; 20 MB by default. */
  readonly maxBytes?: number
  /**
   * Uploads read at once, each holding about twice its size; 2 by default.
   * One past it, or a second from one owner, answers 503 rather than waiting.
   */
  readonly maxConcurrent?: number
  /** The slowest a body may arrive, over each 10 seconds, before it is cut off (408); 32 KB/s by default. */
  readonly minBytesPerSecond?: number
  /** Reads the bytes before anything is kept: a magic-number check, a scan. */
  readonly inspect?: (
    bytes: Uint8Array<ArrayBuffer>,
    declared: { readonly name: string; readonly type: string },
  ) => Effect.Effect<void, FileRefused>
}

const DEFAULT_MAX_BYTES = 20 * 1024 * 1024
const DEFAULT_MIN_BYTES_PER_SECOND = 32 * 1024
const RATE_WINDOW = Duration.seconds(10)

class BodyTooLarge extends Data.TaggedError('BodyTooLarge') {}
class BodyTooSlow extends Data.TaggedError('BodyTooSlow') {}

/**
 * The body, refused past `maxBytes` as it streams, and cut off when a window
 * brings fewer than `floor` bytes: a client trickling bytes cannot hold a
 * slot, while a slow honest connection still finishes.
 */
const bodyWithin = <E>(
  stream: Stream.Stream<Uint8Array, E>,
  maxBytes: number,
  floor: number,
): Effect.Effect<Uint8Array<ArrayBuffer>, E | BodyTooLarge | BodyTooSlow> =>
  Effect.gen(function* () {
    const chunks: Array<Uint8Array> = []
    let size = 0
    let inWindow = 0
    const read = stream.pipe(
      Stream.runForEach(chunk =>
        Effect.suspend(() => {
          size += chunk.byteLength
          inWindow += chunk.byteLength
          if (size > maxBytes) return Effect.fail(new BodyTooLarge())
          chunks.push(chunk)
          return Effect.void
        }),
      ),
    )
    const watch: Effect.Effect<never, BodyTooSlow> = Effect.sleep(RATE_WINDOW).pipe(
      Effect.andThen(
        Effect.suspend(() => {
          if (inWindow < floor) return Effect.fail(new BodyTooSlow())
          inWindow = 0
          return Effect.void
        }),
      ),
      Effect.forever,
    )
    yield* Effect.raceFirst(read, watch)
    const bytes = new Uint8Array(size)
    let at = 0
    for (const chunk of chunks) {
      bytes.set(chunk, at)
      at += chunk.byteLength
    }
    return bytes
  })

const UPLOAD_HEADERS = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }

// A refusal names its kind, and nothing of the server's internals.
const refused = (status: number, error: string) =>
  HttpServerResponse.jsonUnsafe({ error }, { status, headers: UPLOAD_HEADERS })

const notFound = HttpServerResponse.empty({ status: 404, headers: fileHeaders(Option.none()) })
const unauthenticated = HttpServerResponse.empty({
  status: 401,
  headers: fileHeaders(Option.none()),
})

/**
 * The file routes' handlers. An upload is asked of the `FileUploadPolicy`
 * first, then must be `application/octet-stream` (which no page on another
 * site can send without a preflight this route never answers), declare a
 * name and an accepted type in its headers, pass `Admission` when one is
 * given, find a free slot, arrive within `maxBytes` and the minimum rate, and
 * pass `inspect`; it answers the kept `FileAsset`, 201. A download checks
 * the key's grammar, then the `FileReadPolicy`, then the store, and answers
 * the bytes as an attachment that cannot run on this origin.
 */
export const fileHandlers = (options: FileOptions) => {
  const accepts = acceptor(options.accept)
  const maxBytes = nonNegativeInteger('maxBytes', options.maxBytes ?? DEFAULT_MAX_BYTES)
  const maxConcurrent = positiveInteger('maxConcurrent', options.maxConcurrent ?? 2)
  const floor =
    nonNegativeInteger(
      'minBytesPerSecond',
      options.minBytesPerSecond ?? DEFAULT_MIN_BYTES_PER_SECOND,
    ) * Duration.toSeconds(RATE_WINDOW)
  const inspect = options.inspect ?? (() => Effect.void)
  const encode = Schema.encodeSync(FileAsset)
  return HttpApiBuilder.group(FileApi, 'files', group =>
    Effect.gen(function* () {
      const files = yield* FileStore
      const uploadPolicy = yield* FileUploadPolicy
      const readPolicy = yield* FileReadPolicy
      const admit = Option.match(yield* Effect.serviceOption(Admission), {
        onNone: () => (_client: string) => Effect.void,
        onSome: admission => admission.admit,
      })
      // Built with the route, so the slots are the server's (a Worker isolate's), not a request's.
      const slots = yield* Semaphore.make(maxConcurrent)
      const uploading = new Set<string>()
      // Masked, so no interruption lands between taking the owner's mark and arranging its release.
      const inSlot = <A, E>(owner: string, effect: Effect.Effect<A, E>) =>
        Effect.uninterruptibleMask(restore =>
          Effect.suspend(() => {
            if (uploading.has(owner)) return Effect.succeedNone
            uploading.add(owner)
            return restore(Semaphore.withPermitsIfAvailable(slots, 1)(effect)).pipe(
              Effect.ensuring(Effect.sync(() => uploading.delete(owner))),
            )
          }),
        )
      return group
        .handle('upload', ({ request }) =>
          Effect.gen(function* () {
            const owner = yield* uploadPolicy.admit(request)
            if (owner === '') {
              yield* Diagnostics.report(ownerMissing)
              return refused(403, 'Forbidden')
            }
            if (
              !Option.contains(
                mediaTypeOf(request.headers['content-type']),
                'application/octet-stream',
              )
            ) {
              return refused(415, 'Unsupported')
            }
            const name = fileNameOf(request.headers['x-foldkit-file-name'])
            if (Option.isNone(name)) return refused(400, 'Malformed')
            const type = Option.filter(mediaTypeOf(request.headers['x-foldkit-file-type']), accepts)
            if (Option.isNone(type)) return refused(415, 'Unsupported')
            const declared = { name: name.value, type: type.value }
            yield* admit(`files:${owner}`)
            const kept = yield* inSlot(
              owner,
              Effect.gen(function* () {
                const bytes = yield* bodyWithin(request.stream, maxBytes, floor)
                yield* inspect(bytes, declared)
                return yield* files.keep(bytes, { ...declared, owner })
              }),
            )
            return Option.match(kept, {
              onNone: () => refused(503, 'Busy'),
              onSome: asset =>
                HttpServerResponse.jsonUnsafe(encode(asset), {
                  status: 201,
                  headers: UPLOAD_HEADERS,
                }),
            })
          }).pipe(
            Effect.catchTags({
              UploadForbidden: () => Effect.succeed(refused(403, 'Forbidden')),
              UploadUnauthenticated: () => Effect.succeed(refused(401, 'Unauthenticated')),
              RateLimited: ({ retryAfterSeconds }) =>
                Effect.succeed(
                  HttpServerResponse.jsonUnsafe(
                    { error: 'RateLimited' },
                    {
                      status: 429,
                      headers: { ...UPLOAD_HEADERS, 'retry-after': String(retryAfterSeconds) },
                    },
                  ),
                ),
              BodyTooLarge: () => Effect.succeed(refused(413, 'TooLarge')),
              BodyTooSlow: () => Effect.succeed(refused(408, 'TooSlow')),
              FileRefused: () => Effect.succeed(refused(415, 'Unsupported')),
              // The body broke off or could not be read: the request's fault, not the server's.
              HttpServerError: () => Effect.succeed(refused(400, 'Malformed')),
            }),
            Effect.withSpan('Media.fileUpload'),
          ),
        )
        .handle('download', ({ params, request }) =>
          Effect.gen(function* () {
            // Before any policy: a key outside the grammar names nothing a policy could allow.
            if (!isFileKey(params.key)) return notFound
            const mayRead = yield* readPolicy.resolve(request)
            if (!(yield* mayRead(params.key))) return notFound
            return Option.match(yield* files.read(params.key), {
              onNone: () => notFound,
              onSome: ({ asset, bytes }) =>
                HttpServerResponse.uint8Array(bytes, {
                  status: 200,
                  headers: fileHeaders(Option.some(asset.name)),
                  contentType: 'application/octet-stream',
                }),
            })
          }).pipe(
            Effect.catchTag('FileUnauthenticated', () => Effect.succeed(unauthenticated)),
            Effect.withSpan('Media.fileDownload'),
          ),
        )
    }),
  )
}

/**
 * The file routes as an Effect HTTP application, registered with the
 * `HttpRouter`, needing a `FileStore`, a `FileUploadPolicy` and a
 * `FileReadPolicy`, and `Admission` if one is given.
 */
export const fileLayer = (options: FileOptions) =>
  HttpApiBuilder.layer(FileApi).pipe(Layer.provide(fileHandlers(options)))
