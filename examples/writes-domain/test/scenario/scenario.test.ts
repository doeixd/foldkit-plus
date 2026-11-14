// @vitest-environment node
/**
 * One scenario per decision, run from the same values on all three backends:
 * SQLite's guarded writer, the memory writer behind the same guard, and the
 * Domain model the write was lowered into. None may differ in what it decides,
 * the row it leaves, or what it alone owns (the ledger, the events).
 */
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  describeMismatch,
  domainRunner,
  memoryRunner,
  run,
  Scenario,
  sqliteRunner,
} from '../../src/scenario/index.js'
import { accepted, scenarios, visitor } from '../../src/scenario/scenarios.js'

const runners = [sqliteRunner, memoryRunner, domainRunner]

describe('one scenario through three backends', () => {
  it.each(scenarios.map(scenario => [scenario.name, scenario] as const))(
    '%s',
    async (_, scenario) => {
      const report = await Effect.runPromise(run(scenario, runners))
      expect(report.mismatches.map(describeMismatch)).toEqual([])
      // Each backend answered: a runner that says nothing agrees with everything.
      expect(new Set(report.steps.map(step => step.backend))).toEqual(
        new Set(['sqlite', 'memory', 'domain']),
      )
    },
  )

  it('checks what each backend owns: the ledger, the events', async () => {
    const { steps } = await Effect.runPromise(run(accepted, runners))
    expect(steps.map(({ backend, step }) => `${backend}/${step}`)).toEqual([
      'sqlite/decision',
      'sqlite/row',
      'sqlite/ledger',
      'memory/decision',
      'memory/row',
      'domain/decision',
      'domain/row',
      'domain/commits',
      'domain/story',
    ])
  })
})

describe('the mismatch report', () => {
  it('names the backend and the step where a scenario’s expectation is wrong', async () => {
    const wrong = Scenario.write({
      ...accepted,
      name: 'a wrong expectation',
      expect: Scenario.accepted({ reserved: 6, revision: 2 }),
    })
    const { mismatches } = await Effect.runPromise(run(wrong, runners))
    // Every backend lands the same row, so each says the scenario is wrong at its own `row`.
    expect(mismatches.map(({ backend, step }) => `${backend}/${step}`)).toEqual([
      'sqlite/row',
      'memory/row',
      'domain/row',
      'domain/story',
    ])
    expect(mismatches[0]).toEqual({
      backend: 'sqlite',
      step: 'row',
      expected: { reserved: 6, revision: 2 },
      actual: { reserved: 5, revision: 2 },
    })
  })

  it('names the decision step where a refusal is expected of an accepted write', async () => {
    const wrong = Scenario.write({ ...accepted, expect: Scenario.refused('Unmet') })
    const { mismatches } = await Effect.runPromise(run(wrong, runners))
    expect(
      mismatches.filter(({ step }) => step === 'decision').map(({ backend }) => backend),
    ).toEqual(['sqlite', 'memory', 'domain'])
  })
})

describe('a visitor', () => {
  // The backends differ here, and the report says where: Domain's Rejection is
  // `Forbidden` (the lowering answers a visitor as the guard does), while the
  // servers answer the wire's `Unauthenticated` before any guard runs.
  it('is Forbidden to Domain and Unauthenticated to the two servers', async () => {
    const { mismatches } = await Effect.runPromise(run(visitor, runners))
    expect(mismatches.map(describeMismatch)).toEqual([
      'sqlite / decision: expected {"_tag":"Forbidden"}, got {"_tag":"Refused","refusal":"Failed Unauthenticated"}',
      'memory / decision: expected {"_tag":"Forbidden"}, got {"_tag":"Refused","refusal":"Failed Unauthenticated"}',
    ])
  })
})
