/**
 * Export Matrix A: defines one of every major metakit builder with NO explicit
 * type annotations, to be re-exported from Export Matrix B under `emitDeclarationOnly`.
 */
import { Schema } from 'effect'
import { Eq, Expr, Num, Sets, Transition } from 'metakit'
import * as Aggregates from 'metakit/aggregates'
import { CalendarDay, Id, Money, OrderedEnum, Ordinal } from 'metakit/domain'
import * as Fn from 'metakit/fn'
import * as Inspect from 'metakit/inspect'
import * as Language from 'metakit/language'
import * as Machine from 'metakit/machine'
import * as Operation from 'metakit/operation'
import * as Policy from 'metakit/policy'
import * as Relation from 'metakit/relation'

export const Usd = Money.make('USD')
export const ItemId = Id.make('Item', { prefix: 'itm_' })
export const Tier = OrderedEnum.make(['a', 'b'] as const)

export const Item = Schema.Struct({
  id: ItemId,
  amount: Usd,
  tier: Tier.schema,
  day: CalendarDay.schema,
  position: Ordinal.schema,
  tags: Schema.Array(Schema.Literals(['x', 'y'])),
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
export const relationDef = Relation.define({
  name: 'Item.parent',
  parent: Item,
  child: Item,
  foreignKey: 'id',
  cardinality: 'many',
})
export const setExprDef = Expr.in({ row: Item }, ({ row }) => Sets.subset(row.tags, ['x', 'y']))
export const fnDef = Fn.make({ amount: Usd }, ({ amount }) => Num.add(amount, 1))
  .where(({ amount }) => Num.gte(amount, 0))
  .ensures(({ params, result }) => Num.gt(result, params.amount))
export const fnSpecDef = Fn.params({ amount: Usd }).returns(Usd)
export const fnInfoDef = Inspect.fn(fnDef)
export const aggregateDef = Aggregates.sum(Item, $ => $.amount)
export const opDef = Operation.define({
  id: 'matrix.inc',
  version: 1,
  args: [Schema.Int],
  returns: Schema.Int,
  nulls: 'strict',
})
export const langDef = Language.make({ matrix: { inc: opDef } })
