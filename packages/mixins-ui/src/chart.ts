import { Option, Schema } from 'effect'
import { Attr, Capability, Event, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import type { Return } from 'foldkit/update'
import * as Scale from './chart/scale.js'
import type { MixinList } from './resolve.js'

/**
 * A chart, after shadcn's over Recharts: bars, a line, an area or a donut,
 * with a value axis whose ticks are round values the axis reaches, the
 * categories along the bottom, gridlines, a legend, and a tooltip with every
 * series' value at the point the pointer or the keys are on. The plot is
 * drawn in percentages of its box, so it fills any width without measuring.
 *
 * The data is the application's, and so is which point is lit: keep this
 * module's `Model` and fold the chart's Messages into it with `update`.
 * The plot takes the focus; the arrows, Home and End move through the
 * points, and a polite status says each one's values. The drawing is hidden
 * from assistive technology, which reads the same data from a `table`,
 * visually hidden unless `table: 'shown'`. Series take `chart-1` to
 * `chart-5` in order, as `data-color` on every mark; a series that a filter
 * may remove names its own color, so the others keep theirs.
 */
export const ChartSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  title: Slot.make({ capability: Capability.Container }),
  description: Slot.make({ capability: Capability.Container }),
  legend: Slot.make({ capability: Capability.Container }),
  legendItem: Slot.make({ capability: Capability.Container }),
  /** A series' color, in the legend and the tooltip. */
  swatch: Slot.make({ capability: Capability.Container }),
  /** The axes around the plot, laid out as a grid. */
  body: Slot.make({ capability: Capability.Container }),
  /** The value axis's labels, beside the plot; carries `--_fk-chart-label-ch`. */
  yAxis: Slot.make({ capability: Capability.Container }),
  /** The category labels, below the plot. */
  xAxis: Slot.make({ capability: Capability.Container }),
  /** A value's label, at `--_fk-chart-at` down the plot. */
  yTick: Slot.make({ capability: Capability.Container }),
  /** A category's label, across its band: from `--_fk-chart-at`, `--_fk-chart-band` wide. */
  xTick: Slot.make({ capability: Capability.Container }),
  /** The box of the drawing, which takes the focus and the keys. */
  plot: Slot.make({
    capability: Capability.Focusable,
    events: [Event.KeyDown, Event.Focus, Event.Blur, Event.Hover],
    attributes: [Attr.Role],
  }),
  /** The `svg` the marks are drawn in, in percentages of the plot. */
  canvas: Slot.make({ capability: Capability.Container }),
  /** An inner `svg` of 100 by 100 stretched over the plot, for the lines and areas. */
  paths: Slot.make({ capability: Capability.Container }),
  /** A gridline at a tick of the value axis; `data-zero` on the one at zero. */
  grid: Slot.make({ capability: Capability.Container }),
  /** The lit category's band, drawn behind the marks. */
  cursor: Slot.make({ capability: Capability.Container }),
  bar: Slot.make({ capability: Capability.Container }),
  line: Slot.make({ capability: Capability.Container }),
  area: Slot.make({ capability: Capability.Container }),
  /** A line's or an area's point, drawn at the lit category. */
  dot: Slot.make({ capability: Capability.Container }),
  slice: Slot.make({ capability: Capability.Container }),
  /** A category's whole band, unpainted: what the pointer lights. */
  band: Slot.make({ capability: Capability.Container, events: [Event.Hover] }),
  /** The total, or the lit slice, in a donut's hole. */
  center: Slot.make({ capability: Capability.Container }),
  centerValue: Slot.make({ capability: Capability.Container }),
  centerLabel: Slot.make({ capability: Capability.Container }),
  tooltip: Slot.make({ capability: Capability.Container }),
  tooltipLabel: Slot.make({ capability: Capability.Container }),
  tooltipRow: Slot.make({ capability: Capability.Container }),
  tooltipName: Slot.make({ capability: Capability.Container }),
  tooltipValue: Slot.make({ capability: Capability.Container }),
  status: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  table: Slot.make({ capability: Capability.Container }),
  tableCaption: Slot.make({ capability: Capability.Container }),
  tableHead: Slot.make({ capability: Capability.Container }),
  tableBody: Slot.make({ capability: Capability.Container }),
  tableRow: Slot.make({ capability: Capability.Container }),
  tableHeader: Slot.make({ capability: Capability.Container }),
  tableCell: Slot.make({ capability: Capability.Container }),
})

