import * as DragAndDrop from '@foldkit/ui/dragAndDrop'
import { Schema } from 'effect'

import { Column } from './domain/index.js'

export const Model = Schema.Struct({
  columns: Schema.Array(Column.Column),
  dragAndDrop: DragAndDrop.Model,
  maybeNewCardColumnId: Schema.Option(Schema.String),
  newCardTitle: Schema.String,
  announcement: Schema.String,
})

export type Model = typeof Model.Type
