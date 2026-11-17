import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Message, Model, init, update } from '../tagsInput.js'

/**
 * A TagsInput's state for `foldkit-bundle`: `TagsInput.init` and `update`
 * packaged, with `init`'s options as the args. The tags are the widget's
 * own value, so a parent reads them from the placed Model (`model.labels.tags`)
 * and there is nothing to answer. It holds no view: draw the placed Model
 * with `TagsInput.view`.
 */
export const TagsInput = Bundle.make('TagsInput', {
  Model,
  Message,
  args: Schema.Struct({
    /** Prefixes every id the field draws, unique on the page. */
    id: Schema.String,
    tags: Schema.optionalKey(Schema.Array(Schema.String)),
    /** Default `,`. */
    delimiter: Schema.optionalKey(Schema.String),
    /** The most tags the field holds; no limit when not given. */
    max: Schema.optionalKey(Schema.Number),
  }),
  init: args => ({ model: init(args) }),
  update,
})
