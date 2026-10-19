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

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const style = Style.forSlots(BadgeSlots)(
  Recipes.Badge({ attribute: 'data-tone', tones: { review: 'warning' } }),
)
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
            Badge.view({ text, tone: 'review', style }, h),
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
  Style.forSlots(BadgeSlots)(
    Recipes.Badge({ attribute: 'data-tone', tones: { live: 'success' }, appearance }),
  ),
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
                [Badge.view({ text: 'Live', tone: 'live', style: styles[index]! }, h)],
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
