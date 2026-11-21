/**
 * The meanings step 4's differential test asked for, as every reader holds
 * them: `eq.among` of no candidate is false whatever the value; `eq.equals`
 * and `eq.among` refuse NaN; a refusal decides before null and is not
 * absorbed by `and`, `or`, `if` or `match`; partial evaluation folds a strict
 * call beside a known null where its Schemas say no other operand can be
 * refused; and `Text.schema`, text holding no NUL, over which a rule is
 * provable again.
 */
import { Effect, Option, Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  Abstract,
  Bool,
  Eq,
  Expr,
  Node,
  Num,
  Ord,
  Path,
  Str,
  Transition,
  Verdict,
  opProperties,
} from 'metakit'
import { call } from 'metakit/build'
import { Domain, Text } from 'metakit/domain'
import { checkProperties, coreOps } from 'metakit/conformance'
import * as Prove from 'metakit/prove'
import * as Sql from 'metakit/sql'

const Row = Schema.Struct({
  n: Schema.NullOr(Schema.Int),
  x: Schema.NullOr(Schema.Number),
  s: Schema.NullOr(Schema.String),
  t: Schema.NullOr(Schema.String),
  b: Schema.NullOr(Schema.Boolean),
})
type Row = typeof Row.Type
const $ = Path.forSchema(Row)
const at = (fields: Partial<Row>): Row => ({
  n: null,
  x: null,
  s: null,
  t: null,
  b: null,
  ...fields,
})

const answer = (expr: Expr.Expr<Row, unknown>, row: Row): unknown =>
  Result.match(Expr.evalResult(expr, row), {
    onSuccess: value => value,
    onFailure: refusal => `refused: ${refusal.reason}`,
  })

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect)

describe('eq.among of no candidate is false, whatever the value', () => {
  it('in evaluation, before a NUL or a NaN and after a refusal', () => {
    expect(answer(Eq.among($.n, []), at({}))).toBe(false)
    expect(answer(Eq.among($.s, []), at({ s: 'a\u0000' }))).toBe(false)
    expect(answer(Eq.among($.x, []), at({ x: NaN }))).toBe(false)
    expect(answer(Eq.among(Ord.gt($.x, 0), []), at({ x: NaN }))).toBe('refused: non-finite')
    expect(answer(Bool.not(Eq.among($.n, [])), at({}))).toBe(true)
  })

  it('in partial evaluation, over a value not known', () => {
    expect(Expr.residualize(Eq.among($.n, []), {}).node).toEqual(Node.Lit({ value: false }))
    // A value that may be refused is refused first.
    expect(Expr.residualize(Eq.among(Ord.gt($.x, 0), []), {}).node._tag).toBe('Call')
    expect(Expr.judge(Bool.not(Eq.among($.n, [])), {})._tag).toBe('True')
  })

  it('in the checker and the solver, over a value that may be null', async () => {
    const goal = Bool.not(Eq.among($.n, []))
    expect(Verdict.isTrue(Abstract.checkInvariant(Row, goal))).toBe(true)
    expect(Verdict.isTrue(await run(Prove.invariant(Row, goal)))).toBe(true)
  }, 30_000)

  it('in the solver, of a product the checker leaves undecided', async () => {
    const Maybe = Schema.Struct({
      k: Schema.NullOr(Schema.Int.check(Schema.isBetween({ minimum: -10, maximum: 10 }))),
    })
    const k = Path.forSchema(Maybe).k
    const goal = Bool.not(Eq.among(Num.mul(k, k), []))
    expect(Verdict.isTrue(Abstract.checkInvariant(Maybe, goal))).toBe(false)
    expect(Verdict.isTrue(await run(Prove.invariant(Maybe, goal)))).toBe(true)
  }, 30_000)

  it('so the checker takes nothing of a value it never read', () => {
    const State = Schema.Struct({ p: Schema.String, flag: Schema.NullOr(Schema.Boolean) })
    const write = Transition.make({
      state: State,
      input: Schema.Struct({}),
      apply: ({ state }) => [Transition.set(state.flag, Eq.among(state.p, []))],
    })
    const next = Path.forEnv({ next: State }).next
    // `p` may hold a NUL: among no candidate wrote false without reading it.
    expect(Verdict.isTrue(Abstract.checkGoal(State, write, { goal: Eq.is(next.p, next.p) }))).toBe(
      false,
    )
  })

  it.each(['postgres', 'sqlite'] as const)('as the false literal in %s', dialect => {
    const where = Result.getOrThrow(Sql.toWhere(Eq.among($.n, []), { dialect, rowPrefix: [] }))
    expect(where.text).toBe('FALSE')
  })
})

