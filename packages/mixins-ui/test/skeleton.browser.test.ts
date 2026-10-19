/**
 * Skeletons laid out by a real browser over the shipped palette: a lone bar
 * fills a container with a width and still shows in one that sizes to its
 * content; a bar stands off the page in both schemes; the frames lay their
 * bars out as the shapes they stand in for; and the shimmer sweeps for a
 * travel's time, the other way right to left, still when travel is 0.
 */
import { Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { Recipes, Skeleton, SkeletonSlots } from '../src/index.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const L = Layers.standard
const Model = Schema.Struct({})
const pulsing = Style.forSlots(SkeletonSlots)(Recipes.Skeleton({}))
const shimmer = Style.forSlots(SkeletonSlots)(Recipes.Skeleton({ animation: 'shimmer' }))

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const holder = (h: HtmlBuilder<never>, id: string, css: string, child: Html, dir = 'ltr') =>
  h.div([h.Id(id), h.Dir(dir), h.Attribute('style', css)], [child])

const view = (_: unknown, h: HtmlBuilder<never>): Html =>
  h.div(
    [],
    [
      holder(h, 'wide', 'inline-size: 300px', Skeleton.view({ style: pulsing }, h)),
      holder(h, 'shrunk', 'display: inline-block', Skeleton.view({ style: pulsing }, h)),
      holder(h, 'lines', 'inline-size: 300px', Skeleton.lines({ lines: 3, style: pulsing }, h)),
      holder(h, 'person', 'inline-size: 300px', Skeleton.avatarRow({ style: pulsing }, h)),
      holder(h, 'card', 'inline-size: 320px', Skeleton.card({ style: pulsing }, h)),
      holder(h, 'row', 'inline-size: 400px', Skeleton.tableRow({ columns: 4, style: pulsing }, h)),
      holder(h, 'sweep', 'inline-size: 300px', Skeleton.view({ style: shimmer }, h)),
      holder(h, 'back', 'inline-size: 300px', Skeleton.view({ style: shimmer }, h), 'rtl'),
      holder(
        h,
        'held',
        'inline-size: 300px; --fk-knob-travel: 0',
        Skeleton.view({ style: shimmer }, h),
      ),
    ],
  )

const mount = async (scheme: 'light' | 'dark') => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(L.declare, L.in('theme', Theme.root(theme, { colorScheme: scheme }))) +
    pulsing.css +
    shimmer.css
  document.head.append(sheet)
  document.body.style.background = 'var(--fk-surface-base)'
  const container = document.createElement('div')
  container.id = `skeleton-${scheme}`
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
  await vi.waitFor(() => expect(document.getElementById('held')).not.toBeNull())
  return handle
}

const inside = (id: string) => document.getElementById(id)!.firstElementChild!
const boxes = (id: string) =>
  Array.from(inside(id).children).map(child => child.getBoundingClientRect())

test('a bar fills a container that has a width, and shows in one that sizes to its content', async () => {
  const handle = await mount('light')
  try {
    expect(inside('wide').getBoundingClientRect().width).toBe(300)
    const shrunk = inside('shrunk').getBoundingClientRect()
    expect(shrunk.width).toBeGreaterThan(0)
    expect(shrunk.height).toBeGreaterThan(0)
  } finally {
    handle.dispose()
  }
})

test.each(['light', 'dark'] as const)('in a %s scheme, a bar stands off the page', async scheme => {
  const handle = await mount(scheme)
  try {
    // Composited over the page by the browser: a sample of what is painted.
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')!
    const paint = (color: string) => {
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = getComputedStyle(document.body).backgroundColor
      context.fillRect(0, 0, 1, 1)
      context.fillStyle = color
      context.fillRect(0, 0, 1, 1)
      const [r, g, b] = context.getImageData(0, 0, 1, 1).data
      return (r! + g! + b!) / 3
    }
    const page = paint('transparent')
    const bar = paint(getComputedStyle(inside('wide')).backgroundColor)
    // The dark scheme's own, denser tint: the light one's share left a bar
    // barely off a dark page.
    expect(Math.abs(bar - page)).toBeGreaterThan(scheme === 'dark' ? 35 : 10)
  } finally {
    handle.dispose()
  }
})

test('lines fill their column, the last ending early', async () => {
  const handle = await mount('light')
  try {
    const [first, second, last] = boxes('lines')
    expect(first!.width).toBe(300)
    expect(second!.width).toBe(300)
    expect(last!.width).toBe(180)
    expect(second!.top).toBeGreaterThan(first!.bottom)
  } finally {
    handle.dispose()
  }
})

test('an avatar row puts a circle beside two lines, a card a picture over its lines', async () => {
  const handle = await mount('light')
  try {
    const [circle, name, line] = boxes('person')
    expect([circle!.width, circle!.height]).toEqual([40, 40])
    expect(name!.left).toBeGreaterThan(circle!.right)
    expect(name!.top).toBeGreaterThanOrEqual(circle!.top)
    expect(line!.bottom).toBeLessThanOrEqual(circle!.bottom)
    expect(line!.width).toBeLessThan(name!.width)
    const [picture, title] = boxes('card')
    expect(picture!.width).toBe(320)
    expect(picture!.height).toBe(180)
    expect(title!.top).toBeGreaterThan(picture!.bottom)
  } finally {
    handle.dispose()
  }
})

test('a table row lays a cell a column, side by side', async () => {
  const handle = await mount('light')
  try {
    const cells = boxes('row')
    expect(cells).toHaveLength(4)
    for (const cell of cells) {
      expect(cell.top).toBe(cells[0]!.top)
      expect(Math.abs(cell.width - cells[0]!.width)).toBeLessThan(0.5)
    }
    expect(cells[1]!.left).toBeGreaterThan(cells[0]!.right)
  } finally {
    handle.dispose()
  }
})

test('the shimmer sweeps for a travel’s time, the other way right to left, and holds at no travel', async () => {
  const handle = await mount('light')
  try {
    const sweep = getComputedStyle(inside('sweep'))
    expect(sweep.animationName).not.toBe('none')
    expect(parseFloat(sweep.animationDuration)).toBeGreaterThan(1)
    expect(sweep.animationDirection).toBe('normal')
    expect(getComputedStyle(inside('back')).animationDirection).toBe('reverse')
    expect(parseFloat(getComputedStyle(inside('held')).animationDuration)).toBe(0)
  } finally {
    handle.dispose()
  }
})
