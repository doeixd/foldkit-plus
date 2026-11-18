import { Meter, MeterSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { stack } from '../../snippets/layout.js'

// A meter is a measurement within a known range, where Progress is work going
// on. `low`, `high` and `optimum` say which end is good: a battery is best
// full, a disk best nearly empty, so the same 91 reads well on one and badly
// on the other. The fill takes its colour from that judgment.
export default example({
  title: 'Basic',
  slots: MeterSlots,
  recipe: Recipes.Meter,
  view: ({ style, h }) =>
    stack(h, [
      Meter.view(
        { id: 'battery', label: 'Battery', value: 91, low: 20, high: 80, optimum: 100, style },
        h,
      ),
      Meter.view(
        {
          id: 'storage',
          label: 'Storage used',
          value: 91,
          low: 20,
          high: 80,
          optimum: 0,
          valueText: (value, max) => `${value} of ${max} GB`,
          style,
        },
        h,
      ),
    ]),
})