describe('eq.equals and eq.among refuse NaN', () => {
  it('beside null, as they refuse text holding a NUL', () => {
    expect(answer(Eq.equals($.x, $.n), at({ x: NaN }))).toBe('refused: non-finite')
    expect(answer(Eq.among($.n, [NaN]), at({}))).toBe('refused: non-finite')
    expect(answer(Eq.equals($.s, $.t), at({ t: 'a\u0000' }))).toBe('refused: unportable')
    expect(answer(Eq.equals($.x, 1), at({ x: 1 }))).toBe(true)
  })

  it('so the checker proves no equality over a number that may be NaN', () => {
    const Loose = Schema.Struct({ x: Schema.Number })
    const Finite = Schema.Struct({ x: Schema.Finite })
    const [loose, finite] = [Path.forSchema(Loose).x, Path.forSchema(Finite).x]
    expect(Verdict.isTrue(Abstract.checkInvariant(Loose, Eq.equals(loose, loose)))).toBe(false)
    expect(Verdict.isTrue(Abstract.checkInvariant(Finite, Eq.equals(finite, finite)))).toBe(true)
  })

  it.each(['postgres', 'sqlite'] as const)('and %s refuses to bind NaN', dialect => {
    for (const predicate of [Eq.equals($.x, NaN), Eq.among($.x, [NaN])]) {
      const where = Sql.toWhere(predicate, { dialect, rowPrefix: [] })
      expect(Result.isFailure(where) && where.failure.reason).toContain('non-finite')
    }
  })
})

