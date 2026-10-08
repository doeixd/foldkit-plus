/**
 * Skeleton: one Container slot, a view that reports through `status`, and a
 * recipe that breathes through a keyframed pulse — still under
 * reduced motion, where the bar holds its resting opacity.
 */
import { describe, expect, it } from 'vitest'
import { Capability, SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { SkeletonSlots, view } from '../src/skeleton.js'
import { Recipes } from '../src/index.js'

const h = SlotView.inertBuilder<never>()

describe('SkeletonSlots', () => {
  it('publishes one container and nothing stateful', () => {
    expect(Object.keys(SkeletonSlots)).toEqual(['bar'])
    expect(SkeletonSlots.bar?.capability).toBe(Capability.Container)
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

describe('Skeleton recipe', () => {
  const css = (selection: Parameters<typeof Recipes.Skeleton>[0]): string =>
    Style.stylesheet(Style.forSlots(SkeletonSlots)(Recipes.Skeleton(selection)))

  it('breathes through a keyframed pulse that follows the motion token', () => {
    const sheet = css({})
    expect(sheet).toContain('@keyframes')
    expect(sheet).toMatch(/opacity:0?\.45/)
    expect(sheet).toContain('ease-in-out infinite')
    // The duration is the token reference; the knob math lives in Theme.tokens.
    expect(sheet).toContain('var(--fk-motion-normal)')
  })

  it('holds still under reduced motion, and rounds circles', () => {
    const sheet = css({})
    expect(sheet).toContain('prefers-reduced-motion')
    expect(sheet).toContain('animation:none')
    expect(css({ shape: 'circle' })).toContain('border-radius:var(--fk-radius-full)')
  })
})
