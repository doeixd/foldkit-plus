import { Chart, ChartSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { Message, state, visitors } from '../../snippets/chartState.js'

// `curve: 'step'` runs level to the next category before it rises or falls,
// and `markers: 'always'` puts a dot on every point, not only the lit one.
export default example({
  title: 'Step line, markers',
  slots: ChartSlots,
  recipe: Recipes.Chart,
  state,
  view: ({ style, model, onMessage, h }) =>
    Chart.view(
      {
        id: 'line',
        label: 'Visitors',
        kind: Chart.line,
        curve: 'step',
        markers: 'always',
        ...visitors,
        model: model.chart,
        onMessage: message => onMessage(Message.GotChart({ message })),
        style,
      },
      h,
    ),
})
