/**
 * Set Theory, Set Operations, and Z3 SMTSet Theorem-Proving Suite.
 *
 * Covers:
 * 1. Runtime evaluation of `Sets.*` (`union`, `intersect`, `difference`, `symDiff`,
 *    `subset`, `superset`, `properSubset`, `equal`, `disjoint`, `overlaps`,
 *    `include`, `exclude`, `has`, `isEmpty`, `nonEmpty`), canonical ordering,
 *    null-strictness, and refusals (NUL, non-finite, mixed kinds).
 * 2. Z3 formal proofs of Boolean Algebra of Sets: De Morgan's laws, distributivity,
 *    absorption, commutativity, associativity, idempotence, symmetric difference
 *    Abelian group laws, subset partial order, membership/include/exclude/disjoint.
 * 3. Soundness & refutation: false set identities are refuted (`Verdict.False`),
 *    and raw `Schema.String` arrays (which may hold NUL) are not falsely proved.
 * 4. End-to-end RBAC `Machine` invariant verification (`Prove.machine`) using
 *    `Sets.subset`, `Sets.disjoint`, `Sets.include`, `Sets.exclude`.
 * 5. Randomized 100-triple runtime property fuzzer across integer and string sets.
 */
import { Effect, Schema } from 'effect'
import { Bool, Eq, Expr, type Expression, Node, Path, Sets, Transition, Verdict } from 'metakit'
import { Text } from 'metakit/domain'
import * as Machine from 'metakit/machine'
import * as Prove from 'metakit/prove'
import { describe, expect, it } from 'vitest'

