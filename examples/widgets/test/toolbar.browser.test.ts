/**
 * The toolbar as the page draws it, in a real browser: a tool is quiet on the
 * tray, fills under the pointer, takes the accent when pressed (and keeps it
 * under the pointer), and a disabled one is dimmer and does not fill.
 */
import { Style } from 'foldkit-mixins'
import { AppStyle } from 'foldkit-mixins/app'
import { afterEach, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { pageStylesheet } from '../src/style.js'
import { islands } from '../src/widgets.js'

const island = islands[0]
const t = AppStyle.make({}).t

/** What a token paints as, which the sheet resolves. */
const painted = (property: 'color' | 'backgroundColor', value: string) => {
  const probe = document.createElement('i')
  probe.style[property] = value
  document.body.append(probe)
  const result = getComputedStyle(probe)[property]
  probe.remove()
  return result
}

afterEach(async () => {
  await userEvent.hover(document.body, { position: { x: 1, y: 1 } })
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const tool = (name: string) =>
  Array.from(document.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button')).find(
    button => button.textContent === name,
  )!
const look = (name: string) => {
  const style = getComputedStyle(tool(name))
  return { fill: style.backgroundColor, ink: style.color, opacity: style.opacity }
}

const draw = async () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent = pageStylesheet + Style.stylesheet(island.style())
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'toolbar-browser'
  document.body.append(container)
  island.mount(container)
  await vi.waitFor(() =>
    expect(document.querySelectorAll('[role="toolbar"] button')).toHaveLength(4),
  )
}

const settled = () => vi.waitFor(() => expect(document.getAnimations()).toHaveLength(0))

it('a tool is quiet at rest, fills under the pointer, and a disabled one does not', async () => {
  await draw()
  const rest = look('Italic')
  expect(rest.fill).toBe('rgba(0, 0, 0, 0)')
  await userEvent.hover(tool('Italic'))
  await vi.waitFor(() => expect(look('Italic').fill).not.toBe(rest.fill))
  await settled()
  const disabled = look('Strikethrough')
  expect(Number(disabled.opacity)).toBeLessThan(0.75)
  await userEvent.hover(tool('Strikethrough'))
  await settled()
  expect(look('Strikethrough').fill).toBe(disabled.fill)
})

it('a pressed tool takes the accent tint and ink, which hovering it keeps', async () => {
  await draw()
  const rest = look('Bold')
  tool('Bold').click()
  await vi.waitFor(() => expect(tool('Bold').getAttribute('aria-pressed')).toBe('true'))
  await settled()
  const pressed = look('Bold')
  expect(pressed.fill).not.toBe(rest.fill)
  expect(pressed.ink).toBe(painted('color', t.accent.ink))
  expect(pressed.fill).toBe(painted('backgroundColor', t.accent.subtle))
  await userEvent.hover(tool('Bold'))
  await settled()
  expect(look('Bold')).toEqual(pressed)
  // The press is a different state from the hover of a tool that is off.
  await userEvent.hover(tool('Link'))
  await settled()
  expect(look('Link').fill).not.toBe(pressed.fill)
})
