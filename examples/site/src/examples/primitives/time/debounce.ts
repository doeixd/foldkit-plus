import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { debounce } from 'foldkit-primitives/time'
import { primitiveExample } from '../../../gallery/primitiveExample.js'

const Typed = debounce({ name: 'Typed', value: Schema.String })

// `Changed` on every keystroke; `Typed.Debounced` leaves the bundle once, 500ms after the last.
const App = Bundle.compose({ settled: Schema.String }).pipe(
  Bundle.withChild('typed', Typed, {
    args: { delayMs: 500 },
    onOut: out => model => ({ model: { ...model, settled: out.value } }),
  }),
)

export default primitiveExample({
  title: 'Debounce',
  text: '`debounce` makes a bundle whose `Changed` Message restarts a timer; only the last value is reported, once, as its OutMessage.',
  state: App.placements.runtime({ Model: App.Model, initial: { settled: '' } }),
  view: ({ model, onMessage, slots, h }) =>
    h.div(
      [],
      [
        h.input(
          slots.liveField.attrs([
            h.Type('text'),
            h.AriaLabel('Search'),
            h.OnInput(value =>
              onMessage(App.Message.GotTypedMessage({ message: Typed.Message.Changed({ value }) })),
            ),
          ]),
        ),
        h.p([], [`Settled on “${model.settled}”, after the typing stopped.`]),
      ],
    ),
})
