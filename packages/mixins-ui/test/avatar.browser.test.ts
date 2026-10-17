/**
 * Avatars in a real browser over the shipped palette, in both schemes: a
 * group's avatars overlap, each ringed in the page; initials coloured by the
 * name differ between people and read on their disc, while the `+N` stays
 * neutral; the status dot sits on the lower end corner, unclipped, in its
 * status's hue; and the shapes round the picture as they say.
 */
import { Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { Avatar, AvatarGroupSlots, AvatarSlots, Recipes } from '../src/index.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const L = Layers.standard
const Model = Schema.Struct({})

const named = Style.forSlots(AvatarSlots)(Recipes.Avatar({ color: 'name' }))
const square = Style.forSlots(AvatarSlots)(Recipes.Avatar({ shape: 'square', size: 'lg' }))
const group = Style.forSlots(AvatarGroupSlots)(Recipes.AvatarGroup({}))
const pixel = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><rect width="4" height="4" fill="teal"/></svg>')}`

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const view = (_: unknown, h: HtmlBuilder<never>): Html =>
  h.div(
    [h.Style({ display: 'grid', gap: '2rem', padding: '32px', justifyItems: 'start' })],
    [
      Avatar.group(
        {
          label: 'Editors',
          people: [
            { name: 'Ada Lovelace' },
            { name: 'Grace Hopper' },
            { name: 'Alan Turing' },
            { name: 'Barbara Liskov' },
          ],
          max: 3,
          style: group,
          avatarStyle: named,
        },
        h,
      ),
      Avatar.view({ name: 'Edsger Dijkstra', src: pixel, status: 'online', style: square }, h),
    ],
  )

const mount = (scheme: 'light' | 'dark') => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(L.declare, L.in('theme', Theme.root(theme, { colorScheme: scheme }))) +
    [named, square, group].map(style => style.css).join('')
  document.head.append(sheet)
  document.body.style.background = 'var(--fk-surface-base)'
  const container = document.createElement('div')
  container.id = `avatar-${scheme}`
  document.body.appendChild(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: typeof Model.Type) => ({ model }),
      view,
    }),
  )
}

const avatar = (name: string) => document.querySelector<HTMLElement>(`[aria-label^="${name}"]`)!
const fallbackOf = (name: string) => avatar(name).firstElementChild!
const drawn = () =>
  vi.waitFor(() => expect(document.querySelector('[role="group"]')).not.toBeNull())

/** OKLCH's lightness, chroma and hue of a computed color, from OKLCH or OKLab. */
const lch = (color: string) => {
  const oklch = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(color)
  if (oklch !== null) return { l: Number(oklch[1]), c: Number(oklch[2]), h: Number(oklch[3]) }
  const lab = /^oklab\(\s*([\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)/.exec(color)
  if (lab === null) throw new Error(`not an OKLab or OKLCH color: ${color}`)
  const [a, b] = [Number(lab[2]), Number(lab[3])]
  return {
    l: Number(lab[1]),
    c: Math.hypot(a, b),
    h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360,
  }
}
const distance = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b))

test.each(['light', 'dark'] as const)(
  'in a %s scheme, initials take the name’s hue and read on it, and the count stays neutral',
  async scheme => {
    const handle = mount(scheme)
    try {
      await drawn()
      const [ada, grace] = ['Ada Lovelace', 'Grace Hopper'].map(name =>
        lch(getComputedStyle(fallbackOf(name)).backgroundColor),
      )
      expect(distance(ada!.h, grace!.h)).toBeGreaterThan(20)
      for (const name of ['Ada Lovelace', 'Grace Hopper', 'Alan Turing']) {
        const style = getComputedStyle(fallbackOf(name))
        expect(Math.abs(lch(style.backgroundColor).l - lch(style.color).l), name).toBeGreaterThan(
          0.3,
        )
      }
      expect(lch(getComputedStyle(fallbackOf('1 more')).backgroundColor).c).toBeLessThan(0.03)
    } finally {
      handle.dispose()
    }
  },
)

test('a group overlaps its avatars, each ringed in the page', async () => {
  const handle = mount('light')
  try {
    await drawn()
    const [first, second] = ['Ada Lovelace', 'Grace Hopper'].map(name =>
      avatar(name).getBoundingClientRect(),
    )
    expect(first!.right - second!.left).toBeGreaterThan(8)
    expect(getComputedStyle(avatar('Grace Hopper')).boxShadow).toMatch(/0px 0px 0px 2px/)
  } finally {
    handle.dispose()
  }
})

test.each(['light', 'dark'] as const)(
  'in a %s scheme, the status dot sits on the lower end corner, unclipped, in its hue',
  async scheme => {
    const handle = mount(scheme)
    try {
      await drawn()
      const root = avatar('Edsger Dijkstra')
      const dot = root.querySelector('[data-status]')!
      const [outer, mark] = [root.getBoundingClientRect(), dot.getBoundingClientRect()]
      expect(Math.abs(outer.right - mark.right)).toBeLessThan(0.5)
      expect(Math.abs(outer.bottom - mark.bottom)).toBeLessThan(0.5)
      // Its ring is drawn outside its box: the avatar must not clip it.
      expect(getComputedStyle(root).overflow).toBe('visible')
      expect(distance(lch(getComputedStyle(dot).backgroundColor).h, 145)).toBeLessThan(15)
      // A square avatar's picture is square.
      expect(getComputedStyle(root.querySelector('img')!).borderRadius).toBe('0px')
    } finally {
      handle.dispose()
    }
  },
)
