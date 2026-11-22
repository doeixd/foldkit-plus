/**
 * An `any` or `every` (an exists) that cannot be refused: over a list, or a
 * row's related rows, whose test reads only what cannot be refused. Partial
 * evaluation and the judge then drop it beside an `or` its other side settles,
 * as they drop any operand that cannot be refused; every other fold, and a
 * test that may be refused, keep it. The seeded check runs every exists said
 * not to refuse over environments its Schemas admit.
 */
import { Option, Schema } from 'effect'
import { Arr, Bool, Eq, Expr, Node, Ord, Path, Str, Verdict } from 'metakit'
import { describe, expect, it } from 'vitest'
import * as Text from '../src/domain/text.js'
import { evalNode } from '../src/ops/eval.js'
import { cannotRefuse } from '../src/ops/kind.js'

const Item = Schema.Struct({
  x: Schema.Int,
  f: Schema.Number,
  s: Text.schema,
  t: Schema.String,
  b: Schema.Boolean,
  k: Schema.Literals(['a', 'b']),
})
const Row = Schema.Struct({ n: Schema.Int, list: Schema.Array(Item) })
const State = Schema.Struct({ row: Row })
const $ = Path.from(State)

const each = (key: keyof typeof Item.fields): Node.Node =>
  Node.Path({ segments: [Node.EACH, key], ast: Option.some(Item.fields[key].ast) })
const lit = (value: unknown): Node.Node => Node.Lit({ value })
const call = (op: Node.AnyOp, ...args: ReadonlyArray<Node.Node>): Node.Node =>
  Node.Call({ op, args })
const list = Node.Path({ segments: ['row', 'list'], ast: Option.some(Row.fields.list.ast) })
const overList = Node.RowsOver.List({ list })
const related = Node.RowsOver.Related({
  of: Node.Path({ segments: ['row'], ast: Option.none() }),
  relation: 'rel',
})
const rows = (fold: Node.RowsFold, over: Node.RowsOver, where?: Node.Node): Node.Node =>
  Node.Rows({ fold, over, where: Option.fromUndefinedOr(where), value: Option.none(), set: [] })

describe('an exists', () => {
  const unrefused = call(
    Bool.andOp,
    call(Ord.gtOp, each('x'), lit(0)),
    call(Eq.equalsOp, each('k'), lit('a')),
  )

  it.each([
    ['any over a list whose Schema holds only lists', rows('any', overList, unrefused)],
    ['every over a list', rows('every', overList, call(Str.containsOp, each('s'), lit('a')))],
    ['any over a row’s related rows, with no test', rows('any', related)],
    ['any over a literal list', rows('any', Node.RowsOver.List({ list: lit([]) }), each('b'))],
  ])('cannot be refused: %s', (_, node) => {
    expect(cannotRefuse(node)).toBe(true)
  })

  it.each([
    [
      'a test over a number that may be NaN',
      rows('any', overList, call(Ord.gtOp, each('f'), lit(0))),
    ],
    [
      'a test over text that may hold a NUL',
      rows('any', overList, call(Eq.equalsOp, each('t'), lit('a'))),
    ],
    ['a count, whose fold refuses what any absorbs', rows('count', overList, unrefused)],
    [
      'a list read with no Schema',
      rows(
        'any',
        Node.RowsOver.List({ list: Node.Path({ segments: ['row', 'list'], ast: Option.none() }) }),
        unrefused,
      ),
    ],
    [
      'a literal source that is no list',
      rows('any', Node.RowsOver.List({ list: lit('a') }), unrefused),
    ],
    [
      'a related source that is no read',
      rows('any', Node.RowsOver.Related({ of: lit(1), relation: 'rel' })),
    ],
  ])('may be refused: %s', (_, node) => {
    expect(cannotRefuse(node)).toBe(false)
  })

  it('is dropped beside an or its other side settles, where it cannot be refused', () => {
    const settled = Bool.or(
      Ord.gt($.row.n, 0),
      Arr.any($.row.list, item => Ord.gt(item.x, 0)),
    )
    expect(Expr.judge(settled, { row: { n: 1 } })._tag).toBe('True')
    expect(
      Expr.judge(
        Bool.and(
          Ord.lt($.row.n, 0),
          Arr.any($.row.list, item => item.b),
        ),
        { row: { n: 1 } },
      )._tag,
    ).toBe('False')
    // Over a number that may be NaN its test may be refused, which the or does not absorb.
    const open = Bool.or(
      Ord.gt($.row.n, 0),
      Arr.any($.row.list, item => Ord.gt(item.f, 0)),
    )
    expect(Expr.judge(open, { row: { n: 1 } })._tag).toBe('Unknown')
    expect(
      Verdict.isTrue(
        Expr.judge(open, {
          row: { n: 1, list: [{ x: 0, f: NaN, s: '', t: '', b: true, k: 'a' }] },
        }),
      ),
    ).toBe(false)
  })
})

