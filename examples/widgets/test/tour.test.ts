/**
 * The tour section's update: starting and walking the tour, how it ended
 * (from `Ended`) kept beside it, the floating panel opening and closing, and
 * a Message that changes nothing keeping the Model. Focus returning to the
 * opener is `tour.browser.test.ts`'s.
 */
import { Option } from 'effect'
import { FloatingPanel, Tour } from 'foldkit-mixins-ui'
import { describe, expect, it } from 'vitest'
import { Message, initial, update } from '../src/tour/app.js'
import { island } from '../src/tour/island.js'

const gotTour = (message: Tour.Message) => Message.GotTourMessage({ message })
const gotPanel = (message: FloatingPanel.Message) => Message.GotPanelMessage({ message })

const started = update(initial, Message.StartedTour())

describe('the tour', () => {
  it('starts at its first step and asks for it to be shown', () => {
    expect(started.model.tour.open).toBe(true)
    expect(started.model.tour.step).toBe(0)
    expect(started.commands?.length).toBeGreaterThan(0)
  })

  it('finishes on the last step’s Next, and says it finished', () => {
    const second = update(started.model, gotTour(Tour.Message.Next())).model
    expect(second.tour.step).toBe(1)
    const done = update(second, gotTour(Tour.Message.Next())).model
    expect(done.tour.open).toBe(false)
    expect(done.ending).toEqual(Option.some('finished'))
  })

  it('is skipped by Skip and by Escape, and says it was skipped', () => {
    for (const message of [Tour.Message.Skipped(), Tour.Message.Pressed({ key: 'Escape' })]) {
      const skipped = update(started.model, gotTour(message)).model
      expect(skipped.tour.open).toBe(false)
      expect(skipped.ending).toEqual(Option.some('skipped'))
    }
  })

  it('keeps how it last ended when it is started again, until it ends again', () => {
    const skipped = update(started.model, gotTour(Tour.Message.Skipped())).model
    const again = update(skipped, Message.StartedTour()).model
    expect(again.ending).toEqual(Option.some('skipped'))
    expect(update(again, gotTour(Tour.Message.Next())).model.ending).toEqual(Option.some('skipped'))
  })

  it('says how it ended last, when it is run a second time', () => {
    const skipped = update(started.model, gotTour(Tour.Message.Skipped())).model
    const again = update(skipped, Message.StartedTour()).model
    const second = update(again, gotTour(Tour.Message.Next())).model
    expect(update(second, gotTour(Tour.Message.Next())).model.ending).toEqual(
      Option.some('finished'),
    )
  })

  it('keeps the Model for a Message while it is closed', () => {
    expect(update(initial, gotTour(Tour.Message.Skipped())).model).toBe(initial)
  })
})

describe('the floating panel', () => {
  it('opens and asks for its focus, and closes where it was', () => {
    const opened = update(initial, Message.OpenedNotes())
    expect(opened.model.panel.open).toBe(true)
    expect(opened.commands?.length).toBeGreaterThan(0)
    const closed = update(opened.model, gotPanel(FloatingPanel.Message.Closed())).model
    expect(closed.panel.open).toBe(false)
    expect(closed.panel.rect).toEqual(initial.panel.rect)
  })

  it('keeps the Model when it is opened while open, and closed while closed', () => {
    const opened = update(initial, Message.OpenedNotes()).model
    expect(update(opened, Message.OpenedNotes()).model).toBe(opened)
    expect(update(initial, gotPanel(FloatingPanel.Message.Closed())).model).toBe(initial)
  })
})

describe('demo', () => {
  it('traces the tour to its skip, and the panel open and closed', () => {
    expect(island.runDemo()).toEqual([
      'start: tour open=false notes open=false',
      'started the tour: tour step=0 open=true; The tour has not ended yet',
      'Next: tour step=1 open=true; The tour has not ended yet',
      'Skip: tour step=1 open=false; The tour skipped',
      'opened the notes: open=true',
      'closed the notes: open=false',
    ])
  })
})
