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

/** Layout constants: per-row estimate, inter-row gap, and end padding. */
export interface VirtualLayout {
  readonly estimatedHeight: number
  readonly gap: number
  readonly paddingStart: number
  readonly paddingEnd: number
}

const saneHeight = (height: number, estimatedHeight: number): number =>
  Number.isFinite(height) && height >= 0 ? height : estimatedHeight

const heightAt = (
  index: number,
  heights: Readonly<Record<string, number>>,
  keys: ReadonlyArray<string>,
  layout: VirtualLayout,
): number => {
  const key = keys[index]
  if (key === undefined) return layout.estimatedHeight
  return saneHeight(heights[key] ?? layout.estimatedHeight, layout.estimatedHeight)
}

/** Total scrollable height: padding, measured rows, estimates, and gaps. */
export const totalHeight = (
  keys: ReadonlyArray<string>,
  heights: Readonly<Record<string, number>>,
  layout: VirtualLayout,
): number => {
  let total = layout.paddingStart + layout.paddingEnd
  for (let index = 0; index < keys.length; index++) {
    total += heightAt(index, heights, keys, layout)
    if (index < keys.length - 1) total += layout.gap
  }
  return total
}

/** Pixel offset of a row's top edge: padding plus the prefix before it. */
export const offsetFor = (
  index: number,
  keys: ReadonlyArray<string>,
  heights: Readonly<Record<string, number>>,
  layout: VirtualLayout,
): number => {
  const clamped = Math.max(0, Math.min(index, keys.length))
  let offset = layout.paddingStart
  for (let i = 0; i < clamped; i++) {
    offset += heightAt(i, heights, keys, layout) + layout.gap
  }
  return offset
}

/**
 * Which rows to render for a scroll position: the rows intersecting
 * `[scrollTop, scrollTop + viewportHeight)`, widened by `overscan` on both
 * sides and clamped to `[0, count]`. Gaps and padding are dead space — no
 * row — so boxes are tested, not cumulative coverage. An overscan of zero
 * renders exactly the visible rows.
 */
export const visibleRange = (
  keys: ReadonlyArray<string>,
  heights: Readonly<Record<string, number>>,
  layout: VirtualLayout,
  scrollTop: number,
  viewportHeight: number,
  overscan: number,
): VirtualWindow => {
  const count = keys.length
  if (count === 0 || viewportHeight <= 0) return { start: 0, end: 0 }
  const top = Math.max(0, scrollTop)
  const bottom = top + viewportHeight
  let start = 0
  let offset = layout.paddingStart
  for (let index = 0; index < count; index++) {
    const height = heightAt(index, heights, keys, layout)
    if (offset + height <= top) {
      start = index + 1
      offset += height + layout.gap
    } else {
      break
    }
  }
  let end = start
  let cursor = offset
  while (end < count && cursor < bottom) {
    cursor += heightAt(end, heights, keys, layout) + layout.gap
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
  scrolling: Schema.Boolean,
  generation: Schema.Number,
  estimatedHeight: Schema.Number,
  overscan: Schema.Number,
  gap: Schema.Number,
  paddingStart: Schema.Number,
  paddingEnd: Schema.Number,
})
export type VirtualModel = typeof VirtualModel.Type

export const VirtualMessage = defineMessageUnion({
  Scrolled: { top: Schema.Number },
  Measured: { key: Schema.String, height: Schema.Number },
  /** Drops heights for keys no longer listed: the bundle never sees the key
    order, so the application tells it what left. */
  Prune: { keys: Schema.Array(Schema.String) },
  /** Fires when scrolling has been silent for `settleMs`: only the latest
    generation counts, so a fling's intermediate timers emit nothing. */
  Settled: { generation: Schema.Number },
})
export type VirtualMessage = typeof VirtualMessage.Type

const layoutOf = (model: VirtualModel): VirtualLayout => ({
  estimatedHeight: model.estimatedHeight,
  gap: model.gap,
  paddingStart: model.paddingStart,
  paddingEnd: model.paddingEnd,
})

