/**
 * The state of the field previews added with the key-route round: the file
 * pickers' lists. The site's widgets hold one of these and fold `Message`
 * into it.
 */
import { Schema } from 'effect'
import * as Command from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import type * as Update from 'foldkit/update'
import { FileInput, Segmented } from 'foldkit-mixins-ui'
import { Weekday } from '../snippets/components.js'

export const FilesExample = Schema.Literals(['multiple', 'required'])
export type FilesExample = typeof FilesExample.Type

/** The ids the pickers draw their inputs under, which `Sync` and `Focus` find them by. */
export const FILES_ID = {
  multiple: 'preview-attachments',
  required: 'preview-statement',
} as const satisfies Record<FilesExample, string>

export const Model = Schema.Struct({
  files: Schema.Record(FilesExample, Schema.Array(Schema.instanceOf(File))),
  /** The brightness as it moves and as last let go of. */
  brightness: Schema.Struct({ value: Schema.Number, saved: Schema.Number }),
  repeatOn: Schema.Array(Weekday),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  PickedFiles: { example: FilesExample, files: Schema.Array(Schema.instanceOf(File)) },
  RemovedFile: { example: FilesExample, file: Schema.instanceOf(File) },
  /** A Focus or Sync Command ran; nothing to change. */
  MovedBrightness: { value: Schema.Number },
  CommittedBrightness: { value: Schema.Number },
  ToggledDay: { day: Weekday },
  Completed: {},
})
export type Message = typeof Message.Type

export const init = (): Model => ({
  files: { multiple: [], required: [] },
  brightness: { value: 60, saved: 60 },
  repeatOn: ['mon', 'wed'],
})

export const update = (model: Model, message: Message): Update.Return<Model, Message> =>
  Message.match(message, {
    PickedFiles: ({ example, files }) => {
      const next = FileInput.added(model.files[example], files, {
        multiple: example === 'multiple',
      })
      return {
        model: modifyFields(model, { files: current => ({ ...current, [example]: next }) }),
        commands: Command.mapMessages(
          [FileInput.Sync({ id: FILES_ID[example], files: next })],
          () => Message.Completed(),
        ),
      }
    },
    RemovedFile: ({ example, file }) => {
      const next = model.files[example].filter(held => held !== file)
      return {
        model: modifyFields(model, { files: current => ({ ...current, [example]: next }) }),
        commands: [
          ...Command.mapMessages([FileInput.Sync({ id: FILES_ID[example], files: next })], () =>
            Message.Completed(),
          ),
          ...Command.mapMessages([FileInput.Focus({ id: FILES_ID[example] })], () =>
            Message.Completed(),
          ),
        ],
      }
    },
    MovedBrightness: ({ value }) =>
      value === model.brightness.value
        ? { model }
        : { model: modifyFields(model, { brightness: brightness => ({ ...brightness, value }) }) },
    CommittedBrightness: ({ value }) =>
      value === model.brightness.saved
        ? { model }
        : {
            model: modifyFields(model, {
              brightness: brightness => ({ ...brightness, saved: value }),
            }),
          },
    ToggledDay: ({ day }) => ({
      model: modifyFields(model, {
        repeatOn: days => Segmented.toggled(days, day, { multiple: true }),
      }),
    }),
    Completed: () => ({ model }),
  })
