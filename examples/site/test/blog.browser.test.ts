/**
 * The blog's reading column in a real browser: the measure in characters, the
 * size of the text at each width, no sideways scroll on a phone, and the table
 * of contents beside the column or folded above it. The post's own view is
 * drawn over a body of the same elements the build writes, with the site's
 * stylesheet installed, so the styles read are the ones a post gets.
 */
import { Option, Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Style } from 'foldkit-mixins'
import { afterEach, expect, test, vi } from 'vitest'
import { page } from 'vitest/browser'

import type { Post } from '../src/blog/posts.js'
import { PostView } from '../src/blog/view.js'
import { stylesheet } from '../src/style.js'

afterEach(() => {
  document.body.replaceChildren()
  document.body.removeAttribute('style')
})

const SENTENCE =
  'A reading column holds a measure the eye can keep, about sixty-six characters to a line, and a rhythm of space that lets a heading sit with the paragraph it introduces. '

const post: Post = {
  slug: 'a-post',
  path: '/blog/a-post',
  file: 'docs/blog/2026-01-01-a-post.md',
  title: 'A post long enough to wrap onto a second line on a phone',
  description: 'A sentence or two saying what the post is for.',
  date: '2026-01-01',
  updated: Option.none(),
  modified: '2026-01-01',
  author: 'Ada Lovelace',
  tags: ['release', 'typography'],
  image: { path: '/blog/og/default.png', width: 1200, height: 630 },
  nodes: [],
  sections: [
    { id: 'one', text: 'One' },
    { id: 'two', text: 'Two' },
  ],
  idOf: () => '',
  minutes: 4,
}

const body = (h: HtmlBuilder<never>): ReadonlyArray<Html> => [
  h.p([h.Id('long')], [SENTENCE.repeat(4)]),
  h.h2([h.Id('one')], ['One']),
  h.p([h.Id('after')], [SENTENCE]),
  h.p(
    [],
    [
      'A name that cannot break: ',
      h.code([], ['Recipes.Listbox.add({ rows: { divided: {} } }).extend(Everything)']),
    ],
  ),
  h.div(
    [h.Class('table'), h.Id('table')],
    [
      h.table(
        [],
        [
          h.tbody(
            [],
            [
              h.tr(
                [],
                ['Package', 'Owns', 'Size', 'Notes'].map(cell => h.td([], [cell.repeat(3)])),
              ),
            ],
          ),
        ],
      ),
    ],
  ),
  h.h2([h.Id('two')], ['Two']),
  h.p([], [SENTENCE]),
]

const mount = async (width: number) => {
  await page.viewport(width, 900)
  Style.install(stylesheet)
  document.body.style.margin = '0'
  const container = document.createElement('div')
  container.id = 'post'
  document.body.appendChild(container)
  Runtime.embed(
    Runtime.makeElement({
      Model: Schema.Struct({}),
      container,
      init: () => ({ model: {} }),
      update: (model: object) => ({ model }),
      view: (_: unknown, h: HtmlBuilder<never>): Html =>
        PostView({ post, body: body(h), previous: Option.none(), next: Option.none() }, h),
    }),
  )
  await vi.waitFor(() => expect(document.querySelector('#long')).not.toBeNull())
}

const px = (value: string) => Number.parseFloat(value)

/** What `ch` is where `element` stands: the width of a zero in its font. */
const chOf = (element: Element): number => {
  const probe = document.createElement('span')
  probe.style.cssText = 'position:absolute;visibility:hidden;inline-size:100ch'
  element.appendChild(probe)
  const width = probe.getBoundingClientRect().width / 100
  probe.remove()
  return width
}

test('at 1440 the text is 18px on a 48ch measure, the contents beside it', async () => {
  await mount(1440)
  const long = document.querySelector<HTMLElement>('#long')!
  const style = getComputedStyle(long)
  expect(style.fontSize).toBe('18px')
  expect(px(style.lineHeight) / px(style.fontSize)).toBeCloseTo(1.65, 2)
  // The paragraph is exactly the measure: the column it sits in is wider.
  const measure = 48 * chOf(long)
  expect(long.getBoundingClientRect().width).toBeCloseTo(measure, 0)
  expect(document.querySelector('article')!.getBoundingClientRect().width).toBeGreaterThan(measure)
  const aside = document.querySelector('aside')!
  expect(getComputedStyle(aside).display).toBe('block')
  expect(aside.getBoundingClientRect().left).toBeGreaterThan(
    document.querySelector('article')!.getBoundingClientRect().right,
  )
  expect(getComputedStyle(document.querySelector('details')!).display).toBe('none')
})

test('a heading has more room above than below, and dates are tabular', async () => {
  await mount(1440)
  const heading = getComputedStyle(document.querySelector('h2')!)
  const after = getComputedStyle(document.querySelector('#after')!)
  expect(px(heading.marginBlockStart)).toBeGreaterThan(2.5 * px(after.marginBlockStart))
  expect(getComputedStyle(document.querySelector('time')!).fontVariantNumeric).toBe('tabular-nums')
})

test('at 390 the text is 17px, nothing scrolls sideways, the table scrolls in its own box, the contents are folded', async () => {
  await mount(390)
  expect(getComputedStyle(document.querySelector('#long')!).fontSize).toBe('17px')
  const root = document.documentElement
  expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth)
  const table = document.querySelector<HTMLElement>('#table')!
  expect(table.scrollWidth).toBeGreaterThan(table.clientWidth)
  const details = document.querySelector('details')!
  expect(getComputedStyle(details).display).toBe('block')
  expect(details.open).toBe(false)
  expect(getComputedStyle(document.querySelector('aside')!).display).toBe('none')
})
