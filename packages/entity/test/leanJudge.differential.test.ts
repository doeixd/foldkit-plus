/**
 * Every judgement entity's tests make in memory, answered twice: by
 * metakit's lean judge (`settleNode`, what `judgeRun.ts` runs on a page) and
 * by the expression partial evaluation leaves (`residualizeNode`, through
 * `residualSettled` of `metakit/conformance`). The two must agree on
 * every call: value, verdict, reason and reads.
 *
 * `settleNode` is wrapped for this file only, and the files below are
 * imported so their cases run here through the wrapper: every conformance
 * case, flat and relational, over all a reader may see and over less
 * (`lower.test.ts`), the kinds and refusals (`lowerKinds.test.ts`), and every
 * test that judges rows some of whose values the holder lacks.
 */
import { describe, expect, it, vi } from 'vitest'

const record = vi.hoisted(() => ({ calls: 0, mismatches: [] as Array<string> }))

vi.mock('metakit/build', async original => {
  const real = await original<typeof import('metakit/build')>()
  const { residualSettled } = await import('metakit/conformance')
  return {
    ...real,
    settleNode: (...args: Parameters<typeof real.settleNode>) => {
      const lean = real.settleNode(...args)
      record.calls += 1
      try {
        expect(lean).toEqual(residualSettled(...args))
      } catch (error) {
        record.mismatches.push(String(error))
      }
      return lean
    },
  }
})

await import('./lower.test.js')
await import('./lowerKinds.test.js')
await import('./judge.test.js')
await import('./judgeStep5.test.js')
await import('./judgeOver.test.js')
await import('./viewerPath.test.js')
await import('./sets.test.js')
await import('./link.test.js')
await import('./pins.test.js')
await import('./protoKey.test.js')
await import('./variants.test.js')
await import('./versions.test.js')
await import('./unportable.test.js')
await import('./arithmetic.test.js')
await import('./invariant.test.js')
await import('./compute.test.js')

describe('the lean judge and partial evaluation', () => {
  it('agreed on every judgement above', () => {
    expect(record.calls).toBeGreaterThan(1000)
    expect(record.mismatches.slice(0, 3)).toEqual([])
  })
})
