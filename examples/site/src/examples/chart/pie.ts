import { Chart, ChartSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { Message, state } from './state.js'

// `hole: 0` is a pie: the slices meet at the centre, and no total is drawn.
export default example({
  title: 'Pie',
  slots: ChartSlots,
  recipe: Recipes.Chart,
  state,
  view: ({ style, model, onMessage, h }) =>
    Chart.view(
      {
        id: 'pie',
        label: 'Visitors by browser',
        kind: Chart.donut,
        hole: 0,
        slices: [
          { name: 'Chrome', value: 275 },
          { name: 'Safari', value: 200 },
          { name: 'Firefox', value: 187 },
        ],
        model: model.chart,
        onMessage: message => onMessage(Message.GotChart({ message })),
        style,
      },
      h,
    ),
})
