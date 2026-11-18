/**
 * A form with a field of topics. `Bundles.TagsInput` is placed under
 * `topics`: the application's Model holds the tags and the draft as the
 * placement's slice, and the placement folds the field's own Messages into
 * it. The field draws one hidden input per tag under `name`, so the form
 * submits the chips and never the text still being typed. The receipt under
 * the form is read from the form's own `FormData`, so it shows what the
 * browser would send.
 */
import { Effect, Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import * as Command from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import * as Render from 'foldkit/render'
import { modifyFields } from 'foldkit/struct'
import { Bundles } from 'foldkit-mixins-ui'

export const FORM = 'article'
/** The receipt's id: the field draws a status region of its own, so the role names neither. */
export const RECEIPT = 'topics-receipt'
/** The form field the tags submit under. */
export const NAME = 'topics'

const OwnCases = { Submitted: {}, GotSubmission: { tags: Schema.Array(Schema.String) } }
const Own = defineMessageUnion(OwnCases)

export const App = Bundle.compose({
  /** The tags the form held at the last submit, until the tags change. */
  receipt: Schema.Option(Schema.Array(Schema.String)),
}).pipe(
  Bundle.withMessages(OwnCases),
  Bundle.withChild('topics', Bundles.TagsInput, {
    args: { id: 'topics', tags: ['foldkit', 'effect'], max: 5 },
  }),
)
export const Model = App.Model
export type Model = typeof Model.Type
export const Message = App.Message
export type Message = typeof Message.Type

export const initial: Model = App.placements.initial({ receipt: Option.none() }).model

export const ReadSubmission = Command.define('ReadSubmission', {
  args: { form: Schema.String },
  messages: [Own.GotSubmission],
  // A tag added on blur by the same press that submits is drawn as a hidden input only after the next commit.
  execute: ({ form }) =>
    Render.afterCommit.pipe(
      Effect.map(() => {
        const element = document.getElementById(form)
        const entries = element instanceof HTMLFormElement ? new FormData(element).getAll(NAME) : []
        return Own.GotSubmission({
          tags: entries.flatMap(entry => (typeof entry === 'string' ? [entry] : [])),
        })
      }),
    ),
})

const updatePlaced = App.placements.update((model, message) =>
  Own.match(message, {
    Submitted: () => ({ model, commands: [ReadSubmission({ form: FORM })] }),
    GotSubmission: ({ tags }) => ({
      model: modifyFields(model, { receipt: () => Option.some(tags) }),
    }),
  }),
)

/** A change to the tags drops the receipt of the last submit; typing does not. */
export const update = (model: Model, message: Message) => {
  const result = updatePlaced(model, message)
  return result.model.topics.tags === model.topics.tags || Option.isNone(result.model.receipt)
    ? result
    : { ...result, model: modifyFields(result.model, { receipt: () => Option.none() }) }
}
