import { Option } from 'effect'
import { Calendar as Dates } from 'foldkit'
import { Bundles, Calendar, CalendarSlots, Item, ItemSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { note, stack } from '../../snippets/layout.js'
import { forSlots } from '../../snippets/theme.js'
import { today } from '../../snippets/today.js'

const EventStyle = forSlots(ItemSlots)(Recipes.Item({ density: 'compact' }))

/** A few events, days from the day the page was loaded. */
const EVENTS = [
  { in: 0, title: 'Design review', time: '10:00 – 11:00' },
  { in: 0, title: 'Lunch with Sam', time: '12:30' },
  { in: 2, title: 'Sprint planning', time: '09:30 – 10:30' },
  { in: 5, title: 'Dentist', time: '16:00' },
  { in: 9, title: 'Team offsite', time: 'All day' },
  { in: 9, title: 'Dinner', time: '19:00' },
  { in: 13, title: 'Release', time: '15:00' },
]

const eventsOn = (date: Dates.CalendarDate) =>
  EVENTS.filter(each => Dates.isEqual(Dates.addDays(today, each.in), date))

// The day's events are a dot under its number (`detail`, the recipe pinned to
// `detail: 'dot'`), and the list beside the month is the placement's `aside`.
export default example({
  title: 'Events and a Today button',
  slots: CalendarSlots,
  recipe: Recipes.Calendar,
  pins: { detail: 'dot' },
  state: Bundles.Calendar.with({ id: 'events', today }),
  view: ({ style, model, onMessage, h }) => {
    const day = Option.getOrElse(Calendar.firstDate(model.selection), () => today)
    const events = eventsOn(day)
    return Calendar.view(
      {
        model,
        onMessage,
        label: 'Events',
        today: { label: 'Today', selects: false },
        detail: date => {
          const count = eventsOn(date).length
          return Option.liftPredicate(count === 1 ? '1 event' : `${count} events`, () => count > 0)
        },
        aside: stack(h, [
          note(h, [Dates.formatLong(day, Dates.defaultEnglishLocale)]),
          ...(events.length === 0
            ? [note(h, ['Nothing planned.'])]
            : events.map(event =>
                Item.view({ title: event.title, description: event.time, style: EventStyle }, h),
              )),
        ]),
        style,
      },
      h,
    )
  },
})
