/**
 * The site's navigation links in a real browser: the rail's places, a
 * package's pages, "On this page", the blog's own outline, the home page's
 * sections and the phone menu's list are one link style (`navLink`), so in the
 * same state they read the same colour, weight and marker in both schemes, and
 * the text clears AA against the page.
 */
import { Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { SlotView, Style } from 'foldkit-mixins'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'

import { BlogStyle } from '../src/blog/style.js'
import { SiteStyle, stylesheet } from '../src/style.js'

type H = HtmlBuilder<never>

const Site = SlotView.forMessages<never>()
  .define(SiteStyle.slots, (_: null, slots, h: H) =>
    h.div(
      [],
      [
        h.nav(
          slots.nav.attrs(),
          ['rail', 'rail-current'].map(id =>
            h.a(
              [
                h.Id(id),
                h.Href(`#${id}`),
                ...(id === 'rail-current' ? [h.AriaCurrent('page')] : []),
              ],
              [id],
            ),
          ),
        ),
        h.nav(slots.sidebar.attrs(), [
          h.ul(
            [],
            ['sidebar', 'sidebar-current'].map(id =>
              h.li(
                [],
                [
                  h.a(
                    [
                      h.Id(id),
                      h.Href(`#${id}`),
                      ...(id === 'sidebar-current' ? [h.AriaCurrent('page')] : []),
                    ],
                    [id],
                  ),
                ],
              ),
            ),
          ),
        ]),
        h.aside(slots.outline.attrs(), [
          h.ul(
            [],
            ['outline', 'outline-current'].map(id =>
              h.li(
                [],
                [
                  h.a(
                    [
                      h.Id(id),
                      h.Href(`#${id}`),
                      ...(id === 'outline-current' ? [h.AriaCurrent('location')] : []),
                    ],
                    [id],
                  ),
                ],
              ),
            ),
          ),
        ]),
        h.div(slots.menuBody.attrs(), [
          h.nav(
            slots.nav.attrs(),
            ['menu', 'menu-current'].map(id =>
              h.a(
                [
                  h.Id(id),
                  h.Href(`#${id}`),
                  ...(id === 'menu-current' ? [h.AriaCurrent('page')] : []),
                ],
                [id],
              ),
            ),
          ),
        ]),
      ],
    ),
  )
  .pipe(Style.attach(SiteStyle.style))

const Blog = SlotView.forMessages<never>()
  .define(BlogStyle.slots, (_: null, slots, h: H) =>
    h.aside(slots.contents.attrs(), [
      h.ol(
        [],
        ['blog', 'blog-current'].map(id =>
          h.li(
            [],
            [
              h.a(
                [
                  h.Id(id),
                  h.Href(`#${id}`),
                  ...(id === 'blog-current' ? [h.AriaCurrent('location')] : []),
                ],
                [id],
              ),
            ],
          ),
        ),
      ),
    ]),
  )
  .pipe(Style.attach(BlogStyle.style))

afterEach(() => {
  document.body.replaceChildren()
  document.body.removeAttribute('style')
  document.documentElement.style.colorScheme = ''
})

const mount = async (scheme: 'light' | 'dark') => {
  Style.install(stylesheet)
  document.documentElement.style.colorScheme = scheme
  document.body.style.margin = '0'
  document.body.style.background = 'var(--fk-surface-base)'
  const container = document.createElement('div')
  container.id = 'nav-links-page'
  document.body.appendChild(container)
  Runtime.embed(
    Runtime.makeElement({
      Model: Schema.Struct({}),
      container,
      init: () => ({ model: {} }),
      update: (model: object) => ({ model }),
      view: (_, h: H): Html => h.div([], [Site(null, h), Blog(null, h)]),
    }),
  )
  await vi.waitFor(() => expect(document.getElementById('blog-current')).not.toBeNull())
  // The browser tests share one real pointer: an earlier file may have left it over a link, which
  // then reads as hovered. Park it on a spot of our own that no link is drawn at, and let any
  // colour transition it started finish before a rest colour is read.
  const spot = document.createElement('div')
  spot.id = 'nav-links-spot'
  spot.style.cssText =
    'position: fixed; inset-block-end: 0; inset-inline-end: 0; inline-size: 40px; block-size: 40px'
  document.body.appendChild(spot)
  await userEvent.hover(spot)
  await vi.waitFor(() =>
    expect(document.getAnimations().filter(animation => animation.playState === 'running')).toEqual(
      [],
    ),
  )
}

/** The painted channels of a CSS colour, read through a canvas (the computed value may be oklch). */
const rgbOf = (css: string): ReadonlyArray<number> => {
  const context = document.createElement('canvas').getContext('2d')!
  context.fillStyle = css
  context.fillRect(0, 0, 1, 1)
  return Array.from(context.getImageData(0, 0, 1, 1).data)
}

const luminance = ([r, g, b]: ReadonlyArray<number>): number => {
  const [lr, lg, lb] = [r!, g!, b!].map(channel => {
    const c = channel / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * lr! + 0.7152 * lg! + 0.0722 * lb!
}

const contrast = (a: string, b: string): number => {
  const [light, dark] = [luminance(rgbOf(a)), luminance(rgbOf(b))].sort((x, y) => y - x)
  return (light! + 0.05) / (dark! + 0.05)
}

/** What marks a link: the colour, weight, bar and decoration it is drawn with. */
const marks = (id: string) => {
  const style = getComputedStyle(document.getElementById(id)!)
  return {
    color: rgbOf(style.color).join(),
    weight: style.fontWeight,
    bar: `${style.borderInlineStartWidth} ${rgbOf(style.borderInlineStartColor).join()}`,
    decoration: style.textDecorationLine,
  }
}

const LISTS = ['rail', 'sidebar', 'outline', 'menu', 'blog'] as const

/** The page and the menu's list differ in size and in no mark. */
test.each(['light', 'dark'] as const)(
  'a navigation link is drawn alike in every list at rest and as the current one, in %s',
  async scheme => {
    await mount(scheme)
    for (const state of ['', '-current']) {
      const [first, ...rest] = LISTS.map(list => marks(`${list}${state}`))
      for (const other of rest) expect(other).toEqual(first)
    }
    const [rest, current] = [marks('rail'), marks('rail-current')]
    expect(rest.weight).not.toBe(current.weight)
    expect(rest.bar).not.toBe(current.bar)
    expect(current.bar.startsWith('2px')).toBe(true)
  },
)

test.each(['light', 'dark'] as const)(
  "the pointer marks every list's link the same way, and it differs from the current one, in %s",
  async scheme => {
    await mount(scheme)
    const hovered = new Set<string>()
    for (const list of LISTS) {
      const rest = marks(list)
      await userEvent.hover(document.getElementById(list)!)
      await vi.waitFor(() => expect(marks(list)).not.toEqual(rest))
      const hover = marks(list)
      hovered.add(JSON.stringify(hover))
      // A pointer shows a bar and a colour that neither rest nor the current page has.
      expect(hover.bar).not.toBe(rest.bar)
      expect(hover.bar).not.toBe(marks(`${list}-current`).bar)
      expect(hover.color).not.toBe(rest.color)
    }
    expect(hovered.size).toBe(1)
  },
)

test.each(['light', 'dark'] as const)(
  'a navigation link clears AA against the page at rest, under the pointer and as the current one, in %s',
  async scheme => {
    await mount(scheme)
    const page = getComputedStyle(document.body).backgroundColor
    const color = (id: string) => getComputedStyle(document.getElementById(id)!).color
    expect(contrast(color('rail'), page)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(color('rail-current'), page)).toBeGreaterThanOrEqual(4.5)
    await userEvent.hover(document.getElementById('rail')!)
    await vi.waitFor(() => expect(contrast(color('rail'), page)).toBeGreaterThanOrEqual(4.5))
  },
)
