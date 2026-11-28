// @vitest-environment node
/**
 * A guard that cannot be decided never allows. A row guard is read through
 * `foldkit-entity/lowering` and judged by metakit, so a refusal inside one
 * (text holding a NUL, NaN, a sum past the safe integer range) refuses the
 * whole rule, whatever the other guards say: on the server's judge, on a
 * write, on `Policy.decide`, and in the page's hint, which never claims a yes
 * the server would not give. No proof of a data invariant assumes a guard.
 */
import { Effect, Option, Schema } from 'effect'
import { Entity, Expr, Held, Relation, Write } from 'foldkit-entity'
import { Laws } from 'foldkit-entity/laws'
import { Mutation } from 'foldkit-remote'
import { RemoteServer, type MemoryStore } from 'foldkit-remote-server'
import { Expr as MetaExpr, Verdict } from 'metakit'
import { describe, expect, it } from 'vitest'
import { GuardCheck } from '../src/check.js'
import { Condition, Guards, type RuleFor } from '../src/index.js'
import { GuardServer } from '../src/server.js'

const NUL = '\u0000'
/** The largest integer metakit adds without refusing; one more is past the range. */
const top = Number.MAX_SAFE_INTEGER

const Fields = {
  Team: Entity.define('Team', Schema.Struct({ id: Schema.String, open: Schema.Boolean })),
  Item: Entity.define(
    'Item',
    Schema.Struct({
      id: Schema.String,
      ownerId: Schema.String,
      title: Schema.String,
      stock: Schema.Number,
      revision: Schema.Number,
    }),
  ),
}
const Related = Entity.relate(Fields, { Item: { team: Relation.one(Fields.Team) } })
const { ownerId, title, stock, revision } = Related.Item.fields

const User = Schema.Struct({ id: Schema.String })
type User = typeof User.Type
const G = Guards.declare(
  'Stock',
  User,
  guard => ({
    isOwner: guard.row(Related.Item, p => Expr.eq(ownerId, p.id)),
    titled: guard.row(Related.Item, () => Expr.eq(title, 'open')),
    stocked: guard.row(Related.Item, () => Expr.gt(stock, 0)),
    summed: guard.row(Related.Item, () => Expr.gt(Expr.add(stock, revision), 0)),
    inTeam: guard.row(Related.Item, () => Expr.eq(Related.Item.relations.team, 't1')),
    anonymous: guard.row(Related.Item, p => Expr.isNull(p.id)),
    ownerInOpenTeam: guard.row(Related.Item, p =>
      Expr.and(
        Expr.eq(Expr.path(Related.Item.relations.team, Related.Team.fields.open), true),
        Expr.eq(ownerId, p.id),
      ),
    ),
    inOpenTeam: guard.row(Related.Item, () =>
      Expr.eq(Expr.path(Related.Item.relations.team, Related.Team.fields.open), true),
    ),
  }),
  { key: user => user.id, unguarded: 'deny' },
)
const Policy = G.implement({})
const ada = Option.some<User>({ id: 'ada' })

const row = { id: 'i1', ownerId: 'ada', title: 'open', stock: 1, revision: 1, team: 'Team:t1' }
/** Each value that makes metakit refuse one guard, the others still allowing. */
const refusing = [
  { what: 'text holding a NUL', guard: G.titled, values: { ...row, title: `op${NUL}en` } },
  { what: 'NaN', guard: G.stocked, values: { ...row, stock: Number.NaN } },
  { what: 'a sum past the safe range', guard: G.summed, values: { ...row, stock: top } },
] as const

type ItemRule = RuleFor<User, 'Stock', 'Item'>

/** The Update rule of an Item guarded by `update`, as decided for ada. */
const conditionOf = ({ Update }: { readonly Update: ReadonlyArray<ItemRule> }) =>
  Effect.runSync(
    Policy.writable(Related.Item.pipe(Guards.attach(G, { row: { Update } })), ada, 'Update'),
  ).condition

