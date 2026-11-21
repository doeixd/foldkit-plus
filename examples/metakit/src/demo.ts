/**
 * End-to-end MetaKit demo: one domain declaration driving runtime transitions,
 * UI/agent affordances, static dependency & SSR pruning, live PGlite + Drizzle
 * SQL, form/JSON Schema inspection, and Tier 3 Zone / Tier 4 Z3 verification.
 */
import { pathToFileURL } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { integer, pgTable, text } from 'drizzle-orm/pg-core'
import { Effect, Option, Result, Schema } from 'effect'
import { Eq, Expr, Num, Path, Transition } from 'metakit'
import * as Rows from 'metakit/aggregates'
import { CalendarDay, Money, OrderedEnum } from 'metakit/domain'
import * as Drizzle from 'metakit/drizzle'
import * as Graph from 'metakit/graph'
import * as Inspect from 'metakit/inspect'
import * as Machine from 'metakit/machine'
import * as Prove from 'metakit/prove'

// 1. Domain model: currency-safe Money, timezone-free CalendarDay, OrderedEnum,
//    and inspectable invariants attached directly to the Effect Schema.
export const Usd = Money.make('USD')
export const Tier = OrderedEnum.make(['free', 'pro', 'enterprise'] as const)

export const Account = Schema.Struct({
  id: Schema.String,
  balance: Usd,
  reserved: Usd,
  status: Schema.Literals(['open', 'frozen']),
  tier: Tier.schema,
  openedOn: CalendarDay.schema,
  promoEnabled: Schema.Boolean,
}).pipe(
  Expr.refine($ =>
    Expr.all(Num.gte($.balance, 0), Num.gte($.reserved, 0), Num.lte($.reserved, $.balance)),
  ),
)
export type Account = typeof Account.Type

const Withdraw = Transition.make({
  state: Account,
  input: Schema.Struct({ amount: Usd }),
  when: ({ state, input }) =>
    Expr.all(
      Eq.is(state.status, 'open'),
      Num.gt(input.amount, 0),
      Num.lte(input.amount, Num.sub(state.balance, state.reserved)),
    ),
  apply: ({ state, input }) => [
    Transition.set(state.balance, Money.sub(state.balance, input.amount)),
  ],
  emits: ({ state, input }) => [
    Transition.emit('WithdrawalRecorded', { accountId: state.id, amount: input.amount }),
  ],
})

const Freeze = Transition.make({
  state: Account,
  input: Schema.Struct({}),
  when: ({ state }) => Eq.is(state.status, 'open'),
  apply: ({ state }) => [Transition.set(state.status, 'frozen')],
})

// A deliberately buggy transition (missing `amount <= balance - reserved`) to show
// Tier 4 Z3 producing a concrete counterexample witness.
const BuggyWithdraw = Transition.make({
  state: Account,
  input: Schema.Struct({ amount: Usd }),
  when: ({ state, input }) => Expr.all(Eq.is(state.status, 'open'), Num.gt(input.amount, 0)),
  apply: ({ state, input }) => [
    Transition.set(state.balance, Money.sub(state.balance, input.amount)),
  ],
})

export const AccountMachine = Machine.make({
  state: Account,
  transitions: { Withdraw, Freeze },
})

export const BuggyMachine = Machine.make({
  state: Account,
  transitions: { Withdraw: BuggyWithdraw, Freeze },
})

export const accountsTable = pgTable('accounts', {
  id: text('id').primaryKey(),
  balance: integer('balance').notNull(),
  reserved: integer('reserved').notNull(),
  status: text('status').notNull(),
})

