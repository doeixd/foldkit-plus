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
import { Bundle } from 'foldkit-bundle'
import * as Command from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { Bundles } from 'foldkit-mixins-ui'

export const ID = 'documents'
/** The form field the files submit under. */
export const NAME = 'attachments'
export const FORM = 'application'

const OwnCases = { Submitted: {}, GotSubmission: { names: Schema.Array(Schema.String) } }
const Own = defineMessageUnion(OwnCases)

export const App = Bundle.compose({
  /** The names the form held at the last submit, until the list changes. */
  receipt: Schema.Option(Schema.Array(Schema.String)),
}).pipe(
  Bundle.withMessages(OwnCases),
  Bundle.withChild('upload', Bundles.FileUpload, {
    args: { id: ID, multiple: true, accept: ['.pdf', 'image/*'], maxFiles: 5, maxSize: 2_000_000 },
    onOut: Bundle.ignore,
  }),
)
export const Model = App.Model
export type Model = typeof Model.Type
export const Message = App.Message
export type Message = typeof Message.Type

export const initial = (): Model => App.placements.initial({ receipt: Option.none() }).model

export const ReadSubmission = Command.define('ReadSubmission', {
  args: { form: Schema.String },
  messages: [Own.GotSubmission],
  execute: ({ form }) =>
    Effect.sync(() => {
      const element = document.getElementById(form)
      const entries = element instanceof HTMLFormElement ? new FormData(element).getAll(NAME) : []
      // An input holding no file still submits one nameless part.
      return Own.GotSubmission({
        names: entries.flatMap(entry =>
          entry instanceof File && entry.name !== '' ? [entry.name] : [],
        ),
      })
    }),
})

const updatePlaced = App.placements.update((model, message) =>
  Own.match(message, {
    Submitted: () => ({ model, commands: [ReadSubmission({ form: FORM })] }),
    GotSubmission: ({ names }) => ({
      model: modifyFields(model, { receipt: () => Option.some(names) }),
    }),
  }),
)

/** A change to the list drops the receipt, which described the list before it. */
export const update = (model: Model, message: Message) => {
  const result = updatePlaced(model, message)
  return result.model.upload.entries === model.upload.entries || Option.isNone(result.model.receipt)
    ? result
    : { ...result, model: modifyFields(result.model, { receipt: () => Option.none() }) }
}
