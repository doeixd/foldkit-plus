/**
 * Badges in a row too narrow for them, on a real page: each keeps its words
 * inside it rather than shrinking under them into the next.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { Badge, BadgeSlots, Recipes } from '../src/index.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
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
