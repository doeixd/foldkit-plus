/**
 * An image fetched and decoded before it is shown, as a Command: a lightbox
 * or a carousel asks for the next picture, and shows it on `Decoded`, so the
 * switch never passes through a blank frame. A Command, not a Mount: the
 * Model decides to show the image, so the Message that leads there carries
 * the news that it is ready.
 */
import { Effect, Schema } from 'effect'
import type { Command } from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'

export const ImageDecodeMessage = defineMessageUnion({
  Decoded: { src: Schema.String },
  DecodeFailed: { src: Schema.String, message: Schema.String },
})
export type ImageDecodeMessage = typeof ImageDecodeMessage.Type

/** What to decode: a URL, or an `img`'s candidates, so the browser decodes the one it would draw. */
export interface ImageSource {
  readonly src: string
  readonly srcset?: string | undefined
  readonly sizes?: string | undefined
}

/**
 * Fetches and decodes `source` (`img.decode()`), yielding `Decoded` once it
 * can be painted at once, or `DecodeFailed` when it cannot be fetched or read,
 * or there is no document (a server render). Given `srcset` and `sizes`, as
 * `foldkit-media`'s `Picture.Img` has them, the browser picks the candidate
 * it would draw, so the decoded file is the one shown.
 */
export const decodeImage = (source: ImageSource): Command<ImageDecodeMessage, never, never> => ({
  name: 'Image.decode',
  args: { src: source.src },
  effect:
    typeof document === 'undefined'
      ? Effect.succeed(
          ImageDecodeMessage.DecodeFailed({ src: source.src, message: 'there is no document' }),
        )
      : Effect.matchEffect(
          Effect.tryPromise({
            try: () => {
              const image = new Image()
              // Before `src`, so the browser chooses among the candidates, not the fallback.
              if (source.sizes !== undefined) image.sizes = source.sizes
              if (source.srcset !== undefined) image.srcset = source.srcset
              image.src = source.src
              return image.decode()
            },
            catch: error => (error instanceof Error ? error.message : String(error)),
          }),
          {
            onFailure: message =>
              Effect.succeed(ImageDecodeMessage.DecodeFailed({ src: source.src, message })),
            onSuccess: () => Effect.succeed(ImageDecodeMessage.Decoded({ src: source.src })),
          },
        ),
})
