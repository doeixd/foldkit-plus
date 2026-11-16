import type { NamedStyle } from 'foldkit-mixins'
import { Recipes, ChartSlots } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'
import type { Live } from '../showcase.js'

/** A chart example on its own lit point of the widgets' Model. */
const chartOf =
  (example: Widgets.ChartExample, draw: typeof Snippet.chartBar) =>
  <Message>(style: NamedStyle<typeof ChartSlots>, live: Live<Message>) =>
    draw(
      style,
      live.widgets.charts[example],
      message => live.onWidget(Widgets.Message.GotChart({ example, message })),
      live.h,
    )

export const showcase = fromRecipe(
  about('chart'),
  ChartSlots,
  Recipes.Chart,
  chartOf('bar', Snippet.chartBar),
  undefined,
  [
    { name: 'bar', title: 'Bars', draw: chartOf('bar', Snippet.chartBar) },
    { name: 'line', title: 'A line', draw: chartOf('line', Snippet.chartLine) },
    {
      name: 'area',
      title: 'An area',
      draw: chartOf('area', Snippet.chartArea),
      pins: { height: 'sm', grid: 'zero' },
    },
    { name: 'donut', title: 'A donut', draw: chartOf('donut', Snippet.chartDonut) },
    { name: 'table', title: 'Its data, shown', draw: chartOf('table', Snippet.chartTable) },
    {
      name: 'colors',
      title: 'A series keeps its color',
      draw: chartOf('colors', Snippet.chartColors),
    },
  ],
)
