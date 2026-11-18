import { Chart, ChartSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { Message, state, visitors } from '../../snippets/chartState.js'

// `stack` puts the series on one another per category; the axis spans the stack.
export default example({
  title: 'Stacked bars',
  slots: ChartSlots,
  recipe: Recipes.Chart,
  state,
  view: ({ style, model, onMessage, h }) =>
    Chart.view(
      {
        id: 'stacked',
        label: 'Visitors by device',
        kind: Chart.bars,
        stack: true,
        ...visitors,
        model: model.chart,
        onMessage: message => onMessage(Message.GotChart({ message })),
        style,
      },
      h,
    ),
})
