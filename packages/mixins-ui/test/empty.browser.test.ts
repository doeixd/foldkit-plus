/**
 * Empty states in a real browser over the shipped palette: the icon is
 * quieter than the title, in a disc, in both schemes; a dashed frame shows
 * on the page; a failed load inks its icon in the error's hue; an
 * illustration is drawn large and bare; and several actions sit centred in
 * a row.
 */
import { Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { Empty, EmptySlots, Recipes } from '../src/index.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const L = Layers.standard
const Model = Schema.Struct({})
const dashed = Style.forSlots(EmptySlots)(Recipes.Empty({ frame: 'dashed' }))
const failed = Style.forSlots(EmptySlots)(Recipes.Empty({ tone: 'danger' }))
const drawing = Style.forSlots(EmptySlots)(Recipes.Empty({ media: 'illustration' }))

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const glyph = (h: HtmlBuilder<never>) =>
  h.svg(
    [h.ViewBox('0 0 16 16')],
    [h.circle([h.Attribute('cx', '8'), h.Attribute('cy', '8'), h.Attribute('r', '6')], [])],
  )

const view = (_: unknown, h: HtmlBuilder<never>): Html =>
  h.div(
    [h.Style({ display: 'grid', gap: '1rem', width: '480px' })],
    [
      Empty.view(
        {
          title: 'No projects yet',
          description: 'Create one to get going.',
          icon: glyph(h),
          action: h.div([], [h.button([], ['New project']), h.button([], ['Import'])]),
          style: dashed,
        },
        h,
      ),
      Empty.view({ title: 'Could not load', icon: glyph(h), style: failed }, h),
      Empty.view({ title: 'Nothing to show', icon: glyph(h), style: drawing }, h),
    ],
  )

const mount = async (scheme: 'light' | 'dark') => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(L.declare, L.in('theme', Theme.root(theme, { colorScheme: scheme }))) +
    [dashed, failed, drawing].map(style => style.css).join('')
  document.head.append(sheet)
  document.body.style.background = 'var(--fk-surface-base)'
  const container = document.createElement('div')
  container.id = `empty-${scheme}`
  document.body.appendChild(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: typeof Model.Type) => ({ model }),
      view,
    }),
  )
  await vi.waitFor(() => expect(rootOf('Nothing to show')).not.toBeNull())
  return handle
}

const rootOf = (title: string) =>
  Array.from(document.querySelectorAll('p')).find(p => p.textContent === title)?.parentElement ??
  null
const iconOf = (title: string) => rootOf(title)!.firstElementChild!
const lch = (color: string) => {
  const oklch = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(color)
  if (oklch !== null) return { l: Number(oklch[1]), h: Number(oklch[3]) }
  const lab = /^oklab\(\s*([\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)/.exec(color)
  if (lab === null) throw new Error(`not an OKLab or OKLCH color: ${color}`)
  const [a, b] = [Number(lab[2]), Number(lab[3])]
  return { l: Number(lab[1]), h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 }
}

test.each(['light', 'dark'] as const)(
  'in a %s scheme, the icon is quieter than the title, and the dashed frame shows',
  async scheme => {
    const handle = await mount(scheme)
    try {
      const page = lch(getComputedStyle(document.body).backgroundColor).l
      const icon = getComputedStyle(iconOf('No projects yet'))
      const title = getComputedStyle(rootOf('No projects yet')!.children[1]!)
      expect(Math.abs(lch(icon.color).l - page)).toBeLessThan(Math.abs(lch(title.color).l - page))
      expect(icon.backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
      expect(icon.borderRadius).not.toBe('0px')
      const frame = getComputedStyle(rootOf('No projects yet')!)
      expect(frame.borderTopStyle).toBe('dashed')
      expect(Math.abs(lch(frame.borderTopColor).l - page)).toBeGreaterThan(0.1)
    } finally {
      handle.dispose()
    }
  },
)

test('a failed load inks its icon in the error’s hue', async () => {
  const handle = await mount('light')
  try {
    const hue = lch(getComputedStyle(iconOf('Could not load')).color).h
    expect(Math.min(Math.abs(hue - 25), 360 - Math.abs(hue - 25))).toBeLessThan(15)
  } finally {
    handle.dispose()
  }
})

test('an illustration is large and bare, and the actions sit centred in a row', async () => {
  const handle = await mount('light')
  try {
    const picture = iconOf('Nothing to show')
    expect(picture.firstElementChild!.getBoundingClientRect().width).toBe(128)
    expect(getComputedStyle(picture).backgroundColor).toBe('rgba(0, 0, 0, 0)')
    const actions = rootOf('No projects yet')!.lastElementChild!
    const [first, second] = Array.from(actions.querySelectorAll('button')).map(button =>
      button.getBoundingClientRect(),
    )
    expect(first!.top).toBe(second!.top)
    const frame = rootOf('No projects yet')!.getBoundingClientRect()
    const middle = (first!.left + second!.right) / 2
    expect(Math.abs(middle - (frame.left + frame.width / 2))).toBeLessThan(1)
  } finally {
    handle.dispose()
  }
})
