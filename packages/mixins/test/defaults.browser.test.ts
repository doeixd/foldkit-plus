/**
 * What plain HTML gets from `Defaults` over a palette, in a real browser:
 * native controls in the accent, a rule and a key drawn as lines.
 */
import { afterEach, expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Layers, Style } from '../src/index.js'
import { Defaults } from '../src/defaults.js'
import { Theme } from '../src/theme.js'
import { force, nodeOf } from './pseudoState.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const L = Layers.standard

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const install = () => {
  const style = document.createElement('style')
  style.dataset['test'] = ''
  style.textContent = Style.stylesheet(
    L.declare,
    L.in('defaults', Defaults.all),
    L.in('theme', Theme.root(theme, { colorScheme: 'light' })),
  )
  document.head.append(style)
}

const add = (html: string): Element => {
  const holder = document.createElement('div')
  holder.innerHTML = html
  document.body.append(holder)
  const first = holder.firstElementChild
  if (first === null) throw new Error('no element')
  return first
}

test('native checkboxes, radios and ranges take the accent', () => {
  install()
  const accent = getComputedStyle(add('<span style="color:var(--fk-accent-default)"></span>')).color
  expect(getComputedStyle(add('<input type="checkbox">')).accentColor).toBe(accent)
})

test('a rule is one line, and a key a raised one', () => {
  install()
  const rule = getComputedStyle(add('<hr>'))
  expect([rule.borderTopStyle, rule.borderTopWidth, rule.borderBottomStyle]).toEqual([
    'solid',
    '1px',
    'none',
  ])
  const key = getComputedStyle(add('<kbd>K</kbd>'))
  expect([key.borderTopWidth, key.borderBottomWidth]).toEqual(['1px', '2px'])
})

test('a button that reads aria-disabled is dimmed and does not light under the pointer', async () => {
  install()
  const live = add('<button type="button">Live</button>') as HTMLElement
  const held = add('<button type="button" aria-disabled="true">Held</button>') as HTMLElement
  const restLive = getComputedStyle(live).backgroundColor
  const restHeld = getComputedStyle(held).backgroundColor
  expect(getComputedStyle(held).opacity).toBe('0.5')
  expect(getComputedStyle(live).opacity).toBe('1')

  // The live button shows the hover fill, so the held one staying put means something.
  await userEvent.hover(live)
  expect(getComputedStyle(live).backgroundColor).not.toBe(restLive)
  await userEvent.hover(held)
  expect(getComputedStyle(held).backgroundColor).toBe(restHeld)
})

test('a pressed button that reads aria-disabled keeps its resting fill (#530)', async () => {
  install()
  const live = add(
    '<button type="button" id="live" style="transition:none">Live</button>',
  ) as HTMLElement
  const restLive = getComputedStyle(live).backgroundColor
  const liveNode = await nodeOf('#live')
  await force(liveNode, ['active'])
  // The live button shows the pressed fill, so the held ones staying put means something.
  expect(getComputedStyle(live).backgroundColor).not.toBe(restLive)
  await force(liveNode, [])

  for (const html of [
    '<button type="submit" id="held" aria-disabled="true" style="transition:none">Held</button>',
    '<input type="submit" id="held" aria-disabled="true" value="Held" style="transition:none">',
  ]) {
    const held = add(html) as HTMLElement
    const rest = getComputedStyle(held).backgroundColor
    expect(getComputedStyle(held).opacity).toBe('0.5')
    const node = await nodeOf('#held')
    await force(node, ['active'])
    expect(getComputedStyle(held).backgroundColor).toBe(rest)
    await force(node, [])
    held.parentElement?.remove()
  }
})
