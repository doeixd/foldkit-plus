/**
 * One check per declared property, generated from `opProperties` and run
 * against the evaluator over the values that trip readers up: null, a
 * refusal, NaN and the infinities, zero, the ends of the safe range, a
 * fraction, the empty text, an astral character, a lone surrogate and a NUL.
 * A property whose check fails must not be declared.
 */
import { Equal } from 'effect'
import * as Node from './node.js'
import type { Domain, OpProperties, Side } from './properties.js'

const MAX = Number.MAX_SAFE_INTEGER

const refused = new Node.Refusal({
  reason: 'unsafe-integer',
  at: 'sample',
  detail: 'an operand that was refused',
})

const numbers: ReadonlyArray<number> = [0, 1, -3, 0.5, -2.25, MAX, -MAX, 1e200]
const notFinite: ReadonlyArray<number> = [NaN, Infinity, -Infinity]
const booleans: ReadonlyArray<boolean> = [true, false]
const texts: ReadonlyArray<string> = ['', 'ab', 'AB', ' a\t\n', '🚀x', '\uD83D', 'a\u0000b']

/** Every value evaluation can meet, as an operand. */
const awkward: ReadonlyArray<unknown> = [
  ...numbers,
  ...notFinite,
  ...booleans,
  ...texts,
  null,
  refused,
]

/**
 * The values of an operation's result kind (a finite number, not NaN), null,
 * or a refusal; any value for one that gives an operand back.
 */
const ofKind = (op: Node.Op): ReadonlyArray<unknown> => {
  const values: Readonly<Record<Node.Op['returns'], ReadonlyArray<unknown>>> = {
    number: numbers,
    boolean: booleans,
    text: texts,
    operand: [...numbers, ...notFinite, ...booleans, ...texts],
  }
  return [...values[op.returns], null, refused]
}

/** The values of `values` in `domain`: over the integers, the safe integers, null and a refusal. */
const within = (domain: Domain, values: ReadonlyArray<unknown>): ReadonlyArray<unknown> =>
  domain === 'all'
    ? values
    : values.filter(value => typeof value !== 'number' || Number.isSafeInteger(value))

const holdsNul = (value: unknown): boolean => typeof value === 'string' && value.includes('\u0000')

/** Two answers that are one: equal values, or refusals for one reason. */
export const sameAnswer = (left: unknown, right: unknown): boolean =>
  Node.isRefusal(left) || Node.isRefusal(right)
    ? Node.isRefusal(left) && Node.isRefusal(right) && left.reason === right.reason
    : Object.is(left, right) || (left === 0 && right === 0) || Equal.equals(left, right)

const label = (value: unknown): string => {
  if (Node.isRefusal(value)) return 'a refusal'
  if (typeof value === 'number') return Object.is(value, -0) ? '-0' : String(value)
  return JSON.stringify(value) ?? String(value)
}

export interface PropertyFailure {
  readonly property: keyof OpProperties
  readonly operands: ReadonlyArray<string>
  readonly claim: string
}

export interface PropertyReport {
  readonly op: string
  readonly ok: boolean
  readonly checked: number
  readonly failures: ReadonlyArray<PropertyFailure>
}

const pairs = <A>(values: ReadonlyArray<A>): ReadonlyArray<readonly [A, A]> =>
  values.flatMap(a => values.map(b => [a, b] as const))

/** The arguments with `value` on `side` and `x` on the other. */
const placed = (side: Side, x: unknown, value: unknown): ReadonlyArray<ReadonlyArray<unknown>> => {
  const left = [value, x]
  const right = [x, value]
  return side === 'both' ? [left, right] : side === 'left' ? [left] : [right]
}

/**
 * Check each property `properties` declares of `op` against `op`'s evaluator.
 * `opProperties[op.id]` is the table's declaration; a test passes another to
 * show that a false one is caught.
 */
