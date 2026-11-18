import * as UiFileDrop from '@foldkit/ui/fileDrop'
import { Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Message, OutMessage } from '../fileDrop.js'

/**
 * `@foldkit/ui`'s FileDrop for `foldkit-bundle`: whether a drag hovers the
 * zone, with `{ id }` as the args. A drop is reported as
 * `FileDrop.OutMessage.ReceivedFiles` (or `RejectedNonFiles`); the files are
 * the application's to keep. It holds no view: draw the placed Model through
 * `h.submodel` with upstream's `view` and `FileDrop.toView`.
 */
export const FileDrop = Bundle.make('FileDrop', {
  Model: UiFileDrop.Model,
  Message,
  args: Schema.Struct({
    /** The zone's id, unique on the page; its input's id is derived from it. */
    id: Schema.String,
  }),
  init: args => ({ model: UiFileDrop.init(args) }),
  update: (model, message) => {
    const next = UiFileDrop.update(model, message)
    return Option.match(Option.fromUndefinedOr(next.outMessage), {
      onNone: () => ({ model: next.model }),
      onSome: out => ({
        model: next.model,
        outMessage: UiFileDrop.OutMessage.match(out, {
          ReceivedFiles: ({ files }) => OutMessage.ReceivedFiles({ files }),
          RejectedNonFiles: () => OutMessage.RejectedNonFiles(),
        }),
      }),
    })
  },
})
