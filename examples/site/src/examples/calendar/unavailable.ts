import { Option } from 'effect'
import { Calendar as Dates } from 'foldkit'
import { Bundles, Calendar, CalendarSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { note } from '../../snippets/layout.js'
import { today } from '../../snippets/today.js'

// Days already taken, from the day the page was loaded.
const booked = [1, 2, 8, 9, 15, 22].map(days => Dates.addDays(today, days))

// The bounds and the closed days are the calendar's own: it draws them
// disabled and its keys skip them.
export default example({
  title: 'Weekends, booked days and bounds',
  slots: CalendarSlots,
  recipe: Recipes.Calendar,
  state: Bundles.Calendar.with({
    id: 'unavailable',
    today,
    minDate: today,
    maxDate: Dates.addDays(today, 60),
    disabledDaysOfWeek: ['Saturday', 'Sunday'],
    disabledDates: booked,
  }),
  view: ({ style, model, onMessage, h }) =>
    Calendar.view(
      {
        model,
        onMessage,
        label: 'Delivery day',
        footer: note(h, [
          Option.match(Calendar.firstDate(model.selection), {
            onNone: () => 'Weekends and booked days are closed; book up to two months ahead.',
            onSome: date => `Delivery on ${Dates.formatLong(date, Dates.defaultEnglishLocale)}.`,
          }),
        ]),
        style,
      },
      h,
    ),
})
