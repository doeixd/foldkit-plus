import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Throttle, ThrottleMessage } from 'foldkit-primitives/time'
import { primitiveExample } from '../../../gallery/primitiveExample.js'

// `Attempted` asks; the bundle reads Effect's clock and reports `Throttled` only when a
// second has passed since the last one let through.
const App = Bundle.compose({ passed: Schema.Number }).pipe(
  Bundle.withChild('gate', Throttle, {
    args: { intervalMs: 1000 },
    onOut: () => model => ({ model: { ...model, passed: model.passed + 1 } }),
  }),
)

export default primitiveExample({
  title: 'Throttle',
  text: '`Throttle` lets an attempt through at most once per interval. Press as fast as you like: the count rises once a second at most.',
  state: App.placements.runtime({ Model: App.Model, initial: { passed: 0 } }),
  view: ({ model, onMessage, slots, h }) =>
    h.p(
      [],
      [
        h.button(
          slots.liveButton.attrs([
            h.Type('button'),
            h.OnClick(
              onMessage(App.Message.GotGateMessage({ message: ThrottleMessage.Attempted() })),
            ),
          ]),
          ['Press quickly'],
        ),
        ` ${model.passed} let through.`,
      ],
    ),
})
