/**
 * A resume form whose attachments the application owns. The native file input
 * forgets what it was given, so every change to the list is written back
 * into it (`FileInput.Sync`) and a submit sends exactly the rows. The receipt
 * under the form is read from the form's own `FormData`, not from the Model,
 * so it shows what the browser would send.
 */
import { Effect, Option, Schema } from 'effect'
import * as Command from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import type { Return } from 'foldkit/update'
import { FileInput } from 'foldkit-mixins-ui'

export const FIELD = 'resume'
/** The form field the files submit under. */
export const NAME = 'attachments'
export const FORM = 'application'

const Files = Schema.Array(Schema.instanceOf(File))

export const Model = Schema.Struct({
  files: Files,
  /** The names the form held at the last submit, until the list changes. */
  receipt: Schema.Option(Schema.Array(Schema.String)),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  Picked: { files: Files },
  Removed: { file: Schema.instanceOf(File) },
  Submitted: {},
  GotSubmission: { names: Schema.Array(Schema.String) },
  ...FileInput.cases,
})
export type Message = typeof Message.Type

export const initial: Model = { files: [], receipt: Option.none() }

export const ReadSubmission = Command.define('ReadSubmission', {
  args: { form: Schema.String },
  messages: [Message.GotSubmission],
  execute: ({ form }) =>
    Effect.sync(() => {
      const element = document.getElementById(form)
      const entries = element instanceof HTMLFormElement ? new FormData(element).getAll(NAME) : []
      // An input holding no file still submits one nameless part.
      return Message.GotSubmission({
        names: entries.flatMap(entry =>
          entry instanceof File && entry.name !== '' ? [entry.name] : [],
        ),
      })
    }),
})

export const update = (model: Model, message: Message): Return<Model, Message> =>
  Message.match(message, {
    // The input was emptied before this Message, so a pick that adds nothing (a
    // file already listed, a cancelled dialog) still has to be written back.
    Picked: ({ files }) => {
      const next = FileInput.added(model.files, files, { multiple: true })
      return {
        model:
          next.length === model.files.length
            ? model
            : modifyFields(model, { files: () => next, receipt: () => Option.none() }),
        commands: [FileInput.Sync({ id: FIELD, files: next })],
      }
    },
    Removed: ({ file }) => {
      const next = model.files.filter(each => each !== file)
      return next.length === model.files.length
        ? { model }
        : {
            model: modifyFields(model, { files: () => next, receipt: () => Option.none() }),
            // The pressed button leaves the page with the focus on it.
            commands: [FileInput.Sync({ id: FIELD, files: next }), FileInput.Focus({ id: FIELD })],
          }
    },
    Submitted: () => ({ model, commands: [ReadSubmission({ form: FORM })] }),
    GotSubmission: ({ names }) => ({
      model: modifyFields(model, { receipt: () => Option.some(names) }),
    }),
    CompletedSync: () => ({ model }),
    CompletedFocus: () => ({ model }),
  })