describe('a refusal inside a guard', () => {
  it.each(refusing)('of $what refuses the rule beside a guard that allows', ({ guard, values }) => {
    const condition = conditionOf({ Update: [G.isOwner, guard] })
    const holds = (over: Readonly<Record<string, unknown>>) =>
      Condition.holds(condition, over, Policy.inputOf(ada), () => false, Policy.operators)
    expect(holds(row)).toBe(true)
    expect(holds(values)).toBe(false)
  })

  it.each(refusing)(
    'of $what refuses the rule a write’s statement would judge the rest of',
    ({ guard, values }) => {
      const condition = conditionOf({ Update: [G.inOpenTeam, Guards.all(G.isOwner, guard)] })
      const left = (over: Readonly<Record<string, unknown>>) =>
        Condition.residual(condition, over, Policy.inputOf(ada), Policy.operators)
      expect(left(row)).toBe(Condition.always)
      expect(left(values)).toBe(Condition.never)
    },
  )

  it.each(refusing)('of $what is a no from Policy.decide, not a crash', ({ guard, values }) => {
    expect(
      Effect.runSync(Policy.decide(guard, { principal: ada, interaction: 'Update', row })),
    ).toBe(true)
    expect(
      Effect.runSync(Policy.decide(guard, { principal: ada, interaction: 'Update', row: values })),
    ).toBe(false)
  })

  it('is like a rule one row cannot judge: neither holds, beside a guard that allows', () => {
    const holds = (update: ReadonlyArray<ItemRule>) =>
      Condition.holds(
        conditionOf({ Update: update }),
        row,
        Policy.inputOf(ada),
        () => false,
        Policy.operators,
      )
    expect(holds([G.isOwner])).toBe(true)
    expect(holds([G.inOpenTeam])).toBe(false)
    expect(holds([G.isOwner, G.inOpenTeam])).toBe(false)
  })

  it('of a link that is no ref key is a no, not a crash', () => {
    const holds = (team: string) =>
      Condition.holds(
        conditionOf({ Update: [G.inTeam] }),
        { ...row, team },
        Policy.inputOf(ada),
        () => false,
        Policy.operators,
      )
    expect(holds('Team:t1')).toBe(true)
    expect(holds('t1')).toBe(false)
  })

  it('leaves a visitor out of a rule over the principal, even one a visitor’s nothing meets', () => {
    const ask = (principal: Option.Option<User>) =>
      Effect.runSync(Policy.decide(G.anonymous, { principal, interaction: 'Update', row }))
    expect(ask(Option.none())).toBe(false)
  })

  it('in a principal’s own fields refuses what it reads, and a guard beside it', () => {
    const condition = conditionOf({ Update: [G.isOwner, G.titled] })
    const nul = Option.some<User>({ id: `a${NUL}` })
    expect(
      Condition.holds(
        Effect.runSync(
          Policy.writable(
            Related.Item.pipe(Guards.attach(G, { row: { Update: [G.isOwner, G.titled] } })),
            nul,
            'Update',
          ),
        ).condition,
        row,
        Policy.inputOf(nul),
        () => false,
        Policy.operators,
      ),
    ).toBe(false)
    expect(
      Condition.holds(condition, row, Policy.inputOf(ada), () => false, Policy.operators),
    ).toBe(true)
  })
})

describe('a principal’s field no reader agrees on', () => {
  const nul = Policy.inputOf(Option.some<User>({ id: `a${NUL}` }))

  it('refuses a rule whose guard reading it is kept for the statement, beside one that allows', () => {
    const condition = conditionOf({ Update: [G.titled, G.ownerInOpenTeam] })
    expect(Condition.residual(condition, row, Policy.inputOf(ada), Policy.operators)).toBe(
      Condition.always,
    )
    // Kept, the guard would reach the statement only to be refused when it is compiled.
    expect(Condition.residual(condition, row, nul, Policy.operators)).toBe(Condition.never)
    expect(Condition.holds(condition, row, nul, () => false, Policy.operators)).toBe(false)
  })

  const Ranked = Guards.declare(
    'Ranked',
    Schema.Struct({ id: Schema.String, rank: Schema.Number }),
    guard => ({
      outranks: guard.row(Related.Item, p => Expr.gte(stock, p.rank)),
      titled: guard.row(Related.Item, () => Expr.eq(title, 'open')),
    }),
    { key: user => user.id, unguarded: 'deny' },
  )
  const RankedPolicy = Ranked.implement({})

  it.each([Number.NaN, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY])(
    'refuses %s, which SQL cannot compile, as memory does',
    rank => {
      const asker = Option.some({ id: 'ada', rank })
      const ruled = Related.Item.pipe(
        Guards.attach(Ranked, { row: { Update: [Ranked.outranks, Ranked.titled] } }),
      )
      const holds = (principal: typeof asker) =>
        Condition.holds(
          Effect.runSync(RankedPolicy.writable(ruled, principal, 'Update')).condition,
          row,
          RankedPolicy.inputOf(principal),
          () => false,
          RankedPolicy.operators,
        )
      expect(holds(Option.some({ id: 'ada', rank: 0 }))).toBe(true)
      expect(holds(asker)).toBe(false)
    },
  )
})

