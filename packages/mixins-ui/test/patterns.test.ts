/**
 * The gate: every adapter's Slots satisfy its pattern, every obligation the
 * pattern declares has a supplier in the catalog entry and each supplier is
 * needed, the catalog names each widget once, and a pattern refuses a contract
 * that lacks what it requires.
 */
import { A11y, Capability, MetadataToken, Slot, Slots, SlotView } from 'foldkit-mixins'
import { describe, expect, it } from 'vitest'
import { Patterns } from '../src/index.js'

type Entry = (typeof Patterns.catalog)[number]

/** The `slot/obligation` pairs a pattern declares on slots its contract publishes. */
const declared = (entry: Entry): ReadonlyArray<string> =>
  Object.entries(entry.pattern.requirements).flatMap(([slot, requirement]) =>
    Object.hasOwn(entry.slots, slot)
      ? (requirement.obligations ?? []).map(obligation => `${slot}/${obligation.name}`)
      : [],
  )

/** The `slot/obligation` pairs one supplier says it meets. */
const suppliedBy = (supply: Entry['support'][number]): ReadonlyArray<string> =>
  Object.entries(supply.meta?.slots ?? {}).flatMap(([slot, meta]) =>
    meta.provides.map(obligation => `${slot}/${obligation}`),
  )

/** What `A11y.check` reports of the entry's contract once `support` is attached to a view over it. */
const reported = (entry: Entry, support: Entry['support']): ReadonlyArray<string> => {
  const bare = SlotView.define(
    entry.slots as Readonly<Record<string, Slot.Any>>,
    (_input: unknown, _slots, h) => h.div([], []),
  )
  const view = support.reduce<typeof bare>(
    (built, supply) => built.pipe(SlotView.attach(supply)),
    bare,
  )
  return A11y.check(entry.pattern, view).map(
    item => `${item.slot}/${String(item.details?.['obligation'] ?? item.code)}`,
  )
}

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
  'disclosure',
  'segmented',
  'rating',
  'calendar',
  'tour',
  'listbox',
  'picker',
]

const entries = Patterns.catalog.map(entry => [entry.name, entry] as const)

describe('Patterns.catalog', () => {
  it.each(entries)(
    '%s satisfies its pattern, and every obligation has a supplier',
    (_name, entry) => {
      expect(A11y.validate(entry.pattern, entry.slots as never)).toEqual([])
      expect(reported(entry, entry.support)).toEqual([])
    },
  )

  it.each(entries)('%s: each supplier is needed, so dropping one is reported', (_name, entry) => {
    expect([...reported(entry, [])].sort()).toEqual([...declared(entry)].sort())
    for (const dropped of entry.support) {
      const left = entry.support.filter(item => item !== dropped)
      expect(suppliedBy(dropped)).not.toEqual([])
      expect([...reported(entry, left)].sort()).toEqual([...suppliedBy(dropped)].sort())
    }
  })

  it.each(obliged)('%s declares obligations', name => {
    const entry = Patterns.catalog.find(item => item.name === name)
    if (entry === undefined) throw new Error(`no ${name} pattern`)
    expect(declared(entry).length).toBeGreaterThan(0)
  })

  it('names every adapter once, each with a tier and at least one role', () => {
    const names = Patterns.catalog.map(entry => entry.name)
    expect(new Set(names).size).toBe(names.length)
    expect(names).toHaveLength(72)
    for (const entry of Patterns.catalog) {
      expect(['stateful', 'stateless']).toContain(entry.tier)
      expect(entry.roles.length).toBeGreaterThan(0)
    }
  })

  /** The attributes a slot must publish for the pattern to hold, one pair per requirement the slots now declare. */
  it.each([
    ['checkbox', 'checkbox', 'aria-checked'],
    ['checkbox', 'checkbox', 'aria-labelledby'],
    ['switch', 'button', 'aria-checked'],
    ['switch', 'button', 'aria-labelledby'],
    ['checkbox-group', 'checkbox', 'aria-checked'],
    ['radioGroup', 'option', 'aria-checked'],
    ['accordion', 'trigger', 'aria-controls'],
    ['accordion', 'panel', 'aria-labelledby'],
    ['resizable', 'handle', 'aria-valuenow'],
    ['pagination', 'root', 'aria-label'],
    ['pagination', 'root', 'role'],
    ['pagination', 'page', 'aria-current'],
    ['breadcrumb', 'root', 'aria-label'],
    ['breadcrumb', 'root', 'role'],
    ['breadcrumb', 'current', 'aria-current'],
    ['button-group', 'root', 'aria-label'],
    ['button-group', 'root', 'role'],
    ['segmented', 'group', 'aria-disabled'],
    ['segmented', 'option', 'aria-checked'],
    ['segmented', 'option', 'aria-pressed'],
    ['slider', 'thumb', 'aria-describedby'],
  ] as const)('%s requires %s to publish %s', (name, slot, attribute) => {
    const entry = Patterns.catalog.find(item => item.name === name)
    if (entry === undefined) throw new Error(`no ${name} pattern`)
    const original = entry.slots[slot as keyof typeof entry.slots] as Slot.Any
    const without = Slot.make({
      capability: original.capability,
      events: original.events,
      attributes: original.attributes.filter(item =>
        typeof item === 'string' ? item !== attribute : item.name !== attribute,
      ),
    })
    expect(original.attributes).toHaveLength(without.attributes.length + 1)
    const findings = A11y.validate(entry.pattern, { ...entry.slots, [slot]: without } as never)
    expect(findings.map(item => [item.code, item.slot])).toEqual([['a11y:missing-attribute', slot]])
  })

  /** The events a slot must publish: the keys a widget answers are drawn on these slots. */
  it.each([
    ['segmented', 'group', 'keydown'],
    ['rating', 'star', 'keydown'],
    ['slider', 'thumb', 'change'],
    ['nav', 'link', 'keydown'],
    ['nav', 'panelLink', 'keydown'],
    ['tabs', 'tab', 'keydown'],
    ['floating-panel', 'handle', 'keydown'],
  ] as const)('%s requires %s to publish %s', (name, slot, event) => {
    const entry = Patterns.catalog.find(item => item.name === name)
    if (entry === undefined) throw new Error(`no ${name} pattern`)
    const original = entry.slots[slot as keyof typeof entry.slots] as Slot.Any
    const without = Slot.make({
      capability: original.capability,
      events: original.events.filter(item => MetadataToken.nameOf(item) !== event),
      attributes: original.attributes,
    })
    expect(original.events.map(item => MetadataToken.nameOf(item))).toContain(event)
    const findings = A11y.validate(entry.pattern, { ...entry.slots, [slot]: without } as never)
    expect(findings.map(item => [item.code, item.slot])).toEqual([['a11y:missing-event', slot]])
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
