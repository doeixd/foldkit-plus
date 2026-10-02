import * as DragAndDrop from '@foldkit/ui/dragAndDrop'
import { Option } from 'effect'
import { describe, expect, test } from 'vitest'

import { Message } from '../src/message.js'
import { update } from '../src/update.js'
import { boardModel, keyboardDraggingModel, pointerDraggingModel } from './fixtures.js'

const dragAndDrop = (message: DragAndDrop.Message) => Message.GotDragAndDropMessage({ message })

describe('update', () => {
  // Foldkit redraws only when the Model's identity changes, and an auto-scroll
  // frame arrives on every animation frame of a pointer drag.
  test.each([
    ['an auto-scroll frame', pointerDraggingModel, DragAndDrop.Message.AdvancedAutoScrollFrame()],
    ['a focused card', keyboardDraggingModel, DragAndDrop.Message.CompletedFocusItem()],
  ])('keeps the Model it was given for %s', (_, model, message) => {
    expect(update(model, dragAndDrop(message)).model).toBe(model)
  })

  test('takes the drag step the child makes', () => {
    const { model } = update(
      keyboardDraggingModel,
      dragAndDrop(
        DragAndDrop.Message.CompletedResolveKeyboardMove({
          targetContainerId: 'done',
          targetIndex: 0,
        }),
      ),
    )
    expect(DragAndDrop.maybeDropTarget(model.dragAndDrop)).toStrictEqual(
      Option.some({ containerId: 'done', index: 0 }),
    )
  })

  test.each([
    [
      'picking a card up',
      boardModel,
      DragAndDrop.Message.ActivatedKeyboardDrag({ itemId: '1', containerId: 'todo', index: 0 }),
      'Picked up Write tests. Use arrow keys to move within column, Tab to move between columns, Space to drop, Escape to cancel.',
    ],
    [
      'moving it to another column',
      keyboardDraggingModel,
      DragAndDrop.Message.CompletedResolveKeyboardMove({
        targetContainerId: 'done',
        targetIndex: 0,
      }),
      'Moved to Done, position 1.',
    ],
    [
      'moving it within the column',
      keyboardDraggingModel,
      DragAndDrop.Message.CompletedResolveKeyboardMove({
        targetContainerId: 'in-progress',
        targetIndex: 0,
      }),
      'Position 1 in In Progress.',
    ],
    [
      'dropping it',
      keyboardDraggingModel,
      DragAndDrop.Message.ConfirmedKeyboardDrop(),
      'Dropped Write tests in position 2 of In Progress.',
    ],
    [
      'cancelling the drag',
      keyboardDraggingModel,
      DragAndDrop.Message.CancelledDrag(),
      'Drag cancelled, Write tests returned to original position.',
    ],
  ])('announces %s', (_, model, message, announcement) => {
    expect(update(model, dragAndDrop(message)).model.announcement).toBe(announcement)
  })
})
