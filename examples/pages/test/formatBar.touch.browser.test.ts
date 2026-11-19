/**
 * The formatting bar on a touch phone, in Chromium with a coarse pointer: its controls are
 * 44px targets, and what stays beside More fits one row at the narrowest phones, with every
 * control whole and on the screen. At 32px targets eight controls fit a phone; at 44px they
 * wrapped to a second row, which this reads as a bar twice as tall.
 */
import { Effect } from 'effect'
import { ReplicaId, type Storage } from 'foldkit-sync'
import { afterEach, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { mountPages, PagesSync } from '../src/contract.js'
import { NARROW, stylesheet } from '../src/style.js'
import { view } from '../src/view.js'

const memoryStorage = (): Storage => {
  let stored: unknown
  return {
    load: () => Effect.sync(() => stored),
    save: next => Effect.sync(() => (stored = structuredClone(next))),
    close: Effect.void,
  }
}

let dispose = async () => {}
afterEach(async () => {
  await dispose()
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = async () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent = stylesheet
  document.head.append(sheet)
  const replica = await Effect.runPromise(
    PagesSync.openReplica(memoryStorage(), { replicaId: ReplicaId.make('tab-1') }),
  )
  const container = document.createElement('div')
  container.id = 'pages'
  document.body.append(container)
  const mounted = mountPages('s1', replica, {
    container,
    view,
    narrow: matchMedia(NARROW).matches,
  })
  dispose = async () => mounted.dispose()
}

it.each([390, 360])(
  'at %ipx the bar is one row of whole 44px controls on the screen',
  async width => {
    await page.viewport(width, 844)
    expect(matchMedia('(pointer: coarse)').matches).toBe(true)
    await mount()
    await vi.waitFor(() => expect(document.getElementById('new-page')).not.toBeNull())
    await userEvent.click(document.getElementById('new-page')!)
    const bar = await vi.waitFor(() => {
      const element = document.querySelector('[role="toolbar"][aria-label="Formatting"]')
      expect(element).not.toBeNull()
      return element!
    })
    const root = document.documentElement
    const edge = bar.getBoundingClientRect()
    const buttons = [...bar.querySelectorAll('button')].map(button =>
      button.getBoundingClientRect(),
    )
    expect(bar.querySelector('[data-item="more"]')).not.toBeNull()
    // One row: every control at one height, and the bar no taller than a control and its padding.
    expect(new Set(buttons.map(({ top }) => Math.round(top))).size).toBe(1)
    expect(edge.height).toBeLessThan(44 + 24)
    for (const button of buttons) {
      expect(button.width).toBeGreaterThanOrEqual(44)
      expect(button.height).toBeGreaterThanOrEqual(44)
      // Whole: inside the bar, and so inside the screen.
      expect(button.left).toBeGreaterThanOrEqual(edge.left)
      expect(button.right).toBeLessThanOrEqual(edge.right)
    }
    expect(edge.right).toBeLessThanOrEqual(root.clientWidth)
    expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth)
  },
)