/**
 * The rows to render plus the spacer height, from the Model, the key order,
 * and the viewport height. Layout and overscan come from the Model, so the
 * call cannot disagree with the placement. Keys stay the application's:
 * render each row keyed, and per-row placements keep identity.
 */
export const windowFor = (
  model: VirtualModel,
  keys: ReadonlyArray<string>,
  viewportHeight: number,
): VirtualWindow & { readonly totalHeight: number } => {
  const layout = layoutOf(model)
  const window = visibleRange(
    keys,
    model.heights,
    layout,
    model.scrollTop,
    viewportHeight,
    model.overscan,
  )
  return { ...window, totalHeight: totalHeight(keys, model.heights, layout) }
}

/**
 * Pixels from the viewport's bottom edge to the content's end: negative
 * past it, zero exactly there. Prefetch thresholds want this number ("load
 * when within 500px"), not just the boolean below.
 */
export const distanceToEnd = (
  model: VirtualModel,
  keys: ReadonlyArray<string>,
  viewportHeight: number,
): number => {
  const total = totalHeight(keys, model.heights, layoutOf(model))
  return total - (model.scrollTop + viewportHeight)
}

/**
 * Whether the viewport rests at (or past) the end, within `threshold`
 * pixels: the infinite-scroll check. An empty list counts as ended — there
 * is nothing to scroll, so more should load. Thresholds below zero clamp
 * to zero.
 */
export const isAtEnd = (
  model: VirtualModel,
  keys: ReadonlyArray<string>,
  viewportHeight: number,
  threshold = 0,
): boolean => {
  const total = totalHeight(keys, model.heights, layoutOf(model))
  if (total <= 0) return true
  return distanceToEnd(model, keys, viewportHeight) <= Math.max(0, threshold)
}

const saneTop = (top: number): number | null => (Number.isFinite(top) ? Math.max(0, top) : null)

const saneMeasured = (height: number): number | null =>
  Number.isFinite(height) && height >= 0 ? height : null

export const Virtual = Bundle.make<
  'Virtual',
  VirtualModel,
  VirtualMessage,
  {
    readonly estimatedHeight: number
    readonly overscan: number
    readonly gap: number
    readonly paddingStart: number
    readonly paddingEnd: number
    readonly settleMs?: number | undefined
    readonly initialScrollTop?: number | undefined
    readonly initialHeights?: Readonly<Record<string, number>> | undefined
  }
