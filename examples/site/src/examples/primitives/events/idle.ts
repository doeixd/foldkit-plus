import { Idle } from 'foldkit-primitives/events'
import { primitiveExample } from '../../../gallery/primitiveExample.js'

// Mouse, keys, presses and scrolls count as activity; five quiet seconds is idle.
export default primitiveExample({
  title: 'Idle',
  text: '`Idle` keeps whether the reader has been inactive for a timeout. Leave the page alone for five seconds, then move the pointer.',
  state: Idle.with({ timeoutMs: 5000 }),
  view: ({ model, h }) =>
    h.p([], [model.idle ? 'Idle: nothing for five seconds.' : 'Active: five seconds from idle.']),
})
