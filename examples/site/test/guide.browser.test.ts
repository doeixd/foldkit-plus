/**
 * The demo guide over a page in a real browser: on a phone, scrolled to the
 * end, the page's last line sits clear of the pill instead of under it, and
 * the guide's links are tall enough for a finger. On a desktop, where the
 * pill sits beside content rather than over it, the page gets no extra room.
 */
import { Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { afterEach, expect, test, vi } from 'vitest'
import { page } from 'vitest/browser'
import { cmsDemo } from '../src/demos.js'
import { demoGuide } from '../src/guide.js'

const Guide = demoGuide<never>()

afterEach(() => {
  document.body.replaceChildren()
  document.body.removeAttribute('style')
})

const mount = async () => {
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
        Guide({ demo: cmsDemo }, h),
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

test('on a desktop the page gets no room it does not need', async () => {
  await page.viewport(1280, 800)
  await mount()
  expect(getComputedStyle(document.body, '::after').display).not.toBe('block')
})

test('the guide’s links are a finger’s height', async () => {
  await page.viewport(390, 844)
  await mount()
  document.querySelector('details')!.open = true
  const links = [...document.querySelectorAll('details a')]
  expect(links.length).toBeGreaterThan(0)
  for (const link of links) expect(link.getBoundingClientRect().height).toBeGreaterThanOrEqual(24)
})
