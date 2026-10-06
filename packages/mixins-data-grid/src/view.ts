import { Match, Option } from 'effect'
import type { Attribute, Html, HtmlBuilder, KeyboardModifiers } from 'foldkit/html'
import * as Mount from 'foldkit/mount'
import {
  addressableRows,
  type CellAddress,
  CellEditor,
  type CellBox,
  Clipboard,
  Columns,
  Fill,
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
  RowStatus,
  type Viewport,
  VirtualGrid,
} from 'foldkit-data-grid'
import { SlotView } from 'foldkit-mixins'
import { Move } from 'foldkit-primitives/dom'
import { FillDrag } from './fillDrag.js'
import { HoldFocus } from './holdFocus.js'
import { KeepFocus } from './keepFocus.js'
import { HeaderDrag } from './headerDrag.js'
import { CellPress } from './press.js'
import { GridSlots } from './slots.js'

export interface GridWords {
  /** In place of rows when there are none. Default `No rows.` */
  readonly empty?: string
  /** While the first rows are awaited. Default `Loading…`. */
  readonly loading?: string
  /** When the read failed. `{message}` is the failure's. Default `{message}`. */
  readonly failed?: string
  /** On the button that asks again after a failure. Default `Try again`. */
  readonly retry?: string
  /** On the button that loads more rows. Default `More`. */
  readonly more?: string
  /** The name of a column's menu button. `{column}` is its header. Default `{column} menu`. */
  readonly menu?: string
  /** Menu items. `{column}` in `show` is the hidden column's header. */
  readonly pinStart?: string
  readonly pinEnd?: string
  readonly unpin?: string
  readonly hide?: string
  readonly show?: string
}

/** How a column is sorted, and the Message that sorts it next: `foldkit-crud`'s `Sort` gives these. */
export interface ColumnSort<Message> {
  readonly direction?: 'asc' | 'desc' | undefined
  readonly message: Message
}

/**
 * A state the application gives one cell, such as an edit not yet saved. The
 * grid draws its `name` as `data-mark` on the cell's Slot, for a style, and
 * its `description` as the cell's `aria-description`, for a screen reader,
 * and its `title`, shown on hover.
 */
export interface CellMark {
  readonly name: string
  readonly description: string
}

