import { describe, expect, it } from 'vitest'
import { report, result } from './convergence.obligations.js'
import { tieBreak, titled } from './convergence.walks.js'

describe('the last-writer-wins register as the tie-break of two sets of one field', () => {
  it('has both replicas hold the greater replica id’s write, whichever the server commits first', () => {
    // A broken walk prints its seed and the shortest order that breaks it.
    expect(result).toMatchObject({ _tag: 'Held' })
  })

  it('leaves its obligation discharged and none of the package’s open', () => {
    expect(report.open.filter(({ owner }) => owner === 'foldkit-sync')).toEqual([])
    expect(
      report.discharged
        .filter(({ owner }) => owner === 'foldkit-sync')
        .map(({ obligation }) => obligation.name),
    ).toContain('lww-tie-break')
  })

  it('also holds where the later logical time is the other replica’s', async () => {
    expect(await tieBreak([titled(2, 'A', 'from A'), titled(1, 'B', 'from B')])).toMatchObject({
      _tag: 'Held',
    })
  })
})
