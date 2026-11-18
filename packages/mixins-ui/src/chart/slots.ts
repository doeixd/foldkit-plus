import { Attr, Capability, Event, Slot, Slots } from 'foldkit-mixins'

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
  /** A line's or an area's point, drawn at the lit category (every category with `markers: 'always'`). */
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
