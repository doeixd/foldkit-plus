/**
 * `Utilities.scrollDivider` on a real scroller's parent: no line at the top
 * until the content scrolls past it, a line at the end until the end is
 * reached, and none at all over content with nothing to scroll.
 */
import { afterEach, expect, test, vi } from 'vitest'
import { Layers, Style, type StyleValue } from '../src/index.js'
import { Theme } from '../src/theme.js'
import { Utilities } from '../src/utilities.js'

const parent = Style.compose(Style.self({ position: 'relative' }), Utilities.scrollDivider('block'))
const scroller = Style.compose(
  Style.self({ blockSize: '200px', overflowY: 'auto' }),
  Utilities.scrollTimeline('block'),
)

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

/** Installs `piece` alone and returns the class its rules are written on. */
const install = (piece: StyleValue) => {
  const sheet = Style.stylesheet(
    Layers.standard.declare,
    Layers.standard.in('tokens', Theme.root(Theme.tokens)),
    Layers.standard.in('components', piece),
  )
  const style = document.createElement('style')
  style.dataset['test'] = ''
  style.textContent = sheet
  document.head.append(style)
  return /\.(style-[a-z0-9]+)\{/.exec(sheet.slice(sheet.indexOf('@layer components')))![1]!
}

const area = (contentHeight: string) => {
  const outer = document.createElement('div')
  outer.className = install(parent)
  const inner = document.createElement('div')
  inner.className = install(scroller)
  inner.innerHTML = `<div style="block-size: ${contentHeight}"></div>`
  outer.append(inner)
  document.body.append(outer)
  return { outer, inner }
}

const lines = (element: HTMLElement) => [
  getComputedStyle(element, '::before').opacity,
  getComputedStyle(element, '::after').opacity,
]

test('no line at the top until something is past it, and one at the end while more is below', async () => {
  const { outer, inner } = area('1000px')
  await vi.waitFor(() => expect(lines(outer)).toEqual(['0', '1']))
  inner.scrollTop = 300
  await vi.waitFor(() => expect(lines(outer)).toEqual(['1', '1']))
  inner.scrollTop = inner.scrollHeight
  await vi.waitFor(() => expect(lines(outer)).toEqual(['1', '0']))
})

test('no line at either edge of content with nothing to scroll', async () => {
  const { outer } = area('100px')
  // The timeline has no range, so neither animation applies and both rest unseen.
  await new Promise(resolve => requestAnimationFrame(resolve))
  await new Promise(resolve => requestAnimationFrame(resolve))
  expect(lines(outer)).toEqual(['0', '0'])
})