describe('a guarded write whose rule metakit refuses', () => {
  const Item = Fields.Item.pipe(
    Guards.attach(G, { row: { Read: [G.isOwner], Update: [G.isOwner, G.summed] } }),
  )
  const Restock = Mutation.write(
    'Restock',
    Write.update(
      Entity.input(
        Item,
        Schema.Struct({ id: Schema.String, revision: Schema.Number, title: Schema.String }),
      ),
      { id: 'id', expect: 'revision' },
    ),
  )
  const open = (stocked: number) => {
    let held: Readonly<Record<string, unknown>> = { ...row, stock: stocked }
    const store: MemoryStore = {
      rows: name => (name === 'Item' ? [held] : []),
      write: (_name, _id, values) => {
        held = { ...held, ...values }
      },
      remove: () => undefined,
    }
    const server = RemoteServer.make<Option.Option<User>>({
      entities: [],
      mutations: [
        RemoteServer.write(
          Restock,
          GuardServer.writer(Item, Policy, RemoteServer.memoryWriter(store, Item), {
            revision: 'revision',
          }),
        ),
      ],
    })
    return Effect.runPromise(
      RemoteServer.handlers(server, ada)
        .FoldkitRemoteMutate({
          requestId: 'r',
          mutation: 'Restock',
          input: { id: 'i1', revision: 1, title: 'renamed' },
        })
        .pipe(Effect.result),
    )
  }

  it('is Forbidden, though its owner would be let, and says nothing of why', async () => {
    expect((await open(1))._tag).toBe('Success')
    const refused = await open(top)
    expect(refused).toMatchObject({ _tag: 'Failure', failure: { _tag: 'Forbidden' } })
    expect(JSON.stringify(refused)).not.toMatch(/num\.add|unsafe|safe integer/)
  })
})

describe('the page’s hint', () => {
  const held = (values: Readonly<Record<string, unknown>>) => {
    const rows = Held.rows([
      { entity: Related.Team, rows: [{ id: 't1', open: true }] },
      { entity: Related.Item, rows: [{ ...values, team: 't1' }] },
    ])
    return { item: Option.getOrThrow(rows.row(Related.Item, 'i1')), rows }
  }

  it.each(refusing)('says nothing over $what, where the server refuses', ({ guard, values }) => {
    const condition = conditionOf({ Update: [G.titled, guard] })
    const ok = held(row)
    expect(Verdict.isTrue(Condition.judge(condition, ok.item, ok.rows))).toBe(true)
    const bad = held(values)
    expect(Verdict.isUnknown(Condition.judge(condition, bad.item, bad.rows))).toBe(true)
  })

  it('does not take a yes beside a rule over who asks, which may yet be refused', () => {
    // A principal whose id holds a NUL is refused by the server: see above.
    const condition = conditionOf({ Update: [G.isOwner, G.titled] })
    const { item, rows } = held(row)
    expect(Verdict.isUnknown(Condition.judge(condition, item, rows))).toBe(true)
    // With no such rule beside it, the same yes is the page's to give.
    const alone = conditionOf({ Update: [G.titled] })
    expect(Verdict.isTrue(Condition.judge(alone, item, rows))).toBe(true)
  })

  it('follows a path it holds, and says nothing of one it does not', () => {
    const condition = conditionOf({ Update: [G.inOpenTeam] })
    const { item, rows } = held(row)
    expect(Verdict.isTrue(Condition.judge(condition, item, rows))).toBe(true)
    const lone = Held.rows([
      { entity: Related.Item, rows: [{ ...row, team: 't1' }], complete: false },
    ])
    expect(
      Verdict.isUnknown(
        Condition.judge(condition, Option.getOrThrow(lone.row(Related.Item, 'i1')), lone),
      ),
    ).toBe(true)
  })
})

describe('a proof of a data invariant', () => {
  const Ledger = Entity.define(
    'Ledger',
    Schema.Struct({ id: Schema.String, balance: Schema.Int }),
  ).pipe(Entity.invariant('floor', ({ after }) => Expr.gte(after.balance, 0), { message: 'Floor' }))
  const L = Guards.declare(
    'Ledgers',
    User,
    guard => ({ funded: guard.row(Ledger, () => Expr.gte(Ledger.fields.balance, 10)) }),
    { key: user => user.id, unguarded: 'deny' },
  )
  const Guarded = Ledger.pipe(Guards.attach(L, { row: { Update: [L.funded], Read: [L.funded] } }))
  const withdraw = (entity: typeof Ledger) =>
    Write.update(
      Entity.input(entity, Schema.Struct({ id: Schema.String, by: Schema.Int }), {
        by: Entity.unmapped,
      }),
      { id: 'id', increment: { balance: 'by' } },
    )

  it('reads no guard: Laws.check says the same with the guards attached', () => {
    const verdicts = (entity: typeof Ledger) =>
      Laws.check({ writes: [{ name: 'Withdraw', write: withdraw(entity) }] }).pairs.map(
        pair => [pair.invariant, pair.verdict._tag] as const,
      )
    expect(verdicts(Guarded)).toEqual(verdicts(Ledger))
    expect(verdicts(Guarded)).not.toContainEqual(['floor', 'Kept'])
  })

  it('GuardCheck.policy assumes the invariants of the row, and no guard', () => {
    const { definition } = GuardCheck.policy(Guarded, 'balance')
    expect(MetaExpr.refinementsOf(definition.rowSchema)).toHaveLength(1)
  })
})
