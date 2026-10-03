import { Match, Option } from 'effect'
import type { Html, HtmlBuilder, KeyboardModifiers } from 'foldkit/html'
import * as Mount from 'foldkit/mount'
import {
  addressableRows,
  type CellAddress,
  Columns,
  type ColumnSpec,
  type ColumnState,
  type DataGridOf,
  type Direction,
  GridFocus,
  GridSelection,
  GridViewport,
  type RowSelection,
  RowCount,
  type RowModel,
  type Viewport,
  VirtualGrid,
} from 'foldkit-data-grid'
import { SlotView } from 'foldkit-mixins'
import { Move } from 'foldkit-primitives/dom'
import { CellPress } from './press.js'
import { GridSlots } from './slots.js'

export interface GridWords {
  /** In place of rows when there are none. Default `No rows.` */
  readonly empty?: string
}

/** What the grid's view reads, and what the application gives it. */
export interface GridInput<Row, Id extends string, GridMessage, Message> {
  /** The `DataGrid` Model as placed in the parent: focus, viewport and column state. */
  readonly state: {
    readonly focus: { readonly current: Option.Option<CellAddress<Id>> }
    readonly viewport: Viewport
    readonly columns: ColumnState<Id>
    readonly selection: {
      readonly rows: RowSelection
      readonly anchor: Option.Option<string>
      readonly cells: Option.Option<{
        readonly anchor: CellAddress<Id>
        readonly focus: CellAddress<Id>
      }>
    }
  }
  /** The application's rows, in its order; the view draws them through `state.columns`. */
  readonly rows: RowModel<Row>
  /** Lifts the grid's own Messages into the parent's: the placement's wrapper. */
  readonly wrap: (message: GridMessage) => Message
  /** The grid's accessible name. */
  readonly label: string
  readonly rowHeight: number
  readonly headerHeight: number
  readonly overscan?: { readonly rows?: number; readonly columns?: number }
  readonly direction?: Direction
  /** Draws one cell; by default the column's value, as text. */
  readonly cell?: (column: Id, row: Row, h: HtmlBuilder<Message>) => Html | string
  readonly words?: GridWords
}

const px = (value: number): string => `${value}px`

/** How far one press of an arrow key on a resize handle moves the edge, in pixels. */
const resizeStep = 16

const textOf = (value: unknown): string =>
  value === null || value === undefined ? '' : String(value)

/** The offset of each pinned column from its edge: the widths of the ones before it. */
const insets = <Id extends string>(
  ids: ReadonlyArray<Id>,
  width: (column: Id) => number,
): ReadonlyMap<Id, number> => {
  const offsets = new Map<Id, number>()
  let offset = 0
  for (const id of ids) {
    offsets.set(id, offset)
    offset += Math.max(0, width(id))
  }
  return offsets
}

