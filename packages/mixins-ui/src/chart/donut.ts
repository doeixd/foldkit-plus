import { Option } from 'effect'
import { colorOf, type ChartColor, type ChartKind } from './kind.js'
import * as Scale from './scale.js'

export interface Slice {
  readonly name: string
  readonly value: number
  readonly color?: ChartColor | undefined
}

/** What a donut reads: its parts, and the words around its total. */
export interface DonutData {
  /** Up to five parts. */
  readonly slices: ReadonlyArray<Slice>
  /** Says what the hole's total is; default `Total`. */
  readonly totalLabel?: string | undefined
  /** Heads the values' column in the table; default `Value`. */
  readonly valueLabel?: string | undefined
  /** How far in the ring's hole reaches, from 0 (a pie, with no total drawn) to just under 1; default `0.62`. */
  readonly hole?: number | undefined
}

/** Parts of a whole, as a ring. Pass it as a chart's `kind`. */
export const donut: ChartKind<DonutData> = {
  name: 'donut',
  alwaysLegend: true,
  entries: data =>
    data.slices.map((slice, at) => ({ name: slice.name, color: colorOf(slice.color, at) })),
  points: data =>
    data.slices.map((slice, at) => ({
      name: slice.name,
      rows: [{ name: slice.name, value: slice.value, color: colorOf(slice.color, at) }],
    })),
  head: data => ['', data.valueLabel ?? 'Value'],
  draw: (data, frame) => {
    const { h, builders, format, point, legend } = frame
    const { slices } = data
    const hole = data.hole ?? Scale.HOLE
    if (!(hole >= 0 && hole < 1))
      throw new Error(`Chart donut: hole ${hole} is not from 0 up to, not including, 1`)
    const total = slices.reduce((sum, slice) => sum + Math.max(0, slice.value), 0)
    const paths = Scale.slicesOf(
      slices.map(slice => slice.value),
      hole,
    )
    const center = Option.match(point, {
      onNone: () => [format(total), data.totalLabel ?? 'Total'] as const,
      onSome: at => [format(slices[at]!.value), slices[at]!.name] as const,
    })
    return [
      h.div(builders.plot.attrs([...frame.plot, h.DataAttribute('kind', 'donut')]), [
        h.svg(
          builders.canvas.attrs([h.ViewBox('-1.05 -1.05 2.1 2.1'), h.AriaHidden(true)]),
          slices.map((slice, at) =>
            h.path(
              builders.slice.attrs([
                h.D(paths[at] ?? ''),
                h.DataAttribute('color', colorOf(slice.color, at)),
                h.DataAttribute('active', String(Option.contains(point, at))),
                h.VectorEffect('non-scaling-stroke'),
                frame.pointer(at),
              ]),
              [],
            ),
          ),
        ),
        ...(hole === 0
          ? []
          : [
              h.div(builders.center.attrs([h.AriaHidden(true)]), [
                h.span(builders.centerValue.attrs(), [center[0]]),
                h.span(builders.centerLabel.attrs(), [center[1]]),
              ]),
            ]),
      ]),
      ...legend,
    ]
  },
}
