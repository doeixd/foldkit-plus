/**
 * An application form with a file upload: a drop zone and a list, no transport.
 * The widget judges each file (PDFs and images, five at most, 2 MB each),
 * lists it and writes the list back into the native input after every change
 * (`FileInput.Sync` inside `FileUpload.update`), so a plain submit sends exactly
 * the rows, dropped files included. The receipt under the form is read from the
 * form's own `FormData`, not from the Model, so it shows what the browser would
 * send.
 */
import { Effect, Option, Schema } from 'effect'
import * as Command from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import type { Return } from 'foldkit/update'
import { FileUpload } from 'foldkit-mixins-ui'

export const ID = 'documents'
/** The form field the files submit under. */
export const NAME = 'attachments'
export const FORM = 'application'

export const Model = Schema.Struct({
  upload: FileUpload.Model,
  /** The names the form held at the last submit, until the list changes. */
  receipt: Schema.Option(Schema.Array(Schema.String)),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  GotUpload: { message: FileUpload.Message },
  Submitted: {},
  GotSubmission: { names: Schema.Array(Schema.String) },
})
export type Message = typeof Message.Type

export const initial = (): Model => ({
  upload: FileUpload.init({
    id: ID,
    multiple: true,
    accept: ['.pdf', 'image/*'],
    maxFiles: 5,
    maxSize: 2_000_000,
  }),
  receipt: Option.none(),
})

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
    GotUpload: ({ message: inner }) => {
      const { model: upload, commands } = FileUpload.update(model.upload, inner)
      return {
        model:
          upload === model.upload
            ? model
            : modifyFields(model, {
                upload: () => upload,
                // The receipt described a list that has changed.
                receipt: receipt =>
                  upload.entries === model.upload.entries ? receipt : Option.none(),
              }),
        commands: Command.mapMessages(commands ?? [], next => Message.GotUpload({ message: next })),
      }
    },
    Submitted: () => ({ model, commands: [ReadSubmission({ form: FORM })] }),
    GotSubmission: ({ names }) => ({
      model: modifyFields(model, { receipt: () => Option.some(names) }),
    }),
  })
