import { cartesian, spanOf } from './cartesian.js'
import type { ChartKind } from './kind.js'
import { pathsOf, type PathsData } from './paths.js'

/** A line per series. Pass it as a chart's `kind`. */
export const line: ChartKind<PathsData> = cartesian<PathsData>('line', {
  extent: spanOf,
  marks: (data, plot, frame) => pathsOf(data, plot, frame, false),
})
