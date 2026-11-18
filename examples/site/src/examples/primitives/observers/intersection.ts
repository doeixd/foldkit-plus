import { Schema } from 'effect'
import * as Mount from 'foldkit/mount'
import { Intersection, IntersectionChanged } from 'foldkit-primitives/observers'
import { primitiveExample } from '../../../gallery/primitiveExample.js'

// The Mount's own Message is the example's: `isIntersecting` and `ratio`, as the observer says them.
export default primitiveExample({
  title: 'Intersection',
  text: '`Intersection()` is a Mount on the element it watches. Scroll this page until the box below crosses the window’s edge.',
  state: {
    Model: Schema.Struct({ shown: Schema.Boolean, ratio: Schema.Number }),
    Message: IntersectionChanged,
    init: () => ({ model: { shown: false, ratio: 0 } }),
    update: (model, { isIntersecting, ratio }) => ({ model: { shown: isIntersecting, ratio } }),
  },
  view: ({ model, onMessage, slots, h }) =>
    h.div(slots.liveBox.attrs([h.OnMount(Mount.mapMessage(Intersection(), onMessage))]), [
      model.shown ? `In view, ${Math.round(model.ratio * 100)} percent of it.` : 'Out of view.',
    ]),
})
