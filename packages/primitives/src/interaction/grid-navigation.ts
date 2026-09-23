/**
 * Two-dimensional arrow keys over a set of items laid out in rows of
 * `columns` (a calendar grid, a color swatch picker, an emoji palette). The
 * Model slice is the current item's id, as with `RovingTabindex`, so a
 * reorder keeps the same item current. Which cell a key lands on is the pure
 * `move`; the Behavior wires it to a container slot and a per-item slot and
 * shares `RovingTabindex`'s item attributes, so the two are interchangeable
 * on a view.
 */
import { Option, Schema } from 'effect'
import type { HtmlBuilder, KeyboardModifiers } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle, type Declared } from 'foldkit-bundle'
import { Behavior, Behaviors, Capability, type SlotItem } from 'foldkit-mixins'
import * as RovingTabindex from './roving-tabindex.js'

export const Model = Schema.Struct({
  /** The current cell's id, or `null` before any cell has been focused. */
  current: Schema.NullOr(Schema.String),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  /** A cell became current: the user focused it, or a key moved there. */
  Focused: { id: Schema.String },
})
export type Message = typeof Message.Type

export const Args = Schema.Struct({
  /** Cells per row; the last row may be short. */
  columns: Schema.Number.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(1))),
  /** Left and right continue into the previous and next row; up and down
   *  continue into the previous and next column. Off, they stop at the edge. */
  wrap: Schema.Boolean,
  /** Keep DOM focus on the container and point at the current cell with
   *  `aria-activedescendant` instead of moving focus. */
  virtual: Schema.Boolean,
})
export type Args = typeof Args.Type

export const bundle = Bundle.make('GridNavigation', {
  Model,
  Message,
  args: Args,
  init: () => ({ model: { current: null } }),
  update: (_model, message) => ({ model: { current: message.id } }),
})

export interface MoveOptions {
  readonly columns: number
  readonly wrap: boolean
  readonly direction: RovingTabindex.Direction
}

/**
 * The index the key moves to from `current` over a grid of `count` cells in
 * rows of `columns`, skipping cells not in `enabled`, or `undefined` when the
 * key is not a grid key. Left and right step within the row, and across rows
 * under `wrap`; up and down step within the column, and across columns under
 * `wrap`. Home and End are the row's first and last enabled cell; with Ctrl
 * they are the grid's. At an edge without `wrap` the key is consumed and
 * `current` is returned. From `-1` (nothing current) a forward key lands on
 * the first enabled cell and a backward key on the last. Under `rtl`, left
 * and right swap.
 */
export const move = (
  enabled: ReadonlyArray<number>,
  count: number,
  current: number,
  key: string,
  modifiers: KeyboardModifiers,
  options: MoveOptions,
): number | undefined => {
  if (enabled.length === 0 || modifiers.altKey || modifiers.metaKey) return undefined
  const first = enabled[0]!
  const last = enabled[enabled.length - 1]!
  const isEnabled = (index: number) => enabled.includes(index)
  const { columns } = options
  const row = (index: number) => Math.floor(index / columns)

  if (key === 'Home' || key === 'End') {
    if (modifiers.ctrlKey || current === -1) return key === 'Home' ? first : last
    const inRow = enabled.filter(index => row(index) === row(current))
    return key === 'Home' ? (inRow[0] ?? current) : (inRow[inRow.length - 1] ?? current)
  }
  if (modifiers.ctrlKey) return undefined

  const forwardKey = options.direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight'
  const backwardKey = options.direction === 'rtl' ? 'ArrowRight' : 'ArrowLeft'
  const axis: 'row' | 'column' | undefined =
    key === forwardKey || key === backwardKey
      ? 'row'
      : key === 'ArrowDown' || key === 'ArrowUp'
        ? 'column'
        : undefined
  if (axis === undefined) return undefined
  const step = key === forwardKey || key === 'ArrowDown' ? 1 : -1
  if (current === -1) return step === 1 ? first : last

  if (axis === 'row') {
    // Reading order; without wrap the walk stops at the row's edge.
    for (let index = current + step; index >= 0 && index < count; index += step) {
      if (!options.wrap && row(index) !== row(current)) return current
      if (isEnabled(index)) return index
    }
    return current
  }
  // Column-major; without wrap the walk stops at the column's edge.
  const column = current % columns
  for (let index = current + step * columns; ; index += step * columns) {
    if (index < 0 || index >= count) {
      if (!options.wrap) return current
      const nextColumn = column + step
      if (nextColumn < 0 || nextColumn >= columns) return current
      // Continue from the top (or bottom) of the neighbouring column.
      const start =
        step === 1
          ? nextColumn
          : nextColumn + columns * Math.floor((count - 1 - nextColumn) / columns)
      for (let next = start; next >= 0 && next < count; next += step * columns) {
        if (isEnabled(next)) return next
      }
      return current
    }
    if (isEnabled(index)) return index
  }
}

