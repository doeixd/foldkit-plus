/**
 * The demo guide over a page in a real browser: on a phone, scrolled to the
 * end, the page's last line sits clear of the pill instead of under it, and
 * the guide's links are tall enough for a finger. A page that scrolls ends in
 * room for the pill at any width, so no control the page draws is under it; a
 * demo places the pill in another corner, collapses it, or keeps the room.
 */
import { Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { afterEach, expect, test, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { cmsDemo } from '../src/demos.js'
import { demoGuide, type GuideCorner } from '../src/guide.js'

const Guide = demoGuide<never>()

afterEach(() => {
  document.body.replaceChildren()
  document.body.removeAttribute('style')
})

type Options = {
  readonly corner?: GuideCorner
  readonly inset?: string
  readonly compact?: boolean
  readonly reserve?: boolean
}

const mount = async (options: Options = {}) => {
  document.body.style.margin = '0'
  const container = document.createElement('div')
  container.id = 'guided'
  document.body.appendChild(container)
  const view = (_: unknown, h: HtmlBuilder<never>): Html =>
    h.div(
      [],
      [
        h.div([h.Style({ blockSize: '1500px' })], []),
        h.p([h.Id('last'), h.Style({ margin: '0' })], ['The page’s last line']),
        h.button(
          [h.Id('control'), h.Style({ display: 'block', marginInlineStart: 'auto' })],
          ['Save'],
        ),
        Guide({ demo: cmsDemo, ...options }, h),
      ],
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
  await vi.waitFor(() => expect(document.querySelector('summary')).not.toBeNull())
}

test('on a phone the page’s last line scrolls clear of the pill', async () => {
  await page.viewport(390, 844)
  await mount()
  window.scrollTo(0, document.documentElement.scrollHeight)
  await vi.waitFor(() =>
    expect(window.scrollY + window.innerHeight).toBeGreaterThanOrEqual(
      document.documentElement.scrollHeight - 1,
    ),
  )
  const last = document.querySelector('#last')!.getBoundingClientRect()
  const pill = document.querySelector('summary')!.getBoundingClientRect()
  expect(last.bottom).toBeLessThanOrEqual(pill.top)
})

const scrollToEnd = async () => {
  window.scrollTo(0, document.documentElement.scrollHeight)
  await vi.waitFor(() =>
    expect(window.scrollY + window.innerHeight).toBeGreaterThanOrEqual(
      document.documentElement.scrollHeight - 1,
    ),
  )
}

const overlaps = (a: DOMRect, b: DOMRect) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

test.each([
  { width: 390, height: 844 },
  { width: 1280, height: 900 },
])('at $width px the pill covers no control the page draws', async ({ width, height }) => {
  await page.viewport(width, height)
  await mount()
  await scrollToEnd()
  const control = document.querySelector('#control')!.getBoundingClientRect()
  const pill = document.querySelector('summary')!.getBoundingClientRect()
  expect(overlaps(control, pill)).toBe(false)
  // The control is the page's last thing at the right edge, so the room under it is the pill's.
  expect(control.bottom).toBeLessThanOrEqual(pill.top)
})

test('a page that fills the screen keeps its height when it asks for no room', async () => {
  await page.viewport(1280, 900)
  await mount({ reserve: false })
  expect(getComputedStyle(document.body, '::after').display).not.toBe('block')
})

test.each([
  { corner: 'bottom-end', left: false, top: false },
  { corner: 'bottom-start', left: true, top: false },
  { corner: 'top-end', left: false, top: true },
  { corner: 'top-start', left: true, top: true },
] as const)('the pill sits in the $corner corner', async ({ corner, left, top }) => {
  await page.viewport(1280, 900)
  await mount({ corner, inset: '2rem' })
  const pill = document.querySelector('summary')!.getBoundingClientRect()
  const root = document.documentElement
  expect(left ? pill.left : root.clientWidth - pill.right).toBe(32)
  expect(top ? pill.top : root.clientHeight - pill.bottom).toBe(32)
  document.querySelector('details')!.open = true
  const panel = document.querySelector('details > div')!.getBoundingClientRect()
  expect(panel.top < pill.top).toBe(!top)
  expect(left ? panel.left : panel.right).toBe(left ? pill.left : pill.right)
})

test('a compact pill is a finger’s square and still has its name', async () => {
  await page.viewport(390, 844)
  await mount({ compact: true })
  const summary = document.querySelector('summary')!
  const pill = summary.getBoundingClientRect()
  expect(pill.width).toBe(pill.height)
  expect(pill.width).toBeGreaterThanOrEqual(24)
  expect(summary.textContent).toBe('How to try this demo')
  // Tab reaches it, and the keyboard opens it.
  summary.focus()
  expect(document.activeElement).toBe(summary)
  await userEvent.keyboard('{Enter}')
  expect(document.querySelector('details')!.open).toBe(true)
})

test('the guide’s links are a finger’s height', async () => {
  await page.viewport(390, 844)
  await mount()
  document.querySelector('details')!.open = true
  const links = [...document.querySelectorAll('details a')]
  expect(links.length).toBeGreaterThan(0)
  for (const link of links) expect(link.getBoundingClientRect().height).toBeGreaterThanOrEqual(24)
})
