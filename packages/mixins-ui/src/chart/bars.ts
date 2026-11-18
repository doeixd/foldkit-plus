import { Option } from 'effect'
import { cartesian, spanOf, stacked, stackedSpanOf, type CartesianData } from './cartesian.js'
import { colorOf, pct, type ChartKind } from './kind.js'
import * as Scale from './scale.js'

/** What bars read beside the categories and series. */
export interface BarsData extends CartesianData {
  /** One bar per category with the series on top of each other, in place of side by side. */
  readonly stack?: boolean | undefined
}

/**
 * Bars: side by side per category, or stacked with `stack: true`. Pass it as
 * a chart's `kind`; a page that draws another kind ships none of this.
 */
export const bars: ChartKind<BarsData> = cartesian<BarsData>('bar', {
  extent: data => (data.stack === true ? stackedSpanOf(data) : spanOf(data)),
  marks: (data, plot, { h, builders, point }) => {
    const { series, categories } = data
    const edges = data.stack === true ? stacked(series, plot.count) : undefined
    return {
      marks: series.flatMap((each, place) =>
        categories.map((_, at) => {
          const [from, to] = edges?.[place]?.[at] ?? [0, each.values[at] ?? 0]
          const bar = Scale.barOf(
            plot.count,
            at,
            edges === undefined ? place : 0,
            edges === undefined ? series.length : 1,
          )
          const top = Math.min(plot.y(from), plot.y(to))
          return h.rect(
            builders.bar.attrs([
              h.X(pct(bar.start)),
              h.Y(pct(top)),
              h.Width(pct(bar.width)),
              h.Height(pct(Math.abs(plot.y(from) - plot.y(to)))),
              h.DataAttribute('color', colorOf(each.color, place)),
              h.DataAttribute('active', String(Option.contains(point, at))),
            ]),
            [],
          )
        }),
      ),
      dots: [],
    }
  },
})
