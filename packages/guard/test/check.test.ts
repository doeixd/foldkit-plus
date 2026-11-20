import { Effect, Option, Schema } from 'effect'
import { Entity, Expr, Laws, Write } from 'foldkit-entity'
import { Verdict } from 'metakit'
import * as Prove from 'metakit/prove'
import { expect, it } from 'vitest'
import { Guards } from '../src/index.js'

const Fields = Entity.define('Ledger', Schema.Struct({ id: Schema.String, limit: Schema.Int }))
const G = Guards.declare(
  'LedgerRules',
  Schema.Struct({ id: Schema.String }),
  guard => ({
    manager: guard.principal(),
    positive: guard.row(Fields, () => Expr.gt(Fields.fields.limit, 0)),
    negative: guard.row(Fields, () => Expr.lt(Fields.fields.limit, 0)),
    nonnegative: guard.row(Fields, () => Expr.gte(Fields.fields.limit, 0)),
  }),
  { key: user => user.id, unguarded: 'allow' },
)
const Ledger = Fields.pipe(
  Entity.invariant('floor', ({ after }) => Expr.gte(after.limit, 0), {
    message: 'Limit must be nonnegative',
  }),
)

it('uses state invariants for implication and detects unreachable updates separately', () => {
  const safe = Ledger.pipe(Guards.attach(G, { members: { limit: { Read: [G.nonnegative] } } }))
  expect(Verdict.isTrue(Guards.check(safe, 'limit').implication)).toBe(true)
  const dead = Ledger.pipe(Guards.attach(G, { row: { Update: [G.negative] } }))
  expect(Verdict.isFalse(Guards.check(dead, 'limit').consistent)).toBe(true)
  expect(() => Guards.check(Fields, 'limit')).toThrow('carries guards on another descriptor')
})

it('finds the allowed update whose member is hidden, with a valid boundary witness', async () => {
  const leaky = Ledger.pipe(Guards.attach(G, { members: { limit: { Read: [G.positive] } } }))
  const { definition } = Guards.check(leaky, 'limit')
  const verdict = await Effect.runPromise(Prove.policyImplies(definition, 'Update', 'Read'))
  expect(Verdict.isFalse(verdict) && Option.getOrUndefined(verdict.witness)?.['row.limit']).toBe(0)
})

it('keeps a server-only principal decision independent for each interaction', async () => {
  const guarded = Ledger.pipe(Guards.attach(G, { always: [G.manager] }))
  const { definition, implication } = Guards.check(guarded, 'limit')
  expect(Verdict.isUnknown(implication)).toBe(true)
  expect(
    Verdict.isUnknown(await Effect.runPromise(Prove.policyImplies(definition, 'Update', 'Read'))),
  ).toBe(true)
})

it('checks a data invariant even when no principal may create the row', () => {
  const toggle = Entity.define(
    'Toggle',
    Schema.Struct({ id: Schema.String, on: Schema.Boolean }),
  ).pipe(
    Entity.invariant('on', ({ after }) => Expr.eq(after.on, true), { message: 'Must be on' }),
    Guards.attach(G, { row: { Create: [] } }),
  )
  const write = Write.insert(Entity.input(toggle, toggle.schema), { id: 'id' })
  const report = Laws.check({ writes: [{ name: 'Create', write }] })
  expect(report.pairs.find(pair => pair.invariant === 'on')?.verdict._tag).toBe('Refused')
})
