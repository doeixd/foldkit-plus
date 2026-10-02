import * as DragAndDrop from '@foldkit/ui/dragAndDrop'
import { Option } from 'effect'
import { modifyFields } from 'foldkit/struct'

import type { Column } from '../src/domain/index.js'
import { initialModel } from '../src/mirror.js'
import type { Model } from '../src/model.js'

const card = (id: string, title: string, sortKey: string, description = '') => ({
  id,
  title,
  description,
  sortKey,
})

export const testColumns: ReadonlyArray<Column.Column> = [
  {
    id: 'todo',
    name: 'To Do',
    cards: [
      card('1', 'Write tests', 'a0', 'Cover the drop.'),
      card('2', 'Fix bug', 'a1'),
      card('3', 'Ship it', 'a2'),
    ],
  },
  { id: 'in-progress', name: 'In Progress', cards: [card('4', 'Review PR', 'a0')] },
  { id: 'done', name: 'Done', cards: [] },
]

export const boardModel: Model = modifyFields(initialModel, { columns: () => testColumns })

export const withDragState = (dragState: DragAndDrop.DragState): Model =>
  modifyFields(boardModel, {
    dragAndDrop: dragAndDrop => modifyFields(dragAndDrop, { dragState: () => dragState }),
  })

/** Card 1 carried by the pointer over In Progress, above Review PR. */
export const pointerDraggingModel: Model = withDragState(
  DragAndDrop.DragState.Dragging({
    itemId: '1',
    sourceContainerId: 'todo',
    sourceIndex: 0,
    origin: { screenX: 0, screenY: 0 },
    current: { clientX: 40, clientY: 60 },
    maybeDropTarget: Option.some({ containerId: 'in-progress', index: 0 }),
  }),
)

/** Card 1 picked up with the keyboard and moved to the end of In Progress. */
export const keyboardDraggingModel: Model = withDragState(
  DragAndDrop.DragState.KeyboardDragging({
    itemId: '1',
    sourceContainerId: 'todo',
    sourceIndex: 0,
    targetContainerId: 'in-progress',
    targetIndex: 1,
  }),
)

export const addingCardModel: Model = modifyFields(boardModel, {
  maybeNewCardColumnId: () => Option.some('done'),
  newCardTitle: () => 'Draft',
})
