/**
 * The frame in a real browser over the shipped recipe: at a desktop's width the
 * side column runs down the start beside the header and the main region; at a
 * phone's it sits at the start of the header's row and the main region takes
 * the width; the header stays at the top while the page scrolls; and the skip
 * link shows only when focused and takes focus to the main region.
 */
import { Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { AppShell, AppShellSlots, Recipes } from '../src/index.js'

const theme = Theme.standard(Theme.make({}))
const L = Layers.standard
const style = Style.forSlots(AppShellSlots)(Recipes.AppShell({}))

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = async (sided: boolean) => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      L.declare,
      L.in('reset', Style.global('body { margin: 0 }')),
      L.in('theme', Theme.root(theme)),
    ) + style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = `shell-${sided}`
  document.body.appendChild(container)
  const view = (_: unknown, h: HtmlBuilder<never>): Html =>
    AppShell.view(
      {
        title: 'Journal',
        actions: [h.button([], ['Theme'])],
        // A stand-in for a Sidebar: the frame places it whatever it holds.
        ...(sided
          ? { side: h.nav([h.Style({ inlineSize: '15rem' })], [h.a([h.Href('#a')], ['Posts'])]) }
          : {}),
        style,
      },
      // Positioned, as a card or a popover's anchor is, so it would paint over a header without a layer.
      [h.p([h.Style({ blockSize: '3000px', margin: '0', position: 'relative' })], ['A long page'])],
      h,
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
  await vi.waitFor(() => expect(document.querySelector('main')).not.toBeNull())
}

const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect()

test('at a desktop’s width the side column runs down the start, beside the header and the main region', async () => {
  await page.viewport(1280, 800)
  await mount(true)
  const [side, header, main] = [box('[data-side] > div'), box('header'), box('main')]
  expect(side.left).toBe(0)
  expect(side.height).toBe(800)
  // What the column holds runs its height too, as a sidebar's ground should.
  expect(box('[data-side] > div > nav').height).toBe(800)
  expect(header.left).toBeCloseTo(side.right, 0)
  expect(main.left).toBeCloseTo(side.right, 0)
  expect(main.top).toBeCloseTo(header.bottom, 0)
  expect(main.right).toBeCloseTo(1280, 0)
})

test('at a phone’s width the side column sits in the header’s row and the main region takes the width', async () => {
  await page.viewport(390, 844)
  await mount(true)
  const [side, header, main] = [box('[data-side] > div'), box('header'), box('main')]
  expect(side.top).toBeLessThan(header.bottom)
  expect(side.bottom).toBeLessThanOrEqual(header.bottom + 0.5)
  expect([main.left, main.right]).toEqual([0, 390])
  expect(document.documentElement.scrollWidth).toBe(390)
})

test('without a side column the page is one column', async () => {
  await page.viewport(1280, 800)
  await mount(false)
  const [header, main] = [box('header'), box('main')]
  expect([header.left, header.right, main.left, main.right]).toEqual([0, 1280, 0, 1280])
})

test('the header stays at the top while the page scrolls', async () => {
  await page.viewport(1280, 800)
  await mount(true)
  window.scrollTo(0, 1200)
  await vi.waitFor(() => expect(window.scrollY).toBe(1200))
  const header = box('header')
  expect(header.top).toBe(0)
  expect(box('[data-side] > div').top).toBe(0)
  // What is under the header's middle is the header, not the page scrolled beneath it.
  const hit = document.elementFromPoint(
    header.left + header.width / 2,
    header.top + header.height / 2,
  )
  expect(document.querySelector('header')!.contains(hit)).toBe(true)
})

test('the skip link is out of sight until focused, and takes focus to the main region', async () => {
  await page.viewport(1280, 800)
  await mount(false)
  const skip = document.querySelector<HTMLAnchorElement>('a[href="#main"]')!
  expect(skip.getBoundingClientRect().bottom).toBeLessThanOrEqual(0)
  await userEvent.keyboard('{Tab}')
  expect(document.activeElement).toBe(skip)
  await vi.waitFor(() => expect(skip.getBoundingClientRect().top).toBeGreaterThan(0))
  // Shown over the header it overlaps, so a person can see what they are about to press.
  const shown = skip.getBoundingClientRect()
  expect(document.elementFromPoint(shown.left + 4, shown.top + shown.height / 2)).toBe(skip)
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(document.activeElement).toBe(document.querySelector('main')))
})
