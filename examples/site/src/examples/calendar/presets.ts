import { Option } from 'effect'
import { Calendar as Dates } from 'foldkit'
import { Bundles, Calendar, CalendarSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { today } from '../../snippets/today.js'

// A preset is data: a label and a `Calendar.Selection`. These are the
// application's own, written from the published date helpers.
const weekendOf = (day: Dates.CalendarDate): Calendar.Selection => {
  const sunday = Dates.endOfWeek(day, 'Monday')
  return Calendar.Selection.Range({
    start: Option.some(Dates.addDays(sunday, -1)),
    end: Option.some(sunday),
  })
}
const presets: ReadonlyArray<Calendar.Preset> = [
  { label: 'This weekend', selection: weekendOf(today) },
  { label: 'Next weekend', selection: weekendOf(Dates.addDays(today, 7)) },
  { label: 'Next month', selection: Calendar.monthOf(today, 1) },
]

export default example({
  title: 'Presets of your own',
  slots: CalendarSlots,
  recipe: Recipes.Calendar,
  state: Bundles.Calendar.with({ id: 'getaway', today, selection: Calendar.empty('Range') }),
  view: ({ style, model, onMessage, h }) =>
    Calendar.view({ model, onMessage, label: 'Getaway', presets, style }, h),
})
