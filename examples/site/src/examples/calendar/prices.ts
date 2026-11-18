import { Option } from 'effect'
import { Calendar as Dates } from 'foldkit'
import { Bundles, Calendar, CalendarSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { note } from '../../snippets/layout.js'
import { today } from '../../snippets/today.js'

/** A night's price: dearer at the weekend, and varying through the month. */
const priceOf = (date: Dates.CalendarDate): number => {
  const weekend = ['Friday', 'Saturday'].includes(Dates.dayOfWeek(date))
  return 89 + (weekend ? 40 : 0) + ((date.day * 7) % 5) * 6
}

/** The nights from check-in to check-out, and what they cost together. */
const stayOf = (stay: Calendar.Selection): Option.Option<{ nights: number; total: number }> =>
  Option.flatMap(Calendar.rangeOf(stay), ({ start, end }) => {
    const nights = Math.max(1, Dates.daysUntil(start, end))
    const total = Array.from({ length: nights }, (_, night) =>
      priceOf(Dates.addDays(start, night)),
    ).reduce((sum, price) => sum + price, 0)
    return Option.some({ nights, total })
  })

// `detail` writes a line under each day's number; the recipe is pinned to
// `detail: 'text'`, a taller cell to hold it. A range previews under the pointer.
export default example({
  title: 'A price on each day',
  slots: CalendarSlots,
  recipe: Recipes.Calendar,
  pins: { detail: 'text' },
  state: Bundles.Calendar.with({ id: 'prices', today, selection: Calendar.empty('Range') }),
  view: ({ style, model, onMessage, h }) =>
    Calendar.view(
      {
        model,
        onMessage,
        label: 'Stay',
        caption: 'label',
        // A day that can be booked shows its night's price; the past shows none.
        detail: date =>
          Option.liftPredicate(date, () => !Dates.isBefore(date, today)).pipe(
            Option.map(night => `$${priceOf(night)}`),
          ),
        footer: note(h, [
          Option.match(stayOf(model.selection), {
            onNone: () => 'Pick a check-in day, then a check-out day.',
            onSome: ({ nights, total }) =>
              `${nights} ${nights === 1 ? 'night' : 'nights'} · $${total} in all`,
          }),
        ]),
        style,
      },
      h,
    ),
})
