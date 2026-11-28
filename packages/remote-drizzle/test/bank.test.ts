/**
 * The bank account of #600, written with what that issue asked for: rules
 * bound to a state with `in`, a transition by name, `Expr.implies`, an
 * input that is no field in `Mutation.update`, `decrement`, and a `when`
 * that reads the row and the input with `Expr.add`. Its preconditions are
 * held by the SQLite writer where it commits and foreseen by the client
 * before it sends.
 */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity, Expr } from 'foldkit-entity'
import { Can, CanWire, Mutation, Remote } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { Surface } from 'foldkit-surface'
import { afterAll, describe, expect, it } from 'vitest'
import { bind, databaseLayer, writer } from '../src/index.js'

// ---- the domain ------------------------------------------------------------

const DAILY_LIMIT = 500

const Account = Entity.define(
  'Account',
  Schema.Struct({
    id: Schema.String,
    status: Schema.Literals(['open', 'closed']),
    balance: Schema.Number,
    withdrawnToday: Schema.Number,
    revision: Schema.Number,
  }),
)
const Open = Entity.refine(Account, 'Open', { status: 'open' })
const Closed = Entity.refine(Account, 'Closed', { status: 'closed' })
Account.pipe(
  Entity.invariant('neverOverdrawn', ({ after }) => Expr.gte(after.balance, 0), {
    message: 'An open account is never overdrawn',
    in: Open,
  }),
  Entity.invariant('withinDailyLimit', ({ after }) => Expr.lte(after.withdrawnToday, DAILY_LIMIT), {
    message: 'An open account withdraws at most the daily limit',
    in: Open,
  }),
  Entity.transition(
    'aClosedAccountStaysClosed',
    ({ before, after }) =>
      Expr.implies(Expr.eq(before.status, 'closed'), Expr.eq(after.status, 'closed')),
    { message: 'A closed account stays closed' },
  ),
)

const Positive = Schema.Number.check(Schema.isGreaterThan(0))

const OpenAccount = Mutation.insert('OpenAccount', Account, {
  set: {
    status: Schema.Literal('open'),
    balance: Schema.Literal(0),
    withdrawnToday: Schema.Literal(0),
    revision: Schema.Number,
  },
  becomes: Open,
})
const CloseAccount = Mutation.update('CloseAccount', Account, {
  set: { status: Schema.Literal('closed'), revision: Schema.Number },
  expect: 'revision',
  from: Open,
  becomes: Closed,
})
const DepositMoney = Mutation.update('DepositMoney', Account, {
  set: { revision: Schema.Number },
  expect: 'revision',
  input: { amount: Positive },
  from: Open,
  increment: { balance: 'amount' },
})
const WithdrawMoney = Mutation.update('WithdrawMoney', Account, {
  set: { revision: Schema.Number },
  expect: 'revision',
  input: { amount: Positive },
  from: Open,
  decrement: { balance: 'amount' },
  increment: { withdrawnToday: 'amount' },
  when: ({ row, input }) =>
    Expr.and(
      Expr.lte(input.amount, row.balance),
      Expr.lte(Expr.add(row.withdrawnToday, input.amount), DAILY_LIMIT),
    ),
})

// ---- the server: SQLite ----------------------------------------------------

const sqlite = new DatabaseSync(':memory:')
sqlite.exec(
  'create table accounts (id text primary key, status text not null, balance real not null, withdrawn_today real not null, revision integer not null)',
)
afterAll(() => sqlite.close())
const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  status: text('status').notNull(),
  balance: real('balance').notNull(),
  withdrawnToday: real('withdrawn_today').notNull(),
  revision: integer('revision').notNull(),
})
const Db = bind({ Account }, { Account: { table: accounts } })
const handlers = RemoteServer.handlers(
  RemoteServer.make({
    entities: [],
    mutations: [
      RemoteServer.write(OpenAccount, writer(Db.Account)),
      RemoteServer.write(CloseAccount, writer(Db.Account)),
      RemoteServer.write(DepositMoney, writer(Db.Account)),
      RemoteServer.write(WithdrawMoney, writer(Db.Account)),
    ],
  }),
  undefined,
)
let requests = 0
const send = (mutation: string, input: unknown) =>
  Effect.runPromise(
    handlers
      .FoldkitRemoteMutate({ requestId: `r${++requests}`, mutation, input })
      .pipe(Effect.result, Effect.provide(databaseLayer(drizzle({ client: sqlite })))),
  )
const stored = (id: string) =>
  sqlite
    .prepare(
      'select status, balance, withdrawn_today as withdrawnToday, revision from accounts where id = ?',
    )
    .get(id)
const refusedAs = (tag: string) => ({ _tag: 'Failure', failure: { refusal: { _tag: tag } } })

