import { Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { modifyFields } from 'foldkit/struct'
import { Bundles, Button, ButtonSlots, Calendar, CalendarSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { stack } from '../../snippets/layout.js'
import { forSlots } from '../../snippets/theme.js'
import { today } from '../../snippets/today.js'

const times = ['09:00', '10:30', '13:00', '15:30']
const TimeStyle = forSlots(ButtonSlots)(Recipes.Button({ tone: 'neutral', variant: 'outline' }))

// The time is a fact of its own, so it is the application's field and its
// own buttons, and the calendar only places them, in `aside`.
const App = Bundle.compose({ time: Schema.Option(Schema.String) }).pipe(
  Bundle.withMessages({ PickedTime: { time: Schema.String } }),
  Bundle.withChild('day', Bundles.Calendar, {
    args: { id: 'appointment', today, minDate: today, disabledDaysOfWeek: ['Saturday', 'Sunday'] },
    onOut: Bundle.ignore,
  }),
)

export default example({
  title: 'Composed: a day and a time',
  slots: CalendarSlots,
  recipe: Recipes.Calendar,
  state: App.placements.runtime({
    Model: App.Model,
    initial: { time: Option.none() },
    update: App.placements.update((model, { time }) => ({
      model: modifyFields(model, { time: () => Option.some(time) }),
    })),
  }),
  view: ({ style, model, onMessage, h }) =>
    Calendar.view(
      {
        model: model.day,
        onMessage: message => onMessage(App.Message.GotDayMessage({ message })),
        label: 'Appointment',
        aside: stack(
          h,
          times.map(time =>
            Button.view(
              {
                label: time,
                pressed: Option.contains(model.time, time),
                onClick: onMessage(App.Message.PickedTime({ time })),
                style: TimeStyle,
              },
              h,
            ),
          ),
          [h.Role('group'), h.AriaLabel('Time')],
        ),
        style,
      },
      h,
    ),
})
