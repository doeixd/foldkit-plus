import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import type * as Update from 'foldkit/update'
import { Bundle } from 'foldkit-bundle'
import { ColumnState } from './columnState.js'
import type { Columns, ColumnSpec } from './columns.js'
import { GridFocus } from './focus.js'
import { GridProjection } from './projection.js'
import type { RowModel } from './rows.js'
import { GridViewport } from './viewport.js'

const Offsets = Schema.Struct({ top: Schema.Number, left: Schema.Number })

/**
 * One grid's interaction state: focus, the viewport and the column state, as
 * one Bundle. Its update is the parts' own, joined: a key that moves focus
 * off screen carries the scroll that reveals the cell, and the grid issues it.
 *
 * `id` names the grid in the DOM: the scroll container's id, and the prefix
 * of every cell's id (`GridFocus.cellId`).
 */
const make = <Row, Specs extends Record<string, ColumnSpec<Row, unknown>>>(options: {
  readonly id: string
  readonly columns: Columns<Row, Specs>
}) => {
  const focus = GridFocus.make(options.columns)
  const columnState = ColumnState.make(options.columns)
  const Column = focus.Address.fields.column
  const Model = Schema.Struct({
    focus: focus.Model,
    viewport: GridViewport.Model,
    columns: columnState.Model,
    /** A column being resized by the pointer, and its width when the drag began. */
    resizing: Schema.OptionFromNullOr(Schema.Struct({ column: Column, from: Schema.Number })),
  })
  const Region = Schema.Literals(['start', 'center', 'end'])
  type Model = typeof Model.Type
  const Message = defineMessageUnion({
    /** The pointer or the browser focused a cell. */
    Focused: { address: focus.Address },
    /**
     * A key moved focus. `reveal` is the scroll that brings the cell into
     * view, worked out by the view from the viewport it drew, or none when
     * the cell is shown.
     */
    Moved: { address: focus.Address, reveal: Schema.OptionFromNullOr(Offsets) },
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
  })
  type Message = typeof Message.Type
  type Return = Update.Return<Model, Message, never>

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

  const bundle = Bundle.make('DataGrid', {
    Model,
    Message,
    init: () => ({
      model: {
        focus: focus.bundle.init(undefined).model,
        viewport: GridViewport.bundle.init(undefined).model,
        columns: columnState.initial(),
        resizing: Option.none(),
      },
    }),
    update: (model: Model, message: Message): Return =>
      Message.match(message, {
        Focused: ({ address }): Return => ({ model: focusTo(model, address) }),
        Moved: ({ address, reveal }): Return => ({
          model: focusTo(model, address),
          commands: Option.match(reveal, {
            onNone: () => [],
            onSome: offsets => [GridViewport.scrollTo(options.id, offsets)],
          }),
        }),
        Measured: (fields): Return => ({
          model: viewportBy(model, GridViewport.Message.Measured(fields)),
        }),
        Revealed: (fields): Return => ({
          model: viewportBy(model, GridViewport.Message.Revealed(fields)),
        }),
        ColumnResized: ({ column, width }): Return => ({
          model: columnsBy(model, columnState.resize(model.columns, column, width)),
        }),
        ColumnHidden: ({ column }): Return => ({
          model: columnsBy(model, columnState.hide(model.columns, column)),
        }),
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
    columns: options.columns,
    focus,
    columnState,
    project,
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
