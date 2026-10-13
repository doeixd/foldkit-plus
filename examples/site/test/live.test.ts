/**
 * The primitives the Primitives overview runs: each placement takes its own
 * wrapper Message, and every other Message still reaches the site's update.
 */
import { MediaQueryMessage } from 'foldkit-primitives/media'
import { TimerMessage } from 'foldkit-primitives/time'
import { describe, expect, it } from 'vitest'

import { Message, initial, update } from '../src/main.js'

describe('the placed primitives', () => {
  it('start at their defaults: no dark preference read yet, the timer stopped at zero', () => {
    expect(initial.dark).toEqual({ matches: false })
    expect(initial.ticks).toEqual({ count: 0, running: false })
  })

  it('route each wrapper to its placement', () => {
    const started = update(initial, Message.GotTicksMessage({ message: TimerMessage.Started() }))
    expect(started.model.ticks).toEqual({ count: 0, running: true })
    const ticked = update(
      started.model,
      Message.GotTicksMessage({ message: TimerMessage.Ticked() }),
    )
    expect(ticked.model.ticks.count).toBe(1)
    const dark = update(
      initial,
      Message.GotDarkMessage({ message: MediaQueryMessage.Changed({ matches: true }) }),
    )
    expect(dark.model.dark).toEqual({ matches: true })
  })

  it("leave the site's own Messages to its own update", () => {
    expect(update(initial, Message.ToggledMenu()).model.menuOpen).toBe(true)
    expect(update(initial, Message.CopiedCode()).model).toBe(initial)
  })
})
