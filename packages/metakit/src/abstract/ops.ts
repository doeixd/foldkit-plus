import { Option } from 'effect'
import * as Node from '../node.js'
import * as Arr from '../ops/arr.js'
import * as Bool from '../ops/bool.js'
import * as Eq from '../ops/eq.js'
import * as Str from '../ops/str.js'
import { opProperties } from '../properties.js'
import * as Verdict from '../verdict.js'
import * as Interval from './interval.js'
import type { AbstractState } from './state.js'
import { isRead, negated, proved, refuted } from './support.js'
import { ZERO } from './zone.js'

const not = (node: Node.Node): Node.Node => Node.Call({ op: Bool.notOp, args: [node] })

/**
 * A numeric operator's row: how its result is bounded, and whether its
 * evaluator may refuse the result.
 */
export interface TermOp {
  readonly _tag: 'Term'
  /** What every result lies in, whatever the operands. */
  readonly range: Interval.Interval
  /** The result's interval from the operands'. */
  readonly forward: (args: ReadonlyArray<Interval.Interval>) => Interval.Interval
  /** Whether the result is an integer, given which operands are. */
  readonly integral: (args: ReadonlyArray<boolean>) => boolean
  /** Whether the evaluator refuses a result outside the safe range. */
  readonly refuses: boolean
  /** The difference constraints an integer result has with its operands. */
  readonly relation: 'add' | 'sub' | 'none'
  /** Whether the evaluator refuses an operand that is text holding a NUL. */
  readonly unportable: boolean
}

/** A boolean operator's row: how it is decided, and what its truth and its falsity say. */
export interface PredicateOp {
  readonly _tag: 'Predicate'
  /** Null only where an operand is refused: `eq.*` and `null.isNull`. */
  readonly neverNull: boolean
  /** The numeric terms the row reasons with besides its operands (`str.len(x)` for a search in `x`). */
  readonly measures: (args: ReadonlyArray<Node.Node>) => ReadonlyArray<Node.Node>
  /** The verdict on the call's value. */
  readonly decide: (args: ReadonlyArray<Node.Node>, state: AbstractState) => Verdict.Verdict<never>
  /** Record that the call evaluates to true. */
  readonly assume: (args: ReadonlyArray<Node.Node>, state: AbstractState) => void
  /** Record that the call evaluates to false. */
  readonly refute: (args: ReadonlyArray<Node.Node>, state: AbstractState) => void
  /** Whether the evaluator refuses an operand that is text holding a NUL. */
  readonly unportable: boolean
}

export type AbstractOp = TermOp | PredicateOp

const arithmetic = (relation: TermOp['relation'], forward: TermOp['forward']): TermOp => ({
  _tag: 'Term',
  range: Interval.top,
  forward,
  integral: args => args.every(Boolean),
  refuses: true,
  relation,
  unportable: false,
})

/**
 * The interval of an operation the table declares monotone, from its ends;
 * an operation declared nothing of is bounded by nothing.
 */
const monotone = (
  id: Node.CoreOpId,
  at: (ends: ReadonlyArray<number>, toward: -1 | 1) => number,
): TermOp['forward'] => {
  const directions = opProperties[id].monotone
  return directions === undefined ? () => Interval.top : Interval.monotone(directions, at)
}

/** A count: an integer that is never negative and never refused. */
const measure: TermOp = {
  _tag: 'Term',
  range: Interval.between(0, Infinity),
  forward: () => Interval.between(0, Infinity),
  integral: () => true,
  refuses: false,
  relation: 'none',
  unportable: false,
}

/** A length of text: a count, refused for text holding a NUL. */
const length: TermOp = { ...measure, unportable: true }

const none = (): ReadonlyArray<Node.Node> => []

const comparison = (
  /** The operands as `lesser`, `greater` of the `<=` or `<` the row is. */
  order: (args: ReadonlyArray<Node.Node>) => readonly [Node.Node, Node.Node],
  strict: boolean,
): PredicateOp => ({
  _tag: 'Predicate',
  unportable: false,
  neverNull: false,
  measures: none,
  decide: (args, state) => state.entailsLeq(...order(args), strict),
  assume: (args, state) => state.assumeLeq(...order(args), strict),
  // Over operands with values, not `a < b` is `b <= a`.
  refute: (args, state) => {
    const [lesser, greater] = order(args)
    state.assumeLeq(greater, lesser, !strict)
  },
})