describe('a refusal decides before null and is not absorbed', () => {
  const refused = Ord.gt($.x, 0)
  const nan = at({ x: NaN, b: false })

  it('by a strict operation beside a null operand', () => {
    expect(answer(Str.contains($.s, $.t), at({ s: 'x\u0000' }))).toBe('refused: unportable')
    expect(answer(Ord.lt($.x, $.n), at({ x: NaN }))).toBe('refused: non-finite')
  })

  it('by and, or, if and match', () => {
    expect(answer(Bool.and($.b, refused), nan)).toBe('refused: non-finite')
    expect(answer(Bool.or(Bool.not($.b), refused), nan)).toBe('refused: non-finite')
    expect(answer(Expr.when(refused, { then: 1, else: 2 }), nan)).toBe('refused: non-finite')
    const choice = (cond: Expr.Expr<Row, boolean | null>) =>
      Expr.when(cond, { then: 1, else: Num.add($.x, 1) })
    expect(answer(choice($.b), nan)).toBe('refused: non-finite')
    expect(answer(choice(Bool.not($.b)), nan)).toBe(1)
    expect(answer(Expr.matchOrElse(Expr.lit('a'), { a: Num.add($.x, 1) }, 0), nan)).toBe(
      'refused: non-finite',
    )
  })

  it('so partial evaluation drops an operand of and only where it cannot be refused', () => {
    const plain = Bool.and(Eq.equals($.n, 1), Str.contains($.s, 'a'))
    expect(Expr.residualize(plain, { n: 2 }).node._tag).toBe('Call')
    expect(Expr.residualize(Bool.and(Eq.equals($.n, 1), $.b), { n: 2 }).node).toEqual(
      Node.Lit({ value: false }),
    )
  })

  it('which the table says, and its generated check holds it to', () => {
    expect(opProperties['bool.and'].absorbing?.unlessRefused).toBe(true)
    expect(opProperties['bool.or'].absorbing?.unlessRefused).toBe(true)
    const context = { arity: 2, resolve: (id: Node.CoreOpId) => coreOps[id] }
    for (const id of ['bool.and', 'bool.or'] as const) {
      const declared = opProperties[id]
      expect(checkProperties(coreOps[id], declared, context).ok).toBe(true)
      const { value, result, side } = declared.absorbing!
      const overEvery = { ...declared, absorbing: { value, result, side } }
      expect(checkProperties(coreOps[id], overEvery, context).failures).toContainEqual(
        expect.objectContaining({
          property: 'absorbing',
          operands: expect.arrayContaining(['a refusal']),
        }),
      )
    }
  })

  it('so the checker and the solver take or over text that may hold a NUL as undecided', async () => {
    const Plain = Schema.Struct({ k: Schema.Int, s: Schema.String })
    const p = Path.forSchema(Plain)
    const goal = Bool.or(Eq.is(p.k, p.k), Str.contains(p.s, 'x'))
    const refusal = Expr.evalResult(goal, { k: 1, s: 'a\u0000' })
    expect(Result.isFailure(refusal) && refusal.failure.reason).toBe('unportable')
    expect(Verdict.isTrue(Abstract.checkInvariant(Plain, goal))).toBe(false)
    expect(Verdict.isTrue(await run(Prove.invariant(Plain, goal)))).toBe(false)
  }, 30_000)

  it('so the checker proves no or whose other side may be refused, nor NaN, nor past the safe range', () => {
    const Loose = Schema.Struct({ k: Schema.Int, x: Schema.Number })
    const l = Path.forSchema(Loose)
    const nanSide = Bool.or(Eq.is(l.k, l.k), Ord.gt(l.x, 0))
    expect(Result.isFailure(Expr.evalResult(nanSide, { k: 1, x: NaN }))).toBe(true)
    expect(Verdict.isTrue(Abstract.checkInvariant(Loose, nanSide))).toBe(false)
    // Where k > 0 fails, k + MAX <= MAX holds; where it holds, the sum is refused.
    const MAX = Number.MAX_SAFE_INTEGER
    const byCases = Bool.or(Ord.gt(l.k, 0), Ord.lte(Num.add(l.k, MAX), MAX))
    expect(Result.isFailure(Expr.evalResult(byCases, { k: 1, x: 0 }))).toBe(true)
    expect(Verdict.isTrue(Abstract.checkInvariant(Loose, byCases))).toBe(false)
  })

  it('so partial evaluation drops no operand an ill-typed call would refuse', () => {
    const Named = Schema.Struct({ k: Schema.Int, t: Text.schema })
    const n = Path.forSchema(Named)
    const illTyped = call<typeof Named.Type, boolean>(Ord.ltOp, [n.t, 1])
    const both = Bool.and(Eq.equals(n.k, 1), illTyped)
    expect(Result.isFailure(Expr.evalResult(both, { k: 2, t: 'a' }))).toBe(true)
    expect(Expr.residualize(both, { k: 2 }).node._tag).toBe('Call')
  })
})

describe('partial evaluation folds a strict call beside a known null by the Schemas', () => {
  it.each<readonly [string, Expr.Expr<Row, boolean | null>, Partial<Row>]>([
    ['an integer', Eq.equals($.n, $.n), {}],
    ['a boolean', Eq.equals($.b, Bool.not($.b)), {}],
    ['a literal', Ord.lt($.n, 3), {}],
  ])('beside %s', (_, expr, known) => {
    expect(Expr.residualize(expr, { ...known, n: null, b: null }).node).toEqual(
      Node.Lit({ value: null }),
    )
  })

  it('and keeps it beside text that may hold a NUL, or a number that may be NaN', () => {
    expect(Expr.residualize(Eq.equals($.s, $.t), { s: null }).node._tag).toBe('Call')
    expect(Expr.residualize(Eq.equals($.x, $.n), { n: null }).node._tag).toBe('Call')
  })
})

