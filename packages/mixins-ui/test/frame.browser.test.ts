/**
 * A frame on a real page: the tray is a fill apart from the page, each panel
 * a surface apart from the tray, the panels are one pad apart, and nothing
 * pushes a narrow page sideways.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { Frame, FrameSlots, Recipes } from '../src/index.js'
import { unitKnobs } from './fixture.js'

const theme = Theme.standard(Theme.make({ ...unitKnobs, accent: { hue: 265, chroma: 0.16 } }))
const L = Layers.standard
const Model = Schema.Struct({})
const muted = Style.forSlots(FrameSlots)(Recipes.Frame({}))

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = async (width: string) => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent = Style.stylesheet(L.declare, L.in('theme', Theme.root(theme))) + muted.css
  document.head.append(sheet)
  document.body.style.background = 'var(--fk-surface-base)'
  const container = document.createElement('div')
  container.id = 'frame'
  document.body.appendChild(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: typeof Model.Type) => ({ model }),
      view: (_: typeof Model.Type, h: HtmlBuilder<never>) =>
        h.div(
          [h.Style({ inlineSize: width })],
          [
            Frame.view(
              {
                title: 'Alerts',
                action: h.button([h.Type('button')], ['Edit']),
                panels: ['One', 'Two', 'Three'].map(text =>
                  h.p([h.Style({ margin: '0' })], [text]),
                ),
                footer: h.span([], ['Updated now']),
                style: muted,
              },
              h,
            ),
          ],
        ),
    }),
  )
  await vi.waitFor(() => expect(document.querySelector('h3')).not.toBeNull())
  return handle
}

const panelsOf = () =>
  Array.from(document.querySelectorAll('p')).map(paragraph => paragraph.parentElement!)

test('the tray is a fill apart from the page and each panel a surface apart from the tray', async () => {
  const handle = await mount('480px')
  try {
    const tray = document.querySelector('h3')!.parentElement!.parentElement!
    const page = getComputedStyle(document.body).backgroundColor
    expect(getComputedStyle(tray).backgroundColor).not.toBe(page)
    for (const panel of panelsOf()) {
      expect(getComputedStyle(panel).backgroundColor).not.toBe(
        getComputedStyle(tray).backgroundColor,
      )
      expect(parseFloat(getComputedStyle(panel).borderTopWidth)).toBeGreaterThan(0)
    }
  } finally {
    handle.dispose()
  }
})

test('the panels stand one pad apart, and the tray keeps its pad around them', async () => {
  const handle = await mount('480px')
  try {
    const [first, second] = panelsOf().map(panel => panel.getBoundingClientRect())
    const tray = document.querySelector('h3')!.parentElement!.parentElement!
    const pad = parseFloat(getComputedStyle(tray).paddingTop)
    expect(pad).toBeGreaterThan(0)
    expect(second!.top - first!.bottom).toBeCloseTo(pad, 0)
    expect(first!.left - tray.getBoundingClientRect().left).toBeCloseTo(pad, 0)
  } finally {
    handle.dispose()
  }
})

test('a frame in a narrow column does not push the page sideways', async () => {
  const handle = await mount('280px')
  try {
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth,
    )
  } finally {
    handle.dispose()
  }
})