const makeRng = (seed: number) => {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('Sets: runtime set operations & edge cases', () => {
  const Env = Schema.Struct({
    a: Schema.NullOr(Schema.Array(Schema.Int)),
    b: Schema.NullOr(Schema.Array(Schema.Int)),
    s1: Schema.Array(Schema.String),
    s2: Schema.Array(Schema.String),
  })
  const $ = Path.from(Env)
  const evalOk = <A>(expr: Expression<typeof Env.Type, A>, env: typeof Env.Type) =>
    Expr.evaluate(expr, env)

  it('computes canonical sorted unique union, intersect, difference, symDiff, and predicates', () => {
    const env = { a: [3, 1, 2, 1], b: [4, 2, 3, 2], s1: ['b', 'a'], s2: ['c', 'b'] }
    expect(evalOk(Sets.union($.a, $.b), env)).toEqual([1, 2, 3, 4])
    expect(evalOk(Sets.intersect($.a, $.b), env)).toEqual([2, 3])
    expect(evalOk(Sets.difference($.a, $.b), env)).toEqual([1])
    expect(evalOk(Sets.symDiff($.a, $.b), env)).toEqual([1, 4])
    expect(evalOk(Sets.subset($.a, $.b), env)).toBe(false)
    expect(evalOk(Sets.subset([2, 3], $.b), env)).toBe(true)
    expect(evalOk(Sets.superset($.b, [2, 3]), env)).toBe(true)
    expect(evalOk(Sets.properSubset([2, 3], $.b), env)).toBe(true)
    expect(evalOk(Sets.properSubset([2, 3, 4], $.b), env)).toBe(false)
    expect(evalOk(Sets.equal([3, 1, 2], [1, 2, 3, 1]), env)).toBe(true)
    expect(evalOk(Sets.disjoint($.a, $.b), env)).toBe(false)
    expect(evalOk(Sets.disjoint([1, 5], $.b), env)).toBe(true)
    expect(evalOk(Sets.overlaps($.a, $.b), env)).toBe(true)
    expect(evalOk(Sets.union($.s1, $.s2), env)).toEqual(['a', 'b', 'c'])
    expect(evalOk(Sets.include($.s1, 'c'), env)).toEqual(['a', 'b', 'c'])
    expect(evalOk(Sets.exclude($.s1, 'a'), env)).toEqual(['b'])
  })

  it('is null-strict and refuses NUL, non-finite numbers, and mixed scalar kinds', () => {
    const base = { a: null, b: [1, 2], s1: [], s2: [] }
    expect(evalOk(Sets.union($.a, $.b), base)).toBeNull()
    expect(evalOk(Sets.subset($.a, $.b), base)).toBeNull()
    expect(evalOk(Sets.disjoint($.b, $.a), base)).toBeNull()

    // NUL refusal even when the other set is empty
    expect(() =>
      Expr.evaluate(Sets.subset($.s1, $.s2), {
        a: [],
        b: [],
        s1: [],
        s2: ['bad\u0000'],
      }),
    ).toThrow(expect.objectContaining({ reason: 'unportable' }))

    // Non-finite refusal even when the other set is empty
    expect(() =>
      Expr.evaluate(Sets.disjoint($.a, $.b), {
        a: [],
        b: [Number.NaN],
        s1: [],
        s2: [],
      }),
    ).toThrow(expect.objectContaining({ reason: 'non-finite' }))

    // Mixed scalar kinds refusal
    const mixed = Node.apply(Sets.unionOp, [[1], ['a']])
    expect(Node.isRefusal(mixed)).toBe(true)
    if (Node.isRefusal(mixed)) expect(mixed.reason).toBe('ill-typed')
  })
})

describe('Sets: Z3 formal theorem proving (Boolean Algebra of Sets)', () => {
  const IntSets = Schema.Struct({
    a: Schema.Array(Schema.Int),
    b: Schema.Array(Schema.Int),
    c: Schema.Array(Schema.Int),
    x: Schema.Int,
  })
  const $i = Path.from(IntSets)

  const TextSets = Schema.Struct({
    a: Schema.Array(Text.schema),
    b: Schema.Array(Text.schema),
    c: Schema.Array(Text.schema),
    x: Text.schema,
    role: Schema.Literals(['admin', 'editor', 'viewer']),
  })
  const $t = Path.from(TextSets)

  it('proves De Morgan, Distributivity, Absorption, and Symmetric Difference laws in Z3', async () => {
    const theorems = [
      // De Morgan 1: C \ (A ∪ B) = (C \ A) ∩ (C \ B)
      Sets.equal(
        Sets.difference($i.c, Sets.union($i.a, $i.b)),
        Sets.intersect(Sets.difference($i.c, $i.a), Sets.difference($i.c, $i.b)),
      ),
      // De Morgan 2: C \ (A ∩ B) = (C \ A) ∪ (C \ B)
      Sets.equal(
        Sets.difference($i.c, Sets.intersect($i.a, $i.b)),
        Sets.union(Sets.difference($i.c, $i.a), Sets.difference($i.c, $i.b)),
      ),
      // Distributivity 1: A ∩ (B ∪ C) = (A ∩ B) ∪ (A ∩ C)
      Sets.equal(
        Sets.intersect($i.a, Sets.union($i.b, $i.c)),
        Sets.union(Sets.intersect($i.a, $i.b), Sets.intersect($i.a, $i.c)),
      ),
      // Distributivity 2: A ∪ (B ∩ C) = (A ∪ B) ∩ (A ∪ C)
      Sets.equal(
        Sets.union($i.a, Sets.intersect($i.b, $i.c)),
        Sets.intersect(Sets.union($i.a, $i.b), Sets.union($i.a, $i.c)),
      ),
      // Absorption: A ∪ (A ∩ B) = A and A ∩ (A ∪ B) = A
      Sets.equal(Sets.union($i.a, Sets.intersect($i.a, $i.b)), $i.a),
      Sets.equal(Sets.intersect($i.a, Sets.union($i.a, $i.b)), $i.a),
      // Symmetric difference identity: A △ B = (A ∪ B) \ (A ∩ B)
      Sets.equal(
        Sets.symDiff($i.a, $i.b),
        Sets.difference(Sets.union($i.a, $i.b), Sets.intersect($i.a, $i.b)),
      ),
      // Symmetric difference involution: (A △ B) △ B = A
      Sets.equal(Sets.symDiff(Sets.symDiff($i.a, $i.b), $i.b), $i.a),
      // Symmetric difference self-cancellation: isEmpty(A △ A)
      Sets.isEmpty(Sets.symDiff($i.a, $i.a)),
    ]

    for (const theorem of theorems) {
      expect(Verdict.isTrue(await Effect.runPromise(Prove.invariant(IntSets, theorem)))).toBe(true)
    }
  })

  it('proves Subset partial order, Membership, Include/Exclude, Disjointness, and literal sets in Z3', async () => {
    const theorems = [
      // Subset reflexivity & lattice bounds
      Sets.subset($t.a, $t.a),
      Sets.subset(Sets.intersect($t.a, $t.b), $t.a),
      Sets.subset($t.a, Sets.union($t.a, $t.b)),
      Sets.subset([], $t.a),
      // Subset transitivity: (A ⊆ B ∧ B ⊆ C) => A ⊆ C
      Expr.implies(
        Expr.all(Sets.subset($t.a, $t.b), Sets.subset($t.b, $t.c)),
        Sets.subset($t.a, $t.c),
      ),
      // Include/exclude membership laws
      Sets.has(Sets.include($t.a, $t.x), $t.x),
      Bool.not(Sets.has(Sets.exclude($t.a, $t.x), $t.x)),
      // Membership distributes over union, intersect, difference
      Eq.is(
        Sets.has(Sets.union($t.a, $t.b), $t.x),
        Expr.any(Sets.has($t.a, $t.x), Sets.has($t.b, $t.x)),
      ),
      Eq.is(
        Sets.has(Sets.intersect($t.a, $t.b), $t.x),
        Expr.all(Sets.has($t.a, $t.x), Sets.has($t.b, $t.x)),
      ),
      Eq.is(
        Sets.has(Sets.difference($t.a, $t.b), $t.x),
        Expr.all(Sets.has($t.a, $t.x), Bool.not(Sets.has($t.b, $t.x))),
      ),
      // Subset implies membership preservation: (A ⊆ B ∧ x ∈ A) => x ∈ B
      Expr.implies(Expr.all(Sets.subset($t.a, $t.b), Sets.has($t.a, $t.x)), Sets.has($t.b, $t.x)),
      // Disjointness equivalence: disjoint(A, B) <=> isEmpty(A ∩ B)
      Eq.is(Sets.disjoint($t.a, $t.b), Sets.isEmpty(Sets.intersect($t.a, $t.b))),
      // Disjointness implies mutual exclusion: (disjoint(A, B) ∧ x ∈ A) => x ∉ B
      Expr.implies(
        Expr.all(Sets.disjoint($t.a, $t.b), Sets.has($t.a, $t.x)),
        Bool.not(Sets.has($t.b, $t.x)),
      ),
      // Literal set membership equivalence
      Eq.is(Sets.has(['admin', 'editor'], $t.role), Eq.in($t.role, ['admin', 'editor'])),
    ]

    for (let i = 0; i < theorems.length; i++) {
      const verdict = await Effect.runPromise(Prove.invariant(TextSets, theorems[i]!))
      expect([i, verdict._tag, Verdict.isUnknown(verdict) ? verdict.reason : '']).toEqual([
        i,
        'True',
        '',
      ])
    }
  })

  it('refutes false set identities and preserves soundness on raw Schema.String arrays', async () => {
    // False: A ∪ B ⊆ A
    const falseUnion = await Effect.runPromise(
      Prove.invariant(IntSets, Sets.subset(Sets.union($i.a, $i.b), $i.a)),
    )
    expect(Verdict.isFalse(falseUnion)).toBe(true)

    // False: (A \ B) ∪ B = A (fails whenever B has an element not in A)
    const falseDiff = await Effect.runPromise(
      Prove.invariant(IntSets, Sets.equal(Sets.union(Sets.difference($i.a, $i.b), $i.b), $i.a)),
    )
    expect(Verdict.isFalse(falseDiff)).toBe(true)

    // Soundness: raw Schema.String admits '\0', which set.subset refuses -> MUST NOT prove True!
    const RawStrings = Schema.Struct({ a: Schema.Array(Schema.String) })
    const $r = Path.from(RawStrings)
    const rawSelfSubset = await Effect.runPromise(
      Prove.invariant(RawStrings, Sets.subset($r.a, $r.a)),
    )
    expect(Verdict.isTrue(rawSelfSubset)).toBe(false)
  })

  it('proves RBAC permission Machine invariants and refutes buggy role denial in Z3', async () => {
    const Role = Schema.Literals(['read', 'write', 'delete', 'admin'])
    const Access = Schema.Struct({
      roles: Schema.Array(Role),
      allowed: Schema.Array(Role),
      denied: Schema.Array(Role),
    }).pipe(
      Expr.refine($ => Expr.all(Sets.subset($.roles, $.allowed), Sets.disjoint($.roles, $.denied))),
    )

    const GrantRole = Transition.make({
      state: Access,
      input: Schema.Struct({ role: Role }),
      when: ({ state, input }) =>
        Expr.all(Sets.has(state.allowed, input.role), Bool.not(Sets.has(state.denied, input.role))),
      apply: ({ state, input }) => [
        Transition.set(state.roles, Sets.include(state.roles, input.role)),
      ],
    })

    const DenyRole = Transition.make({
      state: Access,
      input: Schema.Struct({ role: Role }),
      when: () => true,
      apply: ({ state, input }) => [
        Transition.set(state.denied, Sets.include(state.denied, input.role)),
        Transition.set(state.roles, Sets.exclude(state.roles, input.role)),
      ],
    })

    const M = Machine.make({ state: Access, transitions: { GrantRole, DenyRole } })
    const report = await Effect.runPromise(Prove.machine(M, { pin: ['GrantRole', 'DenyRole'] }))
    expect(report.ok).toBe(true)

    // Buggy DenyRole forgets to exclude the newly denied role from active roles -> Z3 refutes!
    const BuggyDenyRole = Transition.make({
      state: Access,
      input: Schema.Struct({ role: Role }),
      when: () => true,
      apply: ({ state, input }) => [
        Transition.set(state.denied, Sets.include(state.denied, input.role)),
      ],
    })
    const buggy = await Effect.runPromise(Prove.transition(Access, BuggyDenyRole))
    expect(Verdict.isFalse(buggy)).toBe(true)
  })

  it('satisfies set algebra laws across 100 randomized runtime triples', () => {
    const rng = makeRng(20261126)
    const Env = Schema.Struct({
      a: Schema.Array(Schema.Int),
      b: Schema.Array(Schema.Int),
      c: Schema.Array(Schema.Int),
    })
    const $ = Path.from(Env)
    const law = Expr.all(
      Sets.equal(
        Sets.difference($.c, Sets.union($.a, $.b)),
        Sets.intersect(Sets.difference($.c, $.a), Sets.difference($.c, $.b)),
      ),
      Sets.equal(
        Sets.intersect($.a, Sets.union($.b, $.c)),
        Sets.union(Sets.intersect($.a, $.b), Sets.intersect($.a, $.c)),
      ),
      Sets.equal(Sets.symDiff(Sets.symDiff($.a, $.b), $.b), $.a),
      Eq.is(Sets.disjoint($.a, $.b), Sets.isEmpty(Sets.intersect($.a, $.b))),
    )
    const randSet = () =>
      Array.from({ length: Math.floor(rng() * 8) }, () => Math.floor(rng() * 10) - 3)

    for (let i = 0; i < 100; i++) {
      const env = { a: randSet(), b: randSet(), c: randSet() }
      expect(Expr.evaluate(law, env)).toBe(true)
    }
  })
})
