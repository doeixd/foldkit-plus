import * as Temporal from 'metakit/temporal'
import { describe, expect, it } from 'vitest'
import { report, results } from './protocols.obligations.js'

describe('the walks that discharge Remote’s obligations', () => {
  it.each(results)('%s holds in every order tried', (_name, result) => {
    // A broken walk prints its seed and the shortest order that breaks the property.
    expect(result).toMatchObject({ _tag: 'Held' })
  })

  it('leaves none of them open', () => {
    expect(report.open.filter(({ owner }) => owner === 'foldkit-remote')).toEqual([])
    expect(
      report.discharged
        .filter(({ owner }) => owner === 'foldkit-remote')
        .map(({ obligation }) => obligation.name)
        .sort(),
    ).toEqual(['late-answers', 'latest-wins', 'optimistic-rollback', 'stale-responses'])
    expect(Temporal.registry.report().ok).toBe(true)
  })
})
