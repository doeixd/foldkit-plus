/**
 * Badge: one Container slot, and a view carrying its tone in `data-tone`.
 * How each appearance draws its tone is `badge.browser.test.ts`.
 */
import { describe, expect, it } from 'vitest'
import { Capability, SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { BadgeSlots, view } from '../src/badge.js'
import { Recipes } from '../src/index.js'

const h = SlotView.inertBuilder<never>()

describe('BadgeSlots', () => {
  it('publishes the pill, its icon and its dismiss button', () => {
    expect(Object.keys(BadgeSlots)).toEqual(['badge', 'icon', 'dismiss'])
    expect(BadgeSlots.badge?.capability).toBe(Capability.Container)
    expect(BadgeSlots.dismiss?.capability).toBe(Capability.Interactive)
  })
})

describe('Badge view', () => {
  it('carries its tone in data-tone, or nothing without one', () => {
    const toned = view(
      {
        text: 'Live',
        tone: 'success',
        style: Style.forSlots(BadgeSlots)(Recipes.Badge()),
      },
      h,
    )
    expect(Inert.byTag(toned, 'span')).toHaveLength(1)
    expect(Inert.value(Inert.byTag(toned, 'span')[0], 'data-tone')).toBe('success')
    expect(Inert.text(toned)).toBe('Live')
    const plain = view({ text: 'New' }, h)
    expect(Inert.value(Inert.byTag(plain, 'span')[0], 'data-tone')).toBeUndefined()
  })
})

describe('Badge view: icon, dismiss and link', () => {
  const hm = SlotView.inertBuilder<'Dismissed'>()

  it('draws an icon before the text, hidden from assistive technology', () => {
    const drawn = view({ text: 'Live', icon: h.span([], ['dot']) }, h)
    const hidden = Inert.byTag(drawn, 'span').filter(
      node => Inert.value(node, 'aria-hidden') === 'true',
    )
    expect(hidden).toHaveLength(1)
    expect(Inert.text(hidden[0])).toBe('dot')
    expect(Inert.text(drawn)).toBe('dotLive')
  })

  it('draws a dismiss button named for the badge, sending the Message', () => {
    const drawn = view({ text: 'Design', onDismiss: 'Dismissed' }, hm)
    const [button] = Inert.byTag(drawn, 'button')
    expect(Inert.value(button, 'aria-label')).toBe('Dismiss Design')
    expect(Inert.value(button, 'type')).toBe('button')
    expect(button?.data?.on?.['click']).toBeTypeOf('function')
    expect(Inert.byTag(view({ text: 'Design' }, h), 'button')).toHaveLength(0)
  })

  it('takes its words from `words`, key by key', () => {
    const drawn = view(
      { text: 'Design', onDismiss: 'Dismissed', words: { dismiss: 'Remove {text}' } },
      hm,
    )
    const [button] = Inert.byTag(drawn, 'button')
    expect(Inert.value(button, 'aria-label')).toBe('Remove Design')
    expect(Inert.text(button)).toBe('×')
  })

  it('draws a link for an href, and says when it opens a new tab', () => {
    const plain = view({ text: 'Docs', href: '/docs' }, h)
    expect(Inert.byTag(plain, 'span')).toHaveLength(0)
    const [link] = Inert.byTag(plain, 'a')
    expect(Inert.value(link, 'href')).toBe('/docs')
    expect(Inert.value(link, 'target')).toBeUndefined()
    const [away] = Inert.byTag(
      view({ text: 'Docs', href: 'https://x.test', external: true }, h),
      'a',
    )
    expect(Inert.value(away, 'target')).toBe('_blank')
    expect(Inert.value(away, 'rel')).toBe('noopener noreferrer')
    expect(Inert.value(away, 'aria-description')).toBe('Opens in a new tab')
  })
})
