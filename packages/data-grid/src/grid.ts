import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import type * as Update from 'foldkit/update'
import { Bundle } from 'foldkit-bundle'
import type { Columns, ColumnSpec } from './columns.js'
import { GridFocus } from './focus.js'
import { GridViewport } from './viewport.js'

const Offsets = Schema.Struct({ top: Schema.Number, left: Schema.Number })

/**
 * One grid's interaction state: focus and the viewport, as one Bundle. Its
 * update is the two parts' own, joined: a key that moves focus off screen
 * carries the scroll that reveals the cell, and the grid issues it.
 *
 * `id` names the grid in the DOM: the scroll container's id, and the prefix
 * of every cell's id (`GridFocus.cellId`).
 */
const make = <Row, Specs extends Record<string, ColumnSpec<Row, unknown>>>(options: {
  readonly id: string
  readonly columns: Columns<Row, Specs>
}) => {
  const focus = GridFocus.make(options.columns)
  const Model = Schema.Struct({ focus: focus.Model, viewport: GridViewport.Model })
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

  const bundle = Bundle.make('DataGrid', {
    Model,
    Message,
    init: () => ({
      model: {
        focus: focus.bundle.init(undefined).model,
        viewport: GridViewport.bundle.init(undefined).model,
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
      }),
  })
  return { id: options.id, columns: options.columns, focus, Model, Message, bundle }
}

export const DataGrid = { make }

/** What `DataGrid.make` returns for these columns: the grid a view draws. */
export type DataGridOf<Row, Specs extends Record<string, ColumnSpec<Row, unknown>>> = ReturnType<
  typeof make<Row, Specs>
>