const ascending = (args: ReadonlyArray<Node.Node>) => [args[0]!, args[1]!] as const
const descending = (args: ReadonlyArray<Node.Node>) => [args[1]!, args[0]!] as const

/** The operand that is not a literal, with the literal it is compared to. */
const termAndLiteral = (
  args: ReadonlyArray<Node.Node>,
): Option.Option<readonly [term: Node.Node, literal: unknown]> => {
  const [a, b] = [args[0]!, args[1]!]
  if (Node.$is('Lit')(b) && !Node.$is('Lit')(a)) return Option.some([a, b.value ?? null])
  if (Node.$is('Lit')(a) && !Node.$is('Lit')(b)) return Option.some([b, a.value ?? null])
  return Option.none()
}

const decideEqual = (
  args: ReadonlyArray<Node.Node>,
  state: AbstractState,
): Verdict.Verdict<never> => {
  const [a, b] = [args[0]!, args[1]!]
  const settled = (node: Node.Node): boolean => isRead(node) || state.hasValue(node)
  if (Node.key(a) === Node.key(b) && settled(a)) return proved('concrete')
  const compared = termAndLiteral(args)
  if (Option.isSome(compared)) {
    const [term, literal] = compared.value
    const isNull = Node.$is('Path')(term) ? state.nullFacts.get(Node.key(term)) : undefined
    if (literal === null) {
      if (isNull === true) return proved('zone')
      return isNull === false || state.hasValue(term)
        ? refuted()
        : Verdict.Unknown('nullability unknown')
    }
    if (isNull === true) return refuted()
    if (Node.$is('Path')(term)) {
      const pk = Node.key(term)
      if (state.eqFacts.has(pk)) {
        return state.eqFacts.get(pk) === literal ? proved('zone') : refuted()
      }
      if (state.neqFacts.get(pk)?.has(literal) === true) return refuted()
    }
  }
  // Two numbers with values are equal or apart by their intervals; a null on either side is not.
  if (!state.hasValue(a) || !state.hasValue(b)) return Verdict.Unknown('an operand may be null')
  return Interval.is(state.evalInterval(a), state.evalInterval(b))
}

const assumeEqual = (args: ReadonlyArray<Node.Node>, state: AbstractState): void => {
  const [a, b] = [args[0]!, args[1]!]
  const compared = termAndLiteral(args)
  if (Option.isNone(compared)) {
    // Null equals null, so equality says two terms have values only where one is known to.
    if (!state.hasValue(a) && !state.hasValue(b)) return
    state.markValued(a)
    state.markValued(b)
    const av = state.varOf(a)
    const bv = state.varOf(b)
    if (Option.isSome(av) && Option.isSome(bv)) state.zone.constrainEq(av.value, bv.value, 0)
    return
  }
  const [term, literal] = compared.value
  if (literal === null) {
    if (state.hasValue(term)) state.markBottom()
    else if (Node.$is('Path')(term)) state.nullFacts.set(Node.key(term), true)
    return
  }
  state.markValued(term)
  const id = state.varOf(term)
  if (typeof literal === 'number' && Option.isSome(id)) {
    state.zone.constrainEq(id.value, ZERO, literal)
  } else if (Node.$is('Path')(term)) {
    const pk = Node.key(term)
    if (state.eqFacts.has(pk) && state.eqFacts.get(pk) !== literal) state.markBottom()
    else state.eqFacts.set(pk, literal)
  }
}

const assumeUnequal = (args: ReadonlyArray<Node.Node>, state: AbstractState): void => {
  const compared = termAndLiteral(args)
  if (Option.isNone(compared)) return
  const [term, literal] = compared.value
  if (literal === null) {
    state.markNotNull(term)
    return
  }
  if (!Node.$is('Path')(term)) return
  const pk = Node.key(term)
  if (state.eqFacts.get(pk) === literal) state.markBottom()
  const excluded = state.neqFacts.get(pk) ?? new Set()
  excluded.add(literal)
  state.neqFacts.set(pk, excluded)
}