>('Virtual', {
  Model: VirtualModel,
  Message: VirtualMessage,
  args: Schema.Struct({
    estimatedHeight: Schema.Number.pipe(
      Schema.check(Schema.isGreaterThan(0)),
      Schema.check(Schema.isFinite()),
    ),
    overscan: Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0))),
    gap: Schema.Number.pipe(
      Schema.check(Schema.isGreaterThanOrEqualTo(0)),
      Schema.check(Schema.isFinite()),
    ),
    paddingStart: Schema.Number.pipe(
      Schema.check(Schema.isGreaterThanOrEqualTo(0)),
      Schema.check(Schema.isFinite()),
    ),
    paddingEnd: Schema.Number.pipe(
      Schema.check(Schema.isGreaterThanOrEqualTo(0)),
      Schema.check(Schema.isFinite()),
    ),
    settleMs: Schema.optional(
      Schema.Number.pipe(Schema.check(Schema.isGreaterThan(0)), Schema.check(Schema.isFinite())),
    ),
    initialScrollTop: Schema.optional(
      Schema.Number.pipe(
        Schema.check(Schema.isGreaterThanOrEqualTo(0)),
        Schema.check(Schema.isFinite()),
      ),
    ),
    initialHeights: Schema.optional(Schema.Record(Schema.String, Schema.Number)),
  }),
  init: args => {
    // Restored measurements pass through the same sanitation as live ones,
    // so a poisoned cache cannot wedge the sums.
    const heights: Record<string, number> = {}
    for (const [key, height] of Object.entries(args.initialHeights ?? {})) {
      const sane = saneMeasured(height)
      if (sane !== null) heights[key] = sane
    }
    return {
      model: {
        scrollTop: args.initialScrollTop ?? 0,
        heights,
        scrolling: false,
        generation: 0,
        estimatedHeight: args.estimatedHeight,
        overscan: args.overscan,
        gap: args.gap,
        paddingStart: args.paddingStart,
        paddingEnd: args.paddingEnd,
      },
    }
  },
  update: (model, message, args) =>
    VirtualMessage.match<Update.ReturnWithOutMessage<VirtualModel, VirtualMessage, never>>(
      message,
      {
        Scrolled: ({ top }) => {
          const sane = saneTop(top)
          if (sane === null) return { model }
          const generation = model.generation + 1
          return {
            model: { ...model, scrollTop: sane, scrolling: true, generation },
            commands: [
              {
                name: 'Virtual.settle',
                args: { generation },
                effect: Effect.as(
                  Effect.sleep(args.settleMs ?? 150),
                  VirtualMessage.Settled({ generation }),
                ),
              },
            ],
          }
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
        // A superseded silence timer carries an old generation: ignore it.
        Settled: ({ generation }) =>
          generation === model.generation ? { model: { ...model, scrolling: false } } : { model },
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

/**
 * Which section header sticks for a window: the last section starting at
 * or before the first rendered row, or null above the first section. Order
 * independent — the scan takes the maximum, so unsorted input still
 * answers. CSS `position: sticky` does the sticking; this answers *what*
 * sticks, for styling and callbacks.
 */
export const stickyHeader = (
  sections: ReadonlyArray<{ readonly key: string; readonly index: number }>,
  startIndex: number,
): string | null => {
  let current: string | null = null
  let currentIndex = -1
  for (const section of sections) {
    if (section.index <= startIndex && section.index > currentIndex) {
      current = section.key
      currentIndex = section.index
    }
  }
  return current
}

export interface MasonryPlacement {
  readonly key: string
  readonly column: number
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/**
 * Masonry layout as a pure function: fixed column count and width, each
 * item packed into the currently shortest column. Unmeasured items use the
 * estimate; poisoned heights fall back the same way. This is layout only,
 * not windowing — every placed item renders, so it fits hundreds of images,
 * not hundred-thousands. Needing a windowed grid is a different algorithm.
 */
export const masonry = (
  keys: ReadonlyArray<string>,
  heights: Readonly<Record<string, number>>,
  options: {
    readonly columns: number
    readonly columnWidth: number
    readonly gap: number
    readonly estimatedHeight: number
  },
): { readonly placements: ReadonlyArray<MasonryPlacement>; readonly totalHeight: number } => {
  if (!Number.isInteger(options.columns) || options.columns < 1) {
    throw new Error(`masonry: columns must be a positive integer, got ${options.columns}`)
  }
  if (!(options.columnWidth > 0) || !Number.isFinite(options.columnWidth)) {
    throw new Error(
      `masonry: columnWidth must be a positive finite number, got ${options.columnWidth}`,
    )
  }
  if (options.gap < 0 || !Number.isFinite(options.gap)) {
    throw new Error(`masonry: gap must be a non-negative finite number, got ${options.gap}`)
  }
  if (options.estimatedHeight < 0 || !Number.isFinite(options.estimatedHeight)) {
    throw new Error(
      `masonry: estimatedHeight must be a non-negative finite number, got ${options.estimatedHeight}`,
    )
  }
  const columnHeights: Array<number> = new Array(options.columns).fill(0)
  const placements: Array<MasonryPlacement> = []
  for (const key of keys) {
    const raw = heights[key] ?? options.estimatedHeight
    const height = Number.isFinite(raw) && raw >= 0 ? raw : options.estimatedHeight
    let column = 0
    for (let c = 1; c < columnHeights.length; c++) {
      if (columnHeights[c]! < columnHeights[column]!) column = c
    }
    placements.push({
      key,
      column,
      x: column * (options.columnWidth + options.gap),
      y: columnHeights[column]!,
      width: options.columnWidth,
      height,
    })
    columnHeights[column] = columnHeights[column]! + height + options.gap
  }
  return {
    placements,
    totalHeight: placements.length === 0 ? 0 : Math.max(...columnHeights) - options.gap,
  }
}
