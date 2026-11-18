/**
 * A fence in `text` (a diagram) over a phone in a real browser: its lines are
 * kept whole and the box scrolls sideways rather than the page, a keyboard can
 * reach it, its rows are one height apart, and the box-drawing and arrow glyphs
 * are as wide as letters, so the columns of a diagram line up.
 */
import { Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Style } from 'foldkit-mixins'
import { afterEach, expect, test, vi } from 'vitest'
import { page } from 'vitest/browser'

import { codeBlock } from '../src/content/render.js'
import { stylesheet } from '../src/style.js'

afterEach(() => {
  document.body.replaceChildren()
  document.body.removeAttribute('style')
})

const WIDE = [
  'Surface Projection → requirements → active Subscription → RemoteClient I/O',
  '        ↑                                                    │',
  '        └──────── read Model ← Data.reduce ← Remote Message ──┘',
  '┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐',
  '│ a -> b => c │──►│  two lines  │──►│  of boxes   │──►│   joined    │',
  '└─────────────┘   └─────────────┘   └─────────────┘   └─────────────┘',
].join('\n')

const mount = async (code: string) => {
  Style.install(stylesheet)
  document.body.style.margin = '0'
  const container = document.createElement('div')
  container.id = 'diagram-page'
  document.body.appendChild(container)
  const view = (_: unknown, h: HtmlBuilder<never>): Html =>
    h.div(
      [h.Style({ padding: '16px' })],
      [codeBlock(h, () => [], { code, lang: 'text', copy: true })],
    )
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
  await document.fonts.ready
  return document.querySelector('pre')!
}

/** The width of `text` in the block's own type. */
const widthOf = (pre: HTMLElement, text: string) => {
  const probe = document.createElement('span')
  probe.style.cssText = 'white-space:pre;position:absolute;visibility:hidden'
  probe.textContent = text
  pre.append(probe)
  const width = probe.getBoundingClientRect().width
  probe.remove()
  return width
}

test('a diagram wider than a phone scrolls in its own box, not the page', async () => {
  await page.viewport(390, 844)
  const pre = await mount(WIDE)
  expect(getComputedStyle(pre).whiteSpace).toBe('pre')
  expect(getComputedStyle(pre).overflowX).toBe('auto')
  expect(pre.scrollWidth).toBeGreaterThan(pre.clientWidth)
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
    document.documentElement.clientWidth,
  )
})

test('a keyboard reaches a diagram that scrolls, and it is named', async () => {
  await page.viewport(390, 844)
  const pre = await mount(WIDE)
  expect(pre.tabIndex).toBe(0)
  expect(pre.getAttribute('role')).toBe('region')
  expect(pre.getAttribute('aria-label')).toBe('Diagram')
  pre.focus()
  expect(document.activeElement).toBe(pre)
})

test('its rows are one height apart, tight enough for strokes to meet, in a size that holds', async () => {
  await page.viewport(390, 844)
  const pre = await mount(WIDE)
  const lines = Array.from(pre.querySelectorAll('code > span'))
  const tops = lines.map(line => line.getBoundingClientRect().top)
  const steps = tops.slice(1).map((top, at) => top - tops[at]!)
  expect(steps).toHaveLength(WIDE.split('\n').length - 1)
  for (const step of steps) expect(step).toBeCloseTo(steps[0]!, 1)
  const size = Number.parseFloat(getComputedStyle(pre).fontSize)
  expect(size).toBeGreaterThanOrEqual(12)
  expect(steps[0]! / size).toBeLessThanOrEqual(1.35)
  expect(steps[0]! / size).toBeGreaterThanOrEqual(1.1)
  expect(getComputedStyle(pre).fontVariantLigatures).toBe('none')
})

test('box-drawing and arrow glyphs are as wide as letters, so columns line up', async () => {
  await page.viewport(390, 844)
  const pre = await mount(WIDE)
  const letters = widthOf(pre, 'a'.repeat(40))
  for (const glyph of ['─', '│', '┌', '┐', '└', '┘', '→', '←', '↑', '↓', '►'])
    expect(Math.abs(widthOf(pre, glyph.repeat(40)) - letters), glyph).toBeLessThanOrEqual(0.5)
})
