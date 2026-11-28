import * as Temporal from 'metakit/temporal'
import { describe, expect, it } from 'vitest'
import { report, results } from './protocols.obligations.js'

describe('the walks that discharge Sync’s obligations', () => {
  it.each(results)('%s holds in every order tried', (_name, result) => {
    // A broken walk prints its seed and the shortest order that breaks the property.
    expect(result).toMatchObject({ _tag: 'Held' })
  })

  it('leaves none of them open', () => {
    expect(report.open.filter(({ owner }) => owner === 'foldkit-sync')).toEqual([])
    expect(
      report.discharged
        .filter(({ owner }) => owner === 'foldkit-sync')
        .map(({ obligation }) => obligation.name)
        .sort(),
    ).toEqual(['reconnect', 'server-reset', 'tab-writers-cas', 'two-tabs-settle'])
    expect(Temporal.registry.report().ok).toBe(true)
  })
})
