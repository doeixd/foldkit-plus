import { describe, expect, it } from 'vitest'
import * as Temporal from 'metakit/temporal'

const owed = Temporal.obligation({
  name: 'keeps',
  shows: 'the counter never drops below zero',
  over: ['Add', 'Take'],
})
const scope = { owner: 'counter', where: 'test' }

const broken: Temporal.Discharge<'keeps'> = {
  obligation: 'keeps',
  result: Temporal.WalkResult.Broken({
    seed: 2,
    interleaving: ['Take', 'Add'],
    minimal: ['Take'],
    reason: 'below zero',
  }),
}
const held: Temporal.Discharge<'keeps'> = {
  obligation: 'keeps',
  result: Temporal.WalkResult.Held({ seed: 1, runs: 200 }),
}

const settled = (walks: ReadonlyArray<Temporal.Discharge<'keeps'>>): Temporal.ObligationReport => {
  const registry = Temporal.makeRegistry()
  registry.declare(scope, [owed])
  for (const walk of walks) registry.record(scope, walk)
  return registry.report()
}

describe('evidence for one declaration is aggregated, not taken from the last walk', () => {
  it('keeps a broken walk visible whichever order the walks were recorded', () => {
    for (const walks of [
      [broken, held],
      [held, broken],
    ]) {
      const report = settled(walks)
      expect(report.ok).toBe(false)
      expect(report.open.map(open => open.obligation.name)).toEqual(['keeps'])
      expect(report.open[0]!.why).toContain('broke at seed 2')
      expect(report.discharged).toEqual([])
    }
  })

  it('discharges on a passing sample alone', () => {
    expect(settled([held]).ok).toBe(true)
  })

  it('treats an exploratory answer as closing even when it broke', () => {
    const answered = { ...broken, answer: 'order-matters' as const }
    expect(settled([answered, held]).ok).toBe(true)
  })

  it('clears the failure when the obligation is declared again', () => {
    const registry = Temporal.makeRegistry()
    registry.declare(scope, [owed])
    registry.record(scope, broken)
    registry.declare(scope, [owed])
    registry.record(scope, held)
    expect(registry.report().ok).toBe(true)
  })

  it('undischarged keeps the obligation whichever order, and clears it on a passing sample', () => {
    for (const walks of [
      [broken, held],
      [held, broken],
    ]) {
      expect(Temporal.undischarged([owed], walks)).toEqual([owed])
    }
    expect(Temporal.undischarged([owed], [held])).toEqual([])
  })
})
