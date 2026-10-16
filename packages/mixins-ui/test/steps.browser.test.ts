/**
 * Steps laid out by a real browser: a vertical stepper's line runs from a
 * marker's foot to the next marker's top, however tall the words beside it,
 * and a row in a phone-wide container shows only the current step's label,
 * clear of its neighbours' markers.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { Recipes, Steps, StepsSlots } from '../src/index.js'

const Model = Schema.Struct({})

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const steps = [
  { title: 'Account', description: 'Your name, your email, and a password long enough to keep.' },
  { title: 'Workspace settings', description: 'Where your team works' },
  { title: 'Invite your team', description: 'Who works with you' },
  { title: 'Done' },
]

const mount = (orientation: 'horizontal' | 'vertical', width: string) => {
  const style = Style.forSlots(StepsSlots)(Recipes.Steps({ orientation }))
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('theme', Theme.root(Theme.tokens)),
    ) + style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'steps-browser'
  document.body.append(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: typeof Model.Type) => ({ model }),
      view: (_: unknown, h: HtmlBuilder<never>) =>
        h.div(
          [h.Style({ inlineSize: width })],
          [Steps.view({ label: 'Sign up', steps, current: 1, style }, h)],
        ),
    }),
  )
}

const all = (selector: string) => Array.from(document.querySelectorAll<HTMLElement>(selector))
const markers = () => all('li [data-state][aria-hidden="true"]:first-child')

test('a vertical line runs from each marker to the next', async () => {
  const handle = mount('vertical', '24rem')
  try {
    await vi.waitFor(() => expect(markers()).toHaveLength(4))
    const lines = all('li > span[aria-hidden="true"]')
    expect(lines).toHaveLength(3)
    lines.forEach((line, index) => {
      const box = line.getBoundingClientRect()
      expect(Math.abs(box.top - markers()[index]!.getBoundingClientRect().bottom)).toBeLessThan(1)
      expect(Math.abs(box.bottom - markers()[index + 1]!.getBoundingClientRect().top)).toBeLessThan(
        1,
      )
    })
  } finally {
    handle.dispose()
  }
})

test('a phone-wide row shows the current label alone, clear of the markers beside it', async () => {
  const handle = mount('horizontal', '390px')
  try {
    await vi.waitFor(() => expect(markers()).toHaveLength(4))
    // A label kept for a screen reader alone is clipped to a pixel.
    const shown = all('li [data-state][aria-hidden] + span').filter(
      text => text.getBoundingClientRect().width > 1,
    )
    expect(shown.map(text => text.firstElementChild!.textContent)).toEqual(['Workspace settings'])
    // Where the words are drawn, which runs past their box when it is squeezed.
    const ink = document.createRange()
    ink.selectNodeContents(shown[0]!.firstElementChild!)
    const words = ink.getBoundingClientRect()
    // The current step takes the room the others leave, so its title keeps one line.
    expect(ink.getClientRects()).toHaveLength(1)
    expect(words.right).toBeLessThanOrEqual(markers()[2]!.getBoundingClientRect().left)
    expect(words.left).toBeGreaterThanOrEqual(markers()[1]!.getBoundingClientRect().right)
  } finally {
    handle.dispose()
  }
})