export const runDemo = async () => {
  // 1. Runtime state machine + affordances + incremental aggregate
  const initial: Account = {
    id: 'acct_1',
    balance: Money.minor('USD', 50_000),
    reserved: Money.minor('USD', 10_000),
    status: 'open',
    tier: 'pro',
    openedOn: CalendarDay.parseIsoUnsafe('2026-01-15'),
    promoEnabled: false,
  }

  const [afterWithdraw, emitted] = AccountMachine.update(initial, {
    _tag: 'Withdraw',
    input: { amount: Money.minor('USD', 15_000) },
  })
  const openAffordances = Machine.affordances(AccountMachine, afterWithdraw)
  const [afterFreeze] = AccountMachine.update(afterWithdraw, { _tag: 'Freeze', input: {} })
  const frozenAffordances = Machine.affordances(AccountMachine, afterFreeze)

  // O(1) incremental sum over a ledger
  const ledgerSum = Rows.sum(Schema.Struct({ delta: Schema.Int }), $ => $.delta)
  const initialSum = ledgerSum.evaluate([{ delta: 50_000 }])
  const totalBalance = initialSum + ledgerSum.insertDelta({ delta: -15_000 })

  // 2. Static dependency graph, SSR pruning, and dependent-query readiness
  const $ = Path.from(Account)
  const bindings = {
    available: Num.sub($.balance, $.reserved),
    statusLabel: Expr.match($.status, { open: 'Active', frozen: 'Frozen' }),
    accountId: $.id,
    promoBonus: Expr.when($.promoEnabled, { then: Num.sub($.balance, $.reserved), else: 0 }),
  }
  const graph = Graph.analyze(AccountMachine, bindings)
  const pruned = Graph.pruneStatic(bindings, { promoEnabled: false })

  const query = Expr.in(
    { row: Account, params: Schema.Struct({ minBalance: Schema.Int }) },
    ({ row, params }) =>
      Expr.all(Eq.is(row.status, 'open'), Num.gte(row.balance, params.minBalance)),
  )
  const notReady = Graph.queryReadiness(query, {})
  const ready = Graph.queryReadiness(query, { params: { minBalance: 20_000 } })

  // 3. Live PGlite + Drizzle CHECK / WHERE / UPDATE from the same rules
  const pg = new PGlite()
  const db = drizzle({ client: pg })
  const check = Result.getOrThrow(Drizzle.toCheck(Account, accountsTable))
  await db.execute(
    sql`CREATE TABLE accounts (id text PRIMARY KEY, balance integer NOT NULL, reserved integer NOT NULL, status text NOT NULL, CHECK (${check}))`,
  )
  await db.insert(accountsTable).values([
    { id: 'acct_1', balance: 50_000, reserved: 10_000, status: 'open' },
    { id: 'acct_2', balance: 5_000, reserved: 0, status: 'frozen' },
  ])

  const openHighWhere = Result.getOrThrow(
    Drizzle.toWhere(ready.residual, accountsTable, { rowPrefix: ['row'] }),
  )
  const matchingRows = await db.select().from(accountsTable).where(openHighWhere)

  const updateSet = Result.getOrThrow(
    Drizzle.toUpdate(Withdraw, { amount: Money.minor('USD', 15_000) }, accountsTable),
  )
  await db
    .update(accountsTable)
    .set(updateSet.set)
    .where(sql`${accountsTable.id} = 'acct_1' AND ${updateSet.where}`)
  const updatedRows = await db.select().from(accountsTable)
  await pg.close()

  // 4. Form & JSON Schema inspection (zero interpreter duplication)
  const fieldSpecs = Inspect.fieldSpecs(Account)
  const jsonSchema = Inspect.toJsonSchema(Account)

  // 5. Tier 3 Zone proof + Tier 4 Z3 refutation with structured witness
  const validProof = await Effect.runPromise(
    Prove.machine(AccountMachine, { pin: ['Withdraw', 'Freeze'] }),
  )
  const buggyProof = await Effect.runPromise(Prove.machine(BuggyMachine))

  return {
    afterWithdraw,
    emitted,
    openAffordances,
    frozenAffordances,
    totalBalance,
    graph,
    pruned,
    notReady,
    ready,
    matchingRows,
    updatedRows,
    fieldSpecs,
    jsonSchema,
    validProof,
    buggyProof,
  }
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (isMain) {
  const result = await runDemo()
  console.log('=== 1. Runtime Machine & Affordances ===')
  console.log('After Withdraw(15_000): balance =', result.afterWithdraw.balance)
  console.log('Emitted:', result.emitted)
  console.log('Open affordances:', result.openAffordances)
  console.log('Frozen affordances:', result.frozenAffordances)
  console.log('Incremental ledger sum:', result.totalBalance)

  console.log('\n=== 2. Static Graph, SSR Pruning & Query Readiness ===')
  console.log('affectedBy:', result.graph.affectedBy)
  console.log('deadBindings:', result.graph.deadBindings)
  console.log('pruned staticValues:', result.pruned.staticValues)
  console.log(
    'pruned resumePaths:',
    Option.map(result.pruned.resumePaths, ps => ps.map(Path.format)),
  )
  console.log('queryReadiness (empty): ready =', result.notReady.ready)
  console.log('queryReadiness (bound): ready =', result.ready.ready)

  console.log('\n=== 3. PGlite + Drizzle ===')
  console.log('Open accounts with balance >= 20_000:', result.matchingRows)
  console.log('Rows after Drizzle.toUpdate(Withdraw, 15_000):', result.updatedRows)

  console.log('\n=== 4. Inspect (Form Specs & JSON Schema) ===')
  console.log(
    'balance spec:',
    result.fieldSpecs.find(f => f.name === 'balance'),
  )
  console.log(
    'status spec:',
    result.fieldSpecs.find(f => f.name === 'status'),
  )

  console.log('\n=== 5. Proofs (Tier 3 Zone & Tier 4 Z3) ===')
  console.log('-- AccountMachine (ok =', result.validProof.ok, ') --')
  console.log(result.validProof.format())
  console.log('\n-- BuggyMachine (ok =', result.buggyProof.ok, ') --')
  console.log(result.buggyProof.format())
}
