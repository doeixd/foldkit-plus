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

// The mode is the `selection` arg's tag: a range closes the popover on its
// second pick, and the trigger shows both ends.
export default example({
  title: 'A range',
  slots: DatePickerSlots,
  recipe: Recipes.DatePicker,
  state: Bundles.DatePicker.with({ id: 'stay', today, selection: Calendar.empty('Range') }),
  view: ({ style, model, onMessage, h }) =>
    DatePicker.view(
      {
        model,
        onMessage,
        label: 'Stay',
        trigger: selection =>
          Option.match(Calendar.rangeOf(selection), {
            onNone: () => 'Pick check-in and check-out',
            onSome: ({ start, end }) => `${short(start)} to ${short(end)}`,
          }),
        name: 'stay',
        style,
        calendarStyle: CalendarStyle,
      },
      h,
    ),
})
