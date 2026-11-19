/**
 * What `Laws.check`'s report gained for #600, at the type level: a refusal's
 * witness and hint, an undecided pair's obligation, the two new ways a pair
 * is kept, the totals, and an unmeetable write. Each negative case holds one
 * defect.
 */
import { Option } from 'effect'
import { expectTypeOf } from 'vitest'
import {
  Finding,
  LawVerdict,
  type LawReport,
  type LawTotals,
  type Obligation,
  type Witness,
} from '../src/index.js'

declare const report: LawReport
expectTypeOf(report.totals).toEqualTypeOf<LawTotals>()
expectTypeOf(report.totals.undecided).toEqualTypeOf<number>()

declare const verdict: LawVerdict
if (verdict._tag === 'Refused') {
  expectTypeOf(verdict.witness).toEqualTypeOf<Witness>()
  expectTypeOf(verdict.witness.before).toEqualTypeOf<
    Option.Option<Readonly<Record<string, unknown>>>
  >()
  expectTypeOf(verdict.hint).toEqualTypeOf<Option.Option<string>>()
}
if (verdict._tag === 'Undecided')
  expectTypeOf(verdict.obligation).toEqualTypeOf<Option.Option<Obligation>>()
if (verdict._tag === 'Kept') expectTypeOf(verdict.over).toEqualTypeOf<ReadonlyArray<string>>()

LawVerdict.Kept({ by: 'bounds', rows: 0, over: [] })
LawVerdict.Kept({ by: 'vacuous', rows: 1, over: ['balance'] })
// @ts-expect-error a kept pair names how it was kept, and an interval is `bounds`
LawVerdict.Kept({ by: 'intervals', rows: 0, over: [] })
// @ts-expect-error a refusal carries its witness
LawVerdict.Refused({ steps: [], hint: Option.none() })
// @ts-expect-error an undecided pair carries an obligation, none for a footprint
LawVerdict.Undecided({ reason: 'unknown' })

declare const obligation: Obligation
expectTypeOf(obligation.cases).toEqualTypeOf<
  ReadonlyArray<{
    readonly before: Readonly<Record<string, unknown>>
    readonly input: Readonly<Record<string, unknown>>
    readonly after: Readonly<Record<string, unknown>>
  }>
>()

Finding.Unmeetable({ entity: 'Account', write: 'Overdraw' })
// @ts-expect-error an unmeetable write names its Entity
Finding.Unmeetable({ write: 'Overdraw' })
