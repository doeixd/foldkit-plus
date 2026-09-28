import { Array, Equal, Match, Option } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'

import { EMPTY_COLOR } from '../constant.js'
import { floodFill, getMirroredPositions } from '../grid.js'
import { Message } from '../message.js'
import type { Cell, Grid, HexColor, Model, PaletteIndex } from '../model.js'
import { type PaletteTheme, currentPaletteTheme, resolveColor } from '../palette.js'
import { CanvasSlots, CanvasStyle } from '../style.js'

const EMPTY_PREVIEW_POSITIONS: ReadonlyArray<readonly [number, number]> = []

/** A row's previewed columns when it has none, one value so its lazy row keeps its memo. */
const NO_PREVIEW_COLUMNS: ReadonlyArray<number> = []

const computePreviewPositions = (model: Model): ReadonlyArray<readonly [number, number]> => {
  if (model.isDrawing) {
    return EMPTY_PREVIEW_POSITIONS
  }
  return Option.match(model.maybeHoveredCell, {
    onNone: () => EMPTY_PREVIEW_POSITIONS,
    onSome: ({ x, y }) =>
      Match.value(model.tool).pipe(
        Match.withReturnType<ReadonlyArray<readonly [number, number]>>(),
        Match.whenOr('Brush', 'Eraser', () =>
          getMirroredPositions(x, y, model.gridSize, model.mirrorMode),
        ),
        Match.when('Fill', () =>
          computeFillPreview(model.history.present, x, y, model.selectedColorIndex),
        ),
        Match.exhaustive,
      ),
  })
}

const computeFillPreview = (
  grid: Grid,
  startX: number,
  startY: number,
  fillColorIndex: PaletteIndex,
): ReadonlyArray<readonly [number, number]> => {
  const filledGrid = floodFill(grid, startX, startY, fillColorIndex)
  const positions: Array<readonly [number, number]> = []
  Array.forEach(filledGrid, (row, y) => {
    Array.forEach(row, (cell, x) => {
      if (!Equal.equals(cell, grid[y]?.[x])) {
        positions.push([x, y])
      }
    })
  })
  return positions.length === 0 ? EMPTY_PREVIEW_POSITIONS : positions
}

/** The previewed columns of each row, gathered once rather than searched for per row. */
const previewColumnsByRow = (
  positions: ReadonlyArray<readonly [number, number]>,
): ReadonlyMap<number, ReadonlyArray<number>> => {
  const byRow = new Map<number, Array<number>>()
  for (const [x, y] of positions) {
    const columns = byRow.get(y)
    if (columns === undefined) byRow.set(y, [x])
    else columns.push(x)
  }
  return byRow
}

type RowArgs = Readonly<{
  row: ReadonlyArray<Cell>
  y: number
  previewColor: HexColor
  previewColumns: ReadonlyArray<number>
  theme: PaletteTheme
}>

/**
 * One row, drawn again only when an argument changes by identity: its cells
 * (a painted cell makes a new row, the others keep theirs), its preview, or
 * the theme. Defined once, so its memo is kept from render to render.
 */
const drawRow = (
  slots: SlotBuilders<typeof CanvasSlots, Message>,
  h: HtmlBuilder<Message>,
  { row, y, previewColor, previewColumns, theme }: RowArgs,
): Html => {
  const preview = new Set(previewColumns)
  return h.div(
    slots.row.attrs(),
    Array.map(row, (cell, x) =>
      h.div(
        slots.cell.attrs([
          h.OnMouseDown(Message.PressedCell({ x, y })),
          h.OnMouseEnter(Message.EnteredCell({ x, y })),
          h.Style({ '--pixel-color': preview.has(x) ? previewColor : resolveColor(cell, theme) }),
        ]),
      ),
    ),
  )
}

/** The canvas: one lazy row per grid row, the hovered cells showing what a press would paint. */
export const Canvas = SlotView.forMessages<Message>()
  .define(CanvasSlots, (model: Model, slots, h) => {
    const theme = currentPaletteTheme(model)
    const previewColumns = previewColumnsByRow(computePreviewPositions(model))
    const previewColor =
      model.tool === 'Eraser'
        ? EMPTY_COLOR
        : (theme.colors[model.selectedColorIndex] ?? EMPTY_COLOR)

    return h.div(slots.column.attrs(), [
      h.div(slots.frame.attrs([h.OnMouseLeave(Message.LeftCanvas())]), [
        h.div(
          slots.canvas.attrs(),
          Array.map(model.history.present, (row, y) =>
            slots.row.lazy({ index: y }, drawRow, {
              row,
              y,
              previewColor,
              previewColumns: previewColumns.get(y) ?? NO_PREVIEW_COLUMNS,
              theme,
            }),
          ),
        ),
      ]),
    ])
  })
  .pipe(Style.attach(CanvasStyle))