/** One of the five chart colors, `chart-1` to `chart-5`. */
export type ChartColor = 1 | 2 | 3 | 4 | 5

export interface Series {
  readonly name: string
  /** One value per category, in the categories' order. */
  readonly values: ReadonlyArray<number>
  /** Its color; default its place among the series. */
  readonly color?: ChartColor | undefined
}

export interface Slice {
  readonly name: string
  readonly value: number
  readonly color?: ChartColor | undefined
}

export const Model = Schema.Struct({
  /** The category or slice lit, from 0; none while nothing is. Not `index`, which a Surface reserves. */
  point: Schema.Option(Schema.Number),
  /** The keys lit it, so the status says it; a pointer's light is seen, not said. */
  keyed: Schema.Boolean,
})
export type Model = typeof Model.Type

export const Step = Schema.Literals(['next', 'previous', 'first', 'last'])
export type Step = typeof Step.Type

export const Message = defineMessageUnion({
  /** The pointer is over a category or a slice. */
  Pointed: { point: Schema.Number },
  /** The pointer left the plot. */
  Left: {},
  /** A key moved through `count` points. */
  Stepped: { step: Step, count: Schema.Number },
  /** The plot took the focus, with `count` points. */
  Focused: { count: Schema.Number },
  /** The plot lost the focus, or Escape was pressed. */
  Cleared: {},
})
export type Message = typeof Message.Type

export const init = (): Model => ({ point: Option.none(), keyed: false })

const lit = (model: Model, point: number, keyed: boolean): Model =>
  Option.contains(model.point, point) && model.keyed === keyed
    ? model
    : modifyFields(model, { point: () => Option.some(point), keyed: () => keyed })

const cleared = (model: Model): Model =>
  Option.isNone(model.point) ? model : modifyFields(model, { point: () => Option.none() })

/** The chart after `message`; the same Model when nothing changes. */
export const update = (model: Model, message: Message): Return<Model, Message> => ({
  model: Message.match(message, {
    Pointed: ({ point }) => lit(model, point, false),
    Left: () => (model.keyed ? model : cleared(model)),
    Stepped: ({ step, count }) => {
      if (count <= 0) return model
      const last = count - 1
      // From nothing lit, the arrows begin at an end.
      const from = Option.getOrElse(model.point, () => (step === 'previous' ? count : -1))
      const to = {
        next: Math.min(last, from + 1),
        previous: Math.max(0, from - 1),
        first: 0,
        last,
      }[step]
      return lit(model, Math.min(last, to), true)
    },
    Focused: ({ count }) => (count > 0 && Option.isNone(model.point) ? lit(model, 0, true) : model),
    Cleared: () => cleared(model),
  }),
})

interface ChartCommon<ParentMessage> {
  /** Prefixes the ids the chart draws, unique on the page. */
  readonly id: string
  /** What the chart shows: its caption, the plot's name and the table's caption. */
  readonly label: string
  /** A sentence under the title, such as the period shown. */
  readonly description?: string | undefined
  readonly model: Model
  readonly onMessage: (message: Message) => NoInfer<ParentMessage>
  /** How a value reads, on the axis and in the tooltip; default grouped digits, two decimals at most. */
  readonly format?: ((value: number) => string) | undefined
  /** Draws the legend; default with two series or more, and for a donut. */
  readonly legend?: boolean | undefined
  /** The data table: read by assistive technology only (default), or shown. */
  readonly table?: 'hidden' | 'shown' | undefined
  /** A style of `ChartSlots`, for the look. */
  readonly style?: NamedStyle<typeof ChartSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<ParentMessage> | undefined
}

