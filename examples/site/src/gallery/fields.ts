/**
 * The state of the field previews added with the key-route round: the search
 * fields' text, the toolbar's tab stop and pressed tools, and the file
 * pickers' lists. The site's widgets hold one of these and fold `Message`
 * into it.
 */
import { Equal, Option, Schema } from 'effect'
import * as Command from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import type * as Update from 'foldkit/update'
import { FileInput, SearchField } from 'foldkit-mixins-ui'
import { RovingTabindex } from 'foldkit-primitives/interaction'
import { Picker, Segmented } from 'foldkit-mixins-ui'
import { recipesFor, Sort, Weekday } from '../snippets/components.js'

export const FilesExample = Schema.Literals(['multiple', 'required'])
export type FilesExample = typeof FilesExample.Type

/** The ids the pickers draw their inputs under, which `Sync` and `Focus` find them by. */
export const FILES_ID = {
  multiple: 'preview-attachments',
  required: 'preview-statement',
} as const satisfies Record<FilesExample, string>

export const Model = Schema.Struct({
  search: Schema.String,
  keyed: Schema.Struct({ query: Schema.String, active: Schema.Number }),
  toolbar: Schema.Struct({
    roving: RovingTabindex.Model,
    pressed: Schema.Array(Schema.String),
    align: Schema.String,
  }),
  files: Schema.Record(FilesExample, Schema.Array(Schema.instanceOf(File))),
  /** A price that can be empty, and the brightness as it moves and as last let go of. */
  price: Schema.Option(Schema.Number),
  brightness: Schema.Struct({ value: Schema.Number, saved: Schema.Number }),
  repeatOn: Schema.Array(Weekday),
  /** The sort picker: what is open, and the order chosen. */
  picker: Picker.Model,
  sort: Schema.Option(Sort),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  TypedSearch: { value: Schema.String },
  ClearedSearch: {},
  TypedKeyed: { value: Schema.String },
  ClearedKeyed: {},
  MovedKeyed: { by: Schema.Number },
  FocusedTool: { id: Schema.String },
  PressedTool: { id: Schema.String },
  PickedFiles: { example: FilesExample, files: Schema.Array(Schema.instanceOf(File)) },
  RemovedFile: { example: FilesExample, file: Schema.instanceOf(File) },
  /** A Focus or Sync Command ran; nothing to change. */
  ChangedPrice: { value: Schema.Option(Schema.Number) },
  MovedBrightness: { value: Schema.Number },
  CommittedBrightness: { value: Schema.Number },
  ToggledDay: { day: Weekday },
  GotPicker: { message: Picker.Message },
  Completed: {},
})
export type Message = typeof Message.Type

export const init = (): Model => ({
  search: '',
  keyed: { query: '', active: 0 },
  toolbar: { roving: { current: null }, pressed: ['bold'], align: 'left' },
  files: { multiple: [], required: [] },
  price: Option.none(),
  brightness: { value: 60, saved: 60 },
  repeatOn: ['mon', 'wed'],
  picker: Picker.init({ id: 'preview-sort' }),
  sort: Option.none(),
})

const ALIGNMENTS: ReadonlyArray<string> = ['left', 'center', 'right']

export const update = (model: Model, message: Message): Update.Return<Model, Message> =>
  Message.match(message, {
    TypedSearch: ({ value }) =>
      value === model.search ? { model } : { model: modifyFields(model, { search: () => value }) },
    ClearedSearch: () => ({
      model: modifyFields(model, { search: () => '' }),
      commands: Command.mapMessages([SearchField.Focus({ id: 'preview-search' })], () =>
        Message.Completed(),
      ),
    }),
    // A new query starts again at the first result.
    TypedKeyed: ({ value }) =>
      value === model.keyed.query
        ? { model }
        : { model: modifyFields(model, { keyed: () => ({ query: value, active: 0 }) }) },
    ClearedKeyed: () => ({
      model: modifyFields(model, { keyed: () => ({ query: '', active: 0 }) }),
      commands: Command.mapMessages([SearchField.Focus({ id: 'preview-search-keys' })], () =>
        Message.Completed(),
      ),
    }),
    MovedKeyed: ({ by }) => {
      const last = recipesFor(model.keyed.query).length - 1
      const active = Math.max(0, Math.min(last, model.keyed.active + by))
      return active === model.keyed.active
        ? { model }
        : { model: modifyFields(model, { keyed: keyed => ({ ...keyed, active }) }) }
    },
    FocusedTool: ({ id }) =>
      model.toolbar.roving.current === id
        ? { model }
        : {
            model: modifyFields(model, {
              toolbar: toolbar => ({ ...toolbar, roving: { current: id } }),
            }),
          },
    // Alignment is one of three; the marks each toggle.
    PressedTool: ({ id }) => ({
      model: modifyFields(model, {
        toolbar: toolbar =>
          ALIGNMENTS.includes(id)
            ? { ...toolbar, align: id }
            : {
                ...toolbar,
                pressed: toolbar.pressed.includes(id)
                  ? toolbar.pressed.filter(pressed => pressed !== id)
                  : [...toolbar.pressed, id],
              },
      }),
    }),
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
    ChangedPrice: ({ value }) =>
      Equal.equals(value, model.price)
        ? { model }
        : { model: modifyFields(model, { price: () => value }) },
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
    GotPicker: ({ message }) => {
      const next = Picker.update(model.picker, message)
      // A choice outside the listed orders is ignored.
      const chosen = Option.filter(
        Option.map(Option.fromNullishOr(next.outMessage), ({ value }) => value),
        Schema.is(Sort),
      )
      return {
        model:
          next.model === model.picker && Option.isNone(chosen)
            ? model
            : modifyFields(model, {
                picker: () => next.model,
                sort: sort => Option.orElse(chosen, () => sort),
              }),
        commands: Command.mapMessages(next.commands ?? [], inner =>
          Message.GotPicker({ message: inner }),
        ),
      }
    },
    Completed: () => ({ model }),
  })
