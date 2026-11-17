/**
 * The tour section in a real browser: the Tour and the floating panel each
 * give focus back, when they end, to the control that opened them, though no
 * Model names it. The tour is left by Escape from the step, and by Done from a
 * button inside it, which the end removes; the panel by Escape and by its
 * Close control. A press that took no focus gives focus back to what had it.
 */
import * as Runtime from 'foldkit/runtime'
import { Style } from 'foldkit-mixins'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Model, SAVE_ID, SEARCH_ID, initial, update } from '../src/tour/app.js'
import { island } from '../src/tour/island.js'
import { NOTES_OPEN_ID, START_ID, TourIsland } from '../src/tour/view.js'
import { pageStylesheet } from '../src/style.js'

let dispose = () => {}
afterEach(() => {
  dispose()
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  // Still, so the cutout rests where it is going as soon as it is drawn.
  sheet.textContent =
    pageStylesheet + Style.stylesheet(island.style()) + ':root { --fk-knob-travel: 0 }'
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'tour'
  document.body.append(container)
  dispose = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: initial }),
      update,
      view: TourIsland,
    }),
  ).dispose
}

const byId = (id: string) => document.getElementById(id)!
const tourPanel = () => document.getElementById('tour-tour-panel')
const notesPanel = () => document.getElementById('tour-notes-panel')
const status = () => document.querySelector('p[aria-live="polite"]')?.textContent
const inside = (panel: HTMLElement, name: string) =>
  panel.querySelector<HTMLElement>(`button[aria-label="${name}"]`) ??
  Array.from(panel.querySelectorAll('button')).find(button => button.textContent === name)!

const startTour = async () => {
  mount()
  await vi.waitFor(() => expect(byId(START_ID)).not.toBeNull())
  byId(START_ID).focus()
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(document.activeElement).toBe(tourPanel()))
  return tourPanel()!
}

test('Escape ends the tour and focus goes back to the button that started it', async () => {
  await startTour()
  await userEvent.keyboard('{Escape}')
  await vi.waitFor(() => expect(tourPanel()).toBeNull())
  expect(status()).toBe('The tour skipped')
  await vi.waitFor(() => expect(document.activeElement).toBe(byId(START_ID)))
})

test('Done, pressed inside the last step, ends it and focus goes back to the starter', async () => {
  const panel = await startTour()
  await userEvent.keyboard('{ArrowRight}')
  await vi.waitFor(() => expect(tourPanel()!.textContent).toContain('2 of 2'))
  await vi.waitFor(() => expect(document.activeElement).toBe(tourPanel()))
  const done = inside(tourPanel()!, 'Done')
  done.focus()
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(tourPanel()).toBeNull())
  expect(panel.isConnected).toBe(false)
  expect(status()).toBe('The tour finished')
  await vi.waitFor(() => expect(document.activeElement).toBe(byId(START_ID)))
})

test('a start that took no focus gives focus back to what had it', async () => {
  mount()
  await vi.waitFor(() => expect(byId(START_ID)).not.toBeNull())
  byId(SEARCH_ID).focus()
  // `click()` presses without moving focus, as a press in Safari does.
  byId(START_ID).click()
  await vi.waitFor(() => expect(document.activeElement).toBe(tourPanel()))
  await userEvent.keyboard('{Escape}')
  await vi.waitFor(() => expect(tourPanel()).toBeNull())
  await vi.waitFor(() => expect(document.activeElement).toBe(byId(SEARCH_ID)))
  expect(document.activeElement).not.toBe(byId(SAVE_ID))
})

const openNotes = async () => {
  mount()
  await vi.waitFor(() => expect(byId(NOTES_OPEN_ID)).not.toBeNull())
  byId(NOTES_OPEN_ID).focus()
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(document.activeElement).toBe(notesPanel()))
}

test('Escape closes the floating panel and focus goes back to the button that opened it', async () => {
  await openNotes()
  await userEvent.keyboard('{Escape}')
  await vi.waitFor(() => expect(notesPanel()).toBeNull())
  await vi.waitFor(() => expect(document.activeElement).toBe(byId(NOTES_OPEN_ID)))
})

test('the panel’s Close control gives focus back too, and the panel opens again from the same button', async () => {
  await openNotes()
  const close = inside(notesPanel()!, 'Close')
  close.focus()
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(notesPanel()).toBeNull())
  await vi.waitFor(() => expect(document.activeElement).toBe(byId(NOTES_OPEN_ID)))
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(document.activeElement).toBe(notesPanel()))
})

test('the tour and the panel each go back to their own opener', async () => {
  await openNotes()
  // The notes stay open while the tour runs from the other button.
  byId(START_ID).focus()
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(document.activeElement).toBe(tourPanel()))
  await userEvent.keyboard('{Escape}')
  await vi.waitFor(() => expect(tourPanel()).toBeNull())
  await vi.waitFor(() => expect(document.activeElement).toBe(byId(START_ID)))
  expect(notesPanel()).not.toBeNull()
})
