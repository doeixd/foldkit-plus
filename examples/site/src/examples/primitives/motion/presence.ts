import { Presence, PresenceMessage, isVisible } from 'foldkit-primitives/motion'
import { primitiveExample } from '../../../gallery/primitiveExample.js'

// `hiding` keeps the node drawn for `durationMs`, so a transition can run before it is removed.
export default primitiveExample({
  title: 'Presence',
  text: '`Presence` shows and hides with a leave phase: after `Hide` the phase is `hiding` for the duration, then `hidden`. The box fades in that gap and is removed after it.',
  state: Presence.with({ durationMs: 300 }),
  view: ({ model, onMessage, slots, h }) =>
    h.div(
      [],
      [
        h.button(
          slots.liveButton.attrs([
            h.Type('button'),
            h.OnClick(
              onMessage(model.phase === 'shown' ? PresenceMessage.Hide() : PresenceMessage.Show()),
            ),
          ]),
          [model.phase === 'shown' ? 'Hide' : 'Show'],
        ),
        ...(isVisible(model)
          ? [
              h.div(
                slots.liveBox.attrs([
                  h.Style({
                    opacity: model.phase === 'hiding' ? '0' : '1',
                    transition: 'opacity 300ms',
                  }),
                ]),
                [`Phase: ${model.phase}.`],
              ),
            ]
          : []),
      ],
    ),
})
