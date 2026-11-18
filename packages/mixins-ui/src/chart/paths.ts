import { Option } from 'effect'
import type { Html } from 'foldkit/html'
import { stacked, type CartesianData, type Marks, type Plot } from './cartesian.js'
import { colorOf, pct, type ChartFrame } from './kind.js'
import * as Scale from './scale.js'

/** What the line and the area read beside the categories and series. */
export interface PathsData extends CartesianData {
  /** Straight between the points (default), or level to the next category and then up or down. */
  readonly curve?: Scale.Curve | undefined
  /** A dot on the point lit (default), or on every point. */
  readonly markers?: 'point' | 'always' | undefined
}

/** The lines (and, with `area`, the fill under each) and the dots over them. */
export const pathsOf = <Message>(
  data: PathsData & { readonly stack?: boolean | undefined },
  plot: Plot,
  frame: ChartFrame<Message>,
  area: boolean,
): Marks => {
  const { h, builders, point } = frame
  const { series } = data
  const curve = data.curve ?? 'linear'
  // Where each series' line runs: its own values, or stacked on the series before it.
  const edges = data.stack === true ? stacked(series, plot.count) : undefined
  const topOf = (place: number) =>
    edges?.[place]?.map(([, to]) => to) ?? series[place]?.values ?? []
  const belowOf = (place: number) => edges?.[place]?.map(([from]) => from)
  const color = (place: number) => h.DataAttribute('color', colorOf(series[place]?.color, place))
  const drawn: ReadonlyArray<Html> = [
    h.svg(
      builders.paths.attrs([h.ViewBox('0 0 100 100'), h.PreserveAspectRatio('none')]),
      series.flatMap((_, place) => [
        ...(area
          ? [
              h.path(
                builders.area.attrs([
                  h.D(Scale.areaOf(plot.ticks, topOf(place), curve, belowOf(place))),
                  color(place),
                ]),
                [],
              ),
            ]
          : []),
        h.path(
          builders.line.attrs([
            h.D(Scale.lineOf(plot.ticks, topOf(place), curve)),
            color(place),
            // A stroke as wide at any width the plot is stretched to.
            h.VectorEffect('non-scaling-stroke'),
          ]),
          [],
        ),
      ]),
    ),
  ]
  const dotsAt = (at: number): ReadonlyArray<Html> =>
    series.map((_, place) =>
      h.circle(
        builders.dot.attrs([
          h.Cx(pct(Scale.bandOf(plot.count, at).middle)),
          h.Cy(pct(plot.y(topOf(place)[at] ?? 0))),
          // Eight pixels across, the least a mark is seen at.
          h.R('4'),
          color(place),
        ]),
        [],
      ),
    )
  const dots =
    data.markers === 'always'
      ? Array.from({ length: plot.count }, (_, at) => dotsAt(at)).flat()
      : Option.match(point, { onNone: () => [], onSome: dotsAt })
  return { marks: drawn, dots }
}
