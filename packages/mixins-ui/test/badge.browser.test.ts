/**
 * Badges on a real page: squeezed in a row too narrow for them, each keeps
 * its words inside it rather than shrinking under them into the next; and
 * each appearance carries its tone as it says, read from computed style.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { Badge, BadgeSlots, Recipes } from '../src/index.js'
import type { BadgeAppearance } from '../src/recipes/index.js'
import { unitKnobs } from './fixture.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const style = Style.forSlots(BadgeSlots)(Recipes.Badge())
const Model = Schema.Struct({})

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

test('a badge squeezed in a row keeps its words inside it', async () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      // The page reset, which floors every flex item's min-width at 0 so long text can shrink.
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) + style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'badge-browser'
  document.body.appendChild(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: typeof Model.Type) => ({ model }),
      view: (_: unknown, h: HtmlBuilder<never>) =>
        h.div(
          [h.Style({ display: 'flex', gap: '8px', width: '120px' })],
          ['In review', 'Failed', 'Archived'].map(text =>
            Badge.view({ text, tone: 'warning', style }, h),
          ),
        ),
    }),
  )
  try {
    await vi.waitFor(() => expect(document.body.firstElementChild?.children.length).toBe(3))
    const badges = Array.from(document.body.firstElementChild!.children) as Array<HTMLElement>
    for (const badge of badges) expect(badge.scrollWidth).toBeLessThanOrEqual(badge.clientWidth)
    // Side by side, not over each other.
    const [first, second] = badges.map(badge => badge.getBoundingClientRect())
    expect(first!.right).toBeLessThanOrEqual(second!.left)
  } finally {
    handle.dispose()
  }
})

const appearances = [
  'tinted',
  'dot',
  'outline',
  'solid',
] as const satisfies ReadonlyArray<BadgeAppearance>
const styles = appearances.map(appearance =>
  Style.forSlots(BadgeSlots)(Recipes.Badge({ appearance })),
)

const mountAppearances = () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) + styles.map(each => each.css).join('')
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'badge-appearances'
  document.body.appendChild(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: typeof Model.Type) => ({ model }),
      view: (_: unknown, h: HtmlBuilder<never>) =>
        h.div(
          [],
          [
            ...appearances.map((appearance, index) =>
              h.div(
                [h.DataAttribute('appearance', appearance)],
                [Badge.view({ text: 'Live', tone: 'success', style: styles[index]! }, h)],
              ),
            ),
            // What the theme's tokens compute to, to compare the badges with.
            ...['success-subtle', 'success-default', 'success-outline'].map(token =>
              h.span(
                [h.DataAttribute('token', token), h.Style({ color: `var(--fk-${token})` })],
                [],
              ),
            ),
          ],
        ),
    }),
  )
}

const badgeOf = (appearance: BadgeAppearance) =>
  getComputedStyle(document.querySelector(`[data-appearance="${appearance}"] > *`)!)
const dotOf = (appearance: BadgeAppearance) =>
  getComputedStyle(document.querySelector(`[data-appearance="${appearance}"] > *`)!, '::before')
const token = (name: string) =>
  getComputedStyle(document.querySelector(`[data-token="${name}"]`)!).color

test('each appearance carries its tone: a tint, a dot, a line or a fill', async () => {
  const handle = mountAppearances()
  try {
    await vi.waitFor(() => expect(document.querySelector('[data-token]')).not.toBeNull())
    const transparent = 'rgba(0, 0, 0, 0)'
    // Tinted: the tone's tint, and no dot.
    expect(badgeOf('tinted').backgroundColor).toBe(token('success-subtle'))
    expect(dotOf('tinted').content).toBe('none')
    // Dot: no fill, and a dot of the tone's fill before the words.
    expect(badgeOf('dot').backgroundColor).toBe(transparent)
    expect(dotOf('dot').backgroundColor).toBe(token('success-default'))
    expect(Number.parseFloat(dotOf('dot').width)).toBeGreaterThan(0)
    // Outline: no fill, a ring of the tone's line inside the edge.
    expect(badgeOf('outline').backgroundColor).toBe(transparent)
    expect(badgeOf('outline').boxShadow).toContain(token('success-outline'))
    expect(badgeOf('outline').boxShadow).toContain('inset')
    // Solid: the tone's fill.
    expect(badgeOf('solid').backgroundColor).toBe(token('success-default'))
  } finally {
    handle.dispose()
  }
})

const paddingAt = async (density: number) => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in(
        'theme',
        Theme.root(Theme.standard(Theme.make({ ...unitKnobs, shape: { density, radius: 1 } }))),
      ),
    ) + style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = `badge-density-${density}`
  document.body.appendChild(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: typeof Model.Type) => ({ model }),
      view: (_: unknown, h: HtmlBuilder<never>) =>
        h.div([], [Badge.view({ text: 'New', tone: 'warning', style }, h)]),
    }),
  )
  try {
    const badge = await vi.waitFor(() => {
      const found = document.body.firstElementChild?.firstElementChild
      expect(found).toBeInstanceOf(HTMLElement)
      return found as HTMLElement
    })
    const computed = getComputedStyle(badge)
    return [
      Number.parseFloat(computed.paddingBlockStart),
      Number.parseFloat(computed.paddingInlineStart),
    ]
  } finally {
    handle.dispose()
    sheet.remove()
    document.body.replaceChildren()
  }
}

test('a badge’s padding is the same at density 1 and grows with the density knob', async () => {
  const [block, inline] = await paddingAt(1)
  expect(block).toBeCloseTo(2.4, 1)
  expect(inline).toBeCloseTo(9.6, 1)
  const [denseBlock, denseInline] = await paddingAt(1.3)
  expect(denseBlock).toBeCloseTo(block! * 1.3, 1)
  expect(denseInline).toBeCloseTo(inline! * 1.3, 1)
})

const solid = Style.forSlots(BadgeSlots)(Recipes.Badge({ appearance: 'solid' }))
const sizes = ['sm', 'md', 'lg'] as const
const sized = sizes.map(size => Style.forSlots(BadgeSlots)(Recipes.Badge({ size })))
const tonesOfVocabulary = ['accent', 'neutral', 'info', 'success', 'warning', 'danger'] as const

const mountVocabulary = () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) + [solid, ...sized].map(each => each.css).join('')
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'badge-vocabulary'
  document.body.appendChild(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: typeof Model.Type) => ({ model }),
      view: (_: unknown, h: HtmlBuilder<never>) =>
        h.div(
          [],
          [
            ...tonesOfVocabulary.map(tone =>
              h.div(
                [h.DataAttribute('solid', tone)],
                [Badge.view({ text: tone, tone, style: solid }, h)],
              ),
            ),
            ...sizes.map((size, index) =>
              h.div(
                [h.DataAttribute('size', size)],
                [Badge.view({ text: 'Size', style: sized[index]! }, h)],
              ),
            ),
            ...['accent-default', 'error-default', 'success-default', 'text-muted'].map(name =>
              h.span([h.DataAttribute('token', name), h.Style({ color: `var(--fk-${name})` })], []),
            ),
          ],
        ),
    }),
  )
}

test('every tone of the vocabulary fills a solid badge with its family, danger with the error one', async () => {
  const handle = mountVocabulary()
  try {
    await vi.waitFor(() => expect(document.querySelector('[data-token]')).not.toBeNull())
    const fillOf = (tone: string) =>
      getComputedStyle(document.querySelector(`[data-solid="${tone}"] > *`)!).backgroundColor
    expect(fillOf('accent')).toBe(token('accent-default'))
    expect(fillOf('danger')).toBe(token('error-default'))
    expect(fillOf('success')).toBe(token('success-default'))
    expect(fillOf('neutral')).toBe(token('text-muted'))
    // Each tone has a fill of its own.
    expect(new Set(tonesOfVocabulary.map(fillOf)).size).toBe(tonesOfVocabulary.length)
  } finally {
    handle.dispose()
  }
})

test('the sizes step the text and the pill grows with it', async () => {
  const handle = mountVocabulary()
  try {
    await vi.waitFor(() => expect(document.querySelector('[data-size]')).not.toBeNull())
    const [small, medium, large] = sizes.map(size => {
      const badge = document.querySelector(`[data-size="${size}"] > *`)!
      return {
        font: Number.parseFloat(getComputedStyle(badge).fontSize),
        height: badge.getBoundingClientRect().height,
      }
    })
    expect(small!.font).toBeLessThan(medium!.font)
    expect(medium!.font).toBeLessThan(large!.font)
    expect(small!.height).toBeLessThan(large!.height)
  } finally {
    handle.dispose()
  }
})