/** What the grid's view reads, and what the application gives it. */
export interface GridInput<Row, Id extends string, GridMessage, Message> {
  /** The `DataGrid` Model as placed in the parent. */
  readonly state: {
    readonly focus: {
      readonly current: Option.Option<CellAddress<Id>>
      readonly header: Option.Option<Id>
    }
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
    readonly editing: Option.Option<{
      readonly address: CellAddress<Id>
      readonly draft: string
      readonly error: Option.Option<string>
    }>
    readonly dragging: Option.Option<{ readonly column: Id; readonly delta: number }>
    readonly menu: Option.Option<{ readonly column: Id; readonly active: number }>
    readonly filling: Option.Option<{
      readonly source: { readonly anchor: CellAddress<Id>; readonly focus: CellAddress<Id> }
      readonly to: CellAddress<Id>
    }>
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
  /** A cell's mark, if it has one; asked only for the cells drawn. */
  readonly marks?: (address: CellAddress<Id>) => Option.Option<CellMark>
  /**
   * How a choice column is edited: a list the grid draws, styled with the
   * page (`list`, the default), or the platform's own `select` (`native`),
   * whose picker suits a touch screen better. Pass `native` from a media
   * fact in the Model, such as a coarse pointer; the view reads no media.
   */
  readonly choiceEditor?: 'list' | 'native'
  readonly words?: GridWords
  /**
   * Where the rows' source stands (`GridCrud.status` for a Remote page).
   * Default `Ready`. The grid holds no loading state: the source's owner does.
   */
  readonly status?: RowStatus
  /** Asks again after a failure; given, a failed grid shows a button that sends it. */
  readonly onRetry?: Message
  /**
   * Loads more rows; given, a grid whose count is not known yet shows a button
   * that sends it. Attach `MoreOnScroll` to send it as the end comes into view.
   */
  readonly onMore?: Message
  /**
   * A menu button on each header, opening the column's menu: pin it to the
   * start or the end or unpin it, hide it, or show a hidden column. On a
   * focused header Alt+ArrowDown, Shift+F10 or the menu key opens it.
   */
  readonly columnMenu?: boolean
  /** The columns that sort, each with its direction and its Message. */
  readonly sort?: { readonly [K in Id]?: ColumnSort<Message> }
}

const px = (value: number): string => `${value}px`

/** Whether the rows' source is reading: the grid says so, and asks for nothing more. */
export const isBusy = (status: RowStatus | undefined): boolean =>
  RowStatus.match(status ?? RowStatus.Ready(), {
    Ready: () => false,
    Loading: () => true,
    Refreshing: () => true,
    Failed: () => false,
  })

const ariaSort = (direction: 'asc' | 'desc' | undefined): 'ascending' | 'descending' | 'none' => {
  if (direction === 'asc') return 'ascending'
  if (direction === 'desc') return 'descending'
  return 'none'
}

/** How far one press of an arrow key on a resize handle moves the edge, in pixels. */
const resizeStep = 16

const { textOf } = Columns

// The copied text of a box, once per projection and box: a copy handler is
// drawn with its text, and redrawing for a scroll should not rebuild it.
const copies = new WeakMap<object, Map<string, string>>()
const remembered = (projection: object, key: string, make: () => string): string => {
  const known = copies.get(projection) ?? new Map<string, string>()
  copies.set(projection, known)
  const text = known.get(key)
  if (text !== undefined) return text
  const made = make()
  known.set(key, made)
  return made
}

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
    // Whether any column edits: fixed with the grid, so worked out once.
    const editsAny = Object.values(grid.columns.byId).some(column => column.edit !== undefined)
    return SlotView.forMessages<Message>().define(
      GridSlots,
      (input: GridInput<Row, Id, typeof grid.Message.Type, Message>, slots, h): Html => {
        const { rowHeight, headerHeight, state } = input
        const projection = grid.project(input.rows, state.columns)
        const width = grid.columnState.widthOf(state.columns)
        const viewport = state.viewport
        const shown = grid.window(input)
        const stop = GridFocus.tabStop(projection, state.focus.current)
        const pageRows = Math.max(1, Math.floor((viewport.height - headerHeight) / rowHeight))

        // Display order across the regions; a column's index is its aria-colindex less one.
        const drawn = [...shown.start, ...shown.centerColumns, ...shown.end]
        const indexOf = new Map(projection.columns.map((id, index) => [id, index]))
        const startInsets = insets(shown.start, width)
        const endInsets = insets([...shown.end].reverse(), width)
        const markOf = (address: CellAddress<Id>): Option.Option<CellMark> =>
          input.marks === undefined ? Option.none() : input.marks(address)
        const pinned = (id: Id): Option.Option<'start' | 'end'> => {
          if (startInsets.has(id)) return Option.some('start')
          if (endInsets.has(id)) return Option.some('end')
          return Option.none()
        }
        // The pinned column next to the columns that scroll, where a style draws
        // the edge the others pass under.
        const startEdge = shown.start.at(-1)
        const endEdge = shown.end[0]
        const pinnedEdge = (id: Id) => {
          if (id === startEdge) return [h.DataAttribute('pinned-edge', 'start')]
          if (id === endEdge) return [h.DataAttribute('pinned-edge', 'end')]
          return []
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
        const isRowShown = (address: CellAddress<Id>) =>
          Option.isSome(projection.positionOf(address))
        const onHeader = state.focus.header
        // The header row's cells are drawn whenever their column is.
        const activeDescendant: Option.Option<string> = Option.match(onHeader, {
          onSome: column =>
            drawn.includes(column)
              ? Option.some(GridFocus.headerId(grid.id, column))
              : Option.none(),
          onNone: () =>
            Option.map(Option.filter(stop, isDrawn), address => GridFocus.cellId(grid.id, address)),
        })

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

        const flip = input.direction === 'rtl' ? -1 : 1
        const sideways = new Map([
          ['ArrowRight', flip],
          ['ArrowLeft', -flip],
        ])
        const plainKey = (modifiers: KeyboardModifiers) =>
          !modifiers.shiftKey && !modifiers.ctrlKey && !modifiers.altKey && !modifiers.metaKey
        // A header off screen sideways is brought in; the rows stay where they are.
        const revealHeader = (column: Id) =>
          Option.flatMap(projection.columnIndex(column), columnIndex =>
            Option.flatMap(
              VirtualGrid.reveal({
                projection,
                rowHeight,
                width,
                headerHeight,
                viewport,
                position: { row: shown.rows.start, column: columnIndex },
              }),
              ({ left }) =>
                left === viewport.left ? Option.none() : Option.some({ top: viewport.top, left }),
            ),
          )
        const headerTo = (column: Id) =>
          grid.Message.HeaderFocused({ column, reveal: revealHeader(column) })

        // Keys on a column header: move along the header row, back down to the
        // cells, resize with Shift, reorder within the column's region with
        // Ctrl or Meta and Shift.
        const headerKey = (
          column: Id,
          key: string,
          modifiers: KeyboardModifiers,
        ): Option.Option<typeof grid.Message.Type> => {
          const columns = projection.columns
          const at = columns.indexOf(column)
          const step = sideways.get(key)
          const opensMenu =
            (key === 'ArrowDown' && modifiers.altKey) ||
            (key === 'F10' && modifiers.shiftKey) ||
            key === 'ContextMenu'
          if (input.columnMenu === true && opensMenu) {
            return Option.some(grid.Message.MenuOpened({ column }))
          }
          if (modifiers.altKey) return Option.none()
          if (
            step !== undefined &&
            modifiers.shiftKey &&
            (modifiers.ctrlKey || modifiers.metaKey)
          ) {
            const region = (['start', 'center', 'end'] as const).find(name =>
              state.columns[name].includes(column),
            )
            if (region === undefined) return Option.none()
            const index = state.columns[region].indexOf(column) + step
            return Option.some(grid.Message.ColumnMoved({ column, region, index }))
          }
          if (
            step !== undefined &&
            modifiers.shiftKey &&
            !modifiers.ctrlKey &&
            !modifiers.metaKey
          ) {
            return Option.some(
              grid.Message.ColumnResized({ column, width: width(column) + resizeStep * step }),
            )
          }
          if (!plainKey(modifiers)) return Option.none()
          if (step !== undefined) {
            const next = columns[Math.min(Math.max(at + step, 0), columns.length - 1)]
            return Option.fromUndefinedOr(next).pipe(Option.map(headerTo))
          }
          if (key === 'Home') return Option.fromUndefinedOr(columns[0]).pipe(Option.map(headerTo))
          if (key === 'End') {
            return Option.fromUndefinedOr(columns[columns.length - 1]).pipe(Option.map(headerTo))
          }
          if (key === 'ArrowDown' || key === 'Escape') {
            // Back to the row focus left, in this column, or the first row.
            const row = Option.orElse(
              Option.map(Option.filter(stop, isRowShown), current => current.row),
              () => Option.map(projection.first(), first => first.row),
            )
            return Option.map(row, key => {
              const address = { row: key, column }
              return grid.Message.Moved({ address, reveal: revealOf(address) })
            })
          }
          return Option.none()
        }

        // ArrowUp on the first row goes up to the header.
        const upToHeader = (key: string, modifiers: KeyboardModifiers) =>
          key === 'ArrowUp' && plainKey(modifiers)
            ? Option.flatMap(
                Option.filter(stop, current =>
                  Option.exists(projection.positionOf(current), ({ row }) => row === 0),
                ),
                current => Option.some(headerTo(current.column)),
              )
            : Option.none()

        // An edit is only where its cell is drawn; one scrolled away waits.
        const editing = Option.filter(state.editing, edit => isDrawn(edit.address))
        const draftOf = (address: CellAddress<Id>): string => grid.draftOf(projection, address)
        // Enter or F2 edits the focused cell from its text; a printable key
        // starts it over with that character.
        const editKey = (
          key: string,
          modifiers: KeyboardModifiers,
        ): Option.Option<typeof grid.Message.Type> =>
          Option.flatMap(
            Option.filter(stop, address => grid.columns.byId[address.column].edit !== undefined),
            address => {
              if ((key === 'Enter' || key === 'F2') && plainKey(modifiers)) {
                return Option.some(grid.Message.EditStarted({ address, draft: draftOf(address) }))
              }
              // Keys that reach the grid while an edit opens, before its editor
              // has focus, are the edit's: typed ones add to it, Escape ends it.
              if (key === 'Escape') return Option.some(grid.Message.EditCancelled())
              const typed =
                key.length === 1 && !modifiers.ctrlKey && !modifiers.metaKey && !modifiers.altKey
              if (!typed) return Option.none()
              // On a choice the grid finds the option the key starts.
              return Option.some(
                grid.Message.EditTyped({ address, text: key, from: draftOf(address) }),
              )
            },
          )
        // The editor's own keys: Enter commits and moves down (Shift, up), Tab
        // commits and moves on (Shift, back), Escape cancels.
        const editorKey = (
          address: CellAddress<Id>,
          key: string,
          modifiers: KeyboardModifiers,
        ): Option.Option<typeof grid.Message.Type> => {
          if (key === 'Escape') return Option.some(grid.Message.EditCancelled())
          const back = modifiers.shiftKey ? -1 : 1
          const offsets: Readonly<
            Record<string, { readonly rows?: number; readonly columns?: number }>
          > = {
            Enter: { rows: back },
            Tab: { columns: back * flip },
          }
          const offset = Object.hasOwn(offsets, key) ? offsets[key] : undefined
          if (offset === undefined || modifiers.ctrlKey || modifiers.metaKey || modifiers.altKey) {
            return Option.none()
          }
          const next = projection.moveBy(address, offset)
          return Option.some(
            grid.Message.EditCommitted({ next, reveal: Option.flatMap(next, revealOf) }),
          )
        }

        // A choice's own keys: the arrows, Home, End and the page keys step
        // through its options, a letter finds one, Alt+ArrowUp keeps the draft
        // where it is; Enter, Tab and Escape are any editor's.
        const choiceSteps: Readonly<Record<string, typeof grid.Message.Type>> = {
          ArrowDown: grid.Message.EditStepped({ by: 'next' }),
          ArrowUp: grid.Message.EditStepped({ by: 'previous' }),
          Home: grid.Message.EditStepped({ by: 'first' }),
          End: grid.Message.EditStepped({ by: 'last' }),
          PageDown: grid.Message.EditStepped({ by: 'pageNext' }),
          PageUp: grid.Message.EditStepped({ by: 'pagePrevious' }),
        }
        const choiceKey = (
          address: CellAddress<Id>,
          key: string,
          modifiers: KeyboardModifiers,
        ): Option.Option<typeof grid.Message.Type> => {
          if (key === 'ArrowUp' && modifiers.altKey) {
            return Option.some(
              grid.Message.EditCommitted({ next: Option.none(), reveal: Option.none() }),
            )
          }
          if (modifiers.ctrlKey || modifiers.metaKey || modifiers.altKey) {
            return editorKey(address, key, modifiers)
          }
          if (Object.hasOwn(choiceSteps, key)) return Option.some(choiceSteps[key]!)
          if (key.length === 1) {
            return Option.some(
              grid.Message.EditTyped({ address, text: key, from: draftOf(address) }),
            )
          }
          return editorKey(address, key, modifiers)
        }
        // The rows a choice's list may cover before it opens upward instead.
        const choiceRows = 8
        // A choice as a select-only combobox: the draft shown, its options in a
        // list beside it (inside it, the options would be its text), below the
        // cell, or above it when there is no room below.
        const choiceList = (
          address: CellAddress<Id>,
          options: ReadonlyArray<string>,
          draft: string,
          shared: ReadonlyArray<Attribute<Message>>,
        ): ReadonlyArray<Html> => {
          const cellId = GridFocus.cellId(grid.id, address)
          const listId = `${cellId}:options`
          const optionId = (index: number) => `${cellId}:option:${index}`
          const active = options.indexOf(draft)
          const top = Option.match(projection.positionOf(address), {
            onNone: () => 0,
            onSome: ({ row }) => headerHeight + row * rowHeight - viewport.top,
          })
          const listHeight = Math.min(options.length, choiceRows) * rowHeight
          const above =
            viewport.height - (top + rowHeight) < listHeight && top - headerHeight >= listHeight
          return [
            h.div(
              slots.choice.attrs([
                ...shared,
                h.Role('combobox'),
                h.Tabindex(0),
                h.AriaExpanded(true),
                h.AriaControls(listId),
                ...(active === -1 ? [] : [h.AriaActiveDescendant(optionId(active))]),
              ]),
              [draft],
            ),
            h.ul(
              slots.choiceList.attrs([
                h.Id(listId),
                h.Role('listbox'),
                h.AriaLabel(grid.columns.byId[address.column].header),
                h.DataAttribute('place', above ? 'above' : 'below'),
                h.OnMount(KeepFocus()),
                h.Style({
                  position: 'absolute',
                  insetInlineStart: '0',
                  ...(above ? { bottom: '100%' } : { top: '100%' }),
                }),
              ]),
              options.map((option, index) =>
                h.li(
                  slots.choiceOption.attrs([
                    h.Id(optionId(index)),
                    h.Role('option'),
                    h.AriaSelected(index === active),
                    h.OnClick(input.wrap(grid.Message.EditChosen({ draft: option }))),
                  ]),
                  [option],
                ),
              ),
            ),
          ]
        }

        // The field an edit is typed in, as the column's schema says: a choice
        // of its literals, a number with a decimal keypad, or text.
        const editorOf = (
          address: CellAddress<Id>,
          edit: { readonly draft: string; readonly error: Option.Option<string> },
        ): ReadonlyArray<Html> => {
          const errorId = `${GridFocus.cellId(grid.id, address)}:error`
          // Every editor's attributes, with the keys it answers.
          const sharedWith = (
            keys: (
              key: string,
              modifiers: KeyboardModifiers,
            ) => Option.Option<typeof grid.Message.Type>,
          ) => [
            // A new edit is a new field, so it is focused afresh.
            h.Key(`edit:${address.row}:${address.column}`),
            h.AriaLabel(grid.columns.byId[address.column].header),
            h.AriaInvalid(Option.isSome(edit.error)),
            ...(Option.isSome(edit.error) ? [h.AriaDescribedBy(errorId)] : []),
            h.OnKeyDownPreventDefault((pressed: string, modifiers: KeyboardModifiers) =>
              Option.map(keys(pressed, modifiers), input.wrap),
            ),
            // Clicking away saves, as Enter does without moving: a draft the
            // column refuses stays open, with its error, to be fixed or
            // dropped with Escape. The edit is often over by then (Enter,
            // Escape, another cell), and committing no edit changes nothing.
            h.OnBlur(
              input.wrap(
                grid.Message.EditCommitted({ next: Option.none(), reveal: Option.none() }),
              ),
            ),
            h.OnMount(HoldFocus()),
            h.Style({ boxSizing: 'border-box', width: '100%', height: '100%' }),
          ]
          const shared = sharedWith((pressed, modifiers) => editorKey(address, pressed, modifiers))
          const changed = (draft: string) => input.wrap(grid.Message.EditChanged({ draft }))
          const field = (mode: Option.Option<'decimal'>) =>
            h.input(
              slots.editor.attrs([
                ...shared,
                h.Type('text'),
                h.Value(edit.draft),
                ...Option.match(mode, {
                  onNone: () => [],
                  onSome: decimal => [h.InputMode(decimal)],
                }),
                h.OnInput(changed),
              ]),
            )
          const message = Option.match(edit.error, {
            onNone: () => [],
            onSome: error => [
              h.div(slots.editorError.attrs([h.Id(errorId), h.Role('alert')]), [error]),
            ],
          })
          const editor = Option.match(grid.editorFor(address.column), {
            onNone: () => [field(Option.none())],
            onSome: CellEditor.match({
              Text: () => [field(Option.none())],
              Number: () => [field(Option.some('decimal'))],
              Choice: ({ options }): ReadonlyArray<Html> =>
                input.choiceEditor === 'native'
                  ? [
                      h.select(
                        slots.choice.attrs([...shared, h.OnChange(changed)]),
                        options.map(option =>
                          h.option(
                            slots.choiceOption.attrs([
                              h.Value(option),
                              ...(option === edit.draft ? [h.Selected(true)] : []),
                            ]),
                            [option],
                          ),
                        ),
                      ),
                    ]
                  : choiceList(
                      address,
                      options,
                      edit.draft,
                      sharedWith((pressed, modifiers) => choiceKey(address, pressed, modifiers)),
                    ),
            }),
          })
          return [...editor, ...message]
        }

        // The clipboard works on the range, or the focused cell when there is none.
        // While a cell is edited, the field has the clipboard to itself.
        const clipboardBox = Option.filter(
          Option.orElse(range, () =>
            Option.flatMap(stop, address => projection.box(address, address)),
          ),
          () => Option.isNone(editing),
        )
        const editable = (column: Id) => grid.columns.byId[column].edit !== undefined
        // In a grid where some columns edit, the others say they do not.
        const readOnly = (column: Id) => editsAny && !editable(column)
        const clipboard = (box: CellBox<Id>) => {
          const text = remembered(projection, JSON.stringify(box), () =>
            Clipboard.copy(projection, box, address =>
              textOf(
                Option.match(
                  Option.flatMap(projection.rowIndex(address.row), index =>
                    projection.rows.rowAt(index),
                  ),
                  {
                    onNone: () => '',
                    onSome: row => grid.columns.byId[address.column].value(row),
                  },
                ),
              ),
            ),
          )
          const corner = Option.map(projection.rows.keyAt(box.rows.start), row => ({
            row,
            column: box.columns[0]!,
          }))
          // A cut clears the cells it copied that can be edited.
          const cleared = Option.match(corner, {
            onNone: () => [],
            onSome: anchor =>
              Clipboard.pasteAt(
                projection,
                anchor,
                Array.from({ length: box.rows.end - box.rows.start }, () =>
                  box.columns.map(() => ''),
                ),
                { editable, from: draftOf },
              ),
          })
          return [
            h.OnCopyText(text),
            h.OnCutText(text, input.wrap(grid.Message.Pasted({ cells: cleared }))),
            h.OnPastePreventDefault(pasted =>
              Option.flatMap(corner, anchor => {
                const cells = Clipboard.pasteAt(projection, anchor, Clipboard.parseTsv(pasted), {
                  editable,
                  from: draftOf,
                })
                return cells.length === 0
                  ? Option.none()
                  : Option.some(input.wrap(grid.Message.Pasted({ cells })))
              }),
            ),
          ]
        }

        const sortOf = (column: Id): Option.Option<ColumnSort<Message>> =>
          Option.fromUndefinedOr(input.sort?.[column])

        // Enter on a header that sorts sends the application's sort Message.
        const sortKey = (column: Id, key: string, modifiers: KeyboardModifiers) =>
          key === 'Enter' && plainKey(modifiers)
            ? Option.map(sortOf(column), sorted => sorted.message)
            : Option.none()

        // Ctrl or Meta with D fills the range down from its first row, with R
        // right from its first column; a range one row tall (or one column
        // wide), or a lone cell, fills from the row above (or the column before).
        const fillKey = (
          key: string,
          modifiers: KeyboardModifiers,
        ): Option.Option<typeof grid.Message.Type> => {
          const pressed = key.toLowerCase()
          const toggle = modifiers.ctrlKey || modifiers.metaKey
          if (!editsAny || !toggle || modifiers.shiftKey || modifiers.altKey) return Option.none()
          if (pressed !== 'd' && pressed !== 'r') return Option.none()
          const box = Option.orElse(range, () =>
            Option.flatMap(stop, address => projection.box(address, address)),
          )
          return Option.flatMap(box, ({ rows, columns }) => {
            const first = columns[0]!
            const last = columns[columns.length - 1]!
            if (pressed === 'd') {
              const from = rows.end - rows.start > 1 ? rows.start : rows.start - 1
              return Option.zipWith(
                projection.rows.keyAt(from),
                projection.rows.keyAt(rows.end - 1),
                (sourceRow, toRow) =>
                  grid.Message.FillRequested({
                    source: {
                      anchor: { row: sourceRow, column: first },
                      focus: { row: sourceRow, column: last },
                    },
                    to: { row: toRow, column: first },
                  }),
              )
            }
            const at = projection.columns.indexOf(first)
            const from = columns.length > 1 ? first : projection.columns[at - 1]
            return Option.zipWith(
              Option.fromUndefinedOr(from),
              Option.zipWith(
                projection.rows.keyAt(rows.start),
                projection.rows.keyAt(rows.end - 1),
                (top, bottom) => ({ top, bottom }),
              ),
              (column, { top, bottom }) =>
                grid.Message.FillRequested({
                  source: { anchor: { row: top, column }, focus: { row: bottom, column } },
                  to: { row: top, column: last },
                }),
            )
          })
        }

        // Escape while a header or a fill is dragged lets it go back; the
        // pointer's own release after that finds no drag.
        const onKey = (key: string, modifiers: KeyboardModifiers): Option.Option<Message> => {
          if (key === 'Escape' && Option.isSome(state.dragging)) {
            return Option.some(input.wrap(grid.Message.ColumnDragEnded({ completed: false })))
          }
          if (key === 'Escape' && Option.isSome(state.filling)) {
            return Option.some(input.wrap(grid.Message.FillEnded({ completed: false })))
          }
          return keyOf(key, modifiers)
        }
        // Ctrl or Meta with Z asks to undo, with Shift, or Ctrl+Y, to redo.
        const historyKey = (
          key: string,
          modifiers: KeyboardModifiers,
        ): Option.Option<typeof grid.Message.Type> => {
          if (!(modifiers.ctrlKey || modifiers.metaKey) || modifiers.altKey) return Option.none()
          const pressed = key.toLowerCase()
          if (pressed === 'z') {
            return Option.some(
              modifiers.shiftKey ? grid.Message.RedoRequested() : grid.Message.UndoRequested(),
            )
          }
          return pressed === 'y' && !modifiers.shiftKey
            ? Option.some(grid.Message.RedoRequested())
            : Option.none()
        }
        const keyOf = (key: string, modifiers: KeyboardModifiers): Option.Option<Message> =>
          Option.match(onHeader, {
            onSome: column =>
              Option.orElse(sortKey(column, key, modifiers), () =>
                Option.map(headerKey(column, key, modifiers), input.wrap),
              ),
            onNone: () =>
              Option.map(
                Option.orElse(
                  Option.orElse(historyKey(key, modifiers), () => fillKey(key, modifiers)),
                  () =>
                    Option.orElse(selectionKey(key, modifiers), () =>
                      Option.orElse(editKey(key, modifiers), () =>
                        Option.orElse(upToHeader(key, modifiers), () => focusKey(key, modifiers)),
                      ),
                    ),
                ),
                input.wrap,
              ),
          })

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

        // A header drag is measured toward the region's end, as a resize is.
        // A fill being dragged, where it would write if let go now: the same
        // `Fill.plan` the application's `fill` works it out by on release.
        const fillTarget = Option.map(
          Option.flatMap(state.filling, filling => Fill.plan(projection, filling)),
          ({ target }) => ({ rows: target.rows, columns: new Set<string>(target.columns) }),
        )
        // The fill handle: at the range's end corner, or on the focused cell,
        // in a grid that edits. An edit clears the range, and its cell draws
        // the editor in place of the handle.
        const handleAt = Option.filter(
          Option.orElse(
            Option.flatMap(range, box =>
              Option.map(projection.rows.keyAt(box.rows.end - 1), row => ({
                row,
                column: box.columns[box.columns.length - 1]!,
              })),
            ),
            () => stop,
          ),
          () => editsAny,
        )
        const fillDragged = Mount.mapMessage(FillDrag(), fact =>
          input.wrap(
            Match.valueTags(fact, {
              FillDragStarted: () => grid.Message.FillStarted(),
              FillDraggedOver: ({ cell }) => grid.Message.FillDragged({ cell }),
              FillDragEnded: ({ completed }) => grid.Message.FillEnded({ completed }),
            }),
          ),
        )
        const fillHandle = h.span(
          slots.fillHandle.attrs([
            h.AriaHidden(true),
            h.OnMount(fillDragged),
            h.Style({ position: 'absolute', insetInlineEnd: '0', insetBlockEnd: '0' }),
          ]),
          [],
        )
        const headerDragged = Mount.mapMessage(HeaderDrag(), fact =>
          input.wrap(
            Match.valueTags(fact, {
              HeaderDragStarted: ({ header }) => grid.Message.ColumnDragStarted({ header }),
              HeaderDragged: ({ deltaX }) => grid.Message.ColumnDragged({ delta: deltaX * toward }),
              HeaderDragEnded: ({ completed }) => grid.Message.ColumnDragEnded({ completed }),
            }),
          ),
        )
        // The shown neighbour a dragged header would land beside if let go now,
        // by the same `dropAt` the grid applies on release; none while it
        // would stay where it is.
        const landing = Option.flatMap(
          state.dragging,
          ({ column, delta }): Option.Option<{ readonly column: Id; readonly side: string }> => {
            const columns = grid.columnState
            const region = columns.regionOf(state.columns, column)
            const moved = columns.move(
              state.columns,
              column,
              region,
              columns.dropAt(state.columns, column, delta),
            )
            if (moved === state.columns) return Option.none()
            const hidden = new Set(moved.hidden)
            const order = moved[region].filter(id => !hidden.has(id))
            const at = order.indexOf(column)
            return at + 1 < order.length
              ? Option.some({ column: order[at + 1]!, side: 'before' })
              : Option.some({ column: order[at - 1]!, side: 'after' })
          },
        )
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

        // Four parts, so a menu's id is never a cell's (three) or a header's (two).
        const menuPart = (column: Id, part: string): string =>
          [grid.id, column, 'menu', part].map(encodeURIComponent).join(':')
        const say = (template: string, column: Id) =>
          template.replace('{column}', grid.columns.byId[column].header)
        const itemLabel = (item: typeof grid.MenuItem.Type): string =>
          grid.MenuItem.match(item, {
            Pin: ({ region }) =>
              ({
                start: words.pinStart ?? 'Pin to start',
                end: words.pinEnd ?? 'Pin to end',
                center: words.unpin ?? 'Unpin',
              })[region],
            Hide: () => words.hide ?? 'Hide column',
            Show: ({ column: other }) => say(words.show ?? 'Show {column}', other),
          })
        const columnMenu = (id: Id): ReadonlyArray<Html> => {
          if (input.columnMenu !== true) return []
          const open = Option.filter(state.menu, menu => menu.column === id)
          const button = h.button(
            slots.menuButton.attrs([
              h.Type('button'),
              h.Tabindex(-1),
              h.AriaHasPopup('menu'),
              h.AriaExpanded(Option.isSome(open)),
              h.AriaLabel(say(words.menu ?? '{column} menu', id)),
              // Clear of the resize handle at the same edge, so each takes its own presses.
              ...(grid.columns.byId[id].resizable === false
                ? []
                : [h.Style({ marginInlineEnd: px(resizeStep / 2) })]),
              h.OnClick(
                input.wrap(
                  Option.match(open, {
                    onNone: () => grid.Message.MenuOpened({ column: id }),
                    onSome: () => grid.Message.MenuClosed(),
                  }),
                ),
              ),
            ]),
            [String.fromCharCode(0x22ee)],
          )
          return Option.match(open, {
            onNone: () => [button],
            onSome: ({ active }) => {
              const items = grid.menuItems(state.columns, id)
              const count = items.length
              const menuKey = (key: string): Option.Option<typeof grid.Message.Type> => {
                if (key === 'ArrowDown') {
                  return Option.some(grid.Message.MenuMoved({ active: (active + 1) % count }))
                }
                if (key === 'ArrowUp') {
                  return Option.some(
                    grid.Message.MenuMoved({ active: (active - 1 + count) % count }),
                  )
                }
                if (key === 'Home') return Option.some(grid.Message.MenuMoved({ active: 0 }))
                if (key === 'End') return Option.some(grid.Message.MenuMoved({ active: count - 1 }))
                if (key === 'Enter' || key === ' ') {
                  return Option.some(grid.Message.MenuChosen({ index: active }))
                }
                if (key === 'Escape') return Option.some(grid.Message.MenuClosed())
                // Tab is left to the browser: focus leaving the menu closes it.
                return Option.none()
              }
              return [
                button,
                h.div(
                  slots.menu.attrs([
                    h.Key(menuPart(id, 'list')),
                    h.Role('menu'),
                    h.Id(menuPart(id, 'list')),
                    h.Tabindex(-1),
                    h.AriaLabel(grid.columns.byId[id].header),
                    ...(count === 0 ? [] : [h.AriaActiveDescendant(menuPart(id, String(active)))]),
                    h.OnKeyDownPreventDefault(key => Option.map(menuKey(key), input.wrap)),
                    h.OnFocusLeave(input.wrap(grid.Message.MenuClosed())),
                    h.OnMount(HoldFocus()),
                    h.Style({ position: 'absolute', top: '100%', insetInlineEnd: '0' }),
                  ]),
                  items.map((item, index) =>
                    h.div(
                      slots.menuItem.attrs([
                        h.Role('menuitem'),
                        h.Id(menuPart(id, String(index))),
                        ...(index === active ? [h.DataAttribute('active', 'true')] : []),
                        h.OnClick(input.wrap(grid.Message.MenuChosen({ index }))),
                      ]),
                      [itemLabel(item)],
                    ),
                  ),
                ),
              ]
            },
          })
        }

        const headerCell = (id: Id): Html => {
          const dragged = Option.filter(state.dragging, dragging => dragging.column === id)
          return h.div(
            slots.headerCell.attrs([
              h.Role('columnheader'),
              h.Id(GridFocus.headerId(grid.id, id)),
              ...(Option.contains(onHeader, id) ? [h.DataAttribute('focused', 'true')] : []),
              h.AriaColindex(indexOf.get(id)! + 1),
              // A pinned header is already sticky; any other holds its handle with relative.
              h.Style({
                ...cellStyle(id),
                ...(Option.isNone(pinned(id)) ? { position: 'relative' } : {}),
                ...Option.match(dragged, {
                  onNone: () => ({}),
                  onSome: ({ delta }) => ({ transform: `translateX(${px(delta * toward)})` }),
                }),
              }),
              ...(Option.isSome(dragged) ? [h.DataAttribute('dragging', 'true')] : []),
              ...Option.match(
                Option.filter(landing, place => place.column === id),
                {
                  onNone: () => [],
                  onSome: place => [h.DataAttribute('drop', place.side)],
                },
              ),
              ...Option.match(pinned(id), {
                onNone: () => [],
                onSome: edge => [h.DataAttribute('pinned', edge)],
              }),
              ...pinnedEdge(id),
              ...(readOnly(id) ? [h.AriaReadonly(true), h.Title('Read-only')] : []),
              ...Option.match(sortOf(id), {
                onNone: () => [],
                onSome: sorted => [h.AriaSort(ariaSort(sorted.direction))],
              }),
            ]),
            [
              Option.match(sortOf(id), {
                onNone: () => grid.columns.byId[id].header,
                // A button the pointer sorts with; the keyboard sorts with Enter on the header.
                onSome: sorted =>
                  h.button(
                    slots.sort.attrs([
                      h.Type('button'),
                      h.Tabindex(-1),
                      h.OnClick(sorted.message),
                      // For a stylist to draw the direction; the header says it with aria-sort.
                      ...(sorted.direction === undefined
                        ? []
                        : [h.DataAttribute('sort', sorted.direction)]),
                    ]),
                    [grid.columns.byId[id].header],
                  ),
              }),
              ...columnMenu(id),
              ...resizeHandle(id),
            ],
          )
        }

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
                    const focused =
                      Option.isNone(onHeader) &&
                      Option.exists(stop, current => current.row === key && current.column === id)
                    const inRange = Option.exists(
                      Option.zipWith(range, rangeColumns, (box, ids) => ({ box, ids })),
                      ({ box, ids }) =>
                        index >= box.rows.start && index < box.rows.end && ids.has(id),
                    )
                    const edited = Option.filter(
                      editing,
                      edit => edit.address.row === key && edit.address.column === id,
                    )
                    const handled = Option.exists(
                      handleAt,
                      at => at.row === key && at.column === id,
                    )
                    const filled = Option.exists(
                      fillTarget,
                      box => index >= box.rows.start && index < box.rows.end && box.columns.has(id),
                    )
                    return h.div(
                      slots.cell.attrs([
                        h.Role('gridcell'),
                        h.Id(GridFocus.cellId(grid.id, address)),
                        h.AriaColindex(indexOf.get(id)! + 1),
                        // An edited cell holds its error below it, and the corner cell
                        // the fill handle; a pinned cell is sticky, which places both.
                        h.Style({
                          ...cellStyle(id),
                          ...((Option.isSome(edited) || handled) && Option.isNone(pinned(id))
                            ? { position: 'relative' }
                            : {}),
                        }),
                        ...(filled ? [h.DataAttribute('fill', 'target')] : []),
                        ...(grid.cellSelection ? [h.AriaSelected(inRange)] : []),
                        ...(focused ? [h.DataAttribute('focused', 'true')] : []),
                        ...Option.match(pinned(id), {
                          onNone: () => [],
                          onSome: edge => [h.DataAttribute('pinned', edge)],
                        }),
                        ...pinnedEdge(id),
                        // Editable: double-clicking edits, as Enter does.
                        ...(editable(id)
                          ? [
                              h.DataAttribute('editable', 'true'),
                              h.OnDoubleClick(
                                input.wrap(
                                  grid.Message.EditStarted({ address, draft: draftOf(address) }),
                                ),
                              ),
                            ]
                          : []),
                        ...(Option.isSome(edited) ? [h.DataAttribute('editing', 'true')] : []),
                        ...(readOnly(id) ? [h.AriaReadonly(true)] : []),
                        ...Option.match(markOf(address), {
                          onNone: () => [],
                          onSome: mark => [
                            h.DataAttribute('mark', mark.name),
                            h.AriaDescription(mark.description),
                            // Said on hover too: a dot alone does not say what it means.
                            h.Title(mark.description),
                          ],
                        }),
                      ]),
                      Option.match(edited, {
                        onNone: () => [
                          input.cell?.(id, row, h) ?? textOf(grid.columns.byId[id].value(row)),
                          ...(handled ? [fillHandle] : []),
                        ],
                        onSome: edit => editorOf(address, edit),
                      }),
                    )
                  }),
                ),
            },
          )

        const bodyRows = Array.from({ length: shown.rows.end - shown.rows.start }, (_, offset) =>
          rowAt(shown.rows.start + offset),
        )
        const empty = addressableRows(projection.rowCount) === 0

        const status = input.status ?? RowStatus.Ready()
        const busy = isBusy(status)
        const words = input.words ?? {}
        const failure = (message: string): ReadonlyArray<Html> => [
          h.p(slots.status.attrs([h.Role('alert')]), [
            (words.failed ?? '{message}').replaceAll('{message}', message),
          ]),
          ...(input.onRetry === undefined
            ? []
            : [
                h.button(slots.retry.attrs([h.Type('button'), h.OnClick(input.onRetry)]), [
                  words.retry ?? 'Try again',
                ]),
              ]),
        ]
        // With no rows the body says where the source stands; with rows, a
        // failure is said below them, where it moves no row.
        const emptyBody: ReadonlyArray<Html> = RowStatus.match(status, {
          Loading: () => [
            h.p(slots.status.attrs([h.Role('status'), h.AriaBusy(true)]), [
              words.loading ?? 'Loading…',
            ]),
          ],
          Refreshing: () => [
            h.p(slots.status.attrs([h.Role('status')]), [words.empty ?? 'No rows.']),
          ],
          Ready: () => [h.p(slots.status.attrs([h.Role('status')]), [words.empty ?? 'No rows.'])],
          Failed: ({ message }) => failure(message),
        })
        // More rows to ask for: only while the count is not known yet.
        const more = Option.filter(Option.fromUndefinedOr(input.onMore), () =>
          RowCount.match(projection.rowCount, { Known: () => false, Unknown: () => true }),
        )
        const footer: ReadonlyArray<Html> = [
          ...(empty
            ? []
            : RowStatus.match(status, {
                Ready: () => [],
                Loading: () => [],
                Refreshing: () => [],
                Failed: ({ message }) => failure(message),
              })),
          ...Option.match(more, {
            onNone: () => [],
            onSome: message => [
              h.button(
                slots.more.attrs([
                  h.Type('button'),
                  h.Disabled(busy),
                  h.OnClick(message),
                  // Keyed by the rows loaded and whether a load is in flight, so a
                  // Mount attached to it (`MoreOnScroll`) starts afresh after each.
                  h.Key(`more:${addressableRows(projection.rowCount)}:${busy}`),
                ]),
                [words.more ?? 'More'],
              ),
            ],
          }),
        ]

        return h.div(
          slots.root.attrs([
            h.Id(grid.id),
            h.Role('grid'),
            ...(busy ? [h.AriaBusy(true)] : []),
            h.AriaLabel(input.label),
            h.Tabindex(0),
            h.AriaRowcount(rowCount),
            h.AriaColcount(projection.columns.length),
            ...(grid.rowSelection === 'multiple' || grid.cellSelection
              ? [h.AriaMultiSelectable(true)]
              : []),
            ...Option.match(activeDescendant, {
              onNone: () => [],
              onSome: id => [h.AriaActiveDescendant(id)],
            }),
            // Only keys aimed at the grid itself: a resize handle's arrows are its own.
            h.OnKeyDownSelfPreventDefault(onKey),
            ...Option.match(clipboardBox, { onNone: () => [], onSome: clipboard }),
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
                    // A Mount reads its args once: key it by what its mapping closes over.
                    h.Key(`header-drag:${toward}`),
                    h.OnMount(headerDragged),
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
                ? emptyBody
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
            ...(footer.length === 0 ? [] : [h.div(slots.footer.attrs(), footer)]),
          ],
        )
      },
      { name: grid.id },
    )
  },
})

export const DataGridView = view
