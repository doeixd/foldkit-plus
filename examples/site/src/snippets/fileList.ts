import { Schema } from 'effect'
import * as Command from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import { FileInput } from 'foldkit-mixins-ui'

const Model = Schema.Struct({ files: Schema.Array(Schema.instanceOf(File)) })
export const Message = defineMessageUnion({
  Picked: { files: Schema.Array(Schema.instanceOf(File)) },
  Removed: { file: Schema.instanceOf(File) },
  /** A Sync or Focus Command ran; nothing to change. */
  Completed: {},
})

/**
 * The list a FileInput example owns. The input forgets what it was given, so
 * each change writes the list back into it with `FileInput.Sync`, and a
 * surrounding form submits what the list shows; a remove hands the focus
 * back to the input with `FileInput.Focus`.
 */
export const fileList = (id: string, options: { readonly multiple: boolean }) => ({
  Model,
  Message,
  init: (): { readonly model: typeof Model.Type } => ({ model: { files: [] } }),
  update: (model: typeof Model.Type, message: typeof Message.Type) => {
    const done = () => Message.Completed()
    const synced = (files: ReadonlyArray<File>) =>
      Command.mapMessages([FileInput.Sync({ id, files })], done)
    return Message.match(message, {
      Picked: ({ files }) => {
        const next = FileInput.added(model.files, files, options)
        return { model: { files: next }, commands: synced(next) }
      },
      Removed: ({ file }) => {
        const kept = model.files.filter(held => held !== file)
        const focus = Command.mapMessages([FileInput.Focus({ id })], done)
        return { model: { files: kept }, commands: [...synced(kept), ...focus] }
      },
      Completed: () => ({ model, commands: [] }),
    })
  },
})
