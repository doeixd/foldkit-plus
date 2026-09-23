/**
 * The gate: every adapter's Slots satisfy its pattern, the catalog names
 * each once, and a pattern refuses a contract that lacks what it requires.
 */
import { A11y, Capability, Slot, Slots } from 'foldkit-mixins'
import { describe, expect, it } from 'vitest'
import { Patterns } from '../src/index.js'

describe('Patterns.catalog', () => {
  it.each(Patterns.catalog.map(entry => [entry.name, entry] as const))(
    '%s satisfies its pattern',
    (_name, entry) => {
      expect(A11y.validate(entry.pattern, entry.slots as never)).toEqual([])
    },
  )

  it('names every adapter once, each with a tier and at least one role', () => {
    const names = Patterns.catalog.map(entry => entry.name)
    expect(new Set(names).size).toBe(names.length)
    expect(names).toHaveLength(15)
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
