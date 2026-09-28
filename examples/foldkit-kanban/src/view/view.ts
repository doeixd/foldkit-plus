import * as DragAndDrop from '@foldkit/ui/dragAndDrop'
import { Array, Option, pipe } from 'effect'
import type { Document, HtmlBuilder } from 'foldkit/html'
import { SlotView, Style } from 'foldkit-mixins'

import type { Message } from '../message.js'
import type { Model } from '../model.js'
import { KanbanBoard } from '../style.js'
import { type Slots, ghostCardView } from './card.js'
import { columnView } from './column.js'

const findDraggedCard = (model: Model) =>
  pipe(
    model.dragAndDrop,
    DragAndDrop.maybeDraggedItemId,
    Option.flatMap(cardId =>
      pipe(
        model.columns,
        Array.flatMap(({ cards }) => cards),
        Array.findFirst(({ id }) => id === cardId),
      ),
    ),
  )

const ghostElement = (model: Model, slots: Slots, h: HtmlBuilder<Message>) =>
  pipe(
    DragAndDrop.ghostStyle(model.dragAndDrop),
    Option.flatMap(ghostStyle =>
      Option.map(findDraggedCard(model), card => ({ ghostStyle, card })),
    ),
    Option.match({
      onNone: () => h.empty,
      onSome: ({ ghostStyle, card }) =>
        h.div(slots.ghost.attrs([h.Style(ghostStyle), h.AriaHidden(true)]), [
          ghostCardView(card, slots, h),
        ]),
    }),
  )

export const Board = SlotView.forMessages<Message>()
  .define(KanbanBoard.slots, (model: Model, slots, h) =>
    h.div(slots.page.attrs(), [
      h.div(slots.header.attrs(), [h.h1(slots.heading.attrs(), ['Kanban Board'])]),
      h.div(
        slots.board.attrs(),
        Array.map(model.columns, column => columnView(model, column, message => message, slots, h)),
      ),
      ghostElement(model, slots, h),
      h.div(slots.announcer.attrs([h.AriaLive('assertive')]), [model.announcement]),
    ]),
  )
  .pipe(Style.attach(KanbanBoard.style))

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: 'Kanban Board',
  body: Board(model, h),
})
