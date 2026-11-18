import { Meter, MeterSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { stack } from '../../snippets/layout.js'

// The HTML meter's three regions: below `low`, between, and above `high`.
// A value in the optimum's region is `good`, one region away `fair`, two
// away `poor`; `Meter.levelOf` is that judgment, and the root carries it as
// `data-level` for a style of your own.
const signal = [12, 48, 86]

export default example({
  title: 'Levels',
  slots: MeterSlots,
  recipe: Recipes.Meter,
  view: ({ style, h }) =>
    stack(
      h,
      signal.map(value =>
        Meter.view(
          {
            id: `signal-${value}`,
            label: `Signal ${value}% (${Meter.levelOf(value, { low: 30, high: 70, optimum: 100 })})`,
            value,
            low: 30,
            high: 70,
            optimum: 100,
            style,
          },
          h,
        ),
      ),
    ),
})
