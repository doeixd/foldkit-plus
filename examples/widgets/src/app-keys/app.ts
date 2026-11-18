/**
 * Two shipped widgets whose keys the application extends: a Command and a
 * Menubar. Both are drawn by `foldkit-mixins-ui`; the Model holds the
 * Command's query and highlight, the Menubar's own Model, and what the
 * application's routes and the widgets' Out Messages last said.
 */
import { Match, Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { modifyFields } from 'foldkit/struct'
import { Bundles } from 'foldkit-mixins-ui'

export const MENUS: ReadonlyArray<{
  readonly id: string
  readonly label: string
  readonly rows: ReadonlyArray<string>
}> = [
  { id: 'file', label: 'File', rows: ['New', 'Open', 'Save'] },
  { id: 'edit', label: 'Edit', rows: ['Undo', 'Redo'] },
  { id: 'view', label: 'View', rows: ['Zoom in', 'Zoom out'] },
]

export const App = Bundle.compose({
  query: Schema.String,
  active: Schema.Option(Schema.String),
  ran: Schema.Option(Schema.String),
  chose: Schema.Option(Schema.String),
}).pipe(
  Bundle.withMessages({
    Queried: { query: Schema.String },
    Moved: { value: Schema.String },
    Ran: { value: Schema.String },
    /** The application's own key on the Command: Escape empties the field. */
    ClearedQuery: {},
  }),
  Bundle.withChild('bar', Bundles.Menubar, {
    args: { ids: MENUS.map(menu => menu.id) },
    onOut:
      ({ value }) =>
      model => ({ model: modifyFields(model, { chose: () => Option.some(value) }) }),
  }),
)
export const Model = App.Model
export type Model = typeof Model.Type
export const Message = App.Message
export type Message = typeof Message.Type

export const initial: Model = App.placements.initial({
  query: '',
  active: Option.none(),
  ran: Option.none(),
  chose: Option.none(),
}).model

export const update = App.placements.update((model, message) =>
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
  }),
)

/** The label of the trigger that is the bar's tab stop. */
export const stopOf = (model: Model): string => MENUS[model.bar.stop]?.label ?? ''
