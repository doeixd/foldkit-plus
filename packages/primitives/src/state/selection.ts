/**
 * A selection set as a bundle: the selected ids in the Model, changed one at
 * a time or replaced whole. Order follows first selection; toggling moves a
 * reselected id to the end. Pure logic, no streams.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'

export const SelectionSetModel = Schema.Struct({ selected: Schema.Array(Schema.String) })
export type SelectionSetModel = typeof SelectionSetModel.Type

export const SelectionSetMessage = defineMessageUnion({
  Select: { id: Schema.String },
  Deselect: { id: Schema.String },
  Toggle: { id: Schema.String },
  ReplaceAll: { ids: Schema.Array(Schema.String) },
  Clear: {},
})
export type SelectionSetMessage = typeof SelectionSetMessage.Type

const without = (selected: ReadonlyArray<string>, id: string): ReadonlyArray<string> =>
  selected.filter(other => other !== id)

const sameIds = (a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean =>
  a.length === b.length && a.every((id, index) => id === b[index])

/** Whether the id is currently selected. */
export const isSelected = (model: SelectionSetModel, id: string): boolean =>
  model.selected.includes(id)

export const SelectionSet = Bundle.make('SelectionSet', {
  Model: SelectionSetModel,
  Message: SelectionSetMessage,
  init: () => ({ model: { selected: [] } }),
  update: (model, message) =>
    SelectionSetMessage.match(message, {
      Select: ({ id }) =>
        isSelected(model, id) ? { model } : { model: { selected: [...model.selected, id] } },
      Deselect: ({ id }) =>
        isSelected(model, id) ? { model: { selected: without(model.selected, id) } } : { model },
      Toggle: ({ id }) =>
        isSelected(model, id)
          ? { model: { selected: without(model.selected, id) } }
          : { model: { selected: [...model.selected, id] } },
      ReplaceAll: ({ ids }) => {
        const selected = [...new Set(ids)]
        return sameIds(selected, model.selected) ? { model } : { model: { selected } }
      },
      Clear: () => (model.selected.length === 0 ? { model } : { model: { selected: [] } }),
    }),
})
