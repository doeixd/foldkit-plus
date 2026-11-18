import { Chart, ChartSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { Message, state } from './state.js'

const browsers = [
  { name: 'Chrome', value: 275 },
  { name: 'Safari', value: 200 },
  { name: 'Firefox', value: 187 },
  { name: 'Edge', value: 173 },
]

// The hole shows the total, or the slice the pointer or the keys are on.
export default example({
  title: 'Donut',
  slots: ChartSlots,
  recipe: Recipes.Chart,
  state,
  view: ({ style, model, onMessage, h }) =>
    Chart.view(
      {
        id: 'donut',
        label: 'Visitors by browser',
        kind: Chart.donut,
        slices: browsers,
        totalLabel: 'Visitors',
        model: model.chart,
        onMessage: message => onMessage(Message.GotChart({ message })),
        style,
      },
      h,
    ),
})