describe('Text.schema: text holding no NUL', () => {
  const Named = Schema.Struct({ k: Schema.Int, s: Schema.NullOr(Text.schema), t: Text.schema })
  const n = Path.forSchema(Named)
  const Plain = Schema.Struct({ k: Schema.Int, s: Schema.NullOr(Schema.String), t: Schema.String })
  const p = Path.forSchema(Plain)

  it('refuses a NUL where it is decoded, and keeps what it refines', () => {
    expect(Schema.decodeUnknownSync(Text.schema)('ab')).toBe('ab')
    expect(() => Schema.decodeUnknownSync(Text.schema)('a\u0000b')).toThrow()
    const Short = Schema.Struct({ t: Text.schema.check(Schema.isMaxLength(3)) })
    const short = Path.forSchema(Short).t
    expect(Verdict.isTrue(Abstract.checkInvariant(Short, Eq.is(short, short)))).toBe(true)
  })

  it('makes a rule over it provable to the checker, and leaves it Unknown over plain text', () => {
    expect(Verdict.isTrue(Abstract.checkInvariant(Named, Eq.is(n.t, n.t)))).toBe(true)
    expect(Verdict.isTrue(Abstract.checkInvariant(Plain, Eq.is(p.t, p.t)))).toBe(false)
    const search = Bool.or(Eq.is(n.k, n.k), Str.contains(n.t, 'x'))
    expect(Verdict.isTrue(Abstract.checkInvariant(Named, search))).toBe(true)
  })

  it('and to the solver, where the checker leaves a product undecided', async () => {
    const small = Schema.Int.check(Schema.isBetween({ minimum: -10, maximum: 10 }))
    const OfText = Schema.Struct({ k: small, t: Text.schema })
    const OfString = Schema.Struct({ k: small, t: Schema.String })
    const [a, b] = [Path.forSchema(OfText), Path.forSchema(OfString)]
    const ofText = Bool.or(Ord.gte(Num.mul(a.k, a.k), 0), Str.contains(a.t, 'x'))
    const ofString = Bool.or(Ord.gte(Num.mul(b.k, b.k), 0), Str.contains(b.t, 'x'))
    expect(Verdict.isTrue(Abstract.checkInvariant(OfText, ofText))).toBe(false)
    expect(Verdict.isTrue(await run(Prove.invariant(OfText, ofText)))).toBe(true)
    expect(Verdict.isTrue(await run(Prove.invariant(OfString, ofString)))).toBe(false)
  }, 30_000)

  it('lets partial evaluation fold beside a known null and drop an operand of and', () => {
    expect(Expr.residualize(Eq.equals(n.s, n.t), { s: null }).node).toEqual(
      Node.Lit({ value: null }),
    )
    expect(Expr.judge(Eq.equals(n.s, n.t), { s: null })._tag).toBe('False')
    expect(Expr.residualize(Eq.equals(p.s, p.t), { s: null }).node._tag).toBe('Call')
    const dropped = Bool.and(Eq.equals(n.k, 1), Str.contains(n.t, 'a'))
    expect(Expr.residualize(dropped, { k: 2 }).node).toEqual(Node.Lit({ value: false }))
  })

  it('carries the metakit/domain kind text, and an annotation alone does not make text NUL-free', () => {
    expect(Domain.domainOf(Text.schema)).toEqual(Option.some({ kind: 'text' }))
    const Claimed = Schema.Struct({
      t: Schema.String.annotate({ [Domain.DOMAIN_ANNOTATION_KEY]: { kind: 'text' } }),
    })
    const claimed = Path.forSchema(Claimed).t
    expect(Verdict.isTrue(Abstract.checkInvariant(Claimed, Eq.is(claimed, claimed)))).toBe(false)
  })
})
