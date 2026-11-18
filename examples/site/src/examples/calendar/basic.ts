import { Bundles, Calendar, CalendarSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { today } from '../../snippets/today.js'

// The Bundle holds the month shown and the selection; `model.selection` is
// read with `Calendar.selectedDate`. One day is the default mode.
export default example({
  title: 'A day',
  slots: CalendarSlots,
  recipe: Recipes.Calendar,
  state: Bundles.Calendar.with({ id: 'delivery', today, minDate: today }),
  view: ({ style, model, onMessage, h }) =>
    Calendar.view({ model, onMessage, label: 'Delivery day', style }, h),
})