export interface BehaviorOptions<Input, Slots> {
  /** The slot that receives the arrow keys. */
  readonly container: keyof Slots & string
  /** The slot rendered once per cell; must carry the cell's id (see `Behaviors.Collection`). */
  readonly item: keyof Slots & string
  readonly items: (input: Input) => Behaviors.Collection.Items<unknown>
  /** Default `'ltr'`; return `'rtl'` to swap left and right. */
  readonly direction?: (input: Input) => RovingTabindex.Direction
}

/**
 * Wires a placed `GridNavigation` to the slots exactly as `RovingTabindex`
 * does, with `move` above deciding the cell: the container's arrows, Home and
 * End focus the next cell (synchronously, then dispatch) or, under `virtual`,
 * only dispatch and point with `aria-activedescendant`; each cell gets
 * `tabindex` 0 or -1 and reports `Focused` when focused.
 */
export const behavior =
  <Field extends string>(declared: Declared<typeof bundle, Field>, args: Args) =>
  <Slots>(slots: Slots) =>
  <Input extends { readonly [K in Field]: Model }, ParentMessage>(
    options: BehaviorOptions<Input, Slots>,
  ): Behavior.NamedBehavior<Slots, Input, ParentMessage> => {
    const wrap = (id: string): ParentMessage =>
      declared.wrapper.make(Message.Focused({ id })) as unknown as ParentMessage
    const slice = (input: Input): Model => input[declared.field]
    return Behavior.forSlots(slots)<Input, ParentMessage>(
      {
        [options.container]: Behavior.slot({
          requires: { capability: Capability.Interactive },
          attributes: ({
            input,
            h,
          }: {
            readonly input: Input
            readonly h: HtmlBuilder<ParentMessage>
          }) => {
            const items = options.items(input)
            const current = slice(input).current
            const from = current === null ? -1 : items.indexOf(current)
            const direction = options.direction?.(input) ?? 'ltr'
            const stop = RovingTabindex.tabStop(items, current)
            const stopId = stop === -1 ? undefined : items.ids[stop]
            const target = (key: string, modifiers: KeyboardModifiers): string | undefined => {
              const next = move(items.enabled, items.size, from, key, modifiers, {
                columns: args.columns,
                wrap: args.wrap,
                direction,
              })
              return next === undefined ? undefined : items.ids[next]
            }
            if (args.virtual) {
              return [
                h.OnKeyDownPreventDefault((key, modifiers) =>
                  Option.map(Option.fromNullishOr(target(key, modifiers)), wrap),
                ),
                ...(stopId === undefined ? [] : [h.AriaActiveDescendant(stopId)]),
              ]
            }
            return [
              h.OnKeyDownFocus((key, modifiers) =>
                Option.map(Option.fromNullishOr(target(key, modifiers)), id => ({
                  focusSelector: RovingTabindex.idSelector(id),
                  message: wrap(id),
                })),
              ),
            ]
          },
        }),
        [options.item]: Behavior.slot({
          requires: { capability: Capability.Focusable },
          attributes: ({
            input,
            h,
            item,
          }: {
            readonly input: Input
            readonly h: HtmlBuilder<ParentMessage>
            readonly item?: SlotItem
          }) => {
            if (item === undefined) return []
            return RovingTabindex.itemAttributes(
              h,
              options.items(input),
              slice(input).current,
              item,
              args.virtual,
              wrap,
            )
          },
        }),
        // Keyed by values the caller chose; `forSlots` checks both keys exist.
      } as unknown as Behavior.BehaviorSpec<Slots, Input, ParentMessage>,
      { name: 'GridNavigation' },
    )
  }
