import * as UiButton from '@foldkit/ui/button'
import * as DragAndDrop from '@foldkit/ui/dragAndDrop'
import * as UiInput from '@foldkit/ui/input'
import { Array, Equal, Option, flow, pipe } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { Button, Input } from 'foldkit-mixins-ui'

import { ADD_CARD_INPUT_ID } from '../constant.js'
import type { Card, Column } from '../domain/index.js'
import { Message } from '../message.js'
import type { Model } from '../model.js'
import {
  AddCardButtonStyle,
  CancelButtonStyle,
  NewCardInputStyle,
  SubmitButtonStyle,
} from '../style.js'
import { type Slots, cardView } from './card.js'

const addCardForm = (
  model: Model,
  columnId: string,
  toParentMessage: (message: Message) => Message,
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html => {
  const isAddingToThisColumn = Option.exists(model.maybeNewCardColumnId, id => id === columnId)

  if (!isAddingToThisColumn) {
    return UiButton.view(
      {
        onClick: toParentMessage(Message.ClickedAddCard({ columnId })),
        toView: attributes =>
          h.button(
            Button.resolve<undefined, Message>(attributes, [AddCardButtonStyle.mixin], {
              input: undefined,
              h,
            }).button,
            ['+ Add card'],
          ),
      },
      h,
    )
  }

  return h.form(
    slots.addCardForm.attrs([h.OnSubmit(toParentMessage(Message.SubmittedNewCard()))]),
    [
      h.label(slots.newCardLabel.attrs([h.For(ADD_CARD_INPUT_ID)]), ['New card title']),
      UiInput.view(
        {
          id: ADD_CARD_INPUT_ID,
          onInput: value => toParentMessage(Message.ChangedNewCardTitle({ value })),
          value: model.newCardTitle,
          placeholder: 'Card title...',
          toView: attributes =>
            h.input([
              ...Input.resolve<undefined, Message>(attributes, [NewCardInputStyle.mixin], {
                input: undefined,
                h,
              }).input,
              h.OnKeyDownPreventDefault(
                flow(
                  Option.liftPredicate(Equal.equals('Escape')),
                  Option.map(() => toParentMessage(Message.CancelledNewCard())),
                ),
              ),
            ]),
        },
        h,
      ),
      h.div(slots.formActions.attrs(), [
        UiButton.view(
          {
            onClick: toParentMessage(Message.CancelledNewCard()),
            toView: attributes =>
              h.button(
                Button.resolve<undefined, Message>(attributes, [CancelButtonStyle.mixin], {
                  input: undefined,
                  h,
                }).button,
                ['Cancel'],
              ),
          },
          h,
        ),
        UiButton.view(
          {
            type: 'submit',
            toView: attributes =>
              h.button(
                Button.resolve<undefined, Message>(attributes, [SubmitButtonStyle.mixin], {
                  input: undefined,
                  h,
                }).button,
                ['Add'],
              ),
          },
          h,
        ),
      ]),
    ],
  )
}

const dropPlaceholder = (slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.keyed('li')('drop-placeholder', slots.dropPlaceholder.attrs([h.AriaHidden(true)]))

const findDraggedCard = (model: Model, draggedId: string): Option.Option<Card.Card> =>
  pipe(
    model.columns,
    Array.flatMap(({ cards }) => cards),
    Array.findFirst(({ id }) => id === draggedId),
  )

const defaultCardElements = (
  model: Model,
  column: Column.Column,
  toParentMessage: (message: Message) => Message,
  slots: Slots,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> =>
  Array.map(column.cards, (card, index) =>
    cardView(
      model,
      card,
      column.id,
      index,
      message => toParentMessage(Message.GotDragAndDropMessage({ message })),
      slots,
      h,
    ),
  )

const previewCardElements = (
  model: Model,
  column: Column.Column,
  toParentMessage: (message: Message) => Message,
  slots: Slots,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> => {
  if (!DragAndDrop.isDragging(model.dragAndDrop)) {
    return defaultCardElements(model, column, toParentMessage, slots, h)
  }

  return Option.match(DragAndDrop.maybeDraggedItemId(model.dragAndDrop), {
    onNone: () => defaultCardElements(model, column, toParentMessage, slots, h),
    onSome: draggedId => {
      const maybeTarget = DragAndDrop.maybeDropTarget(model.dragAndDrop)
      const visibleCards = Array.filter(column.cards, ({ id }) => id !== draggedId)
      const cardElements = Array.map(visibleCards, (card, index) =>
        cardView(
          model,
          card,
          column.id,
          index,
          message => toParentMessage(Message.GotDragAndDropMessage({ message })),
          slots,
          h,
        ),
      )

      const isTargetColumn = Option.exists(maybeTarget, target => target.containerId === column.id)

      if (!isTargetColumn) {
        return cardElements
      }

      const targetIndex = Option.match(maybeTarget, {
        onNone: () => visibleCards.length,
        onSome: target => Math.min(target.index, visibleCards.length),
      })

      const isPointerDrag = model.dragAndDrop.dragState._tag === 'Dragging'
      const insertElement = isPointerDrag
        ? dropPlaceholder(slots, h)
        : Option.match(findDraggedCard(model, draggedId), {
            onNone: () => dropPlaceholder(slots, h),
            onSome: card =>
              cardView(
                model,
                card,
                column.id,
                targetIndex,
                message => toParentMessage(Message.GotDragAndDropMessage({ message })),
                slots,
                h,
              ),
          })

      return pipe(
        cardElements,
        Array.insertAt(targetIndex, insertElement),
        Option.getOrElse(() => [...cardElements, insertElement]),
      )
    },
  })
}

export const columnView = (
  model: Model,
  column: Column.Column,
  toParentMessage: (message: Message) => Message,
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html => {
  const maybeCurrentDropTarget = DragAndDrop.maybeDropTarget(model.dragAndDrop)
  const isDropTarget =
    DragAndDrop.isDragging(model.dragAndDrop) &&
    Option.exists(maybeCurrentDropTarget, target => target.containerId === column.id)

  return h.keyed('div')(
    column.id,
    slots.column.attrs([
      h.Role('region'),
      h.AriaLabel(column.name),
      h.DataAttribute('state', isDropTarget ? 'drop-target' : 'idle'),
    ]),
    [
      h.div(slots.columnHeader.attrs(), [
        h.h2(slots.columnName.attrs(), [column.name]),
        h.span(slots.cardCount.attrs(), [`${column.cards.length}`]),
      ]),
      h.ul(
        slots.cardList.attrs([...DragAndDrop.droppable(column.id, column.name)]),
        previewCardElements(model, column, toParentMessage, slots, h),
      ),
      h.div(slots.columnFooter.attrs(), [addCardForm(model, column.id, toParentMessage, slots, h)]),
    ],
  )
}