const view = <Message>() => ({
  /**
   * The view of one `DataGrid`. It draws the grid's columns' headers and the
   * window of cells `VirtualGrid.window` picks for the placed viewport, and
   * sends the grid's Messages through `wrap`: `Moved` for a key, with the
   * scroll that reveals the cell, `Focused` for the pointer, `Measured` from
   * the scroll container. Attach Style and Behavior to the result.
   */
  define: <Row, Specs extends Record<string, ColumnSpec<Row, unknown>>>(
    grid: DataGridOf<Row, Specs>,
  ): SlotView.SlotView<
    typeof GridSlots,
    GridInput<Row, keyof Specs & string, typeof grid.Message.Type, Message>,
    Message
  > => {
    type Id = keyof Specs & string
    return SlotView.forMessages<Message>().define(
      GridSlots,
      (input: GridInput<Row, Id, typeof grid.Message.Type, Message>, slots, h): Html => {
        const { rowHeight, headerHeight, state } = input
        const projection = grid.project(input.rows, state.columns)
        const width = grid.columnState.widthOf(state.columns)
        const viewport = state.viewport
        const shown = VirtualGrid.window({
          projection,
          rowHeight,
          width,
          headerHeight,
          viewport,
          ...(input.overscan === undefined ? {} : { overscan: input.overscan }),
        })
        const stop = GridFocus.tabStop(projection, state.focus.current)
        const pageRows = Math.max(1, Math.floor((viewport.height - headerHeight) / rowHeight))

        // Display order across the regions; a column's index is its aria-colindex less one.
        const drawn = [...shown.start, ...shown.centerColumns, ...shown.end]
        const indexOf = new Map(projection.columns.map((id, index) => [id, index]))
        const startInsets = insets(shown.start, width)
        const endInsets = insets([...shown.end].reverse(), width)
        const pinned = (id: Id): Option.Option<'start' | 'end'> => {
          if (startInsets.has(id)) return Option.some('start')
          if (endInsets.has(id)) return Option.some('end')
          return Option.none()
        }

        const cellStyle = (id: Id): Record<string, string> => {
          const base = { boxSizing: 'border-box', width: px(Math.max(0, width(id))), flex: 'none' }
          return Option.match(pinned(id), {
            onNone: () => base,
            onSome: edge =>
              edge === 'start'
                ? { ...base, position: 'sticky', insetInlineStart: px(startInsets.get(id)!) }
                : { ...base, position: 'sticky', insetInlineEnd: px(endInsets.get(id)!) },
          })
        }
        // Spacers hold the width of the columns not drawn; nothing to see or style.
        const spacer = (size: number): ReadonlyArray<Html> =>
          size > 0
            ? [h.div([h.AriaHidden(true), h.Style({ width: px(size), flex: 'none' })], [])]
            : []
        // Cells in display order, with spacers where the undrawn center columns are.
        const across = (drawCell: (id: Id) => Html): ReadonlyArray<Html> => [
          ...shown.start.map(drawCell),
          ...spacer(shown.center.before),
          ...shown.centerColumns.map(drawCell),
          ...spacer(shown.center.after),
          ...shown.end.map(drawCell),
        ]

        const isDrawn = (address: CellAddress<Id>): boolean =>
          Option.match(projection.positionOf(address), {
            onNone: () => false,
            onSome: ({ row }) =>
              row >= shown.rows.start && row < shown.rows.end && drawn.includes(address.column),
          })
        const activeDescendant = Option.filter(stop, isDrawn)

        const revealOf = (address: CellAddress<Id>) =>
          Option.flatMap(projection.positionOf(address), position =>
            VirtualGrid.reveal({ projection, rowHeight, width, headerHeight, viewport, position }),
          )
        const selection = state.selection
        const isSelectedRow = GridSelection.isSelected(selection.rows)
        const range = Option.flatMap(selection.cells, cells =>
          GridSelection.boxOf(projection, cells),
        )
        const rangeColumns = Option.map(range, box => new Set<string>(box.columns))

        // A selection key, when the grid selects: Shift with a move for a range,
        // Space for the focused row, Ctrl or Meta with A for everything, Escape
        // to let a range go. None leaves the key to focus.
        const selectionKey = (
          key: string,
          modifiers: KeyboardModifiers,
        ): Option.Option<typeof grid.Message.Type> => {
          const toggle = modifiers.ctrlKey || modifiers.metaKey
          if (key === 'Escape' && Option.isSome(selection.cells)) {
            return Option.some(grid.Message.CellsCleared())
          }
          if ((key === 'a' || key === 'A') && toggle && !modifiers.shiftKey && !modifiers.altKey) {
            if (grid.rowSelection === 'multiple') return Option.some(grid.Message.AllRowsSelected())
            if (grid.cellSelection) {
              return Option.zipWith(projection.first(), projection.last(), (anchor, far) =>
                grid.Message.CellsSelected({ anchor, focus: far, reveal: Option.none() }),
              )
            }
            return Option.none()
          }
          if (key === ' ' && !toggle && !modifiers.altKey && grid.rowSelection !== undefined) {
            return Option.map(stop, current => {
              if (!modifiers.shiftKey || grid.rowSelection !== 'multiple') {
                return grid.Message.RowSelected({ row: current.row })
              }
              const from = Option.getOrElse(selection.anchor, () => current.row)
              return grid.Message.RowsExtended({
                rows: GridSelection.rowsBetween(projection, from, current.row),
                to: current.row,
              })
            })
          }
          if (!grid.cellSelection) return Option.none()
          return Option.map(
            GridSelection.extend(projection, {
              range: selection.cells,
              current: stop,
              key,
              modifiers,
              pageRows,
              ...(input.direction === undefined ? {} : { direction: input.direction }),
            }),
            extended =>
              grid.Message.CellsSelected({
                anchor: extended.anchor,
                focus: extended.focus,
                reveal: revealOf(extended.focus),
              }),
          )
        }

        const focusKey = (key: string, modifiers: KeyboardModifiers) =>
          Option.map(
            GridFocus.target(projection, {
              current: state.focus.current,
              key,
              modifiers,
              pageRows,
              ...(input.direction === undefined ? {} : { direction: input.direction }),
            }),
            address => grid.Message.Moved({ address, reveal: revealOf(address) }),
          )

        const onKey = (key: string, modifiers: KeyboardModifiers) =>
          Option.map(
            Option.orElse(selectionKey(key, modifiers), () => focusKey(key, modifiers)),
            input.wrap,
          )

        const pressed = Mount.mapMessage(CellPress(), click =>
          input.wrap(
            grid.Message.CellPressed({
              cell: click.cell,
              shiftKey: click.shiftKey,
              toggleKey: click.toggleKey,
            }),
          ),
        )

        const measured = Mount.mapMessage(GridViewport.Measure(), reading =>
          input.wrap(
            grid.Message.Measured({
              top: reading.top,
              left: reading.left,
              width: reading.width,
              height: reading.height,
            }),
          ),
        )

        const rowCount = RowCount.match(projection.rowCount, {
          // The header row is the first row ARIA counts.
          Known: ({ total }) => total + 1,
          // ARIA's own spelling of a count not known yet.
          Unknown: () => -1,
        })

        // The end edge is the side the text runs toward, so a drag that way widens.
        const toward = input.direction === 'rtl' ? -1 : 1
        const resizeHandle = (id: Id): ReadonlyArray<Html> => {
          const column = grid.columns.byId[id]
          if (column.resizable === false) return []
          const now = width(id)
          const steps = new Map([
            ['ArrowRight', resizeStep * toward],
            ['ArrowLeft', -resizeStep * toward],
          ])
          const dragged = Mount.mapMessage(Move(), fact =>
            input.wrap(
              Match.valueTags(fact, {
                MoveStarted: () => grid.Message.ResizeStarted({ column: id }),
                Moved: ({ deltaX }) => grid.Message.ResizeMoved({ delta: deltaX * toward }),
                MoveEnded: ({ completed }) => grid.Message.ResizeEnded({ completed }),
              }),
            ),
          )
          return [
            h.div(
              slots.resizeHandle.attrs([
                // A Mount reads its args once: key it by what its mapping closes over.
                h.Key(`resize:${id}:${toward}`),
                h.Role('separator'),
                h.AriaOrientation('vertical'),
                h.AriaLabel(`Resize ${column.header}`),
                h.AriaValuenow(now),
                h.AriaValuemin(column.minWidth ?? Columns.minWidth),
                ...(column.maxWidth === undefined ? [] : [h.AriaValuemax(column.maxWidth)]),
                // Out of the tab order, so the grid stays one tab stop; a handle
                // the pointer or a script focused still steps with the arrows.
                h.Tabindex(-1),
                h.OnKeyDownSelfPreventDefault(key =>
                  Option.map(Option.fromUndefinedOr(steps.get(key)), by =>
                    input.wrap(grid.Message.ColumnResized({ column: id, width: now + by })),
                  ),
                ),
                h.OnMount(dragged),
                h.Style({
                  position: 'absolute',
                  top: '0',
                  bottom: '0',
                  insetInlineEnd: '0',
                  width: px(resizeStep / 2),
                  cursor: 'col-resize',
                  touchAction: 'none',
                }),
              ]),
              [],
            ),
          ]
        }

        const headerCell = (id: Id): Html =>
          h.div(
            slots.headerCell.attrs([
              h.Role('columnheader'),
              h.AriaColindex(indexOf.get(id)! + 1),
              // A pinned header is already sticky; any other holds its handle with relative.
              h.Style({
                ...cellStyle(id),
                ...(Option.isNone(pinned(id)) ? { position: 'relative' } : {}),
              }),
              ...Option.match(pinned(id), {
                onNone: () => [],
                onSome: edge => [h.DataAttribute('pinned', edge)],
              }),
            ]),
            [grid.columns.byId[id].header, ...resizeHandle(id)],
          )

        const rowAt = (index: number): Html =>
          Option.match(
            Option.zipWith(
              projection.rows.rowAt(index),
              projection.rows.keyAt(index),
              (row, key) => ({
                row,
                key,
              }),
            ),
            {
              // Counted but not loaded: the space it will take, and nothing to read.
              onNone: () =>
                h.div(
                  slots.placeholder.attrs([
                    h.AriaHidden(true),
                    h.Key(`unloaded:${index}`),
                    h.Style({ height: px(rowHeight), width: px(shown.width) }),
                  ]),
                  [],
                ),
              onSome: ({ row, key }) =>
                h.div(
                  slots.row.attrs([
                    h.Key(key),
                    h.Role('row'),
                    h.AriaRowindex(index + 2),
                    ...(grid.rowSelection === undefined
                      ? []
                      : [h.AriaSelected(isSelectedRow(key))]),
                    h.Style({ display: 'flex', height: px(rowHeight), width: px(shown.width) }),
                  ]),
                  across(id => {
                    const address = { row: key, column: id }
                    const focused = Option.exists(
                      stop,
                      current => current.row === key && current.column === id,
                    )
                    const inRange = Option.exists(
                      Option.zipWith(range, rangeColumns, (box, ids) => ({ box, ids })),
                      ({ box, ids }) =>
                        index >= box.rows.start && index < box.rows.end && ids.has(id),
                    )
                    return h.div(
                      slots.cell.attrs([
                        h.Role('gridcell'),
                        h.Id(GridFocus.cellId(grid.id, address)),
                        h.AriaColindex(indexOf.get(id)! + 1),
                        h.Style(cellStyle(id)),
                        ...(grid.cellSelection ? [h.AriaSelected(inRange)] : []),
                        ...(focused ? [h.DataAttribute('focused', 'true')] : []),
                        ...Option.match(pinned(id), {
                          onNone: () => [],
                          onSome: edge => [h.DataAttribute('pinned', edge)],
                        }),
                      ]),
                      [input.cell?.(id, row, h) ?? textOf(grid.columns.byId[id].value(row))],
                    )
                  }),
                ),
            },
          )

        const bodyRows = Array.from({ length: shown.rows.end - shown.rows.start }, (_, offset) =>
          rowAt(shown.rows.start + offset),
        )
        const empty = addressableRows(projection.rowCount) === 0

        return h.div(
          slots.root.attrs([
            h.Id(grid.id),
            h.Role('grid'),
            h.AriaLabel(input.label),
            h.Tabindex(0),
            h.AriaRowcount(rowCount),
            h.AriaColcount(projection.columns.length),
            ...(grid.rowSelection === 'multiple' || grid.cellSelection
              ? [h.AriaMultiSelectable(true)]
              : []),
            ...Option.match(activeDescendant, {
              onNone: () => [],
              onSome: address => [h.AriaActiveDescendant(GridFocus.cellId(grid.id, address))],
            }),
            // Only keys aimed at the grid itself: a resize handle's arrows are its own.
            h.OnKeyDownSelfPreventDefault(onKey),
            h.OnMount(measured),
            h.Style({ overflow: 'auto', position: 'relative' }),
          ]),
          [
            h.div(
              slots.header.attrs([h.Role('rowgroup'), h.Style({ position: 'sticky', top: '0' })]),
              [
                h.div(
                  slots.headerRow.attrs([
                    h.Role('row'),
                    h.AriaRowindex(1),
                    h.Style({ display: 'flex', height: px(headerHeight), width: px(shown.width) }),
                  ]),
                  across(headerCell),
                ),
              ],
            ),
            h.div(
              slots.body.attrs([
                h.Role('rowgroup'),
                // One listener for every cell's clicks, with their modifier keys.
                h.OnMount(pressed),
                h.Style({ height: px(shown.height - headerHeight), width: px(shown.width) }),
              ]),
              empty
                ? [h.p(slots.status.attrs([h.Role('status')]), [input.words?.empty ?? 'No rows.'])]
                : [
                    ...(shown.rows.before > 0
                      ? [
                          h.div(
                            [h.AriaHidden(true), h.Style({ height: px(shown.rows.before) })],
                            [],
                          ),
                        ]
                      : []),
                    ...bodyRows,
                  ],
            ),
          ],
        )
      },
      { name: grid.id },
    )
  },
})

export const DataGridView = view
