import { Effect, Option, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Bool, Expr, Num, Ord } from '../src/index.js'
import * as Transition from '../src/transition.js'
import * as Tooling from '../src/tooling.js'

const Account = Schema.Struct({
  balance: Schema.Int,
  reserved: Schema.Int,
  frozen: Schema.Boolean,
})

const Amount = Schema.Struct({ amount: Schema.Int })

const available = Expr.in({ state: Account }, ({ state }) => Num.sub(state.balance, state.reserved))
const canWithdrawV1 = Expr.in({ state: Account, input: Amount }, ({ state, input }) =>
  Bool.and(
    Bool.not(state.frozen),
    Bool.and(
      Ord.gt(input.amount, 0),
      Ord.lte(input.amount, Num.sub(state.balance, state.reserved)),
    ),
  ),
)
const canWithdrawV2 = Expr.in({ state: Account, input: Amount }, ({ state, input }) =>
  Bool.and(
    Bool.not(state.frozen),
    Bool.and(
      Ord.gte(input.amount, 0),
      Ord.lte(input.amount, Num.sub(state.balance, state.reserved)),
    ),
  ),
)

const withdraw = Transition.make({
  state: Account,
  input: Amount,
  when: ({ state, input }) =>
    Bool.and(
      Bool.not(state.frozen),
      Bool.and(
        Ord.gt(input.amount, 0),
        Ord.lte(input.amount, Num.sub(state.balance, state.reserved)),
      ),
    ),
  apply: ({ state, input }) => [
    Transition.set(state.balance, Num.sub(state.balance, input.amount)),
  ],
})

const independent = Expr.in({ state: Account }, ({ state }) => Bool.not(state.frozen))

