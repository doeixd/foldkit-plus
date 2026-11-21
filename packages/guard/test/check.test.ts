import { Effect, Option, Schema } from 'effect'
import { Entity, Expr, Laws, Relation, Write } from 'foldkit-entity'
import { Verdict } from 'metakit'
import * as Prove from 'metakit/prove'
import { expect, it } from 'vitest'
import { GuardCheck } from '../src/check.js'
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
  expect(Verdict.isTrue(GuardCheck.policy(safe, 'limit').implication)).toBe(true)
  const dead = Ledger.pipe(Guards.attach(G, { row: { Update: [G.negative] } }))
  expect(Verdict.isFalse(GuardCheck.policy(dead, 'limit').consistent)).toBe(true)
  expect(() => GuardCheck.policy(Fields, 'limit')).toThrow('carries guards on another descriptor')
})

it('finds the allowed update whose member is hidden, with a valid boundary witness', async () => {
  const leaky = Ledger.pipe(Guards.attach(G, { members: { limit: { Read: [G.positive] } } }))
  const { definition } = GuardCheck.policy(leaky, 'limit')
  const verdict = await Effect.runPromise(Prove.policyImplies(definition, 'Update', 'Read'))
  expect(Verdict.isFalse(verdict) && Option.getOrUndefined(verdict.witness)?.['row.limit']).toBe(0)
})

it('keeps a server-only principal decision independent for each interaction', async () => {
  const guarded = Ledger.pipe(Guards.attach(G, { always: [G.manager] }))
  const { definition, implication } = GuardCheck.policy(guarded, 'limit')
  expect(Verdict.isUnknown(implication)).toBe(true)
  expect(
    Verdict.isUnknown(await Effect.runPromise(Prove.policyImplies(definition, 'Update', 'Read'))),
  ).toBe(true)
})

const Base = {
  Team: Entity.define('Team', Schema.Struct({ id: Schema.String, orgId: Schema.String })),
  Doc: Entity.define(
    'Doc',
    Schema.Struct({
      id: Schema.String,
      rank: Schema.Int,
      // Holds NaN, and may be absent: no comparison holds of either.
      score: Schema.Number,
      note: Schema.optionalKey(Schema.Int),
    }),
  ),
}
const Related = Entity.relate(Base, { Doc: { team: Relation.one(Base.Team) } })
const Doc = Related.Doc
const rank = Doc.fields.rank
const D = Guards.declare(
  'DocRules',
  Schema.Struct({ id: Schema.String }),
  guard => ({
    positive: guard.row(Doc, () => Expr.gt(rank, 0)),
    negative: guard.row(Doc, () => Expr.lt(rank, 0)),
    nonnegative: guard.row(Doc, () => Expr.gte(rank, 0)),
    band: guard.row(Doc, () => Expr.and(Expr.gte(rank, 0), Expr.lte(rank, 10))),
    outside: guard.row(Doc, () => Expr.or(Expr.gte(rank, 0), Expr.lt(rank, -5))),
    scoreUp: guard.row(Doc, () => Expr.gte(Doc.fields.score, 0)),
    scoreDown: guard.row(Doc, () => Expr.lt(Doc.fields.score, 0)),
    noteUp: guard.row(Doc, () => Expr.gte(Doc.fields.note, 0)),
    noteDown: guard.row(Doc, () => Expr.lt(Doc.fields.note, 0)),
    inAcme: guard.row(Doc, () =>
      Expr.eq(Expr.path(Doc.relations.team, Related.Team.fields.orgId), 'acme'),
    ),
  }),
  { key: user => user.id, unguarded: 'allow' },
)
const proves = (entity: typeof Doc, member: 'rank' | 'score' | 'note' | 'team') =>
  Verdict.isTrue(GuardCheck.policy(entity, member).implication)

