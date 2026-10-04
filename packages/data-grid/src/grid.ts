import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'
import type * as Update from 'foldkit/update'
import { Bundle } from 'foldkit-bundle'
import { ColumnState } from './columnState.js'
import type { Columns, ColumnSpec } from './columns.js'
import { GridFocus } from './focus.js'
import { GridProjection } from './projection.js'
import type { RowModel } from './rows.js'
import { GridSelection, RowSelection } from './selection.js'
import { GridViewport } from './viewport.js'

const Offsets = Schema.Struct({ top: Schema.Number, left: Schema.Number })

/**
 * One grid's interaction state: focus, the viewport and the column state, as
 * one Bundle. Its update is the parts' own, joined: a key that moves focus
 * off screen carries the scroll that reveals the cell, and the grid issues it.
 *
 * `id` names the grid in the DOM: the scroll container's id, and the prefix
 * of every cell's id (`GridFocus.cellId`). Selection is opt-in:
 * `rowSelection` lets rows be selected one at a time or several, and
 * `cellSelection` lets a rectangle of cells be selected; without them their
 * Messages change nothing.
 */
const make = <Row, Specs extends Record<string, ColumnSpec<Row, unknown>>>(options: {
  readonly id: string
  readonly columns: Columns<Row, Specs>
  readonly rowSelection?: 'single' | 'multiple'
  readonly cellSelection?: boolean
}) => {
  const focus = GridFocus.make(options.columns)
  const columnState = ColumnState.make(options.columns)
  const Column = focus.Address.fields.column
  const CellText = Schema.Struct({ row: Schema.String, column: Column, text: Schema.String })
  const Model = Schema.Struct({
    focus: focus.Model,
    viewport: GridViewport.Model,
    columns: columnState.Model,
    /** A column being resized by the pointer, and its width when the drag began. */
    resizing: Schema.OptionFromNullOr(Schema.Struct({ column: Column, from: Schema.Number })),
    /**
     * A column header being dragged by the pointer, and how far toward its
     * region's end. Where it lands is worked out when it is let go.
     */
    dragging: Schema.OptionFromNullOr(Schema.Struct({ column: Column, delta: Schema.Number })),
    /** The column whose menu is open, and the item the keyboard is on (`menuItems`). */
    menu: Schema.OptionFromNullOr(Schema.Struct({ column: Column, active: Schema.Number })),
    selection: Schema.Struct({
      rows: RowSelection,
      /** Where the last plain row selection happened; a Shift range extends from it. */
      anchor: Schema.OptionFromNullOr(Schema.String),
      /** A rectangle of cells, by its corners; a single focused cell is none. */
      cells: Schema.OptionFromNullOr(
        Schema.Struct({ anchor: focus.Address, focus: focus.Address }),
      ),
    }),
    /** The cell being edited, its draft, and the error that refused it, if one did. */
    editing: Schema.OptionFromNullOr(
      Schema.Struct({
        address: focus.Address,
        draft: Schema.String,
        error: Schema.OptionFromNullOr(Schema.String),
      }),
    ),
  })
  const Region = Schema.Literals(['start', 'center', 'end'])
  type Model = typeof Model.Type
  /**
   * What a column's menu offers: pinning it to another region, hiding it,
   * and showing each hidden column. Each is a column Message the grid
   * already has; the menu only gathers them.
   */
  const MenuItem = defineTaggedUnion({
    Pin: { region: Region },
    Hide: {},
    Show: { column: Column },
  })
  type MenuItem = typeof MenuItem.Type
  const Message = defineMessageUnion({
    /** The pointer or the browser focused a cell. */
    Focused: { address: focus.Address },
    /**
     * A key moved focus. `reveal` is the scroll that brings the cell into
     * view, worked out by the view from the viewport it drew, or none when
     * the cell is shown.
     */
    Moved: { address: focus.Address, reveal: Schema.OptionFromNullOr(Offsets) },
    /** A key moved focus up to a column's header, revealing it when scrolled away. */
    HeaderFocused: { column: Column, reveal: Schema.OptionFromNullOr(Offsets) },
    /** The scroll container moved or changed size: `GridViewport.Measure` reports it. */
    Measured: { ...Offsets.fields, width: Schema.Number, height: Schema.Number },
    /** The reveal a `Moved` asked for has scrolled the container. */
    Revealed: Offsets.fields,
    /** A column was resized; the width is clamped to its limits. */
    ColumnResized: { column: Column, width: Schema.Number },
    ColumnHidden: { column: Column },
    ColumnShown: { column: Column },
    /** A column moved to `index` in `region`: a reorder, a pin or an unpin. */
    ColumnMoved: { column: Column, region: Region, index: Schema.Number },
    /** The pointer went down on a column's resize handle. */
    ResizeStarted: { column: Column },
    /**
     * The pointer moved `delta` pixels toward the column's end edge since the
     * resize began: positive widens it, in either direction of text.
     */
    ResizeMoved: { delta: Schema.Number },
    /** The pointer let go, or the drag was cancelled and the width goes back. */
    ResizeEnded: { completed: Schema.Boolean },
    /**
     * The pointer began dragging the column header whose DOM id is `header`
     * (`GridFocus.headerId`). The id comes from the page, so one that is not
     * a shown column of this grid changes nothing.
     */
    ColumnDragStarted: { header: Schema.String },
    /** The pointer is `delta` pixels toward the region's end from where the drag began. */
    ColumnDragged: { delta: Schema.Number },
    /**
     * The pointer let go and the column moves where it was dropped
     * (`ColumnState.dropAt`), or the drag was cancelled and nothing moves.
     */
    ColumnDragEnded: { completed: Schema.Boolean },
    /**
     * A column's menu opened, from its button or a key on its header; focus
     * goes to the header, so closing the menu returns there.
     */
    MenuOpened: { column: Column },
    /** The keyboard moved to item `active` of the open menu. */
    MenuMoved: { active: Schema.Number },
    /**
     * Item `index` of the open menu was chosen. It is read from the menu as
     * it stands now, and the menu closes.
     */
    MenuChosen: { index: Schema.Number },
    MenuClosed: {},
    /** A row was chosen: in single mode it is the selection, in multiple it toggles. */
    RowSelected: { row: Schema.String },
    /** A Shift range of rows, worked out by the view from the projection it drew. */
    RowsExtended: { rows: Schema.Array(Schema.String), to: Schema.String },
    AllRowsSelected: {},
    RowsCleared: {},
    /**
     * A rectangle of cells, from Shift with a key. `reveal` scrolls its far
     * corner into view, as `Moved`'s does for a focused cell.
     */
    CellsSelected: {
      anchor: focus.Address,
      focus: focus.Address,
      reveal: Schema.OptionFromNullOr(Offsets),
    },
    /**
     * The pointer pressed the cell whose DOM id is `cell` (`GridFocus.cellId`).
     * With Shift it spans a range from the focused cell, with Ctrl or Meta it
     * toggles the cell's row, and plainly it focuses the cell. The id comes
     * from the page, so one that is not this grid's cell changes nothing.
     */
    CellPressed: { cell: Schema.String, shiftKey: Schema.Boolean, toggleKey: Schema.Boolean },
    CellsCleared: {},
    /** An edit began on an editable cell, with the text it starts from. */
    EditStarted: { address: focus.Address, draft: Schema.String },
    /**
     * A key typed on the grid itself, over an editable cell: it starts an
     * edit with the text, or, when that cell's edit is already open (the
     * keys came faster than the editor took focus), adds to its draft.
     */
    EditTyped: { address: focus.Address, text: Schema.String },
    EditChanged: { draft: Schema.String },
    /**
     * The draft is to be kept. When the column accepts it the edit ends, focus
     * goes to `next` (the cell below, or beside, worked out by the view), and
     * the grid reports `Out.Edited`; when it refuses it, the edit stays with the
     * error.
     */
    EditCommitted: {
      next: Schema.OptionFromNullOr(focus.Address),
      reveal: Schema.OptionFromNullOr(Offsets),
    },
    EditCancelled: {},
    /**
     * Text pasted, or a cut's cleared cells, laid onto editable cells by the
     * view (`Clipboard.pasteAt`). Each is checked against its column, and the
     * whole is reported as one `Pasted`.
     */
    Pasted: { cells: Schema.Array(CellText) },
  })
  type Message = typeof Message.Type
  /**
   * What the grid reports to its parent: one cell's committed text, or a
   * paste's, as one change. Turning text into values and writing them is the
   * application's.
   */
  const Out = defineTaggedUnion({
    Edited: { row: Schema.String, column: Column, text: Schema.String },
    /** The cells their columns accepted, and those they refused, with why. */
    Pasted: {
      accepted: Schema.Array(CellText),
      refused: Schema.Array(Schema.Struct({ ...CellText.fields, error: Schema.String })),
    },
  })
  type Out = typeof Out.Type
  type Return = Update.ReturnWithOutMessage<Model, Message, Out, never>

  const focusTo = (model: Model, address: typeof focus.Address.Type): Model => {
    const next = focus.bundle.update(
      model.focus,
      focus.Message.Focused({ address }),
      undefined,
    ).model
    return next === model.focus ? model : modifyFields(model, { focus: () => next })
  }
  const viewportBy = (model: Model, message: typeof GridViewport.Message.Type): Model => {
    const next = GridViewport.bundle.update(model.viewport, message, undefined).model
    return next === model.viewport ? model : modifyFields(model, { viewport: () => next })
  }
  const columnsBy = (model: Model, next: typeof columnState.Model.Type): Model =>
    next === model.columns ? model : modifyFields(model, { columns: () => next })
  type Selection = Model['selection']
  const selectionBy = (model: Model, next: Selection): Model =>
    next === model.selection ? model : modifyFields(model, { selection: () => next })
  const clearCells = (model: Model): Model =>
    Option.isNone(model.selection.cells)
      ? model
      : selectionBy(model, { ...model.selection, cells: Option.none() })
  type Address = typeof focus.Address.Type
  const isColumn = (column: string): column is keyof Specs & string =>
    Object.hasOwn(options.columns.byId, column)
  /** The address of one of this grid's cells, from its DOM id. */
  const addressOf = (cell: string): Option.Option<Address> =>
    Option.flatMap(GridFocus.cellOf(options.id, cell), ({ row, column }) =>
      isColumn(column) ? Option.some({ row, column }) : Option.none(),
    )
  const pressed = (
    model: Model,
    address: Address,
    shiftKey: boolean,
    toggleKey: boolean,
  ): Return => {
    if (shiftKey && options.cellSelection === true) {
      // The range runs from where it began, or from the focused cell, which stays focused.
      const anchor = Option.getOrElse(
        Option.orElse(
          Option.map(model.selection.cells, cells => cells.anchor),
          () => model.focus.current,
        ),
        () => address,
      )
      return {
        model: selectionBy(model, {
          ...model.selection,
          cells: Option.some({ anchor, focus: address }),
        }),
      }
    }
    const focused = clearCells(focusTo(model, address))
    if (toggleKey && options.rowSelection !== undefined) {
      return { model: selectionBy(focused, choose(focused.selection, address.row)) }
    }
    return { model: focused }
  }

  const sameCell = (a: Address, b: Address): boolean => a.row === b.row && a.column === b.column
  /**
   * Ends an edit with its draft: none to report when nothing was edited,
   * `refused` with the column's error when the draft does not pass, or the
   * edit closed and `Edited` to report.
   */
  const finish = (
    model: Model,
  ): { readonly model: Model; readonly edited: Option.Option<Out>; readonly refused: boolean } =>
    Option.match(model.editing, {
      onNone: () => ({ model, edited: Option.none(), refused: false }),
      onSome: editing => {
        const { address, draft } = editing
        const error = options.columns.byId[address.column].edit?.validate?.(draft) ?? Option.none()
        return Option.match(error, {
          onSome: message => ({
            model: modifyFields(model, {
              editing: () => Option.some({ ...editing, error: Option.some(message) }),
            }),
            edited: Option.none(),
            refused: true,
          }),
          onNone: () => ({
            model: modifyFields(model, { editing: () => Option.none() }),
            edited: Option.some(
              Out.Edited({ row: address.row, column: address.column, text: draft }),
            ),
            refused: false,
          }),
        })
      },
    })
  /**
   * The pointer leaving an edit commits it first, as a spreadsheet does; a
   * draft the column refuses keeps the edit, and the pointer's change waits.
   */
  const afterEdit = (model: Model, then: (settled: Model) => Return): Return => {
    const finished = finish(model)
    if (finished.refused) return { model: finished.model }
    const next = then(finished.model)
    return Option.match(finished.edited, {
      onNone: () => next,
      onSome: outMessage => ({ ...next, outMessage }),
    })
  }

  // Single mode replaces, as a radio group does; RowsCleared empties it.
  const choose = (selection: Selection, row: string): Selection => {
    if (options.rowSelection === 'single') {
      return { ...selection, rows: RowSelection.Keys({ keys: [row] }), anchor: Option.some(row) }
    }
    return {
      ...selection,
      rows: GridSelection.toggle(selection.rows, row),
      anchor: Option.some(row),
    }
  }

  /**
   * The items of a column's menu, in order: pin to each other region, hide
   * when it can be hidden, and show each hidden column. An item is offered
   * only when it changes something.
   */
  const menuItems = (
    state: Model['columns'],
    column: keyof Specs & string,
  ): ReadonlyArray<MenuItem> => [
    ...(['start', 'end', 'center'] as const)
      .filter(region => region !== columnState.regionOf(state, column))
      .map(region => MenuItem.Pin({ region })),
    ...(columnState.hide(state, column) === state ? [] : [MenuItem.Hide()]),
    ...state.hidden.map(other => MenuItem.Show({ column: other })),
  ]
  /** The column Message a menu item stands for. */
  const messageOf = (
    state: Model['columns'],
    column: keyof Specs & string,
    item: MenuItem,
  ): Message =>
    MenuItem.match(item, {
      // Pinned, it goes next to the center; unpinned, to the center's edge it came from.
      Pin: ({ region }) =>
        Message.ColumnMoved({
          column,
          region,
          index: {
            start: state.start.length,
            end: 0,
            center: columnState.regionOf(state, column) === 'start' ? 0 : state.center.length,
          }[region],
        }),
      Hide: () => Message.ColumnHidden({ column }),
      Show: ({ column: other }) => Message.ColumnShown({ column: other }),
    })
  const closeMenu = (model: Model): Model =>
    Option.isNone(model.menu) ? model : modifyFields(model, { menu: () => Option.none() })

  const bundle = Bundle.make('DataGrid', {
    Model,
    Message,
    init: () => ({
      model: {
        focus: focus.bundle.init(undefined).model,
        viewport: GridViewport.bundle.init(undefined).model,
        columns: columnState.initial(),
        resizing: Option.none(),
        dragging: Option.none(),
        menu: Option.none(),
        selection: { rows: GridSelection.none, anchor: Option.none(), cells: Option.none() },
        editing: Option.none(),
      },
    }),
    update: (model: Model, message: Message): Return =>
      Message.match(message, {
        // A plain click or key is a single cell again: any range it leaves goes.
        Focused: ({ address }): Return =>
          afterEdit(model, settled => ({ model: clearCells(focusTo(settled, address)) })),
        Moved: ({ address, reveal }): Return => ({
          model: clearCells(focusTo(model, address)),
          commands: Option.match(reveal, {
            onNone: () => [],
            onSome: offsets => [GridViewport.scrollTo(options.id, offsets)],
          }),
        }),
        HeaderFocused: ({ column, reveal }): Return => {
          const next = focus.bundle.update(
            model.focus,
            focus.Message.HeaderFocused({ column }),
            undefined,
          ).model
          return {
            model: next === model.focus ? model : modifyFields(model, { focus: () => next }),
            commands: Option.match(reveal, {
              onNone: () => [],
              onSome: offsets => [GridViewport.scrollTo(options.id, offsets)],
            }),
          }
        },
        Measured: (fields): Return => ({
          model: viewportBy(model, GridViewport.Message.Measured(fields)),
        }),
        Revealed: (fields): Return => ({
          model: viewportBy(model, GridViewport.Message.Revealed(fields)),
        }),
        ColumnResized: ({ column, width }): Return => ({
          model: columnsBy(model, columnState.resize(model.columns, column, width)),
        }),
        // What was on a hidden column goes with it: its edit, its header's focus, its menu.
        ColumnHidden: ({ column }): Return => {
          const hidden = columnsBy(model, columnState.hide(model.columns, column))
          if (hidden === model) return { model }
          const off = (on: Option.Option<string>) => Option.contains(on, column)
          return {
            model: modifyFields(hidden, {
              editing: editing =>
                off(Option.map(editing, each => each.address.column)) ? Option.none() : editing,
              focus: current =>
                off(current.header) ? { ...current, header: Option.none() } : current,
              menu: menu => (off(Option.map(menu, each => each.column)) ? Option.none() : menu),
            }),
          }
        },
        ColumnShown: ({ column }): Return => ({
          model: columnsBy(model, columnState.show(model.columns, column)),
        }),
        ColumnMoved: ({ column, region, index }): Return => ({
          model: columnsBy(model, columnState.move(model.columns, column, region, index)),
        }),
        // Each move is measured from where the drag began, so the width is the
        // pointer's place now, not a sum of every step on the way.
        ResizeStarted: ({ column }): Return => ({
          model:
            options.columns.byId[column].resizable === false
              ? model
              : modifyFields(model, {
                  resizing: () =>
                    Option.some({ column, from: columnState.widthOf(model.columns)(column) }),
                }),
        }),
        ResizeMoved: ({ delta }): Return => ({
          model: Option.match(model.resizing, {
            onNone: () => model,
            onSome: ({ column, from }) =>
              columnsBy(model, columnState.resize(model.columns, column, from + delta)),
          }),
        }),
        MenuOpened: ({ column }): Return =>
          model.columns.hidden.includes(column)
            ? { model }
            : afterEdit(model, settled => {
                const focused = focus.bundle.update(
                  settled.focus,
                  focus.Message.HeaderFocused({ column }),
                  undefined,
                ).model
                return {
                  model: modifyFields(settled, {
                    focus: () => focused,
                    menu: () => Option.some({ column, active: 0 }),
                  }),
                }
              }),
        MenuMoved: ({ active }): Return => ({
          model: Option.match(model.menu, {
            onNone: () => model,
            onSome: menu => {
              const last = menuItems(model.columns, menu.column).length - 1
              const clamped = Math.min(Math.max(0, Math.trunc(active)), Math.max(0, last))
              return clamped === menu.active
                ? model
                : modifyFields(model, { menu: () => Option.some({ ...menu, active: clamped }) })
            },
          }),
        }),
        MenuChosen: ({ index }): Return =>
          Option.match(model.menu, {
            onNone: () => ({ model }),
            onSome: ({ column }) =>
              Option.match(Option.fromUndefinedOr(menuItems(model.columns, column)[index]), {
                onNone: () => ({ model: closeMenu(model) }),
                onSome: item =>
                  bundle.update(
                    closeMenu(model),
                    messageOf(model.columns, column, item),
                    undefined,
                  ),
              }),
          }),
        MenuClosed: (): Return => ({ model: closeMenu(model) }),
        ColumnDragStarted: ({ header }): Return => ({
          model: Option.match(
            Option.filter(
              Option.flatMap(GridFocus.headerOf(options.id, header), column =>
                isColumn(column) ? Option.some(column) : Option.none(),
              ),
              column => !model.columns.hidden.includes(column),
            ),
            {
              onNone: () => model,
              onSome: column =>
                modifyFields(model, { dragging: () => Option.some({ column, delta: 0 }) }),
            },
          ),
        }),
        ColumnDragged: ({ delta }): Return => ({
          model: Option.match(model.dragging, {
            onNone: () => model,
            onSome: dragging =>
              dragging.delta === delta
                ? model
                : modifyFields(model, { dragging: () => Option.some({ ...dragging, delta }) }),
          }),
        }),
        // The drop is worked out from the columns as they stand now, not as
        // they stood when the pointer last moved.
        ColumnDragEnded: ({ completed }): Return => ({
          model: Option.match(model.dragging, {
            onNone: () => model,
            onSome: ({ column, delta }) => {
              const dropped = completed
                ? columnsBy(
                    model,
                    columnState.move(
                      model.columns,
                      column,
                      columnState.regionOf(model.columns, column),
                      columnState.dropAt(model.columns, column, delta),
                    ),
                  )
                : model
              return modifyFields(dropped, { dragging: () => Option.none() })
            },
          }),
        }),
        RowSelected: ({ row }): Return => ({
          model:
            options.rowSelection === undefined
              ? model
              : selectionBy(model, choose(model.selection, row)),
        }),
        RowsExtended: ({ rows, to }): Return => {
          if (options.rowSelection !== 'multiple') return { model }
          const added = GridSelection.add(model.selection.rows, rows)
          const anchor = Option.orElse(model.selection.anchor, () => Option.some(to))
          return {
            model:
              added === model.selection.rows && Option.isSome(model.selection.anchor)
                ? model
                : selectionBy(model, { ...model.selection, rows: added, anchor }),
          }
        },
        AllRowsSelected: (): Return => ({
          model:
            options.rowSelection !== 'multiple'
              ? model
              : selectionBy(model, {
                  ...model.selection,
                  rows: RowSelection.AllExcept({ except: [] }),
                }),
        }),
        RowsCleared: (): Return => {
          const empty = RowSelection.match(model.selection.rows, {
            Keys: ({ keys }) => keys.length === 0,
            AllExcept: () => false,
          })
          return {
            model:
              empty && Option.isNone(model.selection.anchor)
                ? model
                : selectionBy(model, {
                    ...model.selection,
                    rows: GridSelection.none,
                    anchor: Option.none(),
                  }),
          }
        },
        CellsSelected: ({ anchor, focus: far, reveal }): Return =>
          options.cellSelection === true
            ? {
                model: selectionBy(model, {
                  ...model.selection,
                  cells: Option.some({ anchor, focus: far }),
                }),
                commands: Option.match(reveal, {
                  onNone: () => [],
                  onSome: offsets => [GridViewport.scrollTo(options.id, offsets)],
                }),
              }
            : { model },
        CellPressed: ({ cell, shiftKey, toggleKey }): Return =>
          Option.match(addressOf(cell), {
            onNone: () => ({ model }),
            onSome: address =>
              Option.exists(model.editing, editing => sameCell(editing.address, address))
                ? { model }
                : afterEdit(model, settled => pressed(settled, address, shiftKey, toggleKey)),
          }),
        EditStarted: ({ address, draft }): Return =>
          options.columns.byId[address.column].edit === undefined
            ? { model }
            : {
                model: modifyFields(clearCells(focusTo(model, address)), {
                  editing: () => Option.some({ address, draft, error: Option.none() }),
                }),
              },
        EditTyped: ({ address, text }): Return => {
          if (options.columns.byId[address.column].edit === undefined) return { model }
          const draft = Option.match(
            Option.filter(model.editing, editing => sameCell(editing.address, address)),
            { onNone: () => text, onSome: editing => editing.draft + text },
          )
          return {
            model: modifyFields(clearCells(focusTo(model, address)), {
              editing: () => Option.some({ address, draft, error: Option.none() }),
            }),
          }
        },
        EditChanged: ({ draft }): Return => ({
          model: Option.match(model.editing, {
            onNone: () => model,
            onSome: editing =>
              editing.draft === draft && Option.isNone(editing.error)
                ? model
                : modifyFields(model, {
                    editing: () => Option.some({ ...editing, draft, error: Option.none() }),
                  }),
          }),
        }),
        EditCommitted: ({ next, reveal }): Return => {
          const finished = finish(model)
          if (finished.refused) return { model: finished.model }
          const moved = Option.match(next, {
            onNone: () => finished.model,
            onSome: address => focusTo(finished.model, address),
          })
          return {
            model: moved,
            ...Option.match(finished.edited, {
              onNone: () => ({}),
              onSome: outMessage => ({ outMessage }),
            }),
            commands: Option.match(reveal, {
              onNone: () => [],
              onSome: offsets => [GridViewport.scrollTo(options.id, offsets)],
            }),
          }
        },
        // An edit in progress has the keyboard and the clipboard: a paste then is the field's.
        Pasted: ({ cells }): Return => {
          if (Option.isSome(model.editing) || cells.length === 0) return { model }
          const accepted: Array<typeof CellText.Type> = []
          const refused: Array<typeof CellText.Type & { readonly error: string }> = []
          for (const cell of cells) {
            const edit = options.columns.byId[cell.column].edit
            if (edit === undefined) continue
            Option.match(edit.validate?.(cell.text) ?? Option.none(), {
              onNone: () => accepted.push(cell),
              onSome: error => refused.push({ ...cell, error }),
            })
          }
          return { model, outMessage: Out.Pasted({ accepted, refused }) }
        },
        EditCancelled: (): Return => ({
          model: Option.isNone(model.editing)
            ? model
            : modifyFields(model, { editing: () => Option.none() }),
        }),

        CellsCleared: (): Return => ({ model: clearCells(model) }),
        ResizeEnded: ({ completed }): Return => ({
          model: Option.match(model.resizing, {
            onNone: () => model,
            onSome: ({ column, from }) => {
              const settled = completed
                ? model
                : columnsBy(model, columnState.resize(model.columns, column, from))
              return modifyFields(settled, { resizing: () => Option.none() })
            },
          }),
        }),
      }),
  })

  // One projection per rows model and column state, so the view and the
  // application's own reads of the same render share it.
  const projections = new WeakMap<
    RowModel<Row>,
    {
      readonly state: Model['columns']
      readonly projection: GridProjection<Row, keyof Specs & string>
    }
  >()
  /** The grid as presented: the rows through the column state in the Model. */
  const project = (
    rows: RowModel<Row>,
    state: Model['columns'],
  ): GridProjection<Row, keyof Specs & string> => {
    const cached = projections.get(rows)
    if (cached !== undefined && cached.state === state) return cached.projection
    const projection = GridProjection.make({ rows, columns: options.columns, layout: state })
    projections.set(rows, { state, projection })
    return projection
  }

  return {
    id: options.id,
    MenuItem,
    menuItems,
    columns: options.columns,
    rowSelection: options.rowSelection,
    cellSelection: options.cellSelection === true,
    focus,
    columnState,
    project,
    Out,
    Model,
    Message,
    bundle,
  }
}

export const DataGrid = { make }

/** What `DataGrid.make` returns for these columns: the grid a view draws. */
export type DataGridOf<Row, Specs extends Record<string, ColumnSpec<Row, unknown>>> = ReturnType<
  typeof make<Row, Specs>
>
