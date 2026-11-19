/**
 * The Primitives gallery's list on a phone, in a real browser: a row stacks
 * (name and form on one line, what it is for under them at the page's full
 * width), reads at a size a phone can, is tall enough to press, and no row
 * pushes the page sideways. Geometry, not visibility.
 */
import { Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { SlotView, Style } from 'foldkit-mixins'
import { afterEach, expect, test, vi } from 'vitest'
import { page } from 'vitest/browser'

import { families } from '../src/gallery/primitives.js'
import { SiteStyle, stylesheet } from '../src/style.js'
import { row } from '../src/view/primitiveRow.js'

afterEach(() => {
  document.body.replaceChildren()
  document.body.removeAttribute('style')
})

const List = SlotView.forMessages<never>()
  .define(SiteStyle.slots, (_: object, slots, h: HtmlBuilder<never>): Html =>
    h.div(
      [h.Style({ boxSizing: 'border-box', paddingInline: '1rem' })],
      families.flatMap(family => [
        h.ul(
          slots.primitives.attrs(),
          family.cards.map(card => row(family, card, slots, h)),
        ),
      ]),
    ),
  )
  .pipe(Style.attach(SiteStyle.style))

const mount = async () => {
  Style.install(stylesheet)
  document.body.style.margin = '0'
  document.body.style.background = 'var(--fk-surface-base)'
  const container = document.createElement('div')
  container.id = 'primitive-rows'
  document.body.appendChild(container)
  Runtime.embed(
    Runtime.makeElement({
      Model: Schema.Struct({}),
      container,
      init: () => ({ model: {} }),
      update: (model: object) => ({ model }),
      view: (_: object, h: HtmlBuilder<never>) => List({}, h),
    }),
  )
  await vi.waitFor(() => expect(document.querySelector('a')).not.toBeNull())
  return Array.from(document.querySelectorAll('li > a'))
}

const px = (value: string) => Number.parseFloat(value)

test.each([390, 360])('at %i a primitive stacks, reads and presses well', async width => {
  await page.viewport(width, 800)
  const rows = await mount()
  expect(rows.length).toBeGreaterThan(20)
  for (const link of rows) {
    const [name, about, form] = Array.from(link.children)
    const at = link.getBoundingClientRect()
    const nameBox = name!.getBoundingClientRect()
    const aboutBox = about!.getBoundingClientRect()
    const formBox = form!.getBoundingClientRect()
    const label = name!.textContent
    // Name and form share a line, with the form at the row's end.
    expect(Math.abs(nameBox.top - formBox.top), label ?? '').toBeLessThan(nameBox.height)
    expect(formBox.right, label ?? '').toBeCloseTo(at.right, 0)
    // What it is for sits below them and takes the row's whole width.
    expect(aboutBox.top, label ?? '').toBeGreaterThanOrEqual(nameBox.bottom)
    expect(aboutBox.width, label ?? '').toBeCloseTo(at.width, 0)
    // Readable: 15px or more at a line height of 1.45 or more, a mono name at 15px.
    const aboutStyle = getComputedStyle(about!)
    expect(px(aboutStyle.fontSize), label ?? '').toBeGreaterThanOrEqual(15)
    expect(px(aboutStyle.lineHeight) / px(aboutStyle.fontSize), label ?? '').toBeGreaterThanOrEqual(
      1.45,
    )
    expect(px(getComputedStyle(name!).fontSize), label ?? '').toBeGreaterThanOrEqual(15)
    // A finger's target, with room above its text rather than a text-height sliver.
    expect(at.height, label ?? '').toBeGreaterThanOrEqual(44)
    expect(nameBox.top - at.top, label ?? '').toBeGreaterThanOrEqual(12)
  }
  const root = document.documentElement
  expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth)
})
