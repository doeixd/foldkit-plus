/**
 * One check per property a fold declares in `foldProperties`, run against
 * the evaluator over lists of awkward elements: a value that is null, a
 * refusal, a fraction or an end of the safe range, and a test that is true,
 * false, null or refused. A property whose check fails must not be declared.
 */
import { Option } from 'effect'
import * as Node from './node.js'
import { andOp, orOp } from './ops/bool.js'
import { evalNode } from './ops/eval.js'
import { addOp, subOp } from './ops/num.js'
import { loadRows } from './ops/rowsLoad.js'
import { opProperties, type Domain, type FoldProperties } from './properties.js'
import { sameAnswer, type PropertyFailure, type PropertyReport } from './propertyChecks.js'

/** The descriptors of the operations a fold takes its properties from, and their inverses. */
const operations: Partial<Record<Node.CoreOpId, Node.Op>> = {
  'num.add': addOp,
  'num.sub': subOp,
  'bool.or': orOp,
  'bool.and': andOp,
}

const MAX = Number.MAX_SAFE_INTEGER

const refused = new Node.Refusal({ reason: 'ill-typed', at: 'sample', detail: 'a refused answer' })

interface Element {
  readonly v: unknown
  readonly t: unknown
}

const values: ReadonlyArray<unknown> = [0, 1, -3, 0.5, MAX, -MAX, null, refused]
const tests: ReadonlyArray<unknown> = [true, false, null, refused]
const pool: ReadonlyArray<Element> = values.flatMap(v => tests.map(t => ({ v, t })))

/** mulberry32: the lists are the same on every run. */
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** Every list of up to two elements of the pool, and seeded ones of three and four. */
const lists: ReadonlyArray<ReadonlyArray<Element>> = (() => {
  const random = seeded(377)
  const pick = (): Element => pool[Math.floor(random() * pool.length)]!
  return [
    [],
    ...pool.map(element => [element]),
    ...pool.flatMap(a => pool.map(b => [a, b])),
    ...Array.from({ length: 400 }, (_, index) => Array.from({ length: 3 + (index % 2) }, pick)),
  ]
})()

const within = (domain: Domain, list: ReadonlyArray<Element>): boolean =>
  domain === 'all' || list.every(({ v }) => typeof v !== 'number' || Number.isSafeInteger(v))

const each = (field: keyof Element): Node.Node =>
  Node.Path({ segments: [Node.EACH, field], ast: Option.none() })

/** The fold asked of a list: a test for `any`, `every` and `count`, a value for the numeric folds. */
const asked = (fold: Node.RowsFold): Node.Rows => {
  loadRows()
  return Node.Rows({
    fold,
    over: Node.RowsOver.List({ list: Node.Path({ segments: ['list'], ast: Option.none() }) }),
    where:
      fold === 'any' || fold === 'every' || fold === 'count'
        ? Option.some(each('t'))
        : Option.none(),
    value: Option.some(each('v')),
    set: [],
  })
}

const label = (list: ReadonlyArray<Element>): ReadonlyArray<string> =>
  list.map(
    ({ v, t }) =>
      `{ v: ${Node.isRefusal(v) ? 'refused' : String(v)}, t: ${Node.isRefusal(t) ? 'refused' : String(t)} }`,
  )

/** The order of two answers, false before true; none where either has no place in it. */
const order = (a: unknown, b: unknown): Option.Option<number> => {
  const rank = (value: unknown): Option.Option<number> => {
    if (typeof value === 'boolean') return Option.some(value ? 1 : 0)
    return typeof value === 'number' ? Option.some(value) : Option.none()
  }
  return Option.flatMap(rank(a), x => Option.map(rank(b), y => Math.sign(x - y)))
}

/**
 * Check each property `properties` declares of `fold` against the evaluator.
 * `foldProperties[fold]` is the table's declaration; a test passes another
 * to show that a false one is caught.
 */
export const checkFoldProperties = (
  fold: Node.RowsFold,
  properties: FoldProperties,
): PropertyReport => {
  const node = asked(fold)
  const run = (list: ReadonlyArray<Element>): unknown => evalNode(node, { list })
  const failures: Array<PropertyFailure> = []
  let checked = 0
  const expect = (
    property: PropertyFailure['property'],
    list: ReadonlyArray<Element>,
    holds: boolean,
    claim: string,
  ): void => {
    checked++
    if (!holds) failures.push({ property, operands: label(list), claim })
  }
  // The operation a total combines its parts by, and the one that undoes it.
  const combined = Option.flatMap(Option.fromUndefinedOr(properties.from), id =>
    Option.fromUndefinedOr(operations[id]),
  )
  const undone = Option.flatMap(Option.fromUndefinedOr(properties.from), id =>
    Option.flatMap(Option.fromUndefinedOr(opProperties[id].invertible), ({ inverse }) =>
      Option.fromUndefinedOr(operations[inverse]),
    ),
  )
  const { identity, absorbing, commutative, associative, invertible, monotone } = properties
  if (identity !== undefined)
    expect('identity', [], sameAnswer(run([]), identity.value), 'over none')
  for (const list of lists) {
    const answer = run(list)
    if (
      absorbing !== undefined &&
      list.some(({ t }) => (t === true) === absorbing.value && !Node.isRefusal(t))
    ) {
      expect('absorbing', list, sameAnswer(answer, absorbing.result), 'one element decides it')
    }
    if (commutative !== undefined && within(commutative.over, list)) {
      expect('commutative', list, sameAnswer(answer, run([...list].reverse())), 'in reverse')
      expect(
        'commutative',
        list,
        sameAnswer(answer, run([...list.slice(1), ...list.slice(0, 1)])),
        'rotated',
      )
    }
    if (monotone !== undefined) {
      for (const added of pool) {
        const sign = order(answer, run([...list, added]))
        if (Option.isSome(sign)) {
          const holds = monotone === 'up' ? sign.value <= 0 : sign.value >= 0
          expect('monotone', [...list, added], holds, `${monotone} in the rows`)
        }
      }
    }
    if (list.length < 2) continue
    const [left, right] = [list.slice(0, 1), list.slice(1)]
    if (associative !== undefined && within(associative.over, list)) {
      const joined = Option.map(combined, op => Node.apply(op, [run(left), run(right)]))
      const skip =
        associative.unlessRefused &&
        [answer, Option.getOrNull(joined)].some(value => Node.isRefusal(value))
      if (!skip) {
        expect(
          'associative',
          list,
          Option.exists(joined, value => sameAnswer(answer, value)),
          'of two parts joined',
        )
      }
    }
    if (invertible !== undefined && within(invertible.over, list)) {
      const [contribution, before] = [run(right), run(left)]
      if ([answer, contribution, before].every(value => typeof value === 'number')) {
        const back = Option.map(undone, op => Node.apply(op, [answer, contribution]))
        expect(
          'invertible',
          list,
          Option.exists(back, value => sameAnswer(value, before)),
          'is taken back out',
        )
      }
    }
  }
  return { op: `rows.${fold}`, ok: failures.length === 0, checked, failures }
}
