import { Schema } from 'effect'
import * as Mount from 'foldkit/mount'
import { Bounds, Measured } from 'foldkit-primitives/observers'
import { primitiveExample } from '../../../gallery/primitiveExample.js'

// The rectangle is re-measured as the box resizes and as the page scrolls, so its `y` moves.
export default primitiveExample({
  title: 'Bounds',
  text: '`Bounds()` is a Mount that reports an element’s rectangle, the current one first, and again when it resizes or the page scrolls. Scroll and watch `y`.',
  state: {
    Model: Schema.Struct({ x: Schema.Number, y: Schema.Number, width: Schema.Number }),
    Message: Measured,
    init: () => ({ model: { x: 0, y: 0, width: 0 } }),
    update: (_, { x, y, width }) => ({ model: { x, y, width } }),
  },
  view: ({ model, onMessage, slots, h }) =>
    h.div(slots.liveBox.attrs([h.OnMount(Mount.mapMessage(Bounds(), onMessage))]), [
      `At ${Math.round(model.x)}, ${Math.round(model.y)} in the window, ${Math.round(model.width)} wide.`,
    ]),
})
