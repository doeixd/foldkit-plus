import * as DragAndDrop from '@foldkit/ui/dragAndDrop'
import { Array, Match, Option, String, pipe } from 'effect'
import { Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import { FocusAddCardInput, GenerateCardId } from './command.js'
import { Column } from './domain/index.js'
import { Message } from './message.js'
import type { Model } from './model.js'

type UpdateReturn = Update.Return<Model, Message>

const findCardTitle = (columns: ReadonlyArray<Column.Column>, cardId: string): string =>
  pipe(
    columns,
    Array.flatMap(({ cards }) => cards),
    Array.findFirst(({ id }) => id === cardId),
    Option.match({
      onNone: () => cardId,
      onSome: ({ title }) => title,
    }),
  )

const findColumnName = (columns: ReadonlyArray<Column.Column>, columnId: string): string =>
  pipe(
    columns,
    Array.findFirst(({ id }) => id === columnId),
    Option.match({
      onNone: () => columnId,
      onSome: ({ name }) => name,
    }),
  )

const announceKeyboardDrag = (model: Model, nextDragAndDrop: DragAndDrop.Model): string =>
  Match.value(nextDragAndDrop.dragState).pipe(
    Match.withReturnType<string>(),
    Match.tag('KeyboardDragging', nextState =>
      DragAndDrop.DragState.match(model.dragAndDrop.dragState, {
        Idle: () => {
          const title = findCardTitle(model.columns, nextState.itemId)
          return `Picked up ${title}. Use arrow keys to move within column, Tab to move between columns, Space to drop, Escape to cancel.`
        },
        Pending: () => model.announcement,
        Dragging: () => model.announcement,
        KeyboardDragging: prevState => {
          const columnName = findColumnName(model.columns, nextState.targetContainerId)

          if (prevState.targetContainerId !== nextState.targetContainerId) {
            return `Moved to ${columnName}, position ${nextState.targetIndex + 1}.`
          }
          if (prevState.targetIndex !== nextState.targetIndex) {
            return `Position ${nextState.targetIndex + 1} in ${columnName}.`
          }

          return model.announcement
        },
      }),
    ),
    Match.orElse(() => model.announcement),
  )

const screenReaderTextForDrop = (model: Model, outMessage: DragAndDrop.OutMessage): string =>
  DragAndDrop.OutMessage.match<string>(outMessage, {
    Reordered: ({ itemId, toContainerId, toIndex }) => {
      const title = findCardTitle(model.columns, itemId)
      const columnName = findColumnName(model.columns, toContainerId)
      return `Dropped ${title} in position ${toIndex + 1} of ${columnName}.`
    },
    Cancelled: () =>
      Option.match(DragAndDrop.maybeDraggedItemId(model.dragAndDrop), {
        onNone: () => 'Drag cancelled.',
        onSome: id => {
          const title = findCardTitle(model.columns, id)
          return `Drag cancelled, ${title} returned to original position.`
        },
      }),
  })

const foldDragAndDropOutMessage: (
  previousModel: Model,
) => (outMessage: DragAndDrop.OutMessage) => Update.Step<Model, Message> =
  previousModel => outMessage => model =>
    DragAndDrop.OutMessage.match<UpdateReturn>(outMessage, {
      Reordered: ({ itemId, fromContainerId, toContainerId, toIndex }) => ({
        model: modifyFields(model, {
          columns: () =>
            Column.reorder(model.columns, itemId, fromContainerId, toContainerId, toIndex),
          announcement: () => screenReaderTextForDrop(previousModel, outMessage),
        }),
      }),
      Cancelled: () => ({
        model: modifyFields(model, {
          announcement: () => screenReaderTextForDrop(previousModel, outMessage),
        }),
      }),
    })

const foldDragAndDrop = (previousModel: Model) =>
  Update.foldChild({
    update: DragAndDrop.update,
    read: (model: Model) => Option.some(model.dragAndDrop),
    // The child answers an auto-scroll frame, sent on every animation frame
    // of a pointer drag, with its Model unchanged. Keeping the board's
    // identity then keeps Foldkit from redrawing the whole board each frame.
    write: (model, nextDragAndDrop) =>
      nextDragAndDrop === model.dragAndDrop
        ? model
        : modifyFields(model, {
            dragAndDrop: () => nextDragAndDrop,
            announcement: () => announceKeyboardDrag(model, nextDragAndDrop),
          }),
    toParentMessage: message => Message.GotDragAndDropMessage({ message }),
    foldOutMessage: foldDragAndDropOutMessage(previousModel),
  })

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    GotDragAndDropMessage: ({ message }) => foldDragAndDrop(model)(model, message),

    ClickedAddCard: ({ columnId }) => ({
      model: modifyFields(model, {
        maybeNewCardColumnId: () => Option.some(columnId),
        newCardTitle: () => '',
      }),
      commands: [FocusAddCardInput()],
    }),

    ChangedNewCardTitle: ({ value }) => ({
      model: modifyFields(model, { newCardTitle: () => value }),
    }),

    SubmittedNewCard: () =>
      Option.match(model.maybeNewCardColumnId, {
        onNone: () => ({ model }),
        onSome: columnId => {
          const title = String.trim(model.newCardTitle)
          if (String.isEmpty(title)) {
            return { model }
          }

          return {
            model,
            commands: [GenerateCardId({ columnId, title })],
          }
        },
      }),

    CompletedGenerateCardId: ({ cardId, columnId, title }) => ({
      model: modifyFields(model, {
        columns: columns =>
          Array.map(columns, column => {
            if (column.id !== columnId) {
              return column
            }
            return Column.appendCard(column, {
              id: cardId,
              title,
              description: '',
              sortKey: '',
            })
          }),
        maybeNewCardColumnId: () => Option.none(),
        newCardTitle: () => '',
      }),
    }),

    CancelledNewCard: () => ({
      model: modifyFields(model, {
        maybeNewCardColumnId: () => Option.none(),
        newCardTitle: () => '',
      }),
    }),

    CompletedFocusAddCardInput: () => ({ model }),
  })
