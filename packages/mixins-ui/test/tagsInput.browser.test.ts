/// <reference types="@vitest/browser-playwright" />
/**
 * TagsInput in a real browser: keys typed faster than a frame still add the
 * tag, a refused commit shakes the field once and a second refusal plays
 * the shake again, and under reduced motion, or a theme with no travel,
 * the field does not move.
 */
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { cdp, userEvent } from 'vitest/browser'
import { Recipes, TagsInput, TagsInputSlots } from '../src/index.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const style = Style.forSlots(TagsInputSlots)(Recipes.TagsInput({}))

const reduce = (value: 'reduce' | 'no-preference') =>
  cdp().send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value }],
  })

afterEach(async () => {
  await reduce('no-preference')
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) + style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'tags-input-browser'
  document.body.append(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model: TagsInput.Model,
      container,
      init: () => ({ model: TagsInput.init({ id: 'topics' }) }),
      update: (model: TagsInput.Model, message: TagsInput.Message) => {
        const next = TagsInput.update(model, message)
        return { model: next.model, commands: next.commands ?? [] }
      },
      view: (model: TagsInput.Model, h: HtmlBuilder<TagsInput.Message>) =>
        TagsInput.view({ model, onMessage: message => message, label: 'Topics', style }, h),
    }),
  )
}

const input = () => document.getElementById('topics-input')!
const control = () => input().parentElement!
const status = () => document.getElementById('topics-message')!

test('a tag typed and committed in one burst is added, and its repeat shakes the field', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(document.getElementById('topics-input')).not.toBeNull())
    input().focus()
    await userEvent.keyboard('react{Enter}react{Enter}')
    await vi.waitFor(() => expect(status().textContent).toBe('react is already added'))
    expect([...document.querySelectorAll('li')].map(tag => tag.firstChild?.textContent)).toEqual([
      'react',
    ])
    // Refused whole, the draft stays to be seen.
    expect((input() as HTMLInputElement).value).toBe('react')
    const first = getComputedStyle(control()).animationName
    expect(first).not.toBe('none')
    expect(getComputedStyle(control()).animationDuration).not.toBe('0s')
    await userEvent.keyboard('{Enter}')
    // The second refusal plays another shake, under the other name.
    await vi.waitFor(() => expect(getComputedStyle(control()).animationName).not.toBe(first))
    expect(getComputedStyle(control()).animationName).not.toBe('none')
  } finally {
    handle.dispose()
  }
})

test('under reduced motion a refusal does not move the field', async () => {
  await reduce('reduce')
  const handle = mount()
  try {
    await vi.waitFor(() => expect(document.getElementById('topics-input')).not.toBeNull())
    input().focus()
    await userEvent.keyboard(' {Enter}')
    await vi.waitFor(() => expect(status().textContent).toBe('Type a tag to add'))
    // The reset's floor under reduced motion, which a duration of 0 meets.
    expect(parseFloat(getComputedStyle(control()).animationDuration)).toBeLessThan(0.001)
  } finally {
    handle.dispose()
  }
})

test('a theme with no travel stills the shake', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(document.getElementById('topics-input')).not.toBeNull())
    control().style.setProperty('--fk-knob-travel', '0')
    input().focus()
    await userEvent.keyboard(' {Enter}')
    await vi.waitFor(() => expect(status().textContent).toBe('Type a tag to add'))
    expect(getComputedStyle(control()).animationDuration).toBe('0s')
  } finally {
    handle.dispose()
  }
})
