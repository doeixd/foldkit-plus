/**
 * One search field's state. Clearing answers `SearchField.Focus`, which puts
 * focus back on the input the pressed clear button took with it.
 */
import { Schema } from 'effect'
import { SearchField } from 'foldkit-mixins-ui'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'

export const SearchModel = Schema.Struct({
  id: Schema.String,
  value: Schema.String,
  resultsOpen: Schema.Boolean,
})
export type SearchModel = typeof SearchModel.Type

export const SearchMessage = defineMessageUnion({
  Typed: { value: Schema.String },
  Cleared: {},
  OpenedResults: {},
  CompletedFocus: {},
})
export type SearchMessage = typeof SearchMessage.Type

export const searchUpdate = (model: SearchModel, message: SearchMessage) =>
  SearchMessage.match(message, {
    Typed: ({ value }) =>
      value === model.value ? { model } : { model: modifyFields(model, { value: () => value }) },
    Cleared: () => ({
      model:
        model.value === '' && !model.resultsOpen
          ? model
          : modifyFields(model, { value: () => '', resultsOpen: () => false }),
      commands: [SearchField.Focus({ id: model.id })],
    }),
    OpenedResults: () =>
      model.resultsOpen ? { model } : { model: modifyFields(model, { resultsOpen: () => true }) },
    CompletedFocus: () => ({ model }),
  })

export const resultsId = (id: string) => `${id}-results`
