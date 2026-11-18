import { Option, Schema } from 'effect'
import { SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import type { Return } from 'foldkit/update'
import { COLORS, type ChartFrame, type ChartKind } from './chart/kind.js'
import { ChartSlots } from './chart/slots.js'
import type { MixinList } from './resolve.js'

export { ChartSlots } from './chart/slots.js'
export { bars, type BarsData } from './chart/bars.js'
export { line } from './chart/line.js'
export { area, type AreaData } from './chart/area.js'
export { donut, type DonutData, type Slice } from './chart/donut.js'
export type { CartesianData, Series } from './chart/cartesian.js'
export type { PathsData } from './chart/paths.js'
export type { Curve } from './chart/scale.js'
export type { ChartColor, ChartEntry, ChartFrame, ChartKind, ChartPoint } from './chart/kind.js'

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

/** What every kind of chart is given: its name, state, words and look. */
export interface ChartOptions<ParentMessage> {
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

/**
 * A chart of one kind: `kind: Chart.bars` with `categories` and `series`,
 * `Chart.line`, `Chart.area`, or `Chart.donut` with `slices`. The data's own
 * options are the kind's, so `stack` is accepted beside `Chart.bars` and not
 * beside `Chart.line`.
 */
export type ChartView<ParentMessage, Data> = ChartOptions<ParentMessage> & {
  readonly kind: ChartKind<Data>
} & NoInfer<Data>

const grouped = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
// A fixed locale, so a server and the browser write the same digits.
const formatted = (value: number) => grouped.format(value)

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

export const view = <ParentMessage, Data>(
  options: ChartView<ParentMessage, Data>,
  h: HtmlBuilder<ParentMessage>,
): Html => {
  const builders = SlotView.buildersFor(
    ChartSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const { id, label, model, onMessage, kind } = options
  const format = options.format ?? formatted
  const titleId = `${id}-title`
  const entries = kind.entries(options)
  const points = kind.points(options)
  const count = points.length
  if (entries.length > COLORS)
    throw new Error(
      `Chart "${id}" has ${entries.length} series and five colors: fold the rest into one, or draw a chart for them`,
    )
  // A point past the data, after the data shrank, lights nothing.
  const point = Option.filter(model.point, at => at < count)

  const legendShown = options.legend ?? (kind.alwaysLegend === true || entries.length > 1)
  const legend = legendShown
    ? [
        h.ul(
          builders.legend.attrs([h.AriaHidden(true)]),
          entries.map(entry =>
            h.li(builders.legendItem.attrs(), [
              h.span(builders.swatch.attrs([h.DataAttribute('color', entry.color)]), []),
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
  const plot = [
    h.Tabindex(0),
    h.Role('group'),
    h.AriaRoleDescription('chart'),
    h.AriaLabelledBy(titleId),
    h.DataAttribute('pointed', String(Option.isSome(point))),
    keys,
    h.OnFocus(onMessage(Message.Focused({ count }))),
    h.OnBlur(onMessage(Message.Cleared())),
    h.OnMouseLeave(onMessage(Message.Left())),
  ]
  const frame: ChartFrame<ParentMessage> = {
    h,
    builders,
    format,
    point,
    points,
    legend,
    plot,
    pointer: at => h.OnMouseEnter(onMessage(Message.Pointed({ point: at }))),
  }

  const said = Option.match(point, {
    onNone: () => '',
    onSome: at => {
      const lit = points[at]
      return model.keyed && lit !== undefined
        ? `${lit.name}: ${lit.rows.map(row => `${row.name} ${format(row.value)}`).join(', ')}`
        : ''
    },
  })
  const status = h.span(builders.status.attrs([h.Role('status')]), said === '' ? [] : [said])

  const table = h.table(
    builders.table.attrs([h.DataAttribute('shown', String(options.table === 'shown'))]),
    [
      h.caption(builders.tableCaption.attrs(), [label]),
      h.thead(builders.tableHead.attrs(), [
        h.tr(
          builders.tableRow.attrs(),
          kind
            .head(options)
            .map(cell => h.th(builders.tableHeader.attrs([h.Scope('col')]), [cell])),
        ),
      ]),
      h.tbody(
        builders.tableBody.attrs(),
        points.map(each =>
          h.tr(builders.tableRow.attrs(), [
            h.th(builders.tableHeader.attrs([h.Scope('row')]), [each.name]),
            ...each.rows.map(row => h.td(builders.tableCell.attrs(), [format(row.value)])),
          ]),
        ),
      ),
    ],
  )

  return h.figure(builders.root.attrs([h.DataAttribute('kind', kind.name)]), [
    h.figcaption(builders.title.attrs([h.Id(titleId)]), [label]),
    ...(options.description === undefined
      ? []
      : [h.p(builders.description.attrs(), [options.description])]),
    ...kind.draw(options, frame),
    status,
    table,
  ])
}
