/**
 * An image sent to the upload route from a browser: the bytes go once, with
 * their progress reported as they go, and the route's facts come back as the
 * `HashedAsset` to store. `fetch` reports no upload progress, so this is an
 * `XMLHttpRequest`, and interrupting the stream aborts it.
 */
import { Cause, Effect, Option, Queue, Schema, Stream } from 'effect'
import { HashedAsset } from '../asset.js'

/** Why an upload did not end in facts: the route's refusal, or no answer at all. */
export const UploadRefusal = Schema.Literals([
  'Forbidden',
  'Unauthenticated',
  'TooLarge',
  'Unsupported',
  'Malformed',
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

const refusals: Readonly<Record<number, UploadRefusal>> = {
  400: 'Malformed',
  401: 'Unauthenticated',
  403: 'Forbidden',
  413: 'TooLarge',
  415: 'Unsupported',
}

const decodeFacts = Schema.decodeUnknownOption(HashedAsset)

/** The facts in a 201's body, or none for a body that is not them. */
const factsOf = (body: string): Option.Option<HashedAsset> => {
  try {
    return decodeFacts(JSON.parse(body))
  } catch {
    return Option.none()
  }
}

export interface UploadOptions {
  /** Where the route is. Default `/_media/upload`. */
  readonly url?: string | undefined
  /** Sent with the bytes, such as the `authorization` an `uploadPolicyBearer` reads. */
  readonly headers?: Readonly<Record<string, string>> | undefined
}

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
  Stream.callback<UploadEvent, UploadFailed>(queue =>
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
              total: event.lengthComputable ? event.total : file.size,
            }),
          )
        }
        request.onload = () => {
          if (request.status !== 201) return fail(refusals[request.status] ?? 'Unexpected')
          Option.match(factsOf(request.responseText), {
            onNone: () => fail('Unexpected'),
            onSome: asset => {
              Queue.offerUnsafe(queue, Uploaded.make({ asset }))
              Queue.endUnsafe(queue)
            },
          })
        }
        request.onerror = () => fail('Network')
        request.open('POST', options.url ?? '/_media/upload')
        for (const [name, value] of Object.entries(options.headers ?? {}))
          request.setRequestHeader(name, value)
        request.send(file)
        return request
      }),
      // Done or not, the request goes with the stream: abort is a no-op on one that finished.
      request => Effect.sync(() => request.abort()),
    ),
  )
