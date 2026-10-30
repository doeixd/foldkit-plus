/**
 * A virtual list that scrolls with the window: it draws the rows in view of
 * the document's viewport, and spacers as tall as the rest, so a list of
 * thousands below a header and above a footer costs what thirty rows do,
 * while the page keeps its own scrolling. Nothing in it scrolls: the
 * browser restores the document's offset on back and reload, a `sticky`
 * header above it sticks, and the page's keys (Space, End) move it.
 *
 * ```text
 * WindowViewport (on root) -> Placed { top, height } -> update -> viewport
 * MeasureRows (on root)    -> Measured { rows }      -> update -> heights
 * view: windowOf(model, keys) -> start spacer, rows [start, end), end spacer
 * ```
 *
 * `top` is how far the viewport's top is past the list's, so content above
 * the list, or growing above it, is read every time and never assumed. A
 * row's height is its border box, measured once drawn; until then it is
 * `estimatedHeight`. A row is drawn `display: flow-root`, so space rows with
 * padding, not margins. `@foldkit/ui`'s `VirtualList` is the list in a box
 * of its own.
 */
import { Schema } from 'effect'
import { Capability, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Mount from 'foldkit/mount'
import { modifyFields } from 'foldkit/struct'
import {
  MeasureRows,
  offsetFor,
  totalHeight,
  visibleRange,
  WindowViewport,
  type VirtualLayout,
  type VirtualWindow,
} from 'foldkit-primitives/state'
import type { MixinList } from './resolve.js'

export const WindowListSlots = Slots.define({
  /** The list, in the page's flow, as tall as every row. */
  root: Slot.make({ capability: Capability.Container }),
  /** The room the rows not drawn take, at each end (`data-edge`). */
  spacer: Slot.make({ capability: Capability.Container }),
  row: Slot.make({ capability: Capability.Container }),
})

export const Model = Schema.Struct({
  id: Schema.String,
  /** A row's height until it is measured, in pixels. */
  estimatedHeight: Schema.Number,
  /** Rows drawn beyond the viewport at each end. */
  overscan: Schema.Number,
  /** Measured border-box heights, by row key. */
  heights: Schema.Record(Schema.String, Schema.Number),
  /** Where the viewport lies over the list: its top past the list's top, and its height. */
  viewport: Schema.Struct({ top: Schema.Number, height: Schema.Number }),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  Placed: { top: Schema.Number, height: Schema.Number },
  /** The rows drawn or resized since the last report, border boxes. */
  Measured: { rows: Schema.Array(Schema.Struct({ key: Schema.String, height: Schema.Number })) },
})
export type Message = typeof Message.Type

export interface InitConfig {
  /** The list's id, unique in the document. */
  readonly id: string
  /** A row's height until it is measured, in pixels. */
  readonly estimatedHeight: number
  /** Rows drawn beyond the viewport at each end. Default 5. */
  readonly overscan?: number
  /**
   * The viewport's height assumed before the list is mounted, on a server and
   * in the first frame, where the viewport is taken to start at the list.
   * Default 1000.
   */
  readonly viewportHeight?: number
}

/** A list with nothing measured. Throws on an estimate that is not above 0 or an overscan below 0. */
export const init = (config: InitConfig): Model => {
  const overscan = config.overscan ?? 5
  if (!(config.estimatedHeight > 0 && Number.isFinite(config.estimatedHeight))) {
    throw new Error(
      `WindowList ${config.id}: estimatedHeight must be above 0, given ${config.estimatedHeight}`,
    )
  }
  if (!Number.isInteger(overscan) || overscan < 0) {
    throw new Error(`WindowList ${config.id}: overscan must be a whole number, given ${overscan}`)
  }
  return {
    id: config.id,
    estimatedHeight: config.estimatedHeight,
    overscan,
    heights: {},
    viewport: { top: 0, height: config.viewportHeight ?? 1000 },
  }
}

/** The list after `message`; the same Model when nothing changes. */
export const update = (model: Model, message: Message): { readonly model: Model } =>
  Message.match(message, {
    Placed: ({ top, height }) =>
      top === model.viewport.top && height === model.viewport.height
        ? { model }
        : { model: modifyFields(model, { viewport: () => ({ top, height }) }) },
    Measured: ({ rows }) => {
      // A poisoned reading is ignored; a row drawn again reports the height held.
      const changed = rows.filter(
        ({ key, height }) =>
          Number.isFinite(height) &&
          height >= 0 &&
          !(Object.hasOwn(model.heights, key) && model.heights[key] === height),
      )
      return changed.length === 0
        ? { model }
        : {
            model: modifyFields(model, {
              heights: heights =>
                Object.fromEntries([
                  ...Object.entries(heights),
                  ...changed.map(({ key, height }) => [key, height] as const),
                ]),
            }),
          }
    },
  })

/** The Model without the heights of rows no longer in `keys`; the same Model when none left. */
export const keep = (model: Model, keys: ReadonlyArray<string>): Model => {
  const kept = new Set(keys)
  const entries = Object.entries(model.heights)
  const held = entries.filter(([key]) => kept.has(key))
  return held.length === entries.length
    ? model
    : modifyFields(model, { heights: () => Object.fromEntries(held) })
}

const layoutOf = (model: Model): VirtualLayout => ({
  estimatedHeight: model.estimatedHeight,
  gap: 0,
  paddingStart: 0,
  paddingEnd: 0,
})

/**
 * The rows drawn, `[start, end)`: those the viewport overlaps, and
 * `overscan` more at each end. Keep `keys` between calls: the offsets are
 * cached by its identity.
 */
export const windowOf = (model: Model, keys: ReadonlyArray<string>): VirtualWindow =>
  visibleRange(
    keys,
    model.heights,
    layoutOf(model),
    model.viewport.top,
    // The part of the viewport below the list's top. A pixel at least, so a
    // list wholly above or below the viewport keeps its overscan at that end.
    Math.max(1, model.viewport.height + Math.min(0, model.viewport.top)),
    model.overscan,
  )

export type WindowListView<Item, Outer> = Readonly<{
  model: Model
  items: ReadonlyArray<Item>
  /** A key that stays with the item as the list changes. */
  itemToKey: (item: Item, index: number) => string
  /** A row's content, drawn in its `row` slot. */
  itemToView: (item: Item, index: number) => Html
  onMessage: (message: Message) => NoInfer<Outer>
  /** Names the list for assistive technology. */
  label?: string | undefined
  /** A style of `WindowListSlots`. */
  style?: NamedStyle<typeof WindowListSlots> | undefined
  /** Mixins beside the style. */
  mixins?: MixinList<Outer> | undefined
}>

/** The attribute naming a row's key, which `MeasureRows` files its height under. */
const ROW_KEY = 'data-window-list-key'

// The keys of an items array, kept while the array and its key function are,
// so the offsets table built from them is reused from one scroll to the next.
const keysCache = new WeakMap<
  ReadonlyArray<unknown>,
  { readonly itemToKey: unknown; readonly keys: ReadonlyArray<string> }
>()

const keysOf = <Item>(
  items: ReadonlyArray<Item>,
  itemToKey: (item: Item, index: number) => string,
): ReadonlyArray<string> => {
  const cached = keysCache.get(items)
  if (cached !== undefined && cached.itemToKey === itemToKey) return cached.keys
  const keys = items.map(itemToKey)
  keysCache.set(items, { itemToKey, keys })
  return keys
}

/** The list: the rows in view of the window, between spacers as tall as the rest. */
export const view = <Item, Outer>(
  options: WindowListView<Item, Outer>,
  h: HtmlBuilder<Outer>,
): Html => {
  const { model, items, itemToView, onMessage } = options
  const builders = SlotView.buildersFor(
    WindowListSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const keys = keysOf(items, options.itemToKey)
  const { start, end } = windowOf(model, keys)
  const layout = layoutOf(model)
  const startHeight = offsetFor(start, keys, model.heights, layout)
  const endHeight =
    totalHeight(keys, model.heights, layout) - offsetFor(end, keys, model.heights, layout)
  const spacer = (edge: 'start' | 'end', height: number) =>
    h.keyed('div')(
      `${model.id}-${edge}`,
      builders.spacer.attrs([
        h.DataAttribute('edge', edge),
        h.AriaHidden(true),
        h.Style({ blockSize: `${height}px` }),
      ]),
      [],
    )
  return h.div(
    builders.root.attrs([
      h.Id(model.id),
      h.Role('list'),
      ...(options.label === undefined ? [] : [h.AriaLabel(options.label)]),
      h.OnMount(
        Mount.mapMessage(WindowViewport(), ({ top, height }) =>
          onMessage(Message.Placed({ top, height })),
        ),
      ),
      h.OnMount(
        Mount.mapMessage(MeasureRows({ attribute: ROW_KEY }), ({ rows }) =>
          onMessage(Message.Measured({ rows })),
        ),
      ),
    ]),
    [
      spacer('start', startHeight),
      ...keys.slice(start, end).map((key, offset) => {
        const index = start + offset
        return h.keyed('div')(
          key,
          builders.row.attrs([
            h.Role('listitem'),
            h.Attribute(ROW_KEY, key),
            h.AriaPosinset(index + 1),
            h.AriaSetsize(items.length),
            // A child's margin collapsing through the row would escape its measure.
            h.Style({ display: 'flow-root' }),
          ]),
          [itemToView(items[index]!, index)],
        )
      }),
      spacer('end', endHeight),
    ],
  )
}