const lengthOf = (text: Node.Node): Node.Node => Node.Call({ op: Str.lenOp, args: [text] })
const countOf = (items: Node.Node): Node.Node => Node.Call({ op: Arr.countOp, args: [items] })

/** `str.startsWith` or `str.contains`: the text is at least as long as the part it holds. */
const search = (op: Node.Op): PredicateOp => ({
  _tag: 'Predicate',
  unportable: true,
  neverNull: false,
  measures: args => [lengthOf(args[0]!)],
  decide: args => {
    const [text, part] = [args[0]!, args[1]!]
    // The operands have values, so the text is a string and holds the empty one.
    if (Node.$is('Lit')(part) && part.value === '') return proved('concrete')
    if (Node.$is('Lit')(text) && Node.$is('Lit')(part)) {
      const value = Node.apply(op, [text.value, part.value])
      if (value === true) return proved('concrete')
      if (value === false) return refuted()
    }
    return Verdict.Unknown(`${op.id} unknown`)
  },
  assume: (args, state) => {
    const part = args[1]!
    const length = state.varOf(lengthOf(args[0]!))
    if (Node.$is('Lit')(part) && typeof part.value === 'string' && Option.isSome(length)) {
      state.zone.constrainLower(length.value, Str.codePointLength(part.value))
    }
  },
  refute: () => {},
})

