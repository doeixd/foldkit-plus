/**
 * Skeleton: a lone bar that reports through `status`, and frames of bars
 * (lines, an avatar row, a card, a table row) that are one `status` whose
 * bars are drawing; and a recipe that pulses or sweeps, still under reduced
 * motion.
 */
import { describe, expect, it } from 'vitest'
import { Capability, SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { SkeletonSlots, avatarRow, card, lines, tableRow, view } from '../src/skeleton.js'
import { Recipes } from '../src/index.js'

const h = SlotView.inertBuilder<never>()
const bars = (drawn: ReturnType<typeof view>) => Inert.children(drawn)

describe('SkeletonSlots', () => {
  it('publishes containers and nothing stateful', () => {
    expect(Object.keys(SkeletonSlots)).toEqual(['bar', 'group'])
    for (const slot of Object.values(SkeletonSlots)) {
      expect(slot.capability).toBe(Capability.Container)
    }
  })
})

describe('Skeleton view', () => {
  it('reports what it stands in for', () => {
    const bar = view({ label: 'Profile' }, h)
    expect(Inert.byRole(bar, 'status')).toHaveLength(1)
    expect(Inert.value(Inert.byRole(bar, 'status')[0], 'aria-label')).toBe('Profile')
  })

  it('stays silent without a label', () => {
    const bar = view({}, h)
    expect(Inert.value(Inert.byRole(bar, 'status')[0], 'aria-label')).toBeUndefined()
  })
})

describe('Skeleton frames', () => {
  it('is one status, its bars drawing', () => {
    for (const drawn of [
      lines({ lines: 3, label: 'Loading the post' }, h),
      avatarRow({ label: 'Loading the post' }, h),
      card({ label: 'Loading the post' }, h),
      tableRow({ columns: 4, label: 'Loading the post' }, h),
    ]) {
      expect(Inert.byRole(drawn, 'status')).toHaveLength(1)
      expect(Inert.value(drawn, 'aria-label')).toBe('Loading the post')
      for (const bar of bars(drawn)) expect(Inert.value(bar, 'aria-hidden')).toBe('true')
    }
  })

  it('draws `lines` lines, only the last ending early', () => {
    const drawn = bars(lines({ lines: 3 }, h))
    expect(drawn).toHaveLength(3)
    expect(drawn.map(bar => Inert.value(bar, 'data-short'))).toEqual([undefined, undefined, ''])
    // One line is a whole line.
    expect(Inert.value(bars(lines({ lines: 1 }, h))[0], 'data-short')).toBeUndefined()
  })

  it('makes an avatar row of a circle and two lines, a card of a picture and three', () => {
    expect(bars(avatarRow({}, h)).map(bar => Inert.value(bar, 'data-shape'))).toEqual([
      'circle',
      undefined,
      undefined,
    ])
    expect(Inert.value(bars(card({}, h))[0], 'data-shape')).toBe('block')
    expect(bars(card({}, h))).toHaveLength(4)
  })

  it('draws a cell a column, and says how many', () => {
    const drawn = tableRow({ columns: 5 }, h)
    expect(bars(drawn)).toHaveLength(5)
    expect(Inert.style(drawn)['--fk-skeleton-columns']).toBe('5')
  })

  it('refuses no lines or columns', () => {
    expect(() => lines({ lines: 0 }, h)).toThrow(/lines must be a whole number/)
    expect(() => tableRow({ columns: 1.5 }, h)).toThrow(/columns must be a whole number/)
  })
})

describe('Skeleton recipe', () => {
  const css = (selection: Parameters<typeof Recipes.Skeleton>[0]): string =>
    Style.stylesheet(Style.forSlots(SkeletonSlots)(Recipes.Skeleton(selection)))

  it('breathes through a keyframed pulse that follows the motion token', () => {
    const sheet = css({})
    expect(sheet).toContain('@keyframes')
    expect(sheet).toMatch(/opacity:0?\.45/)
    expect(sheet).toContain('ease-in-out infinite')
    expect(sheet).toContain('var(--fk-motion-slow)')
  })

  it('holds still under reduced motion, pulsing or sweeping, and rounds circles', () => {
    for (const animation of ['pulse', 'shimmer'] as const) {
      const sheet = css({ animation })
      expect(sheet).toMatch(/prefers-reduced-motion: reduce\)\{[^}]*\{animation:none/)
    }
    // The lone bar's own circle, not the one a frame draws for an avatar.
    expect(css({ shape: 'circle' })).toMatch(
      /:not\(\[aria-hidden="true"\]\)\{[^}]*border-radius:var\(--fk-radius-full\)/,
    )
  })
})