export const checkProperties = (
  op: Node.Op,
  properties: OpProperties,
  context: {
    /** How many arguments `op` takes. */
    readonly arity: number
    /** The descriptor of an operation a property names (`invertible`'s inverse). */
    readonly resolve: (id: Node.CoreOpId) => Node.Op
  },
): PropertyReport => {
  const { arity, resolve } = context
  const failures: Array<PropertyFailure> = []
  let checked = 0
  const run = (args: ReadonlyArray<unknown>): unknown => Node.apply(op, args)
  const expect = (
    property: keyof OpProperties,
    operands: ReadonlyArray<unknown>,
    holds: boolean,
    claim: string,
  ): void => {
    checked++
    if (!holds) failures.push({ property, operands: operands.map(label), claim })
  }

  const { identity, absorbing, invertible, monotone, reflexive, associative } = properties
  if (identity !== undefined) {
    for (const x of ofKind(op)) {
      for (const args of placed(identity.side, x, identity.value)) {
        expect('identity', args, sameAnswer(run(args), x), `gives ${label(x)}`)
      }
    }
  }
  if (absorbing !== undefined) {
    for (const x of awkward) {
      for (const args of placed(absorbing.side, x, absorbing.value)) {
        expect('absorbing', args, sameAnswer(run(args), absorbing.result), 'gives its result')
      }
    }
  }
  if (properties.idempotent === true) {
    for (const x of arity === 1 ? awkward : ofKind(op)) {
      const once = run([x])
      const twice = arity === 1 ? run([once]) : run([x, x])
      expect('idempotent', [x], sameAnswer(twice, arity === 1 ? once : x), 'twice is once')
    }
  }
  if (properties.involution === true) {
    for (const x of ofKind(op)) {
      expect('involution', [x], sameAnswer(run([run([x])]), x), 'undoes itself')
    }
  }
  if (reflexive !== undefined) {
    for (const x of awkward.filter(value => !Node.isRefusal(value) && !holdsNul(value))) {
      expect('reflexive', [x, x], sameAnswer(run([x, x]), reflexive.value), 'of one read')
    }
  }
  if (properties.commutative === true) {
    for (const [x, y] of pairs(awkward)) {
      expect('commutative', [x, y], sameAnswer(run([x, y]), run([y, x])), 'in either order')
    }
  }
  if (associative !== undefined) {
    // An ill-typed operand's refusal names whichever operand was met first.
    const values = within(associative.over, ofKind(op))
    for (const [x, y] of pairs(values)) {
      for (const z of values) {
        const leftFirst = run([run([x, y]), z])
        const rightFirst = run([x, run([y, z])])
        const skip =
          associative.unlessRefused && (Node.isRefusal(leftFirst) || Node.isRefusal(rightFirst))
        if (!skip) {
          expect('associative', [x, y, z], sameAnswer(leftFirst, rightFirst), 'in either grouping')
        }
      }
    }
  }
  if (invertible !== undefined) {
    const inverse = resolve(invertible.inverse)
    for (const [x, y] of pairs(within(invertible.over, ofKind(op)))) {
      const result = run([x, y])
      if (result === null || Node.isRefusal(result)) continue
      expect('invertible', [x, y], sameAnswer(Node.apply(inverse, [result, y]), x), 'is undone')
    }
  }
  if (monotone !== undefined) {
    monotone.forEach((direction, index) => {
      const others = arity === 1 ? [0] : numbers
      for (const [low, high] of pairs(numbers).filter(([a, b]) => a < b)) {
        for (const other of others) {
          const at = (value: number): ReadonlyArray<unknown> =>
            arity === 1 ? [value] : index === 0 ? [value, other] : [other, value]
          const [a, b] = [run(at(low)), run(at(high))]
          // A refused result has no value to order.
          if (typeof a !== 'number' || typeof b !== 'number') continue
          expect(
            'monotone',
            at(low),
            direction === 'up' ? a <= b : a >= b,
            `${direction} in argument ${index}, against ${label(high)}`,
          )
        }
      }
    })
  }
  return { op: op.id, ok: failures.length === 0, checked, failures }
}
