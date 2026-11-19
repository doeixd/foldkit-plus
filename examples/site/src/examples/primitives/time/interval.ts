import { Interval, IntervalMessage } from 'foldkit-primitives/time'
import { primitiveExample } from '../../../gallery/primitiveExample.js'

// Each tick carries Effect's clock, so the view shows a time without reading one.
export default primitiveExample({
  title: 'Interval',
  text: '`Interval` stamps each tick with the time. The clock below runs while it is started and stops with the bundle.',
  state: Interval.with({ intervalMs: 1000 }),
  view: ({ model, onMessage, slots, h }) =>
    h.p(
      [],
      [
        model.lastAt === null
          ? 'Not started. '
          : `${new Date(model.lastAt).toISOString().slice(11, 19)} UTC `,
        h.button(
          slots.liveButton.attrs([
            h.Type('button'),
            h.OnClick(
              onMessage(model.running ? IntervalMessage.Stopped() : IntervalMessage.Started()),
            ),
          ]),
          [model.running ? 'Stop' : 'Start'],
        ),
      ],
    ),
})
