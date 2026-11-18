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
import { userEvent } from 'vitest/browser'
import { Avatar, AvatarGroupSlots, AvatarSlots, Recipes } from '../src/index.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const L = Layers.standard
const Model = Schema.Struct({})

const named = Style.forSlots(AvatarSlots)(Recipes.Avatar({ color: 'name' }))
const square = Style.forSlots(AvatarSlots)(Recipes.Avatar({ shape: 'square', size: 'lg' }))
const group = Style.forSlots(AvatarGroupSlots)(Recipes.AvatarGroup({}))
const large = Style.forSlots(AvatarSlots)(Recipes.Avatar({ size: 'xl' }))
const lifted = Style.forSlots(AvatarGroupSlots)(Recipes.AvatarGroup({ lift: 'hover' }))
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
      Avatar.view(
        {
          name: 'Margaret Hamilton',
          badges: (['top-start', 'top-end', 'bottom-start', 'bottom-end'] as const).map(place => ({
            content: h.span([], ['*']),
            place,
          })),
          style: large,
        },
        h,
      ),
      Avatar.group(
        {
          label: 'Reviewers',
          people: [{ name: 'Radia Perlman' }, { name: 'Frances Allen' }],
          style: lifted,
          avatarStyle: named,
        },
        h,
      ),
    ],
  )

const mount = (scheme: 'light' | 'dark') => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(L.declare, L.in('theme', Theme.root(theme, { colorScheme: scheme }))) +
    [named, square, group, large, lifted].map(style => style.css).join('')
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
      // A named fill's chroma is about 0.024; the count's is the default neutral's (under 0.01), not the name's.
      expect(ada!.c).toBeGreaterThan(0.015)
      expect(lch(getComputedStyle(fallbackOf('1 more')).backgroundColor).c).toBeLessThan(0.01)
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

test.each(['xs', 'sm', 'md', 'lg', 'xl'] as const)(
  'an avatar of size %s is drawn as wide as widthOf says',
  async size => {
    const sized = Style.forSlots(AvatarSlots)(Recipes.Avatar({ size }))
    const sheet = document.createElement('style')
    sheet.dataset['test'] = ''
    sheet.textContent = Style.stylesheet(L.declare, L.in('theme', Theme.root(theme))) + sized.css
    document.head.append(sheet)
    const container = document.createElement('div')
    container.id = `avatar-size-${size}`
    document.body.appendChild(container)
    const handle = Runtime.embed(
      Runtime.makeElement({
        Model,
        container,
        init: () => ({ model: {} }),
        update: (model: typeof Model.Type) => ({ model }),
        view: (_: unknown, h: HtmlBuilder<never>) =>
          Avatar.view({ name: 'Ada Lovelace', style: sized }, h),
      }),
    )
    try {
      await vi.waitFor(() =>
        expect(document.querySelector('[aria-label="Ada Lovelace"]')).not.toBeNull(),
      )
      const rect = document.querySelector('[aria-label="Ada Lovelace"]')!.getBoundingClientRect()
      expect(Math.round(rect.width)).toBe(Avatar.widthOf(size))
    } finally {
      handle.dispose()
    }
  },
)

test('a badge sits on the corner it names, inside the avatar’s box', async () => {
  const handle = mount('light')
  try {
    await drawn()
    const root = avatar('Margaret Hamilton')
    const outer = root.getBoundingClientRect()
    const corner = (place: string) =>
      root.querySelector(`[data-place="${place}"]`)!.getBoundingClientRect()
    expect(Math.abs(corner('top-start').left - outer.left)).toBeLessThan(0.5)
    expect(Math.abs(corner('top-start').top - outer.top)).toBeLessThan(0.5)
    expect(Math.abs(corner('top-end').right - outer.right)).toBeLessThan(0.5)
    expect(Math.abs(corner('top-end').top - outer.top)).toBeLessThan(0.5)
    expect(Math.abs(corner('bottom-start').left - outer.left)).toBeLessThan(0.5)
    expect(Math.abs(corner('bottom-start').bottom - outer.bottom)).toBeLessThan(0.5)
    expect(Math.abs(corner('bottom-end').right - outer.right)).toBeLessThan(0.5)
    expect(Math.abs(corner('bottom-end').bottom - outer.bottom)).toBeLessThan(0.5)
    // A quarter of the avatar at least, so an empty mark is still seen.
    expect(corner('top-end').width).toBeGreaterThan(outer.width * 0.25)
  } finally {
    handle.dispose()
  }
})

test('a lifted group raises the avatar under the pointer and no other', async () => {
  const handle = mount('light')
  try {
    await drawn()
    const [first, second] = ['Radia Perlman', 'Frances Allen'].map(name => avatar(name))
    await userEvent.hover(document.body, { position: { x: 1, y: 1 } })
    expect(getComputedStyle(first!).translate).toBe('none')
    await userEvent.hover(first!)
    await vi.waitFor(() =>
      expect(parseFloat(getComputedStyle(first!).translate.split(' ')[1]!)).toBeLessThan(0),
    )
    expect(getComputedStyle(second!).translate).toBe('none')
  } finally {
    handle.dispose()
  }
})
