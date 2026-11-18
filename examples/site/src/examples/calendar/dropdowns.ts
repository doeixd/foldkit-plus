import { Bundles, Calendar, CalendarSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { today } from '../../snippets/today.js'

// Each of these is data on the view: a caption of two selects, a column of
// week numbers, and a button back to today that also picks it.
export default example({
  title: 'Month and year selects, week numbers, a Today button',
  slots: CalendarSlots,
  recipe: Recipes.Calendar,
  state: Bundles.Calendar.with({ id: 'birthday', today }),
  view: ({ style, model, onMessage, h }) =>
    Calendar.view(
      {
        model,
        onMessage,
        label: 'Date of birth',
        caption: { dropdowns: { years: { from: today.year - 100, to: today.year } } },
        weekNumbers: true,
        today: { label: 'Today', selects: true },
        style,
      },
      h,
    ),
})
