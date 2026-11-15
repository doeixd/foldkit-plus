/**
 * Two shipped widgets whose keys the application extends: a Command and a
 * Menubar. Both are drawn by `foldkit-mixins-ui`; the Model holds the
 * Command's query and highlight, the Menubar's own Model, and what the
 * application's routes and the widgets' Out Messages last said.
 */
import { Match, Option, Schema } from 'effect'
import { mapMessages } from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import type { Return } from 'foldkit/update'
import { Menubar } from 'foldkit-mixins-ui'

export const MENUS: ReadonlyArray<{
  readonly id: string
  readonly label: string
  readonly rows: ReadonlyArray<string>
}> = [
  { id: 'file', label: 'File', rows: ['New', 'Open', 'Save'] },
  { id: 'edit', label: 'Edit', rows: ['Undo', 'Redo'] },
  { id: 'view', label: 'View', rows: ['Zoom in', 'Zoom out'] },
]

export const Model = Schema.Struct({
  query: Schema.String,
  active: Schema.Option(Schema.String),
  ran: Schema.Option(Schema.String),
  bar: Menubar.Model,
  chose: Schema.Option(Schema.String),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  Queried: { query: Schema.String },
  Moved: { value: Schema.String },
  Ran: { value: Schema.String },
  /** The application's own key on the Command: Escape empties the field. */
  ClearedQuery: {},
  GotBar: { message: Menubar.Message },
})
export type Message = typeof Message.Type

export const initial: Model = {
  query: '',
  active: Option.none(),
  ran: Option.none(),
  bar: Menubar.init(MENUS.map(menu => menu.id)),
  chose: Option.none(),
}

export const update = (model: Model, message: Message): Return<Model, Message> =>
  Match.valueTags(message, {
    Queried: ({ query }) =>
      query === model.query ? { model } : { model: modifyFields(model, { query: () => query }) },
    Moved: ({ value }) =>
      Option.exists(model.active, active => active === value)
        ? { model }
        : { model: modifyFields(model, { active: () => Option.some(value) }) },
    Ran: ({ value }) => ({ model: modifyFields(model, { ran: () => Option.some(value) }) }),
    ClearedQuery: () =>
      model.query === '' ? { model } : { model: modifyFields(model, { query: () => '' }) },
    GotBar: ({ message }) => {
      const next = Menubar.update(model.bar, message)
      const chose = Option.map(Option.fromNullishOr(next.outMessage), ({ value }) => value)
      const commands = mapMessages(next.commands ?? [], inner => Message.GotBar({ message: inner }))
      if (next.model === model.bar && Option.isNone(chose) && commands.length === 0) {
        return { model }
      }
      return {
        model: modifyFields(model, {
          bar: () => next.model,
          chose: current => (Option.isSome(chose) ? chose : current),
        }),
        commands,
      }
    },
  })

/** The label of the trigger that is the bar's tab stop. */
export const stopOf = (model: Model): string => MENUS[model.bar.stop]?.label ?? ''
