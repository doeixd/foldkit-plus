import { Chart, ChartSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { Message, state, visitors } from './state.js'

// The kind is a value you import: a page that draws bars ships bars. The lit
// point is the chart's own Model, folded with `Chart.update`.
export default example({
  title: 'Bars',
  slots: ChartSlots,
  recipe: Recipes.Chart,
  state,
  view: ({ style, model, onMessage, h }) =>
    Chart.view(
      {
        id: 'bars',
        label: 'Visitors',
        description: 'January to June',
        kind: Chart.bars,
        ...visitors,
        model: model.chart,
        onMessage: message => onMessage(Message.GotChart({ message })),
        style,
      },
      h,
    ),
})
