/**
 * The suite as Vitest tests, for a test file to run with the drawers its
 * environment has: each case's disagreements must be exactly those
 * `known.ts` records for the drawers given.
 */
import { describe, expect, it } from 'vitest'
import { cases } from './cases.js'
import { conform, type Disagreement, type LiveDrawer, type StaticDrawer } from './harness.js'
import { known } from './known.js'

const detail = (found: ReadonlyArray<Disagreement>): string =>
  found
    .map(
      ({ drawer, step, aspect, reference, drawn }) =>
        `${drawer}, step ${step}, ${aspect}:\n--- reference\n${reference}\n--- ${drawer}\n${drawn}`,
    )
    .join('\n\n')

export const conformanceSuite = (drawers: {
  readonly reference: LiveDrawer
  readonly live: ReadonlyArray<LiveDrawer>
  readonly static: ReadonlyArray<StaticDrawer>
}): void => {
  const named = new Set([...drawers.live, ...drawers.static].map(drawer => drawer.name))
  describe('the drawers of a Foldkit view', () => {
    for (const subject of cases) {
      it(subject.name, async () => {
        const found = await subject.run(each => conform(each, drawers))
        expect(
          found.map(({ drawer, step, aspect }) => ({ drawer, step, aspect })),
          detail(found),
        ).toEqual((known[subject.name]?.found ?? []).filter(entry => named.has(entry.drawer)))
      })
    }
  })
}
