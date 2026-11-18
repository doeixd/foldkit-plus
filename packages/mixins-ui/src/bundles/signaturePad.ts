import { Match, Schema } from 'effect'
import type { ReturnWithOutMessage } from 'foldkit/update'
import { Bundle } from 'foldkit-bundle'
import { Message, Model, OutMessage, init, update } from '../signaturePad.js'

type Step = ReturnWithOutMessage<Model, Message, OutMessage>

// A PNG's answer is reported; every other Message only folds.
const step = (model: Model, message: Message): Step => {
  const next = update(model, message)
  return Match.value(message).pipe(
    Match.tag('ExportedPng', ({ url, width, height }) => ({
      ...next,
      outMessage: OutMessage.ExportedPng({ url, width, height }),
    })),
    Match.tag('FailedExport', ({ reason }) => ({
      ...next,
      outMessage: OutMessage.FailedExport({ reason }),
    })),
    Match.orElse(() => next),
  )
}

/**
 * A SignaturePad's state for `foldkit-bundle`: the strokes, the stroke under
 * way and a typed name, with `SignaturePad.init`'s options as the args. A
 * PNG the application asks for (`Message.RequestedPng`, sent to the placed
 * child) comes back as `SignaturePad.OutMessage`: `ExportedPng` or
 * `FailedExport`. Whether it is signed is `SignaturePad.isEmpty` of the
 * placed Model, and its SVG `toSvg`. It holds no view: draw the placed Model
 * with `SignaturePad.view`.
 */
export const SignaturePad = Bundle.make('SignaturePad', {
  Model,
  Message,
  args: Schema.Struct({
    /** Prefixes every id the pad draws, unique on the page. */
    id: Schema.String,
    /** The pen, over the default (size 4, thinning 0.6, smoothing 0.5). */
    pen: Schema.optionalKey(
      Schema.Struct({
        size: Schema.optionalKey(Schema.Number),
        thinning: Schema.optionalKey(Schema.Number),
        smoothing: Schema.optionalKey(Schema.Number),
      }),
    ),
  }),
  init: args => ({ model: init(args) }),
  update: step,
})
