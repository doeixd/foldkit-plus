import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import { runDemo } from '../src/demo.js'

describe('examples/metakit', () => {
  it('runs the full end-to-end MetaKit walkthrough (runtime, graph, PGlite+Drizzle, inspect, Zone/Z3 proofs)', async () => {
    const out = await runDemo()

    // 1. Runtime machine & incremental aggregate
    expect(out.afterWithdraw.balance).toBe(35_000)
    expect(Option.isSome(out.emitted)).toBe(true)
    expect(out.openAffordances.available).toEqual(['Freeze'])
    expect(out.openAffordances.pending).toEqual(['Withdraw'])
    expect(out.frozenAffordances.disabled).toEqual(['Withdraw', 'Freeze'])
    expect(out.totalBalance).toBe(35_000)

    // 2. Graph analysis, SSR pruning, and query readiness
    expect(out.graph.affectedBy.Freeze).toEqual(['statusLabel'])
    expect(out.graph.affectedBy.Withdraw).toEqual(['available', 'promoBonus'])
    expect(out.graph.deadBindings).toEqual(['accountId'])
    expect(out.pruned.staticValues).toEqual({ promoBonus: 0 })
    expect(out.notReady.ready).toBe(false)
    expect(out.ready.ready).toBe(true)

    // 3. PGlite + Drizzle SQL
    expect(out.matchingRows.map(r => r.id)).toEqual(['acct_1'])
    const acct1 = out.updatedRows.find(r => r.id === 'acct_1')
    expect(acct1?.balance).toBe(35_000)

    // 4. Inspect
    const balanceSpec = out.fieldSpecs.find(f => f.name === 'balance')
    expect(balanceSpec !== undefined && Option.isSome(balanceSpec.min)).toBe(true)
    expect(out.jsonSchema.type).toBe('object')

    // 5. Proofs
    expect(out.validProof.ok).toBe(true)
    expect(out.validProof.format()).toContain('PROVED (zone) Withdraw [pinned]')
    expect(out.buggyProof.ok).toBe(false)
    expect(out.buggyProof.format()).toContain('REFUTED Withdraw')
    expect(out.buggyProof.format()).toContain('repro:')
  }, 30_000)
})