/** Every primitive's Tier 3 row: a new `CoreOpId` fails to compile until it has one. */
export const abstractOps: Readonly<Record<Node.CoreOpId, AbstractOp>> = {
  'bool.and': {
    _tag: 'Predicate',
    unportable: false,
    neverNull: false,
    measures: none,
    decide: (args, state) => Verdict.and(state.decide(args[0]!), state.decide(args[1]!)),
    assume: (args, state) => {
      state.assume(args[0]!)
      state.assume(args[1]!)
    },
    // False where either is: a disjunction of the two refutations.
    refute: (args, state) => {
      state.pendingOrs.push([not(args[0]!), not(args[1]!)])
    },
  },
  'bool.or': {
    _tag: 'Predicate',
    unportable: false,
    neverNull: false,
    measures: none,
    decide: (args, state) => {
      const [a, b] = [args[0]!, args[1]!]
      const direct = Verdict.or(state.decide(a), state.decide(b))
      // Γ ⊢ A ∨ B from Γ, ¬A ⊢ B, where A is true or false: a null A gives a null disjunction.
      if (!Verdict.isUnknown(direct) || !state.hasValue(a)) return direct
      const otherwise = state.clone()
      otherwise.refute(a)
      const rest = otherwise.entails(b, 1)
      return Verdict.isTrue(rest) ? rest : direct
    },
    assume: (args, state) => {
      state.pendingOrs.push([args[0]!, args[1]!])
    },
    refute: (args, state) => {
      state.refute(args[0]!)
      state.refute(args[1]!)
    },
  },
  'bool.not': {
    _tag: 'Predicate',
    unportable: false,
    neverNull: false,
    measures: none,
    decide: (args, state) => negated(state.decide(args[0]!)),
    assume: (args, state) => state.refute(args[0]!),
    refute: (args, state) => state.assume(args[0]!),
  },
  'eq.is': {
    _tag: 'Predicate',
    unportable: true,
    neverNull: true,
    measures: none,
    decide: decideEqual,
    assume: assumeEqual,
    refute: assumeUnequal,
  },
  'eq.isNot': {
    _tag: 'Predicate',
    unportable: true,
    neverNull: true,
    measures: none,
    decide: (args, state) => negated(decideEqual(args, state)),
    assume: assumeUnequal,
    refute: assumeEqual,
  },
  'eq.in': {
    _tag: 'Predicate',
    unportable: true,
    neverNull: true,
    measures: none,
    decide: (args, state) => {
      const [needle, haystack] = [args[0]!, args[1]!]
      const known = Node.$is('Lit')(needle)
        ? Option.some<unknown>(needle.value)
        : Node.$is('Path')(needle) && state.eqFacts.has(Node.key(needle))
          ? Option.some(state.eqFacts.get(Node.key(needle)))
          : Option.none()
      if (Option.isSome(known) && Node.$is('Lit')(haystack)) {
        const value = Node.apply(Eq.inOp, [known.value, haystack.value])
        if (value === true) return proved('zone')
        if (value === false) return refuted()
      }
      return Verdict.Unknown('membership undecided in Tier 3')
    },
    assume: (args, state) => {
      const [needle, haystack] = [args[0]!, args[1]!]
      if (!Node.$is('Lit')(haystack) || !Array.isArray(haystack.value)) return
      const values: ReadonlyArray<unknown> = haystack.value
      if (values.length === 0) {
        state.markBottom()
        return
      }
      if (values.some(value => value === null || value === undefined)) return
      state.markValued(needle)
      const numbers = values.filter((value): value is number => typeof value === 'number')
      const id = state.varOf(needle)
      if (Option.isSome(id) && numbers.length === values.length) {
        state.zone.constrainLower(id.value, Math.min(...numbers))
        state.zone.constrainUpper(id.value, Math.max(...numbers))
      }
    },
    refute: () => {},
  },
  'null.isNull': {
    _tag: 'Predicate',
    unportable: false,
    neverNull: true,
    measures: none,
    decide: (args, state) => {
      const target = args[0]!
      if (Node.$is('Lit')(target) && !Node.isRefusal(target.value)) {
        return target.value === null || target.value === undefined ? proved('concrete') : refuted()
      }
      if (state.hasValue(target)) return refuted()
      if (Node.$is('Path')(target)) {
        const known = state.nullFacts.get(Node.key(target))
        if (known === true) return proved('zone')
        if (known === false) return refuted()
      }
      return Verdict.Unknown('nullability unknown')
    },
    assume: (args, state) => {
      const target = args[0]!
      if (state.hasValue(target)) state.markBottom()
      else if (Node.$is('Path')(target)) {
        const pk = Node.key(target)
        if (state.nullFacts.get(pk) === false) state.markBottom()
        else state.nullFacts.set(pk, true)
      }
    },
    refute: (args, state) => state.markNotNull(args[0]!),
  },
  'ord.lt': comparison(ascending, true),
  'ord.lte': comparison(ascending, false),
  'ord.gt': comparison(descending, true),
  'ord.gte': comparison(descending, false),
  'num.add': arithmetic(
    'add',
    monotone('num.add', ([a, b], toward) => Interval.directedAdd(a!, b!, toward)),
  ),
  'num.sub': arithmetic(
    'sub',
    monotone('num.sub', ([a, b], toward) => Interval.directedAdd(a!, -b!, toward)),
  ),
  'num.mul': arithmetic('none', args => Interval.mul(args[0]!, args[1]!)),
  'num.neg': arithmetic(
    'none',
    monotone('num.neg', ([a]) => -a!),
  ),
  'str.len': length,
  'str.startsWith': search(Str.startsWithOp),
  'str.contains': search(Str.containsOp),
  'arr.count': measure,
  'arr.isEmpty': {
    _tag: 'Predicate',
    unportable: false,
    neverNull: false,
    measures: args => [countOf(args[0]!)],
    decide: (args, state) => {
      const count = state.evalInterval(countOf(args[0]!))
      if (count.hi <= 0) return proved('zone')
      if (count.lo >= 1) return refuted()
      return Verdict.Unknown('array emptiness unknown')
    },
    assume: (args, state) => {
      const count = state.varOf(countOf(args[0]!))
      if (Option.isSome(count)) state.zone.constrainEq(count.value, ZERO, 0)
    },
    refute: (args, state) => {
      const count = state.varOf(countOf(args[0]!))
      if (Option.isSome(count)) state.zone.constrainLower(count.value, 1)
    },
  },
}
