/**
 * `Utilities.busyReveal` on a real status: a busy line stays transparent
 * through the first 0.6s of a wait, so a read answered sooner never shows it,
 * and fades in after; a line that is not busy shows at once. The animation is
 * paused and moved by hand, so the test reads its own time, not the runner's.
 */
import { afterEach, expect, test } from 'vitest'
import { Layers, Style } from '../src/index.js'
import { Theme } from '../src/theme.js'
import { Utilities } from '../src/utilities.js'

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const status = (busy: boolean, theme = Theme.make({})) => {
  const sheet = Style.stylesheet(
    Layers.standard.declare,
    Layers.standard.in('tokens', Theme.root(Theme.standard(theme))),
    Layers.standard.in('components', Style.compose(Utilities.busyReveal)),
  )
  const style = document.createElement('style')
  style.dataset['test'] = ''
  style.textContent = sheet
  document.head.append(style)
  const element = document.createElement('p')
  element.className = /\.(style-[a-z0-9]+)\[/.exec(
    sheet.slice(sheet.indexOf('@layer components')),
  )![1]!
  element.setAttribute('role', 'status')
  if (busy) element.setAttribute('aria-busy', 'true')
  element.textContent = 'Loading…'
  document.body.append(element)
  return element
}

/** The element's opacity `ms` into its wait. */
const opacityAt = (element: HTMLElement, ms: number): number => {
  const [animation] = element.getAnimations()
  animation!.pause()
  animation!.currentTime = ms
  return Number(getComputedStyle(element).opacity)
}

test('a busy line is held back through a quick answer, and shown once the wait is noticeable', () => {
  const element = status(true)
  expect(opacityAt(element, 0)).toBe(0)
  expect(opacityAt(element, 400)).toBe(0)
  expect(opacityAt(element, 590)).toBe(0)
  expect(opacityAt(element, 1000)).toBe(1)
})

test('a line that is not busy shows at once', () => {
  const element = status(false)
  expect(element.getAnimations()).toEqual([])
  expect(Number(getComputedStyle(element).opacity)).toBe(1)
})

test('a still theme snaps the line in, but waits just as long', () => {
  const element = status(true, Theme.make({ motion: { scale: 0 } }))
  expect(opacityAt(element, 590)).toBe(0)
  expect(opacityAt(element, 610)).toBe(1)
})
