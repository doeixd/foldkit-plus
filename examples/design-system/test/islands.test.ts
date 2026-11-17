// @vitest-environment jsdom
/**
 * Every island boots into the container the page leaves for it: its code loads,
 * its runtime draws a section, and the page's own container stays.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { bootIslands, islandContainerId } from '../src/islands.js'

const ids = [
  'buttons',
  'form',
  'choice',
  'overlays',
  'feedback',
  'navigation',
  'calendar',
  'collections',
  'utilities',
]

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

it('draws each island under its heading, once it is near', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  for (const id of ids) {
    const container = document.createElement('div')
    container.id = islandContainerId(id)
    document.body.append(container)
  }
  bootIslands()
  for (const id of ids) {
    const container = document.getElementById(islandContainerId(id))!
    await vi.waitFor(() => expect(container.querySelector('h2, p, button')).not.toBeNull(), {
      timeout: 20_000,
    })
  }
  expect(ids.every(id => document.getElementById(islandContainerId(id)) !== null)).toBe(true)
}, 60_000)

it('names the island that has no container', () => {
  expect(() => bootIslands()).toThrow('#buttons-island is missing from the page')
})
