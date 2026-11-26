import { Effect, Exit, Inspectable, Option, Ref, Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import * as Expr from '../src/expr.js'
import * as Machine from '../src/machine.js'
import * as Num from '../src/ops/num.js'
import * as Path from '../src/path.js'
import * as Policy from '../src/policy.js'
import * as Relation from '../src/relation.js'
import * as Store from '../src/store.js'
import * as StoreCheck from '../src/storeCheck.js'
import * as Temporal from '../src/temporal.js'
import * as Transition from '../src/transition.js'

describe('metakit Effect 4.1.4 native integration (Phase 1)', () => {
  it('Store.check returns yieldable Result and Store.mountEffect fails with StoreRefused', async () => {
    const weakStore: Store.StoreCapabilities = {
      name: 'weak-kv',
      isolation: 'read-committed',
      parentRowLock: false,
    }
    const strongStore: Store.StoreCapabilities = {
      name: 'pg-serializable',
      isolation: 'serializable',
      isolates: 'transaction',
      parentRowLock: true,
    }
    const reqs: ReadonlyArray<Store.Requirement> = [
      { rule: 'balance >= 0', needs: 'row-atomic', because: 'concurrent debits' },
    ]

    expect(Result.isFailure(Store.check(weakStore, reqs))).toBe(true)
    expect(Result.isSuccess(Store.check(strongStore, reqs))).toBe(true)

    const exitFail = await Effect.runPromiseExit(Store.mountEffect(weakStore, reqs))
    expect(Exit.isFailure(exitFail)).toBe(true)

    const exitOk = await Effect.runPromiseExit(Store.mountEffect(strongStore, reqs))
    expect(Exit.isSuccess(exitOk)).toBe(true)
  })

  it('checkStoreEffect manages connections via Scope and detects broken serializability', async () => {
    let closedCount = 0
    const rows = new Map<string, StoreCheck.StoreRow>()

    const brokenAdapter: StoreCheck.EffectStoreAdapter<never> = {
      connect: Effect.acquireRelease(
        Effect.succeed<StoreCheck.EffectStoreConnection<never>>({
          transaction: run =>
            run({
              read: id => Effect.sync(() => rows.get(id)),
              write: (id, balance) =>
                Effect.sync(() => {
                  rows.set(id, { id, balance })
                }),
            }),
          read: id => Effect.sync(() => rows.get(id)),
          write: (id, balance) =>
            Effect.sync(() => {
              rows.set(id, { id, balance })
            }),
        }),
        () =>
          Effect.sync(() => {
            closedCount += 1
          }),
      ),
      seed: ({ parent }) =>
        Effect.sync(() => {
          rows.clear()
          rows.set(parent.id, parent)
        }),
    }

    const report = await Effect.runPromise(
      StoreCheck.checkStoreEffect(
        {
          name: 'broken-mem',
          isolation: 'serializable',
          isolates: 'transaction',
          parentRowLock: false,
        },
        brokenAdapter,
        { runs: 2 },
      ),
    )

    expect(report.passed).toBe(false)
    expect(report.failures[0]?.probe).toBe('serializable-transaction')
    expect(closedCount).toBe(2) // both Scope-managed connections closed on failing run
  })

  it('Temporal.walkEffect runs inside Scope, cleans up every world, and shrinks failures', async () => {
    let released = 0
    const result = await Effect.runPromise(
      Temporal.walkEffect(
        {
          initial: Effect.acquireRelease(Ref.make(0), () =>
            Effect.sync(() => {
              released += 1
            }),
          ),
          steps: [
            { name: 'inc', run: ref => Ref.update(ref, n => n + 1) },
            { name: 'double', run: ref => Ref.update(ref, n => n * 2) },
            { name: 'noop', run: () => Effect.void },
          ],
          holds: ref =>
            Ref.get(ref).pipe(
              Effect.map(n => (n >= 2 ? Option.some(`reached ${n}`) : Option.none())),
            ),
        },
        { runs: 20, seed: 1 },
      ),
    )

    expect(result._tag).toBe('Broken')
    if (result._tag === 'Broken') {
      expect(result.minimal).toEqual(['inc', 'double'])
    }
    expect(released).toBeGreaterThan(0)
  })

  it('Path, Expr, Relation, and Policy are Pipeable and Inspectable', () => {
    const Account = Schema.Struct({ id: Schema.String, balance: Schema.Int })
    const Principal = Schema.Struct({ id: Schema.String })
    const acc = Path.from(Account)

    expect(acc.balance.pipe(p => p.segments)).toEqual(['balance'])
    expect(Num.add(acc.balance, 1).pipe(e => Expr.eval(e, { id: 'a', balance: 5 }))).toBe(6)
    expect(Inspectable.toStringUnknown(acc.balance)).toContain('metakit/Path')
    expect(String(acc.balance)).toBe('Path(balance)')
    expect(Inspectable.toStringUnknown(Num.add(acc.balance, 1))).toContain('metakit/Expr')

    const rel = Relation.make('Entry.accountId', Account)
    expect(rel.pipe(r => r.name)).toBe('Entry.accountId')

    const pol = Policy.make({
      row: Account,
      principal: Principal,
      rules: ({ row }) => ({ read: Num.gte(row.balance, 0) }),
    })
    expect(
      pol.pipe(p => p.allow('read', { row: { id: 'a', balance: 1 }, principal: { id: 'u' } })),
    ).toBe(true)

    const Tr = Transition.make({
      state: Account,
      input: Schema.Struct({ by: Schema.Int }),
      when: ({ input }) => Num.gt(input.by, 0),
      apply: ({ state, input }) => [
        Transition.set(state.balance, Num.add(state.balance, input.by)),
      ],
    })
    expect(Tr.pipe(t => t.writes.length)).toBe(1)
    expect(String(Tr)).toBe('Transition(balance)')

    const M = Machine.make({ state: Account, transitions: { Deposit: Tr } })
    expect(M.pipe(m => Object.keys(m.transitions))).toEqual(['Deposit'])
    expect(String(M)).toBe('Machine(Deposit)')
  })

  it('Transition.run Result composes cleanly inside Effect.gen via Effect.fromResult', async () => {
    const State = Schema.Struct({ count: Schema.Int })
    const Inc = Transition.make({
      state: State,
      input: Schema.Struct({ by: Schema.Int }),
      when: ({ input }) => Num.gt(input.by, 0),
      apply: ({ state, input }) => [Transition.set(state.count, Num.add(state.count, input.by))],
    })

    const next = await Effect.runPromise(
      Effect.gen(function* () {
        const s1 = yield* Effect.fromResult(Transition.run(Inc, { count: 1 }, { by: 2 }))
        const s2 = yield* Effect.fromResult(Transition.run(Inc, s1, { by: 3 }))
        return s2
      }),
    )
    expect(next).toEqual({ count: 6 })
  })
})
