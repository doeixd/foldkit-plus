import { Chart, ChartSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { Message, state, visitors } from '../../snippets/chartState.js'

interface Lollipops {
  readonly categories: ReadonlyArray<string>
  readonly values: ReadonlyArray<number>
}

// A kind of your own is an object. `entries`, `points` and `head` say what
// the legend, the status line and the data table read, so the chart supplies
// them; `draw` returns the plot. `pointer(at)` lights a point under the mouse.
const lollipop: Chart.ChartKind<Lollipops> = {
  name: 'lollipop',
  entries: () => [{ name: 'Visitors', color: '1' }],
  points: data =>
    data.categories.map((name, at) => ({
      name,
      rows: [{ name: 'Visitors', value: data.values[at] ?? 0, color: '1' }],
    })),
  head: () => ['Month', 'Visitors'],
  draw: (data, { h, builders, plot, pointer }) => {
    const top = Math.max(...data.values)
    return [
      h.div(builders.plot.attrs(plot), [
        h.svg(
          builders.canvas.attrs([h.AriaHidden(true)]),
          data.values.flatMap((value, at) => {
            const x = `${((at + 0.5) / data.values.length) * 100}%`
            const y = `${100 - (value / top) * 85}%`
            return [
              h.line(builders.grid.attrs([h.X1(x), h.X2(x), h.Y1('100%'), h.Y2(y)]), []),
              h.circle(
                builders.dot.attrs([
                  h.Cx(x),
                  h.Cy(y),
                  h.R('7'),
                  h.DataAttribute('color', '1'),
                  pointer(at),
                ]),
                [],
              ),
            ]
          }),
        ),
      ]),
    ]
  },
}

export default example({
  title: 'A kind of your own',
  slots: ChartSlots,
  recipe: Recipes.Chart,
  state,
  view: ({ style, model, onMessage, h }) =>
    Chart.view(
      {
        id: 'lollipop',
        label: 'Desktop visitors',
        kind: lollipop,
        categories: visitors.categories,
        values: visitors.series[0]?.values ?? [],
        model: model.chart,
        onMessage: message => onMessage(Message.GotChart({ message })),
        style,
      },
      h,
    ),
})
