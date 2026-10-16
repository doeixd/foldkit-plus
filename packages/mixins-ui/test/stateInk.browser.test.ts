/// <reference types="@vitest/browser-playwright" />
/**
 * A hover over a painted surface deepens the paint: on a bold error band, a
 * hovered action films the band's own fill, so the film has the error hue at
 * the fill's chroma. Filming the pale on-fill text instead read as grey.
 */
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Schema } from 'effect'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { cdp } from 'vitest/browser'
import { Alert, AlertSlots, Recipes } from '../src/index.js'

type Message = { readonly _tag: 'Dismissed' }

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const alert = Style.forSlots(AlertSlots)(Recipes.Alert({ tone: 'error', emphasis: 'bold' }))

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = (scheme: 'light' | 'dark') => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('tokens', Theme.root(Theme.tokens, { colorScheme: scheme })),
      Layers.standard.in('theme', Theme.root(theme, { omit: Theme.tokens, colorScheme: scheme })),
    ) + alert.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'state-ink-browser'
  document.body.appendChild(container)
  const view = (_: unknown, h: HtmlBuilder<Message>) =>
    Alert.view(
      {
        layout: 'banner',
        label: 'Outage',
        title: 'The API is down.',
        actions: [{ label: 'Status', href: '#status' }],
        onDismiss: { _tag: 'Dismissed' },
        style: alert,
      },
      h,
    )
  return Runtime.embed(
    Runtime.makeElement({
      Model: Schema.Struct({}),
      container,
      init: () => ({ model: {} }),
      update: (model: { readonly [key: string]: never }) => ({ model }),
      view,
    }),
  )
}

type DomNode = {
  readonly nodeId: number
  readonly contentDocument?: DomNode
  readonly children?: ReadonlyArray<DomNode>
}

/** The protocol's id for `selector`, looked for in every frame's document. */
const nodeOf = async (selector: string) => {
  const { root } = (await cdp().send('DOM.getDocument', { depth: -1, pierce: true })) as {
    root: DomNode
  }
  const documents: Array<number> = []
  const walk = (node: DomNode) => {
    if (node.contentDocument !== undefined) {
      documents.push(node.contentDocument.nodeId)
      walk(node.contentDocument)
    }
    node.children?.forEach(walk)
  }
  walk(root)
  for (const nodeId of documents) {
    const { nodeId: found } = (await cdp().send('DOM.querySelector', { nodeId, selector })) as {
      nodeId: number
    }
    if (found !== 0) return found
  }
  throw new Error(`no ${selector} in any frame`)
}

/** Lightness, chroma, hue and alpha of a computed `oklab()` color. */
const filmOf = (color: string) => {
  const match = /^oklab\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\/\s*([\d.]+)/.exec(color)
  if (match === null) throw new Error(`not an OKLab color: ${color}`)
  const [lightness, a, b, alpha] = [match[1], match[2], match[3], match[4]].map(Number) as [
    number,
    number,
    number,
    number,
  ]
  return {
    lightness: lightness * 100,
    chroma: Math.hypot(a, b),
    hue: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360,
    alpha,
  }
}
const distance = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b))

// The error fill the bold band paints, per scheme: lightness 60/64, chroma
// 0.2, hue 25. The film is the fill at 12%, so it agrees on all three.
test.each([
  ['light', 60],
  ['dark', 64],
] as const)(
  'in a %s scheme, a bold band hovers in its own fill, not in its pale text',
  async (scheme, lightness) => {
    const handle = mount(scheme)
    try {
      for (const selector of ['[aria-label="Dismiss Outage"]', 'a']) {
        const element = await vi.waitFor(() => {
          const found = document.querySelector<HTMLElement>(selector)
          expect(found).not.toBeNull()
          return found!
        })
        // Forcing the pseudo state and reading the film race the hover's own
        // 80ms fade: force again until the film reads settled.
        const film = await vi.waitFor(
          async () => {
            await cdp().send('DOM.enable')
            await cdp().send('CSS.enable')
            await cdp().send('CSS.forcePseudoState', {
              nodeId: await nodeOf(selector),
              forcedPseudoClasses: ['hover'],
            })
            expect(element.matches(':hover')).toBe(true)
            const settled = filmOf(getComputedStyle(element).backgroundColor)
            // The film fades in to 12%; mid-fade reads are thinner.
            expect(settled.alpha).toBeGreaterThan(0.11)
            return settled
          },
          { timeout: 10000 },
        )
        const rootEl = document.querySelector('[data-layout="banner"]')!
        expect(rootEl.getAttribute('data-dismissible')).toBe('true')
        expect(distance(film.hue, 25), selector).toBeLessThan(6)
        expect(film.chroma, selector).toBeGreaterThan(0.15)
        expect(Math.abs(film.lightness - lightness), selector).toBeLessThan(4)
      }
    } finally {
      handle.dispose()
    }
  },
)
