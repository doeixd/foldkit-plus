import { LiveAnnounce } from 'foldkit-primitives/interaction'
import { primitiveExample } from '../../../gallery/primitiveExample.js'

// The regions are drawn in the page's first view and hidden by a rule; here they are visible, so you can read what a screen reader is told.
export default primitiveExample({
  title: 'LiveAnnounce',
  text: '`LiveAnnounce` holds the text of a polite and an assertive live region. A burst of announcements reads once, the last; the same text twice is made to read again. Press quickly.',
  state: LiveAnnounce.bundle.with({ debounceMs: 250, clearAfterMs: 4000 }),
  view: ({ model, onMessage, slots, h }) =>
    h.div(
      [],
      [
        h.button(
          slots.liveButton.attrs([
            h.Type('button'),
            h.OnClick(
              onMessage(
                LiveAnnounce.Message.Announced({ message: 'Saved.', politeness: 'polite' }),
              ),
            ),
          ]),
          ['Announce “Saved.”'],
        ),
        h.button(
          slots.liveButton.attrs([
            h.Type('button'),
            h.OnClick(
              onMessage(
                LiveAnnounce.Message.Announced({
                  message: 'Connection lost.',
                  politeness: 'assertive',
                }),
              ),
            ),
          ]),
          ['Announce an alert'],
        ),
        LiveAnnounce.view(model, h),
      ],
    ),
})
