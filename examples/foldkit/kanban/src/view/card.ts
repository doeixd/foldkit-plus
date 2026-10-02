import * as DragAndDrop from '@foldkit/ui/dragAndDrop'
import { String } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { SlotBuilders } from 'foldkit-mixins'

import type { Card } from '../domain/index.js'
import type { Message } from '../message.js'
import type { Model } from '../model.js'
import { KanbanBoard } from '../style.js'

export type Slots = SlotBuilders<typeof KanbanBoard.slots, Message>

/**
 * Whether the keyboard is carrying this card, as a `data-state`. A card the
 * pointer carries is never drawn in a list (the ghost carries it), so
 * upstream's third class set, for that case, is not kept.
 */
type CardState = 'idle' | 'keyboard-dragged'

const cardStateOf = (model: Model, cardId: string): CardState =>
  DragAndDrop.DragState.match(model.dragAndDrop.dragState, {
    Idle: (): CardState => 'idle',
    Pending: (): CardState => 'idle',
    Dragging: (): CardState => 'idle',
    KeyboardDragging: ({ itemId }): CardState => (itemId === cardId ? 'keyboard-dragged' : 'idle'),
  })

const cardContent = (
  card: Card.Card,
  slots: Slots,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> => [
  h.span(slots.cardTitle.attrs(), [card.title]),
  ...(String.isNonEmpty(card.description)
    ? [h.div(slots.cardDescription.attrs(), [card.description])]
    : []),
]

export const cardView = (
  model: Model,
  card: Card.Card,
  columnId: string,
  index: number,
  toParentMessage: (message: DragAndDrop.Message) => Message,
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html =>
  h.keyed('li')(
    card.id,
    slots.card.attrs([
      h.DataAttribute('state', cardStateOf(model, card.id)),
      ...DragAndDrop.draggable(
        {
          model: model.dragAndDrop,
          toParentMessage,
          itemId: card.id,
          containerId: columnId,
          index,
        },
        h,
      ),
    ]),
    cardContent(card, slots, h),
  )

export const ghostCardView = (card: Card.Card, slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.div(slots.ghostCard.attrs(), cardContent(card, slots, h))
