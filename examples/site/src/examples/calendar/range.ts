import { Bundles, Calendar, CalendarSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { today } from '../../snippets/today.js'

// The mode is the `selection` arg's tag. Two months page from their outer
// ends, a range previews under the pointer, and a preset is one press.
export default example({
  title: 'A range over two months, with presets',
  slots: CalendarSlots,
  recipe: Recipes.Calendar,
  state: Bundles.Calendar.with({
    id: 'trip',
    today,
    selection: Calendar.empty('Range'),
    months: 2,
  }),
  view: ({ style, model, onMessage, h }) =>
    Calendar.view(
      {
        model,
        onMessage,
        label: 'Trip dates',
        presets: [
          { label: 'Last 7 days', selection: Calendar.lastDays(today, 7) },
          { label: 'Next 7 days', selection: Calendar.nextDays(today, 7) },
          { label: 'This month', selection: Calendar.monthOf(today) },
        ],
        style,
      },
      h,
    ),
})