describe('The bank account through the SQLite writer', () => {
  it('opens, takes a deposit and a withdrawal, each moving the balance where it commits', async () => {
    expect(
      (
        await send('OpenAccount', {
          id: 'a1',
          status: 'open',
          balance: 0,
          withdrawnToday: 0,
          revision: 1,
        })
      )._tag,
    ).toBe('Success')
    expect((await send('DepositMoney', { id: 'a1', revision: 1, amount: 100 }))._tag).toBe(
      'Success',
    )
    expect((await send('WithdrawMoney', { id: 'a1', revision: 2, amount: 30 }))._tag).toBe(
      'Success',
    )
    expect(stored('a1')).toEqual({ status: 'open', balance: 70, withdrawnToday: 30, revision: 3 })
  })

  it('refuses a withdrawal past the balance as unmet, and writes nothing', async () => {
    expect(await send('WithdrawMoney', { id: 'a1', revision: 3, amount: 80 })).toMatchObject(
      refusedAs('Unmet'),
    )
    expect(stored('a1')).toEqual({ status: 'open', balance: 70, withdrawnToday: 30, revision: 3 })
  })

  it('refuses a withdrawal past the daily limit as unmet, though the balance covers it', async () => {
    await send('OpenAccount', {
      id: 'a2',
      status: 'open',
      balance: 0,
      withdrawnToday: 0,
      revision: 1,
    })
    await send('DepositMoney', { id: 'a2', revision: 1, amount: 1000 })
    await send('WithdrawMoney', { id: 'a2', revision: 2, amount: 480 })
    expect(await send('WithdrawMoney', { id: 'a2', revision: 3, amount: 30 })).toMatchObject(
      refusedAs('Unmet'),
    )
    expect((await send('WithdrawMoney', { id: 'a2', revision: 3, amount: 20 }))._tag).toBe(
      'Success',
    )
    expect(stored('a2')).toEqual({ status: 'open', balance: 500, withdrawnToday: 500, revision: 4 })
  })

  it('closes an account, which then takes no deposit', async () => {
    expect((await send('CloseAccount', { id: 'a1', status: 'closed', revision: 3 }))._tag).toBe(
      'Success',
    )
    expect(await send('DepositMoney', { id: 'a1', revision: 4, amount: 5 })).toMatchObject(
      refusedAs('Unmet'),
    )
    expect(stored('a1')).toEqual({ status: 'closed', balance: 70, withdrawnToday: 30, revision: 4 })
  })
})

// ---- the client: what it foresees ------------------------------------------

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({
  model: App.model.remote,
  entities: [Account],
  mutations: [OpenAccount, CloseAccount, DepositMoney, WithdrawMoney],
})
const holding = (values: Readonly<Record<string, unknown> & { readonly id: string }>): Model =>
  Data.reduce(
    { remote: Remote.initial },
    {
      _tag: 'ReadReceived',
      requests: [{ entity: 'Account', id: values.id, fields: Object.keys(values) }],
      result: { settled: [], entities: [{ entity: 'Account', id: values.id, values }] },
      now: 0,
    },
  )
const answer = (can: Can) =>
  CanWire.match(Can.toWire(can), {
    Yes: () => 'Yes',
    No: ({ refusal }) => refusal._tag,
    Undecided: ({ reasons }) => `Undecided: ${reasons.join('; ')}`,
  })

describe('The bank account as the client foresees it', () => {
  const held = holding({ id: 'a1', status: 'open', balance: 70, withdrawnToday: 480, revision: 3 })

  it.each([
    // The client judges no invariant over a field a write moves by an amount, so a
    // withdrawal its `when` admits is left to the server, as any increment is.
    [
      'within the balance and the limit',
      20,
      'Undecided: the invariants of Account need balance, withdrawnToday, which the client lacks',
    ],
    ['past the balance', 80, 'Unmet'],
    ['past the daily limit', 30, 'Unmet'],
  ])('answers a withdrawal %s before it is sent', (_, amount, expected) => {
    expect(answer(Data.can(held, WithdrawMoney, { id: 'a1', revision: 3, amount }))).toBe(expected)
  })

  it('answers a deposit to a closed account as unmet', () => {
    const closed = holding({
      id: 'a1',
      status: 'closed',
      balance: 70,
      withdrawnToday: 0,
      revision: 4,
    })
    expect(answer(Data.can(closed, DepositMoney, { id: 'a1', revision: 4, amount: 5 }))).toBe(
      'Unmet',
    )
  })

  it('judges the rules: only an open account is held to them, and a closed one stays closed', () => {
    const overdrawn = { id: 'a1', balance: -1, withdrawnToday: 0, revision: 1 }
    expect(Entity.judge(Account, { after: { ...overdrawn, status: 'open' } })._tag).toBe('Invalid')
    expect(Entity.judge(Account, { after: { ...overdrawn, status: 'closed' } })._tag).toBe('Valid')
    const closed = { id: 'a1', status: 'closed', balance: 0, withdrawnToday: 0, revision: 1 }
    expect(
      Entity.judge(Account, { before: closed, after: { ...closed, status: 'open' } })._tag,
    ).toBe('Invalid')
  })
})
