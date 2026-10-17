/// <reference types="@vitest/browser-playwright" />
/**
 * PasswordInput in a real browser: a met requirement's ring is filled in the
 * success ink and an unmet one hollow, and the silent Caps Lock hint takes
 * no room under the field.
 */
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Schema } from 'effect'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { PasswordInput, PasswordInputSlots, Recipes } from '../src/index.js'
import { message, type TestMessage } from './fixture.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const style = Style.forSlots(PasswordInputSlots)(Recipes.PasswordInput({}))
const Model = Schema.Struct({ capsLock: Schema.Boolean })

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = (capsLock: boolean) => {
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
  container.id = 'password-browser'
  document.body.append(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { capsLock } }),
      update: (model: typeof Model.Type, _: TestMessage) => ({ model }),
      view: (model: typeof Model.Type, h: HtmlBuilder<TestMessage>) =>
        PasswordInput.view(
          {
            id: 'new',
            label: 'Password',
            value: 'hunter2',
            onInput: () => message('Other'),
            visible: false,
            onToggle: message('Clicked'),
            requirements: [
              { label: 'At least 12 characters', met: false },
              { label: 'A number', met: true },
            ],
            capsLock: { on: model.capsLock, onKey: () => message('Other') },
            style,
          },
          h,
        ),
    }),
  )
}

const ring = (item: Element) => getComputedStyle(item, '::before')

test("a met requirement's ring is filled in the success ink, an unmet one hollow", async () => {
  const handle = mount(false)
  try {
    await vi.waitFor(() => expect(document.querySelectorAll('li')).toHaveLength(2))
    const [unmet, met] = [...document.querySelectorAll('li')]
    expect(ring(unmet!).backgroundColor).toBe('rgba(0, 0, 0, 0)')
    expect(ring(met!).backgroundColor).toBe(getComputedStyle(met!).color)
    expect(getComputedStyle(met!).color).not.toBe(getComputedStyle(unmet!).color)
  } finally {
    handle.dispose()
  }
})

test('the silent Caps Lock hint takes no room, and speaking it does', async () => {
  const quiet = mount(false)
  let quietHeight = 0
  try {
    await vi.waitFor(() => expect(document.getElementById('new-caps-lock')).not.toBeNull())
    quietHeight = document.getElementById('new-caps-lock')!.parentElement!.offsetHeight
    const list = document.getElementById('new-requirements')!
    const group = document.getElementById('new-input')!.parentElement!
    // The list sits its own gap under the field, with nothing more between.
    expect(list.getBoundingClientRect().top - group.getBoundingClientRect().bottom).toBeCloseTo(
      parseFloat(getComputedStyle(list).marginTop),
      1,
    )
  } finally {
    quiet.dispose()
  }
  document.body.replaceChildren()
  const loud = mount(true)
  try {
    await vi.waitFor(() =>
      expect(document.getElementById('new-caps-lock')?.textContent).toBe('Caps Lock is on'),
    )
    expect(document.getElementById('new-caps-lock')!.parentElement!.offsetHeight).toBeGreaterThan(
      quietHeight,
    )
  } finally {
    loud.dispose()
  }
})
