import { Option } from 'effect'
import type { CellAddress, CellBox, GridProjection } from './projection.js'

/** One cell's text in a paste, by identity: what the grid hands the application. */
export interface CellText<Id extends string> {
  readonly row: string
  readonly column: Id
  readonly text: string
}

// A cell holding a tab, a line break or a quote is quoted, its quotes doubled,
// as spreadsheets write and read tab-separated text.
const needsQuotes = /[\t\n\r"]/

const quote = (cell: string): string =>
  needsQuotes.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell

/** Rows of cells as tab-separated text, the form spreadsheets copy and paste. */
const toTsv = (rows: ReadonlyArray<ReadonlyArray<string>>): string =>
  rows.map(row => row.map(quote).join('\t')).join('\n')

/**
 * Tab-separated text as rows of cells. Quoted cells may hold tabs, line
 * breaks and doubled quotes; `\r\n` and `\r` end a row as `\n` does; the line
 * break a spreadsheet adds after the last row makes no empty row.
 */
const parseTsv = (text: string): ReadonlyArray<ReadonlyArray<string>> => {
  const rows: Array<Array<string>> = []
  let row: Array<string> = []
  let cell = ''
  let quoted = false
  let index = 0
  const endCell = () => {
    row.push(cell)
    cell = ''
  }
  const endRow = () => {
    endCell()
    rows.push(row)
    row = []
  }
  while (index < text.length) {
    const char = text[index]!
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"'
        index += 2
        continue
      }
      if (char === '"') quoted = false
      else cell += char
      index += 1
      continue
    }
    if (char === '"' && cell === '') quoted = true
    else if (char === '\t') endCell()
    else if (char === '\r' || char === '\n') {
      endRow()
      if (char === '\r' && text[index + 1] === '\n') index += 1
    } else cell += char
    index += 1
  }
  // Text that ends in a line break has said all its rows.
  if (cell !== '' || row.length > 0) endRow()
  return rows
}

/**
 * The text of the cells a box covers, row by row in the projection's order
 * and column by column in display order. A row counted but not loaded copies
 * as empty cells, so the shape is the box's.
 */
const copy = <Row, Id extends string>(
  projection: GridProjection<Row, Id>,
  box: CellBox<Id>,
  textOf: (address: CellAddress<Id>) => string,
): string => {
  const rows: Array<ReadonlyArray<string>> = []
  for (let index = box.rows.start; index < box.rows.end; index++) {
    const key = projection.rows.keyAt(index)
    rows.push(
      box.columns.map(column =>
        Option.match(key, { onNone: () => '', onSome: row => textOf({ row, column }) }),
      ),
    )
  }
  return toTsv(rows)
}

/**
 * Where pasted cells land: the matrix laid from `anchor` across rows in the
 * projection's order and columns in display order. Cells past the grid's
 * edges are dropped, as are those landing on a column that does not edit or
 * a row not loaded; the rest keep their place.
 */
const pasteAt = <Row, Id extends string>(
  projection: GridProjection<Row, Id>,
  anchor: CellAddress<Id>,
  matrix: ReadonlyArray<ReadonlyArray<string>>,
  editable: (column: Id) => boolean,
): ReadonlyArray<CellText<Id>> =>
  Option.match(projection.positionOf(anchor), {
    onNone: () => [],
    onSome: start => {
      const cells: Array<CellText<Id>> = []
      matrix.forEach((texts, down) => {
        const key = projection.rows.keyAt(start.row + down)
        if (Option.isNone(key)) return
        texts.forEach((text, across) => {
          const column = projection.columns[start.column + across]
          if (column !== undefined && editable(column)) cells.push({ row: key.value, column, text })
        })
      })
      return cells
    },
  })

export const Clipboard = { toTsv, parseTsv, copy, pasteAt }
