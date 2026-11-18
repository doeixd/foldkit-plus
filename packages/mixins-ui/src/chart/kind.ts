import type { Option } from 'effect'
import type { SlotAttributes, SlotBuilders } from 'foldkit-mixins'
import type { Attribute, Html, HtmlBuilder } from 'foldkit/html'
import type { ChartSlots } from './slots.js'

/** One of the five chart colors, `chart-1` to `chart-5`. */
export type ChartColor = 1 | 2 | 3 | 4 | 5

/** A series or a slice as the legend lists it; `color` is the `data-color` its marks carry. */
export interface ChartEntry {
  readonly name: string
  readonly color: string
}

/** What one category or slice says: the tooltip, the status line and the data table read these. */
export interface ChartPoint {
  readonly name: string
  readonly rows: ReadonlyArray<{
    readonly name: string
    readonly value: number
    readonly color: string
  }>
}

/** What a kind is given to draw with: the chart's state, words and parts. */
export interface ChartFrame<Message> {
  readonly h: HtmlBuilder<Message>
  readonly builders: SlotBuilders<typeof ChartSlots, Message>
  /** How a value reads: the chart's `format`. */
  readonly format: (value: number) => string
  /** The point lit, if it is a point of the data. */
  readonly point: Option.Option<number>
  readonly points: ReadonlyArray<ChartPoint>
  /** The legend, drawn where the kind puts it (empty when none is shown). */
  readonly legend: ReadonlyArray<Html>
  /** The plot's attributes: the focus, the keys, and the pointer leaving. */
  readonly plot: SlotAttributes<Message>
  /** The attribute that lights point `at` while the pointer is over the element. */
  readonly pointer: (at: number) => Attribute<Message>
}

/**
 * A kind of chart: `Chart.bars`, `Chart.line`, `Chart.area` and `Chart.donut`
 * are values of it, and one of your own is an object with these four readers
 * and a `draw`. The chart draws the title, the status line and the data table
 * from `entries`, `points` and `head`, so a kind needs to draw only the plot.
 * `Data` is the options the kind reads beside the chart's own.
 */
export interface ChartKind<Data> {
  /** Written as `data-kind` on the chart's root and plot, for the recipe. */
  readonly name: string
  /** Shows the legend even for one entry (a donut's parts); default only from two. */
  readonly alwaysLegend?: boolean
  /** The legend's entries: series, or slices. */
  readonly entries: (data: Data) => ReadonlyArray<ChartEntry>
  /** One per category or slice, in order. */
  readonly points: (data: Data) => ReadonlyArray<ChartPoint>
  /** The data table's column heads. */
  readonly head: (data: Data) => ReadonlyArray<string>
  /** The elements between the chart's heading and its status line: the legend, the plot. */
  readonly draw: <Message>(data: Data, frame: ChartFrame<Message>) => ReadonlyArray<Html>
}

export const COLORS = 5

/** The `data-color` of an entry: its own color, or its place among the five. */
export const colorOf = (color: ChartColor | undefined, at: number): string =>
  String(color ?? (at % COLORS) + 1)

export const pct = (value: number): string => `${value}%`