// Read of `rank`, by who may update the row. Zero is updated and fails `positive`; eleven fails `band`.
it.each([
  ['any rule of a surface', D.positive, [D.negative, D.positive], true],
  ['each rule of an all', D.nonnegative, [Guards.all(D.nonnegative, D.positive)], false],
  ['either side of an or', D.nonnegative, [D.outside], true],
  ['both sides of an and', D.nonnegative, [D.band], false],
] as const)('a Read asks %s', (_, update, read, proved) => {
  const entity = Doc.pipe(
    Guards.attach(D, { row: { Update: [update] }, members: { rank: { Read: read } } }),
  )
  expect(proves(entity, 'rank')).toBe(proved)
})

it('reads a relation by its own Read rule, not as a member without one', () => {
  const hidden = Doc.pipe(
    Guards.attach(D, {
      row: { Update: [D.positive] },
      relations: { team: { Read: [D.negative] } },
    }),
  )
  expect(proves(hidden, 'team')).toBe(false)
})

// Every row may be updated; the member is read where it is at least zero or below it,
// which a row holding NaN, or none, is not.
it.each([
  ['NaN', 'score', { score: { Read: [D.scoreUp, D.scoreDown] } }],
  ['an absent key', 'note', { note: { Read: [D.noteUp, D.noteDown] } }],
] as const)('proves nothing from a comparison over %s', async (_, member, members) => {
  const { definition, implication } = GuardCheck.policy(
    Doc.pipe(Guards.attach(D, { members })),
    member,
  )
  expect(Verdict.isUnknown(implication)).toBe(true)
  expect(
    Verdict.isUnknown(await Effect.runPromise(Prove.policyImplies(definition, 'Update', 'Read'))),
  ).toBe(true)
})

it('still proves over the other fields beside an invariant over such a number', () => {
  const held = Doc.pipe(
    Entity.invariant('scored', ({ after }) => Expr.gte(after.score, 0), { message: 'Score' }),
    Entity.invariant('noted', ({ after }) => Expr.gte(after.note, 0), { message: 'Note' }),
    Guards.attach(D, {
      row: { Update: [D.positive] },
      members: { rank: { Read: [D.nonnegative] } },
    }),
  )
  expect(proves(held, 'rank')).toBe(true)
})

it('keeps a rule that reads another row independent for each interaction', async () => {
  const reaching = Doc.pipe(Guards.attach(D, { row: { Update: [D.inAcme], Read: [D.inAcme] } }))
  const { definition } = GuardCheck.policy(reaching, 'rank')
  expect(
    Verdict.isUnknown(await Effect.runPromise(Prove.policyImplies(definition, 'Update', 'Read'))),
  ).toBe(true)
})

it('assumes no rule over a change, which a stored row does not hold', () => {
  const growing = Fields.pipe(
    Entity.transition('grows', ({ before, after }) => Expr.gt(after.limit, before.limit), {
      message: 'Limit must grow',
    }),
    Guards.attach(G, { members: { limit: { Read: [G.positive] } } }),
  )
  const { consistent, implication } = GuardCheck.policy(growing, 'limit')
  expect([consistent._tag, implication._tag]).toEqual(['Unknown', 'Unknown'])
})

it('leaves a surface without rules to the set: closed, no one updates and no one reads', async () => {
  const Vault = Entity.define('Vault', Schema.Struct({ id: Schema.String, limit: Schema.Int }))
  const Closed = Guards.declare('Closed', Schema.Struct({ id: Schema.String }), () => ({}), {
    key: user => user.id,
    unguarded: 'deny',
  })
  const unwritable = Vault.pipe(Guards.attach(Closed, { row: { Read: [Guards.anyone] } }))
  expect(Verdict.isFalse(GuardCheck.policy(unwritable, 'limit').consistent)).toBe(true)
  const unreadable = Vault.pipe(Guards.attach(Closed, { row: { Update: [Guards.anyone] } }))
  const { definition, implication } = GuardCheck.policy(unreadable, 'limit')
  expect(Verdict.isTrue(implication)).toBe(false)
  expect(
    Verdict.isFalse(await Effect.runPromise(Prove.policyImplies(definition, 'Update', 'Read'))),
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
