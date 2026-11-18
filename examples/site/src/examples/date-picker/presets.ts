import { Option } from 'effect'
import { Calendar as Dates } from 'foldkit'
import {
  Bundles,
  Calendar,
  CalendarSlots,
  DatePicker,
  DatePickerSlots,
  Recipes,
} from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { forSlots } from '../../snippets/theme.js'
import { today } from '../../snippets/today.js'

const CalendarStyle = forSlots(CalendarSlots)(Recipes.Calendar({}))
const short = Dates.formatShort(Dates.defaultEnglishLocale)

// A range with presets: a preset that makes the range whole closes the
// popover, as the second pick does. `closes: 'manual'` would leave it open.
export default example({
  title: 'A range with presets',
  slots: DatePickerSlots,
  recipe: Recipes.DatePicker,
  state: Bundles.DatePicker.with({ id: 'report', today, selection: Calendar.empty('Range') }),
  view: ({ style, model, onMessage, h }) =>
    DatePicker.view(
      {
        model,
        onMessage,
        label: 'Report period',
        trigger: selection =>
          Option.match(Calendar.rangeOf(selection), {
            onNone: () => 'Pick a period',
            onSome: ({ start, end }) => `${short(start)} to ${short(end)}`,
          }),
        presets: [
          { label: 'Last 7 days', selection: Calendar.lastDays(today, 7) },
          { label: 'Last 30 days', selection: Calendar.lastDays(today, 30) },
          { label: 'This month', selection: Calendar.monthOf(today) },
        ],
        style,
        calendarStyle: CalendarStyle,
      },
      h,
    ),
})
