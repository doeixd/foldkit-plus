import { Option } from 'effect'
import type { Html } from 'foldkit/html'
import type { ChartColor, ChartFrame, ChartKind, ChartPoint } from './kind.js'
import { colorOf, pct } from './kind.js'
import * as Scale from './scale.js'

export interface Series {
  readonly name: string
  /** One value per category, in the categories' order. */
  readonly values: ReadonlyArray<number>
  /** Its color; default its place among the series. */
  readonly color?: ChartColor | undefined
}

/** What the kinds over a value axis read: the categories along the bottom and the series. */
export interface CartesianData {
  /** The categories along the bottom, such as months. */
  readonly categories: ReadonlyArray<string>
  /** Up to five series, each with a value per category. */
  readonly series: ReadonlyArray<Series>
  /** Heads the categories' column in the table; default `Category`. */
  readonly categoryLabel?: string | undefined
}

/** The value axis and the plot's size as a kind's marks need them. */
export interface Plot {
  readonly ticks: ReadonlyArray<number>
  /** Where a value lies down the plot, in percent from the top. */
  readonly y: (value: number) => number
  /** Where zero lies, or the axis's end nearest it. */
  readonly zero: number
  /** The number of categories. */
  readonly count: number
}

/** What a kind's marks return: the marks, and the dots over them, which come before the bands. */
export interface Marks {
  readonly marks: ReadonlyArray<Html>
  readonly dots: ReadonlyArray<Html>
}

/**
 * A kind over a value axis: bars, a line or an area. It draws the axes, the
 * gridlines, the lit band and the tooltip; `extent` says what the axis must
 * span and `marks` draws the series.
 */
export const cartesian = <Data extends CartesianData>(
  name: string,
  config: {
    readonly extent: (data: Data) => readonly [low: number, high: number]
    readonly marks: <Message>(data: Data, plot: Plot, frame: ChartFrame<Message>) => Marks
  },
): ChartKind<Data> => ({
  name,
  entries: data =>
    data.series.map((each, at) => ({ name: each.name, color: colorOf(each.color, at) })),
  points: data =>
    data.categories.map((category, at): ChartPoint => ({
      name: category,
      rows: data.series.map((each, place) => ({
        name: each.name,
        value: each.values[at] ?? 0,
        color: colorOf(each.color, place),
      })),
    })),
  head: data => [data.categoryLabel ?? 'Category', ...data.series.map(each => each.name)],
  draw: (data, frame) => {
    const { h, builders, format, point, legend } = frame
    const { categories } = data
    const count = categories.length
    const [low, high] = config.extent(data)
    const ticks = Scale.ticksOf(Math.min(0, low), Math.max(0, high))
    const y = (value: number) => Scale.yOf(ticks, value)
    const zero = y(Math.min(Math.max(0, ticks[0]!), ticks[ticks.length - 1]!))
    const longest = Math.max(...ticks.map(tick => format(tick).length))
    const kind = name

    const grid = ticks.map(tick =>
      h.line(
        builders.grid.attrs([
          h.X1('0'),
          h.X2('100%'),
          h.Y1(pct(y(tick))),
          h.Y2(pct(y(tick))),
          h.DataAttribute('zero', String(tick === 0)),
        ]),
        [],
      ),
    )
    const cursor = Option.match(point, {
      onNone: () => [],
      onSome: at => {
        const band = Scale.bandOf(count, at)
        return [
          h.rect(
            builders.cursor.attrs([
              h.X(pct(band.start)),
              h.Y('0'),
              h.Width(pct(band.width)),
              h.Height('100%'),
              h.DataAttribute('kind', kind),
            ]),
            [],
          ),
        ]
      },
    })
    const { marks, dots } = config.marks(data, { ticks, y, zero, count }, frame)
    const bands = categories.map((_, at) => {
      const band = Scale.bandOf(count, at)
      return h.rect(
        builders.band.attrs([
          h.X(pct(band.start)),
          h.Y('0'),
          h.Width(pct(band.width)),
          h.Height('100%'),
          frame.pointer(at),
        ]),
        [],
      )
    })
    const tooltip = Option.match(point, {
      onNone: () => [],
      onSome: at => {
        const middle = Scale.bandOf(count, at).middle
        return [
          h.div(
            builders.tooltip.attrs([
              h.AriaHidden(true),
              h.Style({ '--_fk-chart-at': pct(middle) }),
              // Past the middle it opens toward the start, so it stays over the plot.
              h.DataAttribute('side', middle > 50 ? 'start' : 'end'),
            ]),
            [
              h.span(builders.tooltipLabel.attrs(), [categories[at] ?? '']),
              ...(frame.points[at]?.rows ?? []).map(row =>
                h.span(builders.tooltipRow.attrs(), [
                  h.span(builders.swatch.attrs([h.DataAttribute('color', row.color)]), []),
                  h.span(builders.tooltipName.attrs(), [row.name]),
                  h.span(builders.tooltipValue.attrs(), [format(row.value)]),
                ]),
              ),
            ],
          ),
        ]
      },
    })

    return [
      ...legend,
      h.div(builders.body.attrs(), [
        h.div(
          builders.yAxis.attrs([
            h.AriaHidden(true),
            h.Style({ '--_fk-chart-label-ch': String(longest) }),
          ]),
          ticks.map(tick =>
            h.span(builders.yTick.attrs([h.Style({ '--_fk-chart-at': pct(y(tick)) })]), [
              format(tick),
            ]),
          ),
        ),
        h.div(builders.plot.attrs(frame.plot), [
          h.svg(builders.canvas.attrs([h.AriaHidden(true)]), [
            ...grid,
            ...cursor,
            ...marks,
            ...dots,
            ...bands,
          ]),
          ...tooltip,
        ]),
        h.div(
          builders.xAxis.attrs([h.AriaHidden(true)]),
          categories.map((category, at) => {
            const band = Scale.bandOf(count, at)
            return h.span(
              builders.xTick.attrs([
                h.Style({
                  '--_fk-chart-at': pct(band.start),
                  '--_fk-chart-band': pct(band.width),
                }),
                // Every other label, which a narrow chart hides so the rest have room.
                h.DataAttribute('minor', String(at % 2 === 1)),
              ]),
              [category],
            )
          }),
        ),
      ]),
    ]
  },
})

/** Every series' lowest and highest value, for an axis over unstacked series. */
export const spanOf = (data: CartesianData): readonly [number, number] => {
  const values = data.series.flatMap(each => each.values)
  return [Math.min(0, ...values), Math.max(0, ...values)]
}

/**
 * The series stacked: for each series, per category, the edge nearer zero and
 * the edge farther from it. Positives stack up and negatives down, each from zero.
 */
export const stacked = (
  series: ReadonlyArray<Series>,
  count: number,
): ReadonlyArray<ReadonlyArray<readonly [from: number, to: number]>> => {
  const up = Array.from({ length: count }, () => 0)
  const down = Array.from({ length: count }, () => 0)
  return series.map(each =>
    Array.from({ length: count }, (_, at) => {
      const value = each.values[at] ?? 0
      const run = value < 0 ? down : up
      const from = run[at] ?? 0
      run[at] = from + value
      return [from, from + value] as const
    }),
  )
}

/** The axis's span over series stacked on one another. */
export const stackedSpanOf = (data: CartesianData): readonly [number, number] => {
  const edges = stacked(data.series, data.categories.length).flat(2)
  return [Math.min(0, ...edges), Math.max(0, ...edges)]
}
