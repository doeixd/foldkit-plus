/**
 * Windowing math for virtualized lists as pure functions: which rows to
 * render, how tall the scrollable area is, and where each row starts. Row
 * heights come from measured values with a per-row estimate fallback, so
 * unmeasured rows still occupy space and measuring later only corrects.
 * Keys are strings; heights are non-negative, and non-finite measurements
 * fall back to the estimate instead of poisoning the sums.
 *
 * The `Virtual` bundle below owns the scroll position and the measured
 * heights; `Viewport` reports container scrolls and `MeasureRow` reports
 * row heights, both as Mounts on the elements they observe. The application
 * renders `windowFor(...)` rows with its own views (keyed, so `each`
 * placements keep identity) inside a spacer of `totalHeight(...)`.
 */
import { Effect, Queue, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as Mount from 'foldkit/mount'
import type * as Update from 'foldkit/update'
import { Bundle } from 'foldkit-bundle'

export interface VirtualWindow {
  /** First visible row index, inclusive. */
  readonly start: number
  /** End row index, exclusive. */
  readonly end: number
}

const saneHeight = (height: number, estimatedHeight: number): number =>
  Number.isFinite(height) && height >= 0 ? height : estimatedHeight

const heightAt = (
  index: number,
  heights: Readonly<Record<string, number>>,
  keys: ReadonlyArray<string>,
  estimatedHeight: number,
): number => {
  const key = keys[index]
  if (key === undefined) return estimatedHeight
  return saneHeight(heights[key] ?? estimatedHeight, estimatedHeight)
}

/** Total scrollable height: measured rows plus estimates for the rest. */
export const totalHeight = (
  keys: ReadonlyArray<string>,
  heights: Readonly<Record<string, number>>,
  estimatedHeight: number,
): number => {
  let total = 0
  for (let index = 0; index < keys.length; index++) {
    total += heightAt(index, heights, keys, estimatedHeight)
  }
  return total
}

/** Pixel offset of a row's top edge: the prefix sum before it. */
export const offsetFor = (
  index: number,
  keys: ReadonlyArray<string>,
  heights: Readonly<Record<string, number>>,
  estimatedHeight: number,
): number => {
  const clamped = Math.max(0, Math.min(index, keys.length))
  let offset = 0
  for (let i = 0; i < clamped; i++) {
    offset += heightAt(i, heights, keys, estimatedHeight)
  }
  return offset
}

/**
 * Which rows to render for a scroll position: the rows intersecting
 * `[scrollTop, scrollTop + viewportHeight)`, widened by `overscan` on both
 * sides and clamped to `[0, count]`. An overscan of zero renders exactly
 * the visible rows; larger values pre-render scrolled-into content.
 */
export const visibleRange = (
  keys: ReadonlyArray<string>,
  heights: Readonly<Record<string, number>>,
  estimatedHeight: number,
  scrollTop: number,
  viewportHeight: number,
  overscan: number,
): VirtualWindow => {
  const count = keys.length
  if (count === 0 || viewportHeight <= 0) return { start: 0, end: 0 }
  const top = Math.max(0, scrollTop)
  let start = 0
  let offset = 0
  for (let index = 0; index < count; index++) {
    const height = heightAt(index, heights, keys, estimatedHeight)
    if (offset + height <= top) {
      start = index + 1
      offset += height
    } else {
      break
    }
  }
  let end = start
  let covered = offset
  while (end < count && covered < top + viewportHeight) {
    covered += heightAt(end, heights, keys, estimatedHeight)
    end += 1
  }
  return {
    start: Math.max(0, start - Math.max(0, overscan)),
    end: Math.min(count, end + Math.max(0, overscan)),
  }
}

export const VirtualModel = Schema.Struct({
  scrollTop: Schema.Number,
  heights: Schema.Record(Schema.String, Schema.Number),
})
export type VirtualModel = typeof VirtualModel.Type

export const VirtualMessage = defineMessageUnion({
  Scrolled: { top: Schema.Number },
  Measured: { key: Schema.String, height: Schema.Number },
  /** Drops heights for keys no longer listed: the bundle never sees the key
    order, so the application tells it what left. */
  Prune: { keys: Schema.Array(Schema.String) },
})
export type VirtualMessage = typeof VirtualMessage.Type

export interface WindowOptions {
  readonly estimatedHeight: number
  readonly overscan: number
}

/**
 * The rows to render plus the spacer height, from the Model, the key order,
 * the viewport height, and the placement options. Keys stay the
 * application's: render each row keyed, and per-row placements keep
 * identity.
 */
export const windowFor = (
  model: VirtualModel,
  keys: ReadonlyArray<string>,
  viewportHeight: number,
  options: WindowOptions,
): VirtualWindow & { readonly totalHeight: number } => {
  const window = visibleRange(
    keys,
    model.heights,
    options.estimatedHeight,
    model.scrollTop,
    viewportHeight,
    options.overscan,
  )
  return { ...window, totalHeight: totalHeight(keys, model.heights, options.estimatedHeight) }
}

const saneTop = (top: number): number | null => (Number.isFinite(top) ? Math.max(0, top) : null)

const saneMeasured = (height: number): number | null =>
  Number.isFinite(height) && height >= 0 ? height : null

export const Virtual = Bundle.make<
  'Virtual',
  VirtualModel,
  VirtualMessage,
  { readonly estimatedHeight: number; readonly overscan: number }
>('Virtual', {
  Model: VirtualModel,
  Message: VirtualMessage,
  args: Schema.Struct({
    estimatedHeight: Schema.Number.pipe(
      Schema.check(Schema.isGreaterThan(0)),
      Schema.check(Schema.isFinite()),
    ),
    overscan: Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0))),
  }),
  init: () => ({ model: { scrollTop: 0, heights: {} } }),
  update: (model, message) =>
    VirtualMessage.match<Update.ReturnWithOutMessage<VirtualModel, VirtualMessage, never>>(
      message,
      {
        Scrolled: ({ top }) => {
          const sane = saneTop(top)
          return sane === null ? { model } : { model: { ...model, scrollTop: sane } }
        },
        Measured: ({ key, height }) => {
          const sane = saneMeasured(height)
          return sane === null
            ? { model }
            : { model: { ...model, heights: { ...model.heights, [key]: sane } } }
        },
        Prune: ({ keys }) => {
          const kept = new Set(keys)
          const heights: Record<string, number> = {}
          for (const [key, height] of Object.entries(model.heights)) {
            if (kept.has(key)) heights[key] = height
          }
          return { model: { ...model, heights } }
        },
      },
    ),
})

