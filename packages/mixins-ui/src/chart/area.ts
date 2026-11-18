import { cartesian, spanOf, stackedSpanOf } from './cartesian.js'
import type { ChartKind } from './kind.js'
import { pathsOf, type PathsData } from './paths.js'

/** What the area reads beside what the line does. */
export interface AreaData extends PathsData {
  /** Each series' area on the one beneath it, in place of every one down to zero. */
  readonly stack?: boolean | undefined
}

/** A line per series with the area under it filled. Pass it as a chart's `kind`. */
export const area: ChartKind<AreaData> = cartesian<AreaData>('area', {
  extent: data => (data.stack === true ? stackedSpanOf(data) : spanOf(data)),
  marks: (data, plot, frame) => pathsOf(data, plot, frame, true),
})