describe('metakit/tooling (#646 P0)', () => {
  it('indexes Expr and Transition definitions via Effect SemanticIndex layer, tracks references, dependencies, impact, and Mermaid', async () => {
    const entries = [
      Tooling.Definition.expr('Account.available', available, {
        origin: { uri: 'src/account.ts', line: 10, column: 1 },
        description: 'Available balance',
      }),
      Tooling.Definition.expr('Account.canWithdraw', canWithdrawV1, {
        dependsOn: ['Account.available'],
        origin: { uri: 'src/account.ts', line: 15, column: 1 },
      }),
      Tooling.Definition.transition('Account.withdraw', withdraw, {
        dependsOn: ['Account.canWithdraw'],
        origin: { uri: 'src/account.ts', line: 22, column: 1 },
      }),
      Tooling.Definition.expr('Account.isActive', independent),
    ]

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const index = yield* Tooling.SemanticIndex
        const def = yield* index.definition('Account.available')
        const refs = yield* index.references('Account.available')
        const deps = yield* index.dependencies('Account.withdraw')
        const impact = yield* index.impact(['Account.available'])
        const explain = yield* index.explain('Account.canWithdraw', {
          _tag: 'sql',
          dialect: 'postgres',
        })
        const mermaid = yield* index.toMermaid()
        return { def, refs, deps, impact, explain, mermaid }
      }).pipe(Effect.provide(Tooling.layer(entries))),
    )

    expect(result.def.portable).toBe(true)
    expect(Option.isSome(result.def.fingerprint)).toBe(true)
    expect(result.def.reads).toEqual(['state.balance', 'state.reserved'])

    // Reverse references include both explicit depends-on and transition writes to read fields
    expect(result.refs.some(r => r.from === 'Account.canWithdraw' && r.kind === 'depends-on')).toBe(
      true,
    )
    expect(
      result.refs.some(
        r =>
          r.from === 'Account.withdraw' &&
          r.kind === 'writes-read-field' &&
          r.field === 'state.balance',
      ),
    ).toBe(true)

    // Transitive dependencies
    expect(result.deps.direct).toEqual(['Account.canWithdraw'])
    expect(result.deps.transitive).toEqual(['Account.available', 'Account.canWithdraw'])
    expect(result.deps.cycles).toEqual([])

    // Downstream impact leaves Account.isActive unaffected
    expect(result.impact.affected).toEqual(['Account.canWithdraw', 'Account.withdraw'])
    expect(result.impact.unaffected).toEqual(['Account.isActive'])

    // Explain & Mermaid
    expect(result.explain.supported).toBe(true)
    expect(result.mermaid).toContain('flowchart TD')
    expect(result.mermaid).toContain('n0["Account.available (expr)"]')
    expect(result.mermaid).toContain('n1["Account.canWithdraw (expr)"]')
    expect(result.mermaid).toContain('n3["Account.withdraw (transition)"]')
    expect(result.mermaid).toContain('n3 --> n1')
  })

  it('rejects duplicate declaration IDs and diagnoses missing deps, cycles, and opaque nodes', async () => {
    const dup = await Effect.runPromise(
      Effect.flip(
        Tooling.makeIndex([
          Tooling.Definition.expr('Account.dup', available),
          Tooling.Definition.expr('Account.dup', independent),
        ]),
      ),
    )
    expect(dup._tag).toBe('DuplicateDeclarationError')

    const opaqueDef = Tooling.Definition.expr(
      'Account.opaqueRule',
      Expr.opaque({ name: 'clockCheck' }, () => true),
      { dependsOn: ['Account.missing'] },
    )
    const cycleA = Tooling.Definition.expr('Cycle.a', available, { dependsOn: ['Cycle.b'] })
    const cycleB = Tooling.Definition.expr('Cycle.b', independent, { dependsOn: ['Cycle.a'] })

    const index = await Effect.runPromise(Tooling.makeIndex([opaqueDef, cycleA, cycleB]))
    const diags = await Effect.runPromise(index.diagnostics({ _tag: 'sql', dialect: 'postgres' }))

    const codes = new Set(diags.map(d => d.code))
    expect(codes.has('MK001')).toBe(true) // missing dep
    expect(codes.has('MK002')).toBe(true) // cycle
    expect(codes.has('MK003')).toBe(true) // non-portable opaque
    expect(codes.has('MK004')).toBe(true) // SQL unsupported opaque

    const missing = await Effect.runPromise(Effect.flip(index.definition('Does.Not.Exist')))
    expect(missing._tag).toBe('UnknownDeclarationError')
  })

  it('semanticDiff identifies changed definitions, affected downstream, and unaffected cached items', async () => {
    const before = await Effect.runPromise(
      Tooling.makeIndex([
        Tooling.Definition.expr('Account.available', available, {
          origin: { uri: 'src/account.ts', line: 10, column: 1 },
        }),
        Tooling.Definition.expr('Account.canWithdraw', canWithdrawV1, {
          dependsOn: ['Account.available'],
        }),
        Tooling.Definition.transition('Account.withdraw', withdraw, {
          dependsOn: ['Account.canWithdraw'],
        }),
        Tooling.Definition.expr('Account.isActive', independent),
        Tooling.Definition.expr('Account.legacy', independent),
      ]),
    )

    // Note: Account.available moved line 10 -> 42 (non-semantic origin edit: stays unchanged!)
    const after = await Effect.runPromise(
      Tooling.makeIndex([
        Tooling.Definition.expr('Account.available', available, {
          origin: { uri: 'src/account.ts', line: 42, column: 1 },
        }),
        Tooling.Definition.expr('Account.canWithdraw', canWithdrawV2, {
          dependsOn: ['Account.available'],
        }),
        Tooling.Definition.transition('Account.withdraw', withdraw, {
          dependsOn: ['Account.canWithdraw'],
        }),
        Tooling.Definition.expr('Account.isActive', independent),
        Tooling.Definition.expr('Account.newRule', independent),
      ]),
    )

    const diff = await Effect.runPromise(Tooling.semanticDiff(before, after))
    expect(diff.added).toEqual(['Account.newRule'])
    expect(diff.removed).toEqual(['Account.legacy'])
    expect(diff.changed.map(c => c.id)).toEqual(['Account.canWithdraw'])
    expect(diff.unchanged).toContain('Account.available')
    expect(diff.affectedDownstream).toEqual(['Account.withdraw'])
    expect(diff.unaffectedCached).toEqual(['Account.available', 'Account.isActive'])
  })

  it('detects Transition write-RHS changes, avoids Mermaid ID collisions, and emits MK002 only on cycle members', async () => {
    const withdrawAdd = Transition.make({
      state: Account,
      input: Amount,
      when: ({ state, input }) =>
        Bool.and(
          Bool.not(state.frozen),
          Bool.and(
            Ord.gt(input.amount, 0),
            Ord.lte(input.amount, Num.sub(state.balance, state.reserved)),
          ),
        ),
      apply: ({ state, input }) => [
        Transition.set(state.balance, Num.add(state.balance, input.amount)),
      ],
    })

    const before = await Effect.runPromise(
      Tooling.makeIndex([Tooling.Definition.transition('Account.withdraw', withdraw)]),
    )
    const after = await Effect.runPromise(
      Tooling.makeIndex([Tooling.Definition.transition('Account.withdraw', withdrawAdd)]),
    )
    const diff = await Effect.runPromise(Tooling.semanticDiff(before, after))
    expect(diff.changed.map(c => c.id)).toEqual(['Account.withdraw'])
    expect(diff.unchanged).toEqual([])

    // Mermaid IDs do not collide for `a.b` vs `a-b` and escape quotes safely.
    const collisionIndex = await Effect.runPromise(
      Tooling.makeIndex([
        Tooling.Definition.expr('a.b', available),
        Tooling.Definition.expr('a-b', independent, { dependsOn: ['a.b'] }),
        Tooling.Definition.expr('quote"name', independent),
      ]),
    )
    const mermaid = await Effect.runPromise(collisionIndex.toMermaid())
    expect(mermaid).toContain('n0["a-b (expr)"]')
    expect(mermaid).toContain('n1["a.b (expr)"]')
    expect(mermaid).toContain('n0 --> n1')
    expect(mermaid).toContain('quote&quot;name')

    // Non-cycle entry pointing into a cycle should not receive MK002.
    const cycleIndex = await Effect.runPromise(
      Tooling.makeIndex([
        Tooling.Definition.expr('Entry', available, { dependsOn: ['Loop.a'] }),
        Tooling.Definition.expr('Loop.a', available, { dependsOn: ['Loop.b'] }),
        Tooling.Definition.expr('Loop.b', independent, { dependsOn: ['Loop.a'] }),
      ]),
    )
    const diags = await Effect.runPromise(cycleIndex.diagnostics())
    const cycleOwners = diags.filter(d => d.code === 'MK002').map(d => d.id)
    expect(cycleOwners).not.toContain('Entry')
    expect(cycleOwners).toEqual(['Loop.a', 'Loop.b'])
  })
})
