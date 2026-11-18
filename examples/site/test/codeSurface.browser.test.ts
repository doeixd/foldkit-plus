/**
 * The site's code blocks in a real browser: in the light scheme the box is a
 * quiet step off the page, not a slab, and the same holds for a diagram. The
 * two painted colors are compared with each other, never with a knob value.
 */
import { Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Style } from 'foldkit-mixins'
import { afterEach, expect, test, vi } from 'vitest'

import { codeBlock } from '../src/content/render.js'
import { stylesheet } from '../src/style.js'

afterEach(() => {
  document.body.replaceChildren()
  document.body.removeAttribute('style')
})

const mount = async (lang: 'ts' | 'text') => {
  Style.install(stylesheet)
  document.body.style.margin = '0'
  document.body.style.background = 'var(--fk-surface-base)'
  const container = document.createElement('div')
  container.id = 'code-surface-page'
  document.body.appendChild(container)
  const view = (_: unknown, h: HtmlBuilder<never>): Html =>
    h.div([], [codeBlock(h, () => [], { code: 'const a = 1', lang, copy: true })])
  Runtime.embed(
    Runtime.makeElement({
      Model: Schema.Struct({}),
      container,
      init: () => ({ model: {} }),
      update: (model: object) => ({ model }),
      view,
    }),
  )
  await vi.waitFor(() => expect(document.querySelector('pre')).not.toBeNull())
  return document.querySelector('pre')!
}

/** Where the box's fill is painted: the nearest ancestor of `pre` with one. */
const fillOf = (el: Element): string => {
  for (let at: Element | null = el; at !== null; at = at.parentElement) {
    const color = getComputedStyle(at).backgroundColor
    if (color !== 'rgba(0, 0, 0, 0)') return color
  }
  return 'rgb(255, 255, 255)'
}

/** OKLab lightness (0 to 1) of what the browser painted, read through a canvas. */
const lightnessOf = (css: string): number => {
  const context = document.createElement('canvas').getContext('2d')!
  context.fillStyle = css
  context.fillRect(0, 0, 1, 1)
  const [r, g, b] = Array.from(context.getImageData(0, 0, 1, 1).data, channel => {
    const c = channel / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  const l = Math.cbrt(0.4122214708 * r! + 0.5363325363 * g! + 0.0514459929 * b!)
  const m = Math.cbrt(0.2119034982 * r! + 0.6806995451 * g! + 0.1073969566 * b!)
  const s = Math.cbrt(0.0883024619 * r! + 0.2817188376 * g! + 0.6299787005 * b!)
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
}

test.each(['ts', 'text'] as const)(
  'a %s code block is barely off the page in the light scheme',
  async lang => {
    const pre = await mount(lang)
    const page = lightnessOf(fillOf(document.body))
    const box = lightnessOf(fillOf(pre))
    expect(page).toBeGreaterThan(0.95)
    expect(Math.abs(page - box)).toBeLessThan(0.025)
  },
)
