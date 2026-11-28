import { Option, Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Expr, Transition, Verdict } from 'metakit'
import * as Inspect from 'metakit/inspect'
import * as Machine from 'metakit/machine'
import {
  AdvanceEra,
  ProgressMachine,
  UnlockTech,
  ValidatedCatalog,
  catalogBundle,
} from '../src/techtree/index.js'

const sampleCatalog = {
  eras: [
    { ordinal: 1, name: 'Bronze' },
    { ordinal: 2, name: 'Iron' },
  ],
  research: [
    { id: 'mining', era: 1, prereqId: null, cost: 50 },
    { id: 'smelting', era: 2, prereqId: 'mining', cost: 120 },
  ],
  buildings: [
    {
      id: 'foundry',
      tiers: [
        { level: 1, cost: 100 },
        { level: 2, cost: 250 },
      ],
    },
  ],
}

describe('Example 2: Tech Tree & Build-Order Catalog', () => {
  it('enforces nested-fold catalog invariants and computes precise read footprints', () => {
    expect(Schema.decodeUnknownSync(ValidatedCatalog)(sampleCatalog)).toEqual(sampleCatalog)
    expect(Expr.holds(catalogBundle.rules.researchInKnownEra, { catalog: sampleCatalog })).toBe(
      true,
    )
    expect(Expr.holds(catalogBundle.rules.uniqueResearchIds, { catalog: sampleCatalog })).toBe(true)
    expect(Expr.holds(catalogBundle.rules.validPrerequisites, { catalog: sampleCatalog })).toBe(
      true,
    )
    expect(Expr.holds(catalogBundle.rules.positiveBuildingTiers, { catalog: sampleCatalog })).toBe(
      true,
    )

    // Broken cross-list era reference
    expect(() =>
      Schema.decodeUnknownSync(ValidatedCatalog)({
        ...sampleCatalog,
        research: [{ id: 'laser', era: 9, prereqId: null, cost: 500 }],
      }),
    ).toThrow()

    // Self-referential prerequisite rejected
    expect(
      Expr.holds(catalogBundle.rules.validPrerequisites, {
        catalog: {
          ...sampleCatalog,
          research: [{ id: 'loop', era: 1, prereqId: 'loop', cost: 10 }],
        },
      }),
    ).toBe(false)

    expect(Expr.reads(catalogBundle.rules.researchInKnownEra)).toEqual(
      Option.some([
        ['catalog', 'research', '*', 'era'],
        ['catalog', 'eras', '*', 'ordinal'],
      ]),
    )
    expect(Expr.reads(catalogBundle.rules.positiveBuildingTiers)).toEqual(
      Option.some([['catalog', 'buildings', '*', 'tiers', '*', 'cost']]),
    )
  })

  it('supports partial evaluation, generic SchemaOf tables, and Inspect annotations', () => {
    expect(
      Verdict.isUnknown(
        Expr.judge(catalogBundle.rules.researchInKnownEra, {
          catalog: { research: sampleCatalog.research },
        }),
      ),
    ).toBe(true)
    expect(
      Verdict.isTrue(
        Expr.judge(catalogBundle.rules.researchInKnownEra, { catalog: sampleCatalog }),
      ),
    ).toBe(true)

    const parsedEras = catalogBundle.eraTable.decode({
      table: 'eras',
      rows: sampleCatalog.eras,
    })
    expect(parsedEras.rows).toHaveLength(2)

    const json = Inspect.toJsonSchema(catalogBundle.schema)
    expect(json['title']).toBe('Game Catalog')
    expect(json['description']).toBe('Validated progression ruleset')
    const props = json['properties'] as Record<string, Record<string, unknown>>
    expect(props['eras']?.['title']).toBe('Eras')
    expect(props['research']?.['description']).toBe('Unlockable technologies')
  })

  it('computes player progression affordances and transitions', () => {
    const start = { currentEra: 1, science: 80, unlocked: [] as ReadonlyArray<string> }
    const aff1 = Machine.affordances(ProgressMachine, start)
    expect(aff1.disabled).toContain('AdvanceEra')
    expect(aff1.pending).toContain('UnlockTech')

    const unlocked = Result.getOrThrow(
      Transition.step(UnlockTech, start, { techId: 'mining', requiredEra: 1, cost: 50 }),
    )
    expect(unlocked.state).toEqual({ currentEra: 1, science: 30, unlocked: ['mining'] })

    const aff2 = Machine.affordances(ProgressMachine, unlocked.state)
    expect(aff2.available).toContain('AdvanceEra')
    const nextEra = Result.getOrThrow(Transition.step(AdvanceEra, unlocked.state, {}))
    expect(nextEra.state.currentEra).toBe(2)
  })
})
