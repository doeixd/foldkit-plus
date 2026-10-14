/**
 * `Utilities.scrollFade` on a real scroller: its start edge is solid until
 * the content scrolls past it, and its end edge fades until the end is
 * reached, as the scroll timeline moves the mask's ends.
 */
import { afterEach, expect, test, vi } from 'vitest'
import { Layers, Style } from '../src/index.js'
import { Theme } from '../src/theme.js'
import { Utilities } from '../src/utilities.js'

const fade = Style.compose(
  Style.self({ blockSize: '200px', overflowY: 'auto' }),
  Utilities.scrollFade('block'),
)

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const scroller = () => {
  const sheet = Style.stylesheet(
    Layers.standard.declare,
    Layers.standard.in('tokens', Theme.root(Theme.tokens)),
    Layers.standard.in('components', fade),
  )
  const style = document.createElement('style')
  style.dataset['test'] = ''
  style.textContent = sheet
  document.head.append(style)
  const element = document.createElement('div')
  element.className = /\.(style-[a-z0-9]+)\{/.exec(
    sheet.slice(sheet.indexOf('@layer components')),
  )![1]!
  element.innerHTML = '<div style="block-size: 1000px"></div>'
  document.body.append(element)
  return element
}

const ends = (element: HTMLElement) => {
  const style = getComputedStyle(element)
  return [style.getPropertyValue('--_fk-fade-start'), style.getPropertyValue('--_fk-fade-end')]
}

test('the start is solid at the top, and the end fades while there is more below', async () => {
  const element = scroller()
  // The timeline resolves on the next frame.
  await vi.waitFor(() => expect(ends(element)).toEqual(['1', '0']))
})

test('past the fade, both edges dissolve; at the end, the end is solid', async () => {
  const element = scroller()
  element.scrollTop = 300
  await vi.waitFor(() => expect(ends(element)).toEqual(['0', '0']))
  element.scrollTop = element.scrollHeight
  await vi.waitFor(() => expect(ends(element)).toEqual(['0', '1']))
})
