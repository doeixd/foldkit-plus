import { Option } from 'effect'
import type { CellPosition, GridProjection } from './projection.js'
import { addressableRows } from './rows.js'

/** The scroll container's offsets and size, in pixels. */
export interface Viewport {
  readonly top: number
  readonly left: number
  readonly width: number
  readonly height: number
}

/** Rendered items `[start, end)` on one axis, with the space the rest take before and after. */
export interface AxisWindow {
  readonly start: number
  readonly end: number
  readonly before: number
  readonly after: number
}

export interface GridWindow<Id extends string> {
  /** Row indexes to render; every row is `rowHeight` tall. */
  readonly rows: AxisWindow
  /** Center columns to render, as indexes into `projection.center`. */
  readonly center: AxisWindow
  /** The center columns in that window, in display order. */
  readonly centerColumns: ReadonlyArray<Id>
  /** Pinned columns are always rendered: they never scroll horizontally. */
  readonly start: ReadonlyArray<Id>
  readonly end: ReadonlyArray<Id>
  /** The scrollable content's full size. */
  readonly width: number
  readonly height: number
}

export interface Geometry<Row, Id extends string> {
  readonly projection: GridProjection<Row, Id>
  readonly rowHeight: number
  /** Width of each visible column. */
  readonly width: (column: NoInfer<Id>) => number
  /** Height of the header rows inside the scroll container, above the body. */
  readonly headerHeight?: number
}

export interface WindowOptions<Row, Id extends string> extends Geometry<Row, Id> {
  readonly viewport: Viewport
  /** Extra rows and columns rendered beyond each edge, so a fast scroll shows no gap. */
  readonly overscan?: { readonly rows?: number; readonly columns?: number }
}

const sum = (values: ReadonlyArray<number>): number =>
  values.reduce((total, value) => total + value, 0)

/** `edges[i]` is where center column `i` begins; `edges[count]` is the center's width. */
const edgesOf = <Id extends string>(
  ids: ReadonlyArray<Id>,
  width: (column: Id) => number,
): Float64Array => {
  const edges = new Float64Array(ids.length + 1)
  ids.forEach((id, index) => {
    edges[index + 1] = edges[index]! + Math.max(0, width(id))
  })
  return edges
}

/** How many of `0..count-1` satisfy `holds`, which holds for a prefix of them: a binary search. */
const prefixWhere = (count: number, holds: (index: number) => boolean): number => {
  let low = 0
  let high = count
  while (low < high) {
    const middle = (low + high) >>> 1
    if (holds(middle)) low = middle + 1
    else high = middle
  }
  return low
}

interface Layout<Id extends string> {
  readonly rowCount: number
  readonly bodyHeight: number
  readonly centerWidth: number
  readonly edges: Float64Array
  readonly startWidth: number
  readonly endWidth: number
  readonly center: ReadonlyArray<Id>
}

const layoutOf = <Row, Id extends string>(
  geometry: Geometry<Row, Id>,
  viewport: Viewport,
): Layout<Id> => {
  const { projection, width, rowHeight } = geometry
  if (!(Number.isFinite(rowHeight) && rowHeight > 0)) {
    throw new Error(`VirtualGrid: rowHeight must be a positive number of pixels, not ${rowHeight}.`)
  }
  const startWidth = sum(projection.start.map(id => Math.max(0, width(id))))
  const endWidth = sum(projection.end.map(id => Math.max(0, width(id))))
  return {
    rowCount: addressableRows(projection.rowCount),
    bodyHeight: Math.max(0, viewport.height - (geometry.headerHeight ?? 0)),
    centerWidth: Math.max(0, viewport.width - startWidth - endWidth),
    edges: edgesOf(projection.center, width),
    startWidth,
    endWidth,
    center: projection.center,
  }
}

/**
 * What to render for a viewport: the rows and center columns it shows, plus
 * overscan, and the space the rest take. Rows are one fixed height, so the
 * row window is arithmetic on the scroll offset and never walks the rows; the
 * column window is a binary search over the center columns' widths. The
 * pinned columns are always rendered, outside the horizontal window.
 */
const window = <Row, Id extends string>(options: WindowOptions<Row, Id>): GridWindow<Id> => {
  const { viewport, rowHeight } = options
  const layout = layoutOf(options, viewport)
  const overRows = Math.max(0, Math.trunc(options.overscan?.rows ?? 0))
  const overColumns = Math.max(0, Math.trunc(options.overscan?.columns ?? 0))

  const top = Math.max(0, viewport.top)
  const firstRow = Math.floor(top / rowHeight)
  const pastRow = Math.ceil((top + layout.bodyHeight) / rowHeight)
  const rowStart = Math.min(layout.rowCount, Math.max(0, firstRow - overRows))
  const rowEnd = Math.min(layout.rowCount, Math.max(rowStart, pastRow + overRows))

  // A column is shown when it ends after the left edge and begins before the right.
  const { edges } = layout
  const count = layout.center.length
  const totalCenter = edges[count]!
  const left = Math.max(0, viewport.left)
  const right = left + layout.centerWidth
  const firstColumn = prefixWhere(count, index => edges[index + 1]! <= left)
  const pastColumn = Math.max(
    firstColumn,
    prefixWhere(count, index => edges[index]! < right),
  )
  const columnStart = Math.max(0, firstColumn - overColumns)
  const columnEnd = Math.min(count, pastColumn + overColumns)

  return {
    rows: {
      start: rowStart,
      end: rowEnd,
      before: rowStart * rowHeight,
      after: (layout.rowCount - rowEnd) * rowHeight,
    },
    center: {
      start: columnStart,
      end: columnEnd,
      before: edges[columnStart]!,
      after: totalCenter - edges[columnEnd]!,
    },
    centerColumns: layout.center.slice(columnStart, columnEnd),
    start: options.projection.start,
    end: options.projection.end,
    width: layout.startWidth + totalCenter + layout.endWidth,
    height: (options.headerHeight ?? 0) + layout.rowCount * rowHeight,
  }
}

export interface RevealOptions<Row, Id extends string> extends Geometry<Row, Id> {
  readonly viewport: Viewport
  readonly position: CellPosition
}

/**
 * The scroll offsets that bring a cell fully into view, moving each axis the
 * least it can, or none when it is already in view. A pinned column never
 * scrolls, so only its row is brought in.
 */
const reveal = <Row, Id extends string>(
  options: RevealOptions<Row, Id>,
): Option.Option<{ readonly top: number; readonly left: number }> => {
  const { viewport, position, rowHeight, projection } = options
  const layout = layoutOf(options, viewport)
  // The least scroll that shows `[from, from + size)` in a span of `span` at `offset`.
  const nearest = (offset: number, from: number, size: number, span: number): number => {
    if (from < offset) return from
    if (from + size > offset + span) return Math.max(0, from + size - span)
    return offset
  }

  const top = nearest(viewport.top, position.row * rowHeight, rowHeight, layout.bodyHeight)
  const centerIndex = position.column - projection.start.length
  // A pinned column is outside the center, and stays where it is drawn.
  const left =
    layout.center[centerIndex] !== undefined
      ? nearest(
          viewport.left,
          layout.edges[centerIndex]!,
          layout.edges[centerIndex + 1]! - layout.edges[centerIndex]!,
          layout.centerWidth,
        )
      : viewport.left
  return top === viewport.top && left === viewport.left ? Option.none() : Option.some({ top, left })
}

export const VirtualGrid = { window, reveal }