export const ViewportScrolled = Schema.TaggedStruct('ViewportScrolled', { top: Schema.Number })
export type ViewportScrolled = typeof ViewportScrolled.Type

/**
 * The scroll container's position, reported on its own scrolls starting
 * with the current one. Attach to the scrolling element — viewport scrolls
 * arrive through the window-level scroll entry instead.
 */
export const Viewport = Mount.defineStream('Viewport', {
  messages: [ViewportScrolled],
  execute: ({ element }) => {
    // The mount needs only a scroll position, not a full Element.
    const read = (): ViewportScrolled => {
      const scroller = element as unknown as { readonly scrollTop: number }
      return ViewportScrolled.make({ top: scroller.scrollTop })
    }
    return Stream.concat(
      Stream.make(read()),
      Stream.fromEventListener(element, 'scroll').pipe(Stream.map(read)),
    )
  },
})

export const RowMeasured = Schema.TaggedStruct('RowMeasured', {
  key: Schema.String,
  height: Schema.Number,
})
export type RowMeasured = typeof RowMeasured.Type

type RowObserverCtor = new (callback: ResizeObserverCallback) => ResizeObserver

/**
 * One row's height, reported on every resize starting with the current
 * one. The key is the application's row identity, echoed back so the
 * parent files the height without tracking which Mount sent what.
 */
export const MeasureRow = Mount.defineStream('MeasureRow', {
  messages: [RowMeasured],
  args: { key: Schema.String },
  execute: ({ element, key }) =>
    Stream.callback<typeof RowMeasured.Type>(queue =>
      Effect.gen(function* () {
        const Observed = (globalThis as { ResizeObserver?: RowObserverCtor }).ResizeObserver
        if (Observed === undefined) return
        yield* Effect.acquireRelease(
          Effect.sync(() => {
            const observer = new Observed(entries => {
              const rect = entries[0]?.contentRect
              if (rect !== undefined) {
                Queue.offerUnsafe(queue, RowMeasured.make({ key, height: rect.height }))
              }
            })
            observer.observe(element)
            return observer
          }),
          observer => Effect.sync(() => observer.disconnect()),
        )
      }),
    ),
})
