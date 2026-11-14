/**
 * The gate: every adapter's Slots satisfy its pattern, every obligation the
 * pattern declares has a named provider, the catalog names each widget once,
 * and a pattern refuses a contract that lacks what it requires.
 */
import { A11y, Capability, Slot, Slots } from 'foldkit-mixins'
import { describe, expect, it } from 'vitest'
import { Patterns } from '../src/index.js'

/** The `slot/obligation` pairs a pattern declares on slots its contract publishes. */
const declared = (entry: (typeof Patterns.catalog)[number]): ReadonlyArray<string> =>
  Object.entries(entry.pattern.requirements).flatMap(([slot, requirement]) =>
    Object.hasOwn(entry.slots, slot)
      ? (requirement.obligations ?? []).map(obligation => `${slot}/${obligation}`)
      : [],
  )

/** Widgets whose APG pattern implies obligations: each must declare at least one. */
const obliged = [
  'menu',
  'menubar',
  'combobox',
  'command',
  'cascade-select',
  'tabs',
  'tree-view',
  'radioGroup',
  'switch',
  'checkbox',
  'checkbox-group',
  'slider',
  'angle-slider',
  'accordion',
  'segmented',
  'rating',
  'calendar',
  'tour',
  'listbox',
  'picker',
]

describe('Patterns.catalog', () => {
  it.each(Patterns.catalog.map(entry => [entry.name, entry] as const))(
    '%s satisfies its pattern, and every obligation has a provider',
    (_name, entry) => {
      expect(A11y.validate(entry.pattern, entry.slots as never, entry.support)).toEqual([])
    },
  )

  it.each(Patterns.catalog.map(entry => [entry.name, entry] as const))(
    '%s: each provider is needed, so dropping one is reported',
    (_name, entry) => {
      const unmet = (support: typeof entry.support) =>
        A11y.validate(entry.pattern, entry.slots as never, support).map(
          item => `${item.slot}/${item.details?.['obligation']}`,
        )
      expect(unmet([]).sort()).toEqual([...declared(entry)].sort())
      for (const dropped of entry.support) {
        expect(unmet(entry.support.filter(item => item !== dropped))).toEqual([
          `${dropped.slot}/${dropped.obligation}`,
        ])
      }
    },
  )

  it.each(obliged)('%s declares obligations', name => {
    const entry = Patterns.catalog.find(item => item.name === name)
    if (entry === undefined) throw new Error(`no ${name} pattern`)
    expect(declared(entry).length).toBeGreaterThan(0)
  })

  it('names every adapter once, each with a tier and at least one role', () => {
    const names = Patterns.catalog.map(entry => entry.name)
    expect(new Set(names).size).toBe(names.length)
    expect(names).toHaveLength(70)
    for (const entry of Patterns.catalog) {
      expect(['stateful', 'stateless']).toContain(entry.tier)
      expect(entry.roles.length).toBeGreaterThan(0)
    }
  })

  it('can fail: a contract missing a required slot or capability is refused', () => {
    const Bare = Slots.define({ trigger: Slot.make({ capability: Capability.Interactive }) })
    const codes = A11y.validate(Patterns.Tooltip, Bare).map(d => d.code)
    expect(codes).toContain('a11y:missing-slot')
    expect(codes).toContain('a11y:missing-event')
    const Weak = Slots.define({
      tablist: Slot.make({ capability: Capability.Base }),
      tab: Slot.make({ capability: Capability.Interactive }),
      panel: Slot.make({ capability: Capability.Container }),
    })
    expect(A11y.validate(Patterns.Tabs, Weak).map(d => d.code)).toContain(
      'a11y:capability-mismatch',
    )
  })
})
