import { Option } from 'effect'
import { Calendar as Dates } from 'foldkit'
import { Bundles, Calendar, DatePicker, DatePickerSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { today } from '../../snippets/today.js'

// A picker is two contracts: its own Slots, picked above, and its calendar's.
const CalendarStyle = Recipes.Calendar.style({})

// The Bundle holds the popover, the calendar and the selection, and closes
// the popover on the pick that makes the selection whole.
export default example({
  title: 'Placed as a Bundle',
  slots: DatePickerSlots,
  recipe: Recipes.DatePicker,
  state: Bundles.DatePicker.with({ id: 'due', today, animated: true }),
  view: ({ style, model, onMessage, h }) =>
    DatePicker.view(
      {
        model,
        onMessage,
        label: 'Due date',
        trigger: selection =>
          Option.match(Calendar.selectedDate(selection), {
            onNone: () => 'Pick a due date',
            onSome: date => Dates.formatLong(date, Dates.defaultEnglishLocale),
          }),
        name: 'due',
        today: { label: 'Today', selects: true },
        style,
        calendarStyle: CalendarStyle,
      },
      h,
    ),
})
