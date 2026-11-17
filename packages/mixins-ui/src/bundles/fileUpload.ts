import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Message, Model, init, update } from '../fileUpload.js'

/**
 * A FileUpload's state for `foldkit-bundle`: the files the field holds, each
 * with its status, with `FileUpload.init`'s options as the args. The entries
 * are the widget's own value, so the Bundle holds them and reports `Picked`
 * and `Removed`; a parent that only reads `model.<field>.entries` answers
 * with `Bundle.ignore`. It holds no view and sends nothing: with `lanes`
 * above zero the application adds `FileUpload.lanes` to its Subscriptions,
 * with its own transport.
 */
export const FileUpload = Bundle.make('FileUpload', {
  Model,
  Message,
  args: Schema.Struct({
    /** Prefixes every id the field draws, unique on the page. */
    id: Schema.String,
    multiple: Schema.optionalKey(Schema.Boolean),
    /** `.ext`, `type/*` or `type/subtype` tokens; every file when empty. */
    accept: Schema.optionalKey(Schema.Array(Schema.String)),
    /** Bytes per file. */
    maxSize: Schema.optionalKey(Schema.Number),
    /** Needs `multiple`. */
    maxFiles: Schema.optionalKey(Schema.Number),
    /** Draw a thumbnail for each image; default `true`. */
    previews: Schema.optionalKey(Schema.Boolean),
    /** Sends at once; default 0, which sends nothing. */
    lanes: Schema.optionalKey(Schema.Number),
    /** Files already uploaded. */
    initial: Schema.optionalKey(
      Schema.Array(
        Schema.Struct({
          id: Schema.String,
          name: Schema.String,
          size: Schema.Number,
          type: Schema.String,
          url: Schema.String,
        }),
      ),
    ),
  }),
  init: args => ({ model: init(args) }),
  update: (model, message) => update(model, message),
})
