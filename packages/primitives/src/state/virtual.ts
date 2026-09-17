/**
 * Windowing math for virtualized lists as pure functions: which rows to
 * render, how tall the scrollable area is, and where each row starts. Row
 * heights come from measured values with a per-row estimate fallback, so
 * unmeasured rows still occupy space and measuring later only corrects.
 * Keys are strings; heights are non-negative, and non-finite measurements
 * fall back to the estimate instead of poisoning the sums.
 */

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
