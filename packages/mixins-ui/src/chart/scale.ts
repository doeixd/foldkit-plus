/**
 * A chart's geometry, pure: the value axis's ticks and where a value, a
 * category or a donut's slice lies, as percentages of the plot (or units of
 * a donut's circle). The plot is drawn in percentages, so it fills any width
 * with nothing measured, and a server draws what the browser does.
 */

/** Rid of the float noise of a sum or a product: `0.3`, not `0.30000000000000004`. */
const tidy = (value: number): number => Number(value.toFixed(6))

/** A round step near `span / count`: 1, 2 or 5 times a power of ten, as d3 and Plot pick it. */
const stepOf = (span: number, count: number): number => {
  const rough = span / count
  const power = 10 ** Math.floor(Math.log10(rough))
  const error = rough / power
  if (error >= Math.sqrt(50)) return power * 10
  if (error >= Math.sqrt(10)) return power * 5
  if (error >= Math.sqrt(2)) return power * 2
  return power
}

/**
 * The value axis for values from `low` to `high`, zero included (a bar's
 * length is its value only from zero): about `count` round ticks, the
 * first at or below the least value and the last at or above the greatest.
 * The axis runs from the first tick to the last, so every tick names a value
 * on it and the greatest value reaches as high as a tick allows.
 */
export const ticksOf = (low: number, high: number, count = 5): ReadonlyArray<number> => {
  const from = Math.min(0, low)
  const to = Math.max(0, high)
  // All zero (or nothing) still draws an axis: one step above zero.
  const step = stepOf(to > from ? to - from : 1, count)
  const first = Math.floor(tidy(from / step))
  const last = Math.max(first + 1, Math.ceil(tidy(to / step)))
  return Array.from({ length: last - first + 1 }, (_, at) => tidy((first + at) * step))
}

/** Where `value` lies down the plot, as a percentage from its top, for an axis of `ticks`. */
export const yOf = (ticks: ReadonlyArray<number>, value: number): number => {
  const bottom = ticks[0] ?? 0
  const top = ticks[ticks.length - 1] ?? 1
  return tidy(((top - value) / (top - bottom)) * 100)
}

/** Each category's band, as a percentage of the plot's width: its start and its width. */
export const bandOf = (count: number, at: number) => {
  const width = 100 / Math.max(1, count)
  return { start: tidy(at * width), width: tidy(width), middle: tidy((at + 0.5) * width) }
}

/** The share of a band its bars take; the rest is the space between groups. */
const GROUP = 0.8

/** Bar `series` of `of` in category `at` of `count`: its start and width, in percent. */
export const barOf = (count: number, at: number, series: number, of: number) => {
  const band = bandOf(count, at)
  const width = (band.width * GROUP) / Math.max(1, of)
  return {
    start: tidy(band.start + (band.width * (1 - GROUP)) / 2 + width * series),
    width: tidy(width),
  }
}

/** A line through `values`, one point mid-band each, in a 100 by 100 box. */
export const lineOf = (ticks: ReadonlyArray<number>, values: ReadonlyArray<number>): string =>
  values
    .map(
      (value, at) =>
        `${at === 0 ? 'M' : 'L'}${bandOf(values.length, at).middle} ${yOf(ticks, value)}`,
    )
    .join('')

/** The line closed down to zero (or the axis's end nearest it): the area under it. */
export const areaOf = (ticks: ReadonlyArray<number>, values: ReadonlyArray<number>): string => {
  if (values.length === 0) return ''
  const base = yOf(ticks, Math.min(Math.max(0, ticks[0] ?? 0), ticks[ticks.length - 1] ?? 0))
  const first = bandOf(values.length, 0).middle
  const last = bandOf(values.length, values.length - 1).middle
  return `${lineOf(ticks, values)}L${last} ${base}L${first} ${base}Z`
}

/** How far into a donut's ring its hole reaches, of the radius 1. */
export const HOLE = 0.62

const pointAt = (radius: number, turn: number) => {
  // From the top, clockwise: a turn of 0 is twelve o'clock.
  const angle = turn * 2 * Math.PI - Math.PI / 2
  return `${tidy(radius * Math.cos(angle))} ${tidy(radius * Math.sin(angle))}`
}

/** A ring segment from turn `from` to `to` (0 to 1), in a circle of radius 1 about 0, 0. */
const segment = (from: number, to: number): string => {
  const large = to - from > 0.5 ? 1 : 0
  return [
    `M${pointAt(1, from)}`,
    `A1 1 0 ${large} 1 ${pointAt(1, to)}`,
    `L${pointAt(HOLE, to)}`,
    `A${HOLE} ${HOLE} 0 ${large} 0 ${pointAt(HOLE, from)}`,
    'Z',
  ].join('')
}

/**
 * Each value's segment of a donut, in order from the top, clockwise, sized
 * by its share of the total; a value of zero or less draws nothing. A whole
 * ring is drawn as two halves, since an arc cannot end where it starts.
 */
export const slicesOf = (values: ReadonlyArray<number>): ReadonlyArray<string> => {
  const total = values.reduce((sum, value) => sum + Math.max(0, value), 0)
  let turned = 0
  return values.map(value => {
    if (value <= 0 || total <= 0) return ''
    const from = turned
    turned += value / total
    if (value === total) return segment(0, 0.5) + segment(0.5, 1)
    return segment(from, turned)
  })
}
