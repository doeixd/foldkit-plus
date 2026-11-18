import { Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Geolocation } from 'foldkit-primitives/device'
import { primitiveExample } from '../../../gallery/primitiveExample.js'

// `when` gates the placement's watch: nothing asks the browser for a position until the press.
const App = Bundle.compose({ asked: Schema.Boolean }).pipe(
  Bundle.withMessages({ Asked: {} }),
  Bundle.withChild('here', Geolocation, { when: model => model.asked }),
)

export default primitiveExample({
  title: 'Geolocation',
  text: '`Geolocation` watches the device position while placed. Here it is placed behind a press, so the browser asks only then; a denial is its own status.',
  state: App.placements.runtime({
    Model: App.Model,
    initial: { asked: false },
    update: App.placements.update(model => ({ model: { ...model, asked: true } })),
  }),
  view: ({ model, onMessage, slots, h }) =>
    h.p(
      [],
      [
        model.asked
          ? model.here.status === 'denied'
            ? 'Permission was denied. Allow it in the site settings to try again.'
            : Option.match(model.here.coords, {
                onNone: () => 'Asking for a position…',
                onSome: ({ latitude, longitude }) =>
                  `Near ${latitude.toFixed(1)}, ${longitude.toFixed(1)}.`,
              })
          : h.button(
              slots.liveButton.attrs([h.Type('button'), h.OnClick(onMessage(App.Message.Asked()))]),
              ['Where am I?'],
            ),
      ],
    ),
})
