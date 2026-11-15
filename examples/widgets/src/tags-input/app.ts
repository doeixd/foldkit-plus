/**
 * A form with a field of topics. The application owns the tags and the draft
 * as `TagsInput.Model` and folds the field's own Messages into it; the field
 * draws one hidden input per tag under `name`, so the form submits the chips
 * and never the text still being typed. The receipt under the form is read
 * from the form's own `FormData`, so it shows what the browser would send.
 */
import { Effect, Option, Schema } from 'effect'
import * as Command from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import * as Render from 'foldkit/render'
import { modifyFields } from 'foldkit/struct'
import type { Return } from 'foldkit/update'
import { TagsInput } from 'foldkit-mixins-ui'

export const FORM = 'article'
/** The receipt's id: the field draws a status region of its own, so the role names neither. */
export const RECEIPT = 'topics-receipt'
/** The form field the tags submit under. */
export const NAME = 'topics'

export const Model = Schema.Struct({
  topics: TagsInput.Model,
  /** The tags the form held at the last submit, until the tags change. */
  receipt: Schema.Option(Schema.Array(Schema.String)),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  GotTopics: { message: TagsInput.Message },
  Submitted: {},
  GotSubmission: { tags: Schema.Array(Schema.String) },
})
export type Message = typeof Message.Type

export const initial: Model = {
  topics: TagsInput.init({ id: 'topics', tags: ['foldkit', 'effect'], max: 5 }),
  receipt: Option.none(),
}

export const ReadSubmission = Command.define('ReadSubmission', {
  args: { form: Schema.String },
  messages: [Message.GotSubmission],
  // A tag added on blur by the same press that submits is drawn as a hidden input only after the next commit.
  execute: ({ form }) =>
    Render.afterCommit.pipe(
      Effect.map(() => {
        const element = document.getElementById(form)
        const entries = element instanceof HTMLFormElement ? new FormData(element).getAll(NAME) : []
        return Message.GotSubmission({
          tags: entries.flatMap(entry => (typeof entry === 'string' ? [entry] : [])),
        })
      }),
    ),
})

export const update = (model: Model, message: Message): Return<Model, Message> =>
  Message.match(message, {
    GotTopics: ({ message }) => {
      const result = TagsInput.update(model.topics, message)
      const commands = Command.mapMessages(result.commands, message =>
        Message.GotTopics({ message }),
      )
      if (result.model === model.topics) return { model, commands }
      return {
        model: modifyFields(model, {
          topics: () => result.model,
          receipt: receipt => (result.model.tags === model.topics.tags ? receipt : Option.none()),
        }),
        commands,
      }
    },
    Submitted: () => ({ model, commands: [ReadSubmission({ form: FORM })] }),
    GotSubmission: ({ tags }) => ({
      model: modifyFields(model, { receipt: () => Option.some(tags) }),
    }),
  })
