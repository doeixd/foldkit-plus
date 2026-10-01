/**
 * The site's chrome: the keyboard's way past the bar, and the look of what a
 * pointer and a keyboard reach differently.
 */
import { Schema } from 'effect'
import { Style, SlotView } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { expect, it } from 'vitest'

import { PostId } from '../src/content/domain.js'
import { postGrid } from '../src/content/site.js'
import { SiteSlots, SiteStyle } from '../src/styles/siteStyle.js'
import { visit } from './siteFixture.js'

it('offers the keyboard its way past the chrome, first', async () => {
  const page = await visit('/site/blog')
  const [skip] = Inert.byLabel(page.body, 'Skip to content')
  const [first] = Inert.byTag(page.body, 'a')
  const [main] = Inert.byTag(page.body, 'main')
  expect(Inert.value(first, 'href')).toBe('#site-main')
  expect(Inert.value(skip, 'href')).toBe('#site-main')
  expect(Inert.value(main, 'id')).toBe('site-main')
  expect(Inert.value(main, 'tabIndex')).toBe(-1)
})

it('keeps the skip way out of the page until it takes focus', () => {
  const piece = SiteStyle.pieces.skipLink ?? Style.empty
  const css = Style.forSlots(SiteSlots)({ skipLink: piece }).css
  expect(css).toContain('transform:translateY(-200%)')
  expect(css).toContain(':focus-visible')
  expect(css).toContain('transform:translateY(0)')
})

it('rings the card its link covers when the keyboard is on the link', () => {
  const cards = postGrid(SlotView.inertBuilder(), [
    {
      id: Schema.decodeUnknownSync(PostId)('post-1'),
      title: 'A post',
      slug: 'a-post',
      excerpt: 'What it is about.',
      cover: '',
      publishedAt: '2026-01-01T00:00:00.000Z',
    },
  ])
  expect(Inert.css(Inert.all(cards))).toContain(':has(a:focus-visible)')
})