/** mulberry32: a small seeded generator, so a failing exists can be built again. */
const random = (seed: number) => {
  let state = seed >>> 0
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const pick = <A>(items: ReadonlyArray<A>): A => items[Math.floor(next() * items.length)]!
  return { next, pick }
}
type Random = ReturnType<typeof random>

const input = (key: 'v' | 'w'): Node.Node =>
  Node.Path({
    segments: ['input', key],
    ast: Option.some(key === 'v' ? Schema.String.ast : Text.schema.ast),
  })

const test = (r: Random, depth: number): Node.Node => {
  if (depth === 0 || r.next() < 0.4) {
    return r.pick<() => Node.Node>([
      () => call(Ord.gtOp, each('x'), lit(r.pick([0, 1, -1]))),
      () => call(Ord.gtOp, each('f'), lit(0)),
      () => call(Eq.equalsOp, each('k'), lit(r.pick(['a', 'b']))),
      () => call(Eq.isOp, each('s'), lit('a')),
      () => call(Str.containsOp, each('s'), lit('a')),
      () => call(Str.containsOp, each('t'), lit('a')),
      () => each('b'),
      () => call(Eq.equalsOp, each('s'), input('w')),
      () => call(Eq.isOp, each('t'), input('v')),
    ])()
  }
  const [a, b] = [test(r, depth - 1), test(r, depth - 1)]
  return r.pick<() => Node.Node>([
    () => call(Bool.notOp, a),
    () => call(Bool.andOp, a, b),
    () => call(Bool.orOp, a, b),
  ])()
}

const item = (r: Random) => ({
  x: r.pick([0, 1, -1, 7]),
  f: r.pick([0, 1.5, -2, NaN, Infinity]),
  s: r.pick(['', 'a', 'ab', 'B']),
  t: r.pick(['', 'a', 'a\u0000', 'B']),
  b: r.pick([true, false]),
  k: r.pick(['a', 'b'] as const),
})

/** A full environment the Schemas admit, its related rows held as `{ rows, whole }` or not at all. */
const environment = (r: Random) => {
  const items = Array.from({ length: Math.floor(r.next() * 4) }, () => item(r))
  return {
    row: {
      n: 1,
      list: items,
      ...(r.next() < 0.8 ? { [Node.relatedSegment('rel')]: { rows: items, whole: true } } : {}),
    },
    input: { v: r.pick(['', 'a', 'a\u0000']), w: r.pick(['', 'a']) },
  }
}

describe('an exists said not to refuse', () => {
  it('evaluates to a truth value or null in every environment tried', () => {
    const r = random(11)
    let unrefused = 0
    let refusedElsewhere = 0
    for (let at = 0; at < 1500; at++) {
      const node = rows(r.pick(['any', 'every'] as const), r.pick([overList, related]), test(r, 2))
      const envs = Array.from({ length: 40 }, () => environment(r))
      const refused = envs.filter(env => Node.isRefusal(evalNode(node, env)))
      if (!cannotRefuse(node)) {
        if (refused.length > 0) refusedElsewhere++
        continue
      }
      unrefused++
      expect(refused, `${Node.key(node)} said not to refuse`).toEqual([])
    }
    // The generator makes both kinds: those it clears, and refusals among the rest.
    expect(unrefused).toBeGreaterThan(150)
    expect(refusedElsewhere).toBeGreaterThan(150)
  })
})