/** Bars side by side per category, a line, or a line with the area under it filled. */
export interface CartesianChart<ParentMessage> extends ChartCommon<ParentMessage> {
  readonly kind: 'bar' | 'line' | 'area'
  /** The categories along the bottom, such as months. */
  readonly categories: ReadonlyArray<string>
  /** Up to five series, each with a value per category. */
  readonly series: ReadonlyArray<Series>
  /** Heads the categories' column in the table; default `Category`. */
  readonly categoryLabel?: string | undefined
}

/** Parts of a whole, as a ring. */
export interface DonutChart<ParentMessage> extends ChartCommon<ParentMessage> {
  readonly kind: 'donut'
  /** Up to five parts. */
  readonly slices: ReadonlyArray<Slice>
  /** Says what the hole's total is; default `Total`. */
  readonly totalLabel?: string | undefined
  /** Heads the values' column in the table; default `Value`. */
  readonly valueLabel?: string | undefined
}

export type ChartView<ParentMessage> = CartesianChart<ParentMessage> | DonutChart<ParentMessage>

const COLORS = 5

const grouped = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
// A fixed locale, so a server and the browser write the same digits.
const formatted = (value: number) => grouped.format(value)

const colorOf = (color: ChartColor | undefined, at: number) => String(color ?? (at % COLORS) + 1)

const pct = (value: number) => `${value}%`

/** What a key does on the plot. */
const stepOf = (key: string): Option.Option<Step | 'clear'> => {
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return Option.some('next')
    case 'ArrowLeft':
    case 'ArrowUp':
      return Option.some('previous')
    case 'Home':
      return Option.some('first')
    case 'End':
      return Option.some('last')
    case 'Escape':
      return Option.some('clear')
    default:
      return Option.none()
  }
}

