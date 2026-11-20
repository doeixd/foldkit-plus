import { describe, expect, it } from 'vitest'
import * as Conformance from 'metakit/conformance'

describe('metakit/conformance (Galois soundness)', () => {
  it('verifies Galois soundness for every Tier 3 Interval transformer using Effect Arbitrary', () => {
    const reports = Conformance.checkAllIntervalTransformers({ samples: 30 })
    expect(reports.length).toBeGreaterThan(10)
    for (const report of reports) {
      expect(report.checked).toBeGreaterThan(0)
      expect(report.failures, `op ${report.op} failed Galois soundness`).toEqual([])
      expect(report.ok).toBe(true)
    }
  })
})
