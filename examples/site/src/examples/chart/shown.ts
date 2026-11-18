import { Chart, ChartSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { Message, state, visitors } from '../../snippets/chartState.js'

// The drawing is hidden from assistive technology, which reads the same data
// from a table. `table: 'shown'` draws it for everyone.
export default example({
  title: 'Its data, shown',
  slots: ChartSlots,
  recipe: Recipes.Chart,
  state,
  view: ({ style, model, onMessage, h }) =>
    Chart.view(
      {
        id: 'shown',
        label: 'Visitors',
        kind: Chart.bars,
        ...visitors,
        table: 'shown',
        model: model.chart,
        onMessage: message => onMessage(Message.GotChart({ message })),
        style,
      },
      h,
    ),
})
