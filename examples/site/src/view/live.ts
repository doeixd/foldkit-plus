/**
 * Two primitives running in the page, on the Primitives overview: the site
 * places `PrefersDark` and `Timer` in its own Model, and this draws what each
 * placement holds there, beside the controls that send it Messages.
 */
import type { Html } from 'foldkit/html'
import { TimerMessage } from 'foldkit-primitives/time'

import { Message, type Model } from '../main.js'
import type { H, Slots } from './layout.js'

/** The page that shows them. */
export const LIVE_PATH = '/primitives'

const tick = (message: TimerMessage) => Message.GotTicksMessage({ message })

export const livePrimitives = (model: Model, slots: Slots, h: H): Html =>
  h.section(slots.live.attrs([h.AriaLabelledBy('running-here')]), [
    h.h2([h.Id('running-here')], ['Running in this page']),
    h.p(
      [],
      [
        'This site places two primitives in its own Model. What each holds is drawn from that Model, as it changes.',
      ],
    ),
    h.div(slots.liveRow.attrs(), [
      h.p(
        [],
        [
          h.code([], ['PrefersDark']),
          ` · your system asks for a ${model.dark.matches ? 'dark' : 'light'} color scheme.`,
        ],
      ),
      h.code(slots.liveValue.attrs(), [`model.dark = { matches: ${model.dark.matches} }`]),
    ]),
    h.div(slots.liveRow.attrs(), [
      h.p(
        [],
        [
          h.code([], ['Timer']),
          ` · ${model.ticks.count} ${model.ticks.count === 1 ? 'tick' : 'ticks'}. `,
          h.button(
            slots.liveButton.attrs([
              h.Type('button'),
              h.OnClick(
                tick(model.ticks.running ? TimerMessage.Stopped() : TimerMessage.Started()),
              ),
            ]),
            [model.ticks.running ? 'Stop' : 'Start'],
          ),
        ],
      ),
      h.code(slots.liveValue.attrs(), [
        `model.ticks = { count: ${model.ticks.count}, running: ${model.ticks.running} }`,
      ]),
    ]),
  ])
