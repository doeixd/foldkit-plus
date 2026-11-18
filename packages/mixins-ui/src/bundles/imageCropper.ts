import { Match, Schema } from 'effect'
import type { ReturnWithOutMessage } from 'foldkit/update'
import { Bundle } from 'foldkit-bundle'
import { Message, Model, OutMessage, Rect, Shape, Size, init, update } from '../imageCropper.js'

type Step = ReturnWithOutMessage<Model, Message, OutMessage>

// An export's answer is reported; every other Message only folds.
const step = (model: Model, message: Message): Step => {
  const next = update(model, message)
  return Match.value(message).pipe(
    Match.tag('Exported', ({ url, width, height }) => ({
      ...next,
      outMessage: OutMessage.Exported({ url, width, height }),
    })),
    Match.tag('FailedExport', ({ reason }) => ({
      ...next,
      outMessage: OutMessage.FailedExport({ reason }),
    })),
    Match.orElse(() => next),
  )
}

/**
 * An ImageCropper's state for `foldkit-bundle`: the crop, zoom, turn and
 * drag, with `ImageCropper.init`'s options as the args. An export the
 * application asks for (`Message.RequestedExport`, sent to the placed child)
 * comes back as `ImageCropper.OutMessage`: `Exported` or `FailedExport`. The
 * crop itself is read from the placed Model with `ImageCropper.crop`. It
 * holds no view: draw the placed Model with `ImageCropper.view`.
 */
export const ImageCropper = Bundle.make('ImageCropper', {
  Model,
  Message,
  args: Schema.Struct({
    /** Prefixes every id the cropper draws, unique on the page. */
    id: Schema.String,
    /** Width over height, locked; default free. */
    aspect: Schema.optionalKey(Schema.Number),
    shape: Schema.optionalKey(Shape),
    /** The crop to start with, in the image's pixels. */
    crop: Schema.optionalKey(Rect),
    /** The least crop in image pixels; default 1 by 1. */
    min: Schema.optionalKey(Size),
    /** Default 3. */
    maxZoom: Schema.optionalKey(Schema.Number),
  }),
  // An aspect `init` refuses fails here, at placement.
  init: args => ({ model: init(args) }),
  update: step,
})