export const view = <ParentMessage>(
  options: ChartView<ParentMessage>,
  h: HtmlBuilder<ParentMessage>,
): Html => {
  const builders = SlotView.buildersFor(
    ChartSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const { id, label, model, onMessage } = options
  const format = options.format ?? formatted
  const titleId = `${id}-title`
  const [count, entries] =
    options.kind === 'donut'
      ? [options.slices.length, options.slices.map((slice, at) => ({ ...slice, at }))]
      : [options.categories.length, options.series.map((series, at) => ({ ...series, at }))]
  if (entries.length > COLORS)
    throw new Error(
      `Chart "${id}" has ${entries.length} series and five colors: fold the rest into one, or draw a chart for them`,
    )
  // A point past the data, after the data shrank, lights nothing.
  const point = Option.filter(model.point, at => at < count)
  const pointed = Option.isSome(point)
  const isLit = (at: number) => Option.contains(point, at)
  const color = (entry: { readonly color?: ChartColor | undefined; readonly at: number }) =>
    h.DataAttribute('color', colorOf(entry.color, entry.at))
  const active = (at: number) => h.DataAttribute('active', String(isLit(at)))

  const legendShown = options.legend ?? (options.kind === 'donut' || entries.length > 1)
  const legend = legendShown
    ? [
        h.ul(
          builders.legend.attrs([h.AriaHidden(true)]),
          entries.map(entry =>
            h.li(builders.legendItem.attrs(), [
              h.span(builders.swatch.attrs([color(entry)]), []),
              entry.name,
            ]),
          ),
        ),
      ]
    : []

  const keys = h.OnKeyDownPreventDefault(key =>
    Option.map(stepOf(key), step =>
      onMessage(step === 'clear' ? Message.Cleared() : Message.Stepped({ step, count })),
    ),
  )
  const plotAttributes = [
    h.Tabindex(0),
    h.Role('group'),
    h.AriaRoleDescription('chart'),
    h.AriaLabelledBy(titleId),
    h.DataAttribute('pointed', String(pointed)),
    keys,
    h.OnFocus(onMessage(Message.Focused({ count }))),
    h.OnBlur(onMessage(Message.Cleared())),
    h.OnMouseLeave(onMessage(Message.Left())),
  ]

  const rowsOf = (at: number): ReadonlyArray<readonly [string, number, string]> =>
    options.kind === 'donut'
      ? [
          [
            options.slices[at]!.name,
            options.slices[at]!.value,
            colorOf(options.slices[at]!.color, at),
          ],
        ]
      : options.series.map(
          (series, place) =>
            [series.name, series.values[at] ?? 0, colorOf(series.color, place)] as const,
        )
  const nameOf = (at: number) =>
    options.kind === 'donut' ? (options.slices[at]?.name ?? '') : (options.categories[at] ?? '')
  const said = Option.match(point, {
    onNone: () => '',
    onSome: at =>
      model.keyed
        ? `${nameOf(at)}: ${rowsOf(at)
            .map(([name, value]) => `${name} ${format(value)}`)
            .join(', ')}`
        : '',
  })
  const status = h.span(builders.status.attrs([h.Role('status')]), said === '' ? [] : [said])

  const table = (head: ReadonlyArray<string>, rows: ReadonlyArray<ReadonlyArray<string>>) =>
    h.table(builders.table.attrs([h.DataAttribute('shown', String(options.table === 'shown'))]), [
      h.caption(builders.tableCaption.attrs(), [label]),
      h.thead(builders.tableHead.attrs(), [
        h.tr(
          builders.tableRow.attrs(),
          head.map(cell => h.th(builders.tableHeader.attrs([h.Scope('col')]), [cell])),
        ),
      ]),
      h.tbody(
        builders.tableBody.attrs(),
        rows.map(([first, ...rest]) =>
          h.tr(builders.tableRow.attrs(), [
            h.th(builders.tableHeader.attrs([h.Scope('row')]), [first ?? '']),
            ...rest.map(cell => h.td(builders.tableCell.attrs(), [cell])),
          ]),
        ),
      ),
    ])

  const heading = [
    h.figcaption(builders.title.attrs([h.Id(titleId)]), [label]),
    ...(options.description === undefined
      ? []
      : [h.p(builders.description.attrs(), [options.description])]),
  ]

  if (options.kind === 'donut') {
    const { slices } = options
    const total = slices.reduce((sum, slice) => sum + Math.max(0, slice.value), 0)
    const paths = Scale.slicesOf(slices.map(slice => slice.value))
    const center = Option.match(point, {
      onNone: () => [format(total), options.totalLabel ?? 'Total'] as const,
      onSome: at => [format(slices[at]!.value), slices[at]!.name] as const,
    })
    return h.figure(builders.root.attrs([h.DataAttribute('kind', 'donut')]), [
      ...heading,
      h.div(builders.plot.attrs([...plotAttributes, h.DataAttribute('kind', 'donut')]), [
        h.svg(
          builders.canvas.attrs([h.ViewBox('-1.05 -1.05 2.1 2.1'), h.AriaHidden(true)]),
          slices.map((slice, at) =>
            h.path(
              builders.slice.attrs([
                h.D(paths[at] ?? ''),
                color({ ...slice, at }),
                active(at),
                h.VectorEffect('non-scaling-stroke'),
                h.OnMouseEnter(onMessage(Message.Pointed({ point: at }))),
              ]),
              [],
            ),
          ),
        ),
        h.div(builders.center.attrs([h.AriaHidden(true)]), [
          h.span(builders.centerValue.attrs(), [center[0]]),
          h.span(builders.centerLabel.attrs(), [center[1]]),
        ]),
      ]),
      ...legend,
      status,
      table(
        ['', options.valueLabel ?? 'Value'],
        slices.map(slice => [slice.name, format(slice.value)]),
      ),
    ])
  }

  const { categories, series, kind } = options
  const values = series.flatMap(each => each.values)
  const ticks = Scale.ticksOf(Math.min(0, ...values), Math.max(0, ...values))
  const y = (value: number) => Scale.yOf(ticks, value)
  const zero = y(Math.min(Math.max(0, ticks[0]!), ticks[ticks.length - 1]!))
  const longest = Math.max(...ticks.map(tick => format(tick).length))

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
  const bars =
    kind === 'bar'
      ? series.flatMap((each, place) =>
          categories.map((_, at) => {
            const value = each.values[at] ?? 0
            const bar = Scale.barOf(count, at, place, series.length)
            const top = Math.min(y(value), zero)
            return h.rect(
              builders.bar.attrs([
                h.X(pct(bar.start)),
                h.Y(pct(top)),
                h.Width(pct(bar.width)),
                h.Height(pct(Math.abs(zero - y(value)))),
                color({ ...each, at: place }),
                active(at),
              ]),
              [],
            )
          }),
        )
      : []
  const lines =
    kind === 'bar'
      ? []
      : [
          h.svg(
            builders.paths.attrs([h.ViewBox('0 0 100 100'), h.PreserveAspectRatio('none')]),
            series.flatMap((each, place) => [
              ...(kind === 'area'
                ? [
                    h.path(
                      builders.area.attrs([
                        h.D(Scale.areaOf(ticks, each.values)),
                        color({ ...each, at: place }),
                      ]),
                      [],
                    ),
                  ]
                : []),
              h.path(
                builders.line.attrs([
                  h.D(Scale.lineOf(ticks, each.values)),
                  color({ ...each, at: place }),
                  // A stroke as wide at any width the plot is stretched to.
                  h.VectorEffect('non-scaling-stroke'),
                ]),
                [],
              ),
            ]),
          ),
        ]
  const dots =
    kind === 'bar'
      ? []
      : Option.match(point, {
          onNone: () => [],
          onSome: at =>
            series.map((each, place) =>
              h.circle(
                builders.dot.attrs([
                  h.Cx(pct(Scale.bandOf(count, at).middle)),
                  h.Cy(pct(y(each.values[at] ?? 0))),
                  // Eight pixels across, the least a mark is seen at.
                  h.R('4'),
                  color({ ...each, at: place }),
                ]),
                [],
              ),
            ),
        })
  const bands = categories.map((_, at) => {
    const band = Scale.bandOf(count, at)
    return h.rect(
      builders.band.attrs([
        h.X(pct(band.start)),
        h.Y('0'),
        h.Width(pct(band.width)),
        h.Height('100%'),
        h.OnMouseEnter(onMessage(Message.Pointed({ point: at }))),
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
            ...rowsOf(at).map(([name, value, swatch]) =>
              h.span(builders.tooltipRow.attrs(), [
                h.span(builders.swatch.attrs([h.DataAttribute('color', swatch)]), []),
                h.span(builders.tooltipName.attrs(), [name]),
                h.span(builders.tooltipValue.attrs(), [format(value)]),
              ]),
            ),
          ],
        ),
      ]
    },
  })

  return h.figure(builders.root.attrs([h.DataAttribute('kind', kind)]), [
    ...heading,
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
      h.div(builders.plot.attrs(plotAttributes), [
        h.svg(builders.canvas.attrs([h.AriaHidden(true)]), [
          ...grid,
          ...cursor,
          ...bars,
          ...lines,
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
              h.Style({ '--_fk-chart-at': pct(band.start), '--_fk-chart-band': pct(band.width) }),
              // Every other label, which a narrow chart hides so the rest have room.
              h.DataAttribute('minor', String(at % 2 === 1)),
            ]),
            [category],
          )
        }),
      ),
    ]),
    status,
    table(
      [options.categoryLabel ?? 'Category', ...series.map(each => each.name)],
      categories.map((category, at) => [
        category,
        ...series.map(each => format(each.values[at] ?? 0)),
      ]),
    ),
  ])
}
