import { Context, Effect, Option } from 'effect'
import { rgbaToThumbHash } from 'thumbhash'
import { Placeholder, type ImageAsset } from './asset.js'
import type { OriginalTooLarge, TransformFailed } from './server/errors.js'

/** A picture at most 100 pixels a side, as raw RGBA: what a ThumbHash is made from. */
export interface Thumbnail {
  readonly width: number
  readonly height: number
  readonly rgba: Uint8Array
}

/** What an inspector reads of an original. */
export interface Inspected {
  readonly width: number
  readonly height: number
  /** Whether it may have transparent pixels; an inspector that cannot tell says yes. */
  readonly alpha: boolean
  /** None where the inspector cannot make one (the Images binding offline makes no raw pixels). */
  readonly thumbnail: Option.Option<Thumbnail>
}

/** Reads an original's facts: its size, its alpha, and a thumbnail. */
export class Inspector extends Context.Service<
  Inspector,
  {
    readonly inspect: (
      bytes: Uint8Array<ArrayBuffer>,
    ) => Effect.Effect<Inspected, TransformFailed | OriginalTooLarge>
  }
>()('foldkit-media/Inspector') {}

const hex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join('')

const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))

/**
 * An original's facts, as an `ImageAsset` under `key`: its size and alpha
 * from the `Inspector`, its SHA-256, and a ThumbHash placeholder where the
 * inspector made a thumbnail. Where an original enters (an upload, a build, a
 * page's content naming a URL), so its facts are derived once and stored.
 */
export const describe = (
  key: string,
  bytes: Uint8Array<ArrayBuffer>,
): Effect.Effect<ImageAsset, TransformFailed | OriginalTooLarge, Inspector> =>
  Effect.gen(function* () {
    const inspected = yield* Inspector.use(inspector => inspector.inspect(bytes))
    const digest = yield* Effect.promise(() => crypto.subtle.digest('SHA-256', bytes))
    return {
      key,
      width: inspected.width,
      height: inspected.height,
      alpha: inspected.alpha,
      hash: Option.some(hex(digest)),
      placeholder: Option.map(inspected.thumbnail, ({ width, height, rgba }) =>
        Placeholder.cases.ThumbHash.make({ hash: base64(rgbaToThumbHash(width, height, rgba)) }),
      ),
      focus: Option.none(),
    }
  })
