import { Chart, ChartSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { Message, state, visitors } from './state.js'

// Mobile names its color, so hiding Desktop from `series` does not repaint it.
export default example({
  title: 'A series keeps its color',
  slots: ChartSlots,
  recipe: Recipes.Chart,
  state,
  view: ({ style, model, onMessage, h }) =>
    Chart.view(
      {
        id: 'colors',
        label: 'Mobile visitors',
        kind: Chart.bars,
        categories: visitors.categories,
        series: [{ name: 'Mobile', values: [80, 200, 120, 190, 130, 140], color: 2 }],
        legend: true,
        model: model.chart,
        onMessage: message => onMessage(Message.GotChart({ message })),
        style,
      },
      h,
    ),
})
