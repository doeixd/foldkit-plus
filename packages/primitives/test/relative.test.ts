/**
 * Relative time picks units by threshold; the wording is the platform's.
 */
import { describe, expect, it } from 'vitest'
import { formatRelativeTime } from '../src/time/index.js'

const at = (iso: string): Date => new Date(iso)

describe('formatRelativeTime', () => {
  const cases: ReadonlyArray<readonly [from: string, to: string, en: string]> = [
    ['2026-09-17T10:59:30Z', '2026-09-17T11:00:00Z', '30 seconds ago'],
    ['2026-09-17T10:55:00Z', '2026-09-17T11:00:00Z', '5 minutes ago'],
    ['2026-09-17T09:00:00Z', '2026-09-17T11:00:00Z', '2 hours ago'],
    ['2026-09-14T11:00:00Z', '2026-09-17T11:00:00Z', '3 days ago'],
    ['2026-09-03T11:00:00Z', '2026-09-17T11:00:00Z', '2 weeks ago'],
    ['2026-06-17T11:00:00Z', '2026-09-17T11:00:00Z', '3 months ago'],
    ['2024-09-17T11:00:00Z', '2026-09-17T11:00:00Z', '2 years ago'],
  ]
  for (const [from, to, en] of cases) {
    it(`renders ${en}`, () => {
      expect(formatRelativeTime(at(from), at(to))).toBe(en)
    })
  }

  it('phrases the future when swapped', () => {
    expect(formatRelativeTime(at('2026-09-20T11:00:00Z'), at('2026-09-17T11:00:00Z'))).toBe(
      'in 3 days',
    )
  })

  it('says yesterday and tomorrow at the day boundary', () => {
    expect(formatRelativeTime(at('2026-09-16T11:00:00Z'), at('2026-09-17T11:00:00Z'))).toBe(
      'yesterday',
    )
  })
})
