/**
 * Example 2 (module 3 of 3): Re-exported catalog bundle + player research machine.
 *
 * Re-exporting `rules` from another module verifies TS2883 declaration emit (#640)
 * stays green under `tsc -b examples/metakit`.
 */
import { Schema } from 'effect'
import { Arr, Bool, Eq, Expr, Num, Transition } from 'metakit'
import * as Machine from 'metakit/machine'
import { CatalogBase, Era, defineTable } from './catalog.js'
import {
  positiveBuildingTiers,
  researchInKnownEra,
  uniqueResearchIds,
  validPrerequisites,
} from './rules.js'

export const catalogBundle = {
  schema: CatalogBase,
  eraTable: defineTable('eras', Era),
  rules: {
    researchInKnownEra,
    uniqueResearchIds,
    validPrerequisites,
    positiveBuildingTiers,
  },
}

export const ValidatedCatalog = CatalogBase.pipe(
  Expr.refine(
    $ => Arr.every($.research, row => Arr.any($.eras, era => Eq.is(row.era, era.ordinal))),
    { message: 'research era must exist in eras' },
  ),
  Expr.refine(
    $ =>
      Arr.every($.research, row =>
        Eq.is(
          Arr.count($.research, other => Eq.is(other.id, row.id)),
          1,
        ),
      ),
    { message: 'research ids must be unique' },
  ),
)

export const PlayerProgress = Schema.Struct({
  currentEra: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  science: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  unlocked: Schema.Array(Schema.String),
})

export const UnlockTech = Transition.make({
  state: PlayerProgress,
  input: Schema.Struct({
    techId: Schema.String,
    requiredEra: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
    cost: Schema.Int.check(Schema.isGreaterThan(0)),
  }),
  when: ({ state, input }) =>
    Expr.all(
      Num.gte(state.currentEra, input.requiredEra),
      Num.gte(state.science, input.cost),
      Bool.not(Arr.has(state.unlocked, input.techId)),
    ),
  apply: ({ state, input }) => [
    Transition.set(state.science, Num.sub(state.science, input.cost)),
    Transition.include(state.unlocked, input.techId),
  ],
})

export const AdvanceEra = Transition.make({
  state: PlayerProgress,
  input: Schema.Struct({}),
  when: ({ state }) => Num.gte(Arr.count(state.unlocked), state.currentEra),
  apply: ({ state }) => [Transition.add(state.currentEra, 1)],
})

export const ProgressMachine = Machine.make({
  state: PlayerProgress,
  transitions: { UnlockTech, AdvanceEra },
})
