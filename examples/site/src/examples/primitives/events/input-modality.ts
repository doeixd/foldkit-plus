import { InputModality } from 'foldkit-primitives/events'
import { primitiveExample } from '../../../gallery/primitiveExample.js'

// What the last input was, so a view can show focus rings for keys and none for presses.
export default primitiveExample({
  title: 'InputModality',
  text: '`InputModality` keeps whether the page is being driven by keyboard or pointer. Press a key, then press the page.',
  state: InputModality,
  view: ({ model, h }) =>
    h.p(
      [],
      [
        model.modality === 'unknown'
          ? 'No input yet.'
          : `The last input was ${model.modality === 'keyboard' ? 'a key' : 'a press'}.`,
      ],
    ),
})
