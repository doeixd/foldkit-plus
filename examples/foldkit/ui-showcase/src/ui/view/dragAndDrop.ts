import { Array, Option, pipe } from 'effect'
import { Submodel } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { DragAndDrop } from '@foldkit/ui'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'

import { Message as UiMessage } from '../message.js'
import type { DemoCard, DemoColumn, UiModel } from '../model.js'
import { DragAndDropPageSlots, DragAndDropPageStyle } from '../style/dragAndDrop.js'

type Slots = SlotBuilders<typeof DragAndDropPageSlots, UiMessage>

/** How the dragged card is moving, for its `data-drag` look. */
type DragMode = 'Pointer' | 'Keyboard' | 'None'

const dragModeOf = (dragAndDropModel: DragAndDrop.Model): DragMode =>
  DragAndDrop.DragState.match(dragAndDropModel.dragState, {
    Idle: () => 'None' as const,
    Pending: () => 'None' as const,
    Dragging: () => 'Pointer' as const,
    KeyboardDragging: () => 'Keyboard' as const,
  })

const findDraggedCard = (
  columns: ReadonlyArray<DemoColumn>,
  maybeItemId: Option.Option<string>,
): Option.Option<DemoCard> =>
  pipe(
    maybeItemId,
    Option.flatMap(itemId =>
      pipe(
        columns,
        Array.flatMap(({ cards }) => cards),
        Array.findFirst(({ id }) => id === itemId),
      ),
    ),
  )

const cardView = (
  card: DemoCard,
  index: number,
  containerId: string,
  dragAndDropModel: DragAndDrop.Model,
  slots: Slots,
  h: HtmlBuilder<UiMessage>,
): Html => {
  const maybeItemId = DragAndDrop.maybeDraggedItemId(dragAndDropModel)
  const isBeingDragged = Option.exists(maybeItemId, id => id === card.id)

  return h.keyed('div')(
    card.id,
    slots.card.attrs([
      h.DataAttribute('drag', isBeingDragged ? dragModeOf(dragAndDropModel) : 'None'),
      ...DragAndDrop.draggable(
        {
          model: dragAndDropModel,
          toParentMessage: message => UiMessage.GotDragAndDropDemoMessage({ message }),
          itemId: card.id,
          containerId,
          index,
        },
        h,
      ),
      ...DragAndDrop.sortable(card.id),
    ]),
    [card.label],
  )
}

const dropPlaceholder = (slots: Slots, h: HtmlBuilder<UiMessage>): Html =>
  h.keyed('div')('drop-placeholder', slots.placeholder.attrs())

const renderColumn = (
  column: DemoColumn,
  dragAndDropModel: DragAndDrop.Model,
  children: ReadonlyArray<Html>,
  slots: Slots,
  h: HtmlBuilder<UiMessage>,
): Html => {
  const maybeTarget = DragAndDrop.maybeDropTarget(dragAndDropModel)
  const isDropTarget =
    DragAndDrop.isDragging(dragAndDropModel) &&
    Option.exists(maybeTarget, ({ containerId }) => containerId === column.id)

  return h.keyed('div')(column.id, slots.column.attrs(), [
    h.div(slots.columnLabel.attrs(), [column.label]),
    h.div(
      slots.dropZone.attrs([
        ...(isDropTarget ? [h.DataAttribute('drop-target', '')] : []),
        ...DragAndDrop.droppable(column.id, column.label),
      ]),
      [...children],
    ),
  ])
}

const columnView = (
  columns: ReadonlyArray<DemoColumn>,
  column: DemoColumn,
  dragAndDropModel: DragAndDrop.Model,
  slots: Slots,
  h: HtmlBuilder<UiMessage>,
): Html => {
  const maybeItemId = DragAndDrop.maybeDraggedItemId(dragAndDropModel)
  const maybeTarget = DragAndDrop.maybeDropTarget(dragAndDropModel)
  const isDragging = DragAndDrop.isDragging(dragAndDropModel)
  const isPointerDragging = dragModeOf(dragAndDropModel) === 'Pointer'

  const isTargetColumn =
    isDragging && Option.exists(maybeTarget, ({ containerId }) => containerId === column.id)

  const visibleCards = Option.match(maybeItemId, {
    onNone: () => column.cards,
    onSome: draggedId =>
      isDragging ? Array.filter(column.cards, ({ id }) => id !== draggedId) : column.cards,
  })

  const cardElements = Array.map(visibleCards, (card, index) =>
    cardView(card, index, column.id, dragAndDropModel, slots, h),
  )

  if (!isTargetColumn) {
    return renderColumn(column, dragAndDropModel, cardElements, slots, h)
  }

  const targetIndex = Option.match(maybeTarget, {
    onNone: () => visibleCards.length,
    onSome: ({ index }) => Math.min(index, visibleCards.length),
  })

  const insertElement = isPointerDragging
    ? dropPlaceholder(slots, h)
    : Option.match(findDraggedCard(columns, maybeItemId), {
        onNone: () => dropPlaceholder(slots, h),
        onSome: card => cardView(card, targetIndex, column.id, dragAndDropModel, slots, h),
      })

  const withInsert: ReadonlyArray<Html> = pipe(
    cardElements,
    Array.insertAt(targetIndex, insertElement),
    Option.getOrElse(() => [...cardElements, insertElement]),
  )

  return renderColumn(column, dragAndDropModel, withInsert, slots, h)
}

const ghostView = (
  columns: ReadonlyArray<DemoColumn>,
  dragAndDropModel: DragAndDrop.Model,
  slots: Slots,
  h: HtmlBuilder<UiMessage>,
): Html => {
  const maybeItemId = DragAndDrop.maybeDraggedItemId(dragAndDropModel)

  return pipe(
    DragAndDrop.ghostStyle(dragAndDropModel),
    Option.flatMap(ghostStyle =>
      Option.map(findDraggedCard(columns, maybeItemId), card => ({
        ghostStyle,
        card,
      })),
    ),
    Option.match({
      onNone: () => h.empty,
      onSome: ({ ghostStyle, card }) =>
        // `@foldkit/ui` places the ghost under the pointer with inline style.
        h.div(slots.ghost.attrs([h.Style(ghostStyle)]), [card.label]),
    }),
  )
}

const DragAndDropPage = SlotView.forMessages<UiMessage>()
  .define(DragAndDropPageSlots, (model: UiModel, slots, h) =>
    h.div(slots.page.attrs(), [
      h.h2(slots.title.attrs(), ['Drag and Drop']),
      h.div(slots.board.attrs(), [
        h.div(
          slots.columns.attrs(),
          Array.map(model.dragAndDropDemoColumns, column =>
            columnView(model.dragAndDropDemoColumns, column, model.dragAndDropDemo, slots, h),
          ),
        ),
        ghostView(model.dragAndDropDemoColumns, model.dragAndDropDemo, slots, h),
      ]),
    ]),
  )
  .pipe(Style.attach(DragAndDropPageStyle))

export const view = Submodel.defineView<UiModel, UiMessage>(DragAndDropPage)
