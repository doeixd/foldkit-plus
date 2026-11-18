import { Chart, ChartSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { Message, state, visitors } from '../../snippets/chartState.js'

// A stacked area: each series fills down to the one beneath it.
export default example({
  title: 'Stacked area',
  slots: ChartSlots,
  recipe: Recipes.Chart,
  state,
  view: ({ style, model, onMessage, h }) =>
    Chart.view(
      {
        id: 'area',
        label: 'Visitors',
        kind: Chart.area,
        stack: true,
        ...visitors,
        model: model.chart,
        onMessage: message => onMessage(Message.GotChart({ message })),
        style,
      },
      h,
    ),
})
