/**
 * The round components follow the radius knob, on a real page: a badge rounds
 * with it and an avatar is a disc at the default and a square at 0.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { Avatar, AvatarSlots, Badge, BadgeSlots, Recipes } from '../src/index.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const badgeStyle = Style.forSlots(BadgeSlots)(Recipes.Badge({ attribute: 'data-tone', tones: {} }))
const avatarStyle = Style.forSlots(AvatarSlots)(Recipes.Avatar({}))
const Model = Schema.Struct({})

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
  document.documentElement.style.removeProperty('--fk-knob-radius-factor')
})

test('a badge rounds with the radius knob, and an avatar is a disc that squares at 0', async () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(Layers.standard.declare, Layers.standard.in('theme', Theme.root(theme))) +
    badgeStyle.css +
    avatarStyle.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'radius-browser'
  document.body.appendChild(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: typeof Model.Type) => ({ model }),
      view: (_: unknown, h: HtmlBuilder<never>) =>
        h.div(
          [],
          [
            Badge.view({ text: 'Live', style: badgeStyle }, h),
            Avatar.view({ name: 'Ada Lovelace', src: '', style: avatarStyle }, h),
          ],
        ),
    }),
  )
  try {
    await vi.waitFor(() => expect(document.body.firstElementChild?.children.length).toBe(2))
    const [pill, disc] = Array.from(document.body.firstElementChild!.children) as Array<HTMLElement>
    const corner = (element: HTMLElement) =>
      parseFloat(getComputedStyle(element).borderTopLeftRadius)
    const knob = (factor: string) =>
      document.documentElement.style.setProperty('--fk-knob-radius-factor', factor)
    knob('1')
    expect(corner(pill!)).toBe(12)
    expect(getComputedStyle(disc!).borderTopLeftRadius).toBe('50%')
    knob('0.5')
    expect(corner(pill!)).toBe(6)
    knob('0')
    expect(corner(pill!)).toBe(0)
    expect(corner(disc!)).toBe(0)
  } finally {
    handle.dispose()
  }
})
