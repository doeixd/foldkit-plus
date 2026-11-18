import { Schema } from 'effect'
import * as Mount from 'foldkit/mount'
import { Bundle } from 'foldkit-bundle'
import { Press } from 'foldkit-primitives/interaction'
import { primitiveExample } from '../../../gallery/primitiveExample.js'

// `events()` reports the element's pointer, key and click facts; the bundle turns them into one `Pressed`.
const App = Bundle.compose({ presses: Schema.Number }).pipe(
  Bundle.withChild('press', Press.bundle, {
    args: { clickSuppressionMs: 400 },
    onOut: () => model => ({ model: { ...model, presses: model.presses + 1 } }),
  }),
)

export default primitiveExample({
  title: 'Press',
  text: '`Press` is a press as one fact: a mouse, a finger, Enter, Space or a screen reader’s click all end in one `Pressed`, and a touch’s ghost click is not counted twice. Try each.',
  state: App.placements.runtime({ Model: App.Model, initial: { presses: 0 } }),
  view: ({ model, onMessage, slots, h }) =>
    h.p(
      [],
      [
        h.button(
          slots.liveButton.attrs([
            h.Type('button'),
            h.DataAttribute('pressed', String(model.press.pressed)),
            h.OnMount(
              Mount.mapMessage(Press.events(), message =>
                onMessage(App.Message.GotPressMessage({ message })),
              ),
            ),
          ]),
          [model.press.pressed ? 'Held' : 'Press me'],
        ),
        ` Pressed ${model.presses} times.`,
      ],
    ),
})
