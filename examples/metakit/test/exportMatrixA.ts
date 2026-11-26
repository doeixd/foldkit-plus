/**
 * Export Matrix A: defines one of every major metakit builder with NO explicit
 * type annotations, to be re-exported from Export Matrix B under `emitDeclarationOnly`.
 */
import { Schema } from 'effect'
import { Eq, Expr, Num, Transition } from 'metakit'
import * as Aggregates from 'metakit/aggregates'
import { CalendarDay, Money, OrderedEnum } from 'metakit/domain'
import * as Language from 'metakit/language'
import * as Machine from 'metakit/machine'
import * as Operation from 'metakit/operation'
import * as Policy from 'metakit/policy'
import * as Relation from 'metakit/relation'

export const Usd = Money.make('USD')
export const Tier = OrderedEnum.make(['a', 'b'] as const)

export const Item = Schema.Struct({
  id: Schema.String,
  amount: Usd,
  tier: Tier.schema,
  day: CalendarDay.schema,
})

export const Principal = Schema.Struct({ admin: Schema.Boolean })

export const exprDef = Expr.in({ row: Item }, ({ row }) => Num.gt(row.amount, 0))
export const transitionDef = Transition.make({
  state: Item,
  input: Schema.Struct({ delta: Usd }),
  when: ({ input }) => Num.gt(input.delta, 0),
  apply: ({ state, input }) => [Transition.add(state.amount, input.delta)],
})
export const machineDef = Machine.make({ state: Item, transitions: { Add: transitionDef } })
export const policyDef = Policy.make({
  row: Item,
  principal: Principal,
  rules: ({ row, principal }) => ({ canEdit: Expr.any(principal.admin, Eq.is(row.tier, 'a')) }),
})
export const relationDef = Relation.make('Item.parent', Item)
export const aggregateDef = Aggregates.sum(Item, $ => $.amount)
export const opDef = Operation.define({
  id: 'matrix.inc',
  version: 1,
  args: [Schema.Int],
  returns: Schema.Int,
  nulls: 'strict',
})
export const langDef = Language.make({ matrix: { inc: opDef } })
