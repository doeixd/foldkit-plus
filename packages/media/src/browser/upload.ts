/**
 * A file sent to an upload route from a browser: the bytes go once, with
 * their progress reported as they go, and the route's facts come back: an
 * image's `HashedAsset` (`upload`), or any file's `FileAsset` (`uploadFile`).
 * `fetch` reports no upload progress, so this is an `XMLHttpRequest`, and
 * interrupting the stream aborts it.
 */
import { Cause, Effect, Option, Queue, Schema, Stream } from 'effect'
import { HashedAsset } from '../asset.js'
import { FileAsset } from '../file.js'

/** Why an upload did not end in facts: the route's refusal, or no answer at all. */
export const UploadRefusal = Schema.Literals([
  'Forbidden',
  'Unauthenticated',
  'TooLarge',
  'Unsupported',
  'Malformed',
  /** The file route: the body came too slowly. */
  'TooSlow',
  /** The file route: every slot was taken, or this uploader already had one. Try again soon. */
  'Busy',
  /** The file route: too many uploads lately. */
  'RateLimited',
  /** No answer: the network failed, or the request was refused before reaching the route. */
  'Network',
  /** An answer that is neither the route's facts nor one of its refusals. */
  'Unexpected',
])
export type UploadRefusal = typeof UploadRefusal.Type

export class UploadFailed extends Schema.TaggedError<UploadFailed>()('UploadFailed', {
  reason: UploadRefusal,
  /** The HTTP status, `0` when there was no answer. */
  status: Schema.Number,
}) {}

/** How far the bytes have gone: `loaded` of `total`. */
export const Progressed = Schema.TaggedStruct('Progressed', {
  loaded: Schema.Number,
  total: Schema.Number,
})
/** The route kept the image, and these are its facts. */
export const Uploaded = Schema.TaggedStruct('Uploaded', { asset: HashedAsset })
export const UploadEvent = Schema.Union([Progressed, Uploaded])
export type UploadEvent = typeof UploadEvent.Type
/** The file route kept the file, and these are its facts. */
export const FileUploaded = Schema.TaggedStruct('FileUploaded', { asset: FileAsset })
export const FileUploadEvent = Schema.Union([Progressed, FileUploaded])
export type FileUploadEvent = typeof FileUploadEvent.Type

const refusals: Readonly<Record<number, UploadRefusal>> = {
  400: 'Malformed',
  401: 'Unauthenticated',
  403: 'Forbidden',
  408: 'TooSlow',
  413: 'TooLarge',
  415: 'Unsupported',
  429: 'RateLimited',
  503: 'Busy',
}

/** The facts in a 201's body, or none for a body that is not them. */
const factsOf =
  <A>(schema: Schema.Codec<A, unknown>) =>
  (body: string): Option.Option<A> => {
    try {
      return Schema.decodeUnknownOption(schema)(JSON.parse(body))
    } catch {
      return Option.none()
    }
  }
const imageFactsOf = factsOf(HashedAsset)
const fileFactsOf = factsOf(FileAsset)

export interface UploadOptions {
  /** Where the route is. Default `/_media/upload`. */
  readonly url?: string | undefined
  /**
   * Sent with the bytes. A page's own session cookie goes with a same-origin
   * request already: never put a deployment's secret (`uploadPolicyBearer`'s) here,
   * where every visitor can read it.
   */
  readonly headers?: Readonly<Record<string, string>> | undefined
}

// The one sender: `body` goes with `headers`, its progress reported, and a 201 whose body
// `read` takes ends the stream with `done` of it.
const sent = <A, Event>(
  body: Blob,
  url: string,
  headers: Readonly<Record<string, string>>,
  read: (body: string) => Option.Option<A>,
  done: (facts: A) => Event,
): Stream.Stream<typeof Progressed.Type | Event, UploadFailed> =>
  Stream.callback<typeof Progressed.Type | Event, UploadFailed>(queue =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const request = new XMLHttpRequest()
        const fail = (reason: UploadRefusal) =>
          Queue.failCauseUnsafe(
            queue,
            Cause.fail(new UploadFailed({ reason, status: request.status })),
          )
        request.upload.onprogress = event => {
          Queue.offerUnsafe(
            queue,
            Progressed.make({
              loaded: event.loaded,
              total: event.lengthComputable ? event.total : body.size,
            }),
          )
        }
        request.onload = () => {
          if (request.status !== 201) return fail(refusals[request.status] ?? 'Unexpected')
          Option.match(read(request.responseText), {
            onNone: () => fail('Unexpected'),
            onSome: facts => {
              Queue.offerUnsafe(queue, done(facts))
              Queue.endUnsafe(queue)
            },
          })
        }
        request.onerror = () => fail('Network')
        request.open('POST', url)
        for (const [name, value] of Object.entries(headers)) request.setRequestHeader(name, value)
        request.send(body)
        return request
      }),
      // Done or not, the request goes with the stream: abort is a no-op on one that finished.
      request => Effect.sync(() => request.abort()),
    ),
  )

/**
 * Sends `file` to the upload route as its body, which the browser types by the
 * file's own `type`:
 * `Progressed` as the bytes go, then one `Uploaded` with the facts, and the
 * stream ends. A refusal fails it with `UploadFailed`, naming why; a file the
 * route does not take as an image is `Unsupported`. Interrupting it aborts the
 * request.
 */
export const upload = (
  file: Blob,
  options: UploadOptions = {},
): Stream.Stream<UploadEvent, UploadFailed> =>
  sent(file, options.url ?? '/_media/upload', options.headers ?? {}, imageFactsOf, asset =>
    Uploaded.make({ asset }),
  )

/**
 * Sends any `file` to the file route (`/_media/files` by default):
 * `Progressed` as the bytes go, then one `FileUploaded` with the facts to
 * claim on save. The body goes as `application/octet-stream`, which no page
 * can send to another site without a preflight, and the file's name and type
 * in headers of their own; a file the browser gives no type is declared
 * `application/octet-stream`. A refusal fails it with `UploadFailed`, as does a
 * file name that cannot be sent (`Malformed`, status `0`).
 */
export const uploadFile = (
  file: File,
  options: UploadOptions = {},
): Stream.Stream<FileUploadEvent, UploadFailed> =>
  // A name `encodeURIComponent` refuses (a lone surrogate) is a failure of the stream, not a throw here.
  Stream.suspend(() => {
    const name = Option.liftThrowable(encodeURIComponent)(file.name)
    return Option.isNone(name)
      ? Stream.fail(new UploadFailed({ reason: 'Malformed', status: 0 }))
      : sent(
          file,
          options.url ?? '/_media/files',
          {
            ...options.headers,
            'content-type': 'application/octet-stream',
            'x-foldkit-file-name': name.value,
            'x-foldkit-file-type': file.type === '' ? 'application/octet-stream' : file.type,
          },
          fileFactsOf,
          asset => FileUploaded.make({ asset }),
        )
  })
