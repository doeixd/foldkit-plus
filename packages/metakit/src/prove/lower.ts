import { Option } from 'effect'
import type { Arith, ArithSort, Bool, Context, FP, SMTSet, Solver } from 'z3-solver'
import { abstractOps } from '../abstract/ops.js'
import { noCandidate } from '../abstract/support.js'
import * as Node from '../node.js'
import { isShift } from '../ops/mulScaled.js'
import { isOnZero, isRoundingMode } from '../ops/divRem.js'
import * as Str from '../ops/str.js'
import * as Path from '../path.js'
import { halfEven } from './mulScaled.js'
import type { PathInfo, Shape, Sort } from './shape.js'
import { textReading } from './text.js'

export type Z3 = Context<'metakit'>
export type ZBool = Bool<'metakit'>
export type ZArith = Arith<'metakit'>
export type ZFP = FP<'metakit'>
export type ZSet = SMTSet<'metakit', ArithSort<'metakit'>>
export type ZExpr = ZBool | ZArith | ZFP | ZSet

/** What a term is, where the Schema or the operator says: a mismatch is undecided, not a proof. */
export type Kind = 'bool' | 'num' | 'text' | 'set' | 'null' | 'other'

/**
 * A term as evaluation gives it: a value, null, or a refusal (a number past
 * the safe range, text holding a NUL). At most one of `isNull` and `refused`
 * is true, and `value` means something only where neither is.
 */
export interface Term {
  readonly value: ZExpr
  readonly isNull: ZBool
  readonly refused: ZBool
  readonly kind: Kind
}

/** One primitive's reading, from its operands' terms and nodes. */
export type Lowerer = (args: ReadonlyArray<Term>, nodes: ReadonlyArray<Node.Node>) => Term

/** Thrown where the lowering cannot say what evaluation would; the proof is then undecided. */
export class Unsupported extends Error {}

/** The solver reads no list a write makes: what it says of one is `unsupported`, by name. */
const listWrite = (id: Node.CoreOpId): never => {
  throw new Unsupported(id)
}

const sortKind: Readonly<Record<Sort, Kind>> = {
  int: 'num',
  real: 'num',
  bool: 'bool',
  text: 'text',
  struct: 'other',
  other: 'other',
}

/**
 * Lower expressions to terms of `solver`, declaring a variable for every path
 * of `shape`. What a model assigns is read back through the returned tables.
 */
export const lowering = (z3: Z3, solver: Solver<'metakit'>, shape: Shape) => {
  const flagVars = new Map<string, ZBool>()
  const flagVar = (name: string): ZBool => {
    const known = flagVars.get(name)
    if (known !== undefined) return known
    const made = shape.absences.get(name)?.always === true ? z3.Bool.val(true) : z3.Bool.const(name)
    flagVars.set(name, made)
    return made
  }
  const anyOf = (flags: ReadonlyArray<string>): ZBool =>
    flags.length === 0 ? z3.Bool.val(false) : z3.Or(...flags.map(flagVar))

  const textCodes = new Map<string, number>()
  const codeTexts = new Map<number, string>()
  // One code per text as evaluation compares it: a lone surrogate is U+FFFD (`Node.textIdentity`).
  const codeOf = (raw: string): number => {
    const text = Node.wellFormed(raw)
    const known = textCodes.get(text)
    if (known !== undefined) return known
    const code = textCodes.size + 1
    textCodes.set(text, code)
    codeTexts.set(code, text)
    return code
  }

  const bool = (term: Term): ZBool => {
    if (z3.isBool(term.value) && term.kind !== 'num' && term.kind !== 'text') return term.value
    throw new Unsupported(`expected a boolean, got ${term.kind}`)
  }
  const number = (term: Term): ZArith => {
    if (z3.isArith(term.value) && term.kind !== 'bool' && term.kind !== 'text') return term.value
    throw new Unsupported(`expected a number, got ${term.kind}`)
  }
  const expr = (value: unknown): ZExpr => {
    if (z3.isBool(value) || z3.isArith(value) || z3.isFP(value) || z3.isArray(value)) {
      return value as ZExpr
    }
    throw new Unsupported('a term of no solver sort')
  }
  /** Two numbers in one sort: an integer beside a fraction is read as a real, which loses nothing. */
  const aligned = (a: ZArith, b: ZArith): readonly [ZArith, ZArith] => {
    if (z3.isInt(a) && z3.isReal(b)) return [z3.ToReal(a), b]
    if (z3.isReal(a) && z3.isInt(b)) return [a, z3.ToReal(b)]
    return [a, b]
  }
  const never = z3.Bool.val(false)
  const present = (value: ZExpr, kind: Kind): Term => ({
    value,
    isNull: never,
    refused: never,
    kind,
  })
  const decided = (term: Term): ZBool => z3.And(z3.Not(term.isNull), z3.Not(term.refused))
  const holds = (term: Term): ZBool => z3.And(decided(term), bool(term))
  const fails = (term: Term): ZBool => z3.And(decided(term), z3.Not(bool(term)))
  const anyRefused = (args: ReadonlyArray<Term>): ZBool => z3.Or(...args.map(arg => arg.refused))
  const anyNull = (args: ReadonlyArray<Term>): ZBool => z3.Or(...args.map(arg => arg.isNull))
  // A double holds every integer up to here; evaluation refuses an integer result past it.
  const safe = z3.Int.val(BigInt(Number.MAX_SAFE_INTEGER))
  const unsafe = (value: ZArith): ZBool => z3.Or(value.gt(safe), value.lt(safe.neg()))

  const vars = new Map<string, ZExpr>()
  const nanReads = new Set<string>()

  const declare = (name: string, info: PathInfo): ZExpr => {
    const guard = (constraint: ZBool): void => {
      solver.add(info.flags.length === 0 ? constraint : z3.Or(anyOf(info.flags), constraint))
    }
    if (info.sort === 'bool') {
      const made = z3.Bool.const(name)
      if (info.literals.length === 1) guard(made.eq(z3.Bool.val(info.literals[0] === true)))
      return made
    }
    if (info.sort === 'text') {
      const made = z3.Int.const(name)
      if (info.literals.length > 0) {
        guard(z3.Or(...info.literals.map(literal => made.eq(codeOf(String(literal))))))
      }
      return made
    }
    if (info.sort === 'real' && info.finite) {
      const f64 = z3.Float.sort64()
      const made = z3.Float.const(name, f64)
      guard(z3.And(z3.Not(made.isNaN()), z3.Not(made.isInf())))
      if (Option.isSome(info.min)) guard(made.ge(z3.Float.val(info.min.value, f64)))
      if (Option.isSome(info.max)) guard(made.le(z3.Float.val(info.max.value, f64)))
      if (Option.isSome(info.exclusiveMin)) {
        guard(made.gt(z3.Float.val(info.exclusiveMin.value, f64)))
      }
      if (Option.isSome(info.exclusiveMax)) {
        guard(made.lt(z3.Float.val(info.exclusiveMax.value, f64)))
      }
      if (info.literals.length > 0) {
        guard(
          z3.Or(
            ...info.literals.map(lit => {
              const v = z3.Float.val(Number(lit), f64)
              return z3.And(made.le(v), made.ge(v))
            }),
          ),
        )
      }
      return made
    }
    if (info.sort === 'int' || info.sort === 'real') {
      const made = info.sort === 'int' ? z3.Int.const(name) : z3.Real.const(name)
      // An integer above 0.5 is at least 1: a fraction is no integer constant.
      const whole = info.sort === 'int'
      // `Schema.Int` accepts only a safe integer.
      if (whole) guard(z3.Not(unsafe(made)))
      if (Option.isSome(info.min))
        guard(made.ge(whole ? Math.ceil(info.min.value) : info.min.value))
      if (Option.isSome(info.max))
        guard(made.le(whole ? Math.floor(info.max.value) : info.max.value))
      if (Option.isSome(info.exclusiveMin)) {
        const bound = info.exclusiveMin.value
        guard(whole ? made.ge(Math.floor(bound) + 1) : made.gt(bound))
      }
      if (Option.isSome(info.exclusiveMax)) {
        const bound = info.exclusiveMax.value
        guard(whole ? made.le(Math.ceil(bound) - 1) : made.lt(bound))
      }
      if (info.literals.length > 0) {
        guard(z3.Or(...info.literals.map(literal => made.eq(Number(literal)))))
      }
      return made
    }
    // A struct, an array, a union: a token that equals itself and nothing known.
    return z3.Real.const(name)
  }
  for (const [name, info] of shape.paths) vars.set(name, declare(name, info))

  /** Terms the solver holds only a free variable for: a model that sets one shows nothing. */
  const opaque = new Map<string, ZExpr>()
  const lengths = new Map<string, ZArith>()
  const measure = (prefix: string, node: Node.Node): ZArith => {
    const key = `${prefix}:${Node.key(node)}`
    const known = lengths.get(key)
    if (known !== undefined) return known
    const made = z3.Int.const(key)
    lengths.set(key, made)
    solver.add(made.ge(0))
    return made
  }

  const literal = (value: unknown): Term => {
    if (value === null || value === undefined) {
      return { value: z3.Int.val(0), isNull: z3.Bool.val(true), refused: never, kind: 'null' }
    }
    if (typeof value === 'boolean') return present(z3.Bool.val(value), 'bool')
    if (typeof value === 'number' && Number.isFinite(value)) {
      return present(
        Number.isInteger(value) ? z3.Int.val(BigInt(value)) : z3.Real.val(value),
        'num',
      )
    }
    if (typeof value === 'string') return present(z3.Int.val(codeOf(value)), 'text')
    throw new Unsupported(`a literal of type ${Array.isArray(value) ? 'array' : typeof value}`)
  }

  const mergeKind = (a: Kind, b: Kind): Kind => {
    if (a === 'null') return b
    if (b === 'null' || a === b) return a
    return 'other'
  }
  /** The values of two branches in one sort; a null branch borrows the other's, which is never read. */
  const f64 = z3.Float.sort64()
  const rne = z3.FloatRM.RNE()
  const fpSafe = z3.Float.val(Number.MAX_SAFE_INTEGER, f64)
  const unsafeFp = (value: ZFP): ZBool => value.abs().gt(fpSafe)
  const fpInteger = (value: ZFP): ZBool => {
    // The exponent determines how many low significand bits are fractional.
    const bits = value.toIEEEBV()
    const exponent = bits.extract(62, 52)
    const fraction = bits.extract(51, 0)
    const shift = z3.BitVec.val(1075, exponent.size()).sub(exponent).zeroExt(41)
    const low = z3.BitVec.val(1, fraction.size()).shl(shift).sub(1)
    return z3.Or(
      value.isZero(),
      exponent.uge(1075),
      z3.And(exponent.uge(1023), fraction.and(low).eq(z3.BitVec.val(0, fraction.size()))),
    )
  }
  const toFp = (value: ZExpr): ZFP => {
    if (z3.isFP(value)) return value
    if (z3.isIntVal(value)) return z3.Float.val(Number(value.value()), f64)
    if (z3.isRealVal(value)) return z3.Float.val(value.asNumber(), f64)
    throw new Unsupported('mixed integer and floating-point arithmetic in the solver')
  }
  const fpPair = (a: ZExpr, b: ZExpr): readonly [ZFP, ZFP] => [toFp(a), toFp(b)]
  const isFpPair = (a: Term, b: Term): boolean => z3.isFP(a.value) || z3.isFP(b.value)

  const branches = (a: Term, b: Term): readonly [ZExpr, ZExpr] => {
    const left = a.kind === 'null' ? b.value : a.value
    const right = b.kind === 'null' ? a.value : b.value
    if (z3.isFP(left) || z3.isFP(right)) return fpPair(left, right)
    return z3.isArith(left) && z3.isArith(right) ? aligned(left, right) : [left, right]
  }
  /** `cond ? a : b`, where `cond` is not null. */
  const choose = (cond: ZBool, a: Term, b: Term): Term => ({
    value: expr(z3.If(cond, ...branches(a, b))),
    isNull: z3.If(cond, a.isNull, b.isNull),
    refused: z3.If(cond, a.refused, b.refused),
    kind: mergeKind(a.kind, b.kind),
  })
  /** `chosen` under a subject or condition that, null or refused, is the answer itself. */
  const under = (subject: Term, chosen: Term): Term => ({
    ...chosen,
    isNull: z3.And(z3.Not(subject.refused), z3.Or(subject.isNull, chosen.isNull)),
    refused: z3.Or(subject.refused, z3.And(z3.Not(subject.isNull), chosen.refused)),
  })

  /** Whether two terms, neither null, are one value. */
  const sameValue = (a: Term, b: Term): ZBool => {
    // Text is held as a code among the integers, where "a" could meet 1: it is
    // compared with text alone, and a term of no known sort is read as a number.
    const sorted = (kind: Kind) => (kind === 'other' ? 'num' : kind)
    if (a.kind !== 'null' && b.kind !== 'null' && sorted(a.kind) !== sorted(b.kind)) {
      throw new Unsupported(`eq.is of a ${a.kind} and a ${b.kind}`)
    }
    if (z3.isBool(a.value) && z3.isBool(b.value)) return a.value.eq(b.value)
    if (a.kind === 'set' && b.kind === 'set') {
      return (a.value as ZSet).eq(b.value as ZSet)
    }
    if (isFpPair(a, b)) {
      const [left, right] = fpPair(a.value, b.value)
      // IEEE-754 numeric equality (`fp.eq` on non-NaN floats): equates -0.0 and +0.0.
      return z3.And(left.le(right), left.ge(right))
    }
    if (z3.isArith(a.value) && z3.isArith(b.value)) {
      const [left, right] = aligned(a.value, b.value)
      return left.eq(right)
    }
    throw new Unsupported('eq.is of terms of two solver sorts')
  }
  const is = (a: Term, b: Term): ZBool =>
    z3.Or(z3.And(a.isNull, b.isNull), z3.And(z3.Not(a.isNull), z3.Not(b.isNull), sameValue(a, b)))

  /**
   * An operator that is null of a null operand. A refused operand comes
   * first, as in evaluation; `refuses` is the operator's own refusal of
   * operands that are all values.
   */
  const strict = (
    kind: Kind,
    args: ReadonlyArray<Term>,
    value: ZExpr,
    refuses: ZBool = never,
  ): Term => ({
    value,
    isNull: z3.And(z3.Not(anyRefused(args)), anyNull(args)),
    refused: z3.Or(anyRefused(args), z3.And(z3.Not(anyNull(args)), refuses)),
    kind,
  })
  /** An operator that answers of a null operand, and passes a refusal on. */
  const nullSafe = (args: ReadonlyArray<Term>, value: ZBool): Term => ({
    value,
    isNull: never,
    refused: anyRefused(args),
    kind: 'bool',
  })
  const compare =
    (apply: (a: ZArith, b: ZArith) => ZBool, applyFp: (a: ZFP, b: ZFP) => ZBool) =>
    ([a, b]: ReadonlyArray<Term>): Term => {
      if (isFpPair(a!, b!)) {
        const [x, y] = fpPair(a!.value, b!.value)
        return strict('bool', [a!, b!], applyFp(x, y))
      }
      return strict('bool', [a!, b!], apply(...aligned(number(a!), number(b!))))
    }
  // IEEE-754 arithmetic shares JavaScript's operand limit. An out-of-range
  // result is refused when it is an integer, whatever the operands were
  // (`ops/num.ts`): `MAX_SAFE_INTEGER * 1.5` is.
  const arithmetic =
    (apply: (a: ZArith, b: ZArith) => ZArith, applyFp: (a: ZFP, b: ZFP) => ZFP) =>
    ([a, b]: ReadonlyArray<Term>): Term => {
      if (isFpPair(a!, b!)) {
        const [x, y] = fpPair(a!.value, b!.value)
        const result = applyFp(x, y)
        return strict(
          'num',
          [a!, b!],
          result,
          z3.Or(
            unsafeFp(x),
            unsafeFp(y),
            z3.And(unsafeFp(result), fpInteger(result)),
            result.isNaN(),
            result.isInf(),
          ),
        )
      }
      const [x, y] = aligned(number(a!), number(b!))
      const result = apply(x, y)
      return strict('num', [a!, b!], result, z3.Or(unsafe(x), unsafe(y), unsafe(result)))
    }
  /** Kleene: a refusal first, which is not absorbed; then `settling` when either side is; then null; then the other value. */
  const kleene = (settling: boolean) => {
    const settles = settling ? holds : fails
    return (args: ReadonlyArray<Term>): Term => {
      const refused = anyRefused(args)
      const settled = z3.And(z3.Not(refused), z3.Or(...args.map(settles)))
      return {
        value: settling ? settled : z3.Not(settled),
        isNull: z3.And(z3.Not(settled), z3.Not(refused), anyNull(args)),
        refused,
        kind: 'bool',
      }
    }
  }
  const length = (node: Node.Node): ZArith => {
    if (Node.$is('Lit')(node) && typeof node.value === 'string') {
      return z3.Int.val(Str.codePointLength(node.value))
    }
    if (Node.$is('Call')(node)) {
      if (node.op.id === 'str.concat' && node.args.length === 2) {
        return length(node.args[0]!).add(length(node.args[1]!))
      }
      if (
        (node.op.id === 'str.lowerAscii' || node.op.id === 'str.upperAscii') &&
        node.args.length === 1
      ) {
        return length(node.args[0]!)
      }
      if (node.op.id === 'str.trim' && node.args.length === 1) {
        const m = measure('strLen', node)
        solver.add(m.le(length(node.args[0]!)))
        return m
      }
    }
    const m = measure('strLen', node)
    if (Node.$is('Path')(node)) {
      const info = shape.paths.get(Path.format(node.segments))
      if (info !== undefined && info.sort === 'text') {
        const guard = (constraint: ZBool): void => {
          solver.add(info.flags.length === 0 ? constraint : z3.Or(anyOf(info.flags), constraint))
        }
        // UTF-16 length bounds imply code-point length bounds: ceil(min/2) <= cpLen <= max.
        if (info.text.minLength > 0) guard(m.ge(Math.ceil(info.text.minLength / 2)))
        if (Number.isFinite(info.text.maxLength)) guard(m.le(info.text.maxLength))
      }
    }
    return m
  }

  const text = textReading({
    z3,
    shape,
    flagVar,
    opaque,
    present,
    literal,
    strict: (kind, args, value) => strict(kind, args, value),
    length,
    assert: fact => solver.add(fact),
    lower: node => lower(node),
    codeOf,
  })
  const { nulOf } = text

  /** A candidate list written as a literal, as SQL's `in` takes one. */
  const candidatesOf = (id: string, list: Node.Node): ReadonlyArray<unknown> => {
    if (!Node.$is('Lit')(list) || !Array.isArray(list.value)) {
      throw new Unsupported(`${id} of candidates that are not a literal array`)
    }
    return list.value
  }

  const intSort = z3.Int.sort()
  const emptySet: ZSet = z3.EmptySet(intSort)
  const sets = new Map<string, ZSet>()
  const setElemSorts = new WeakMap<object, 'int' | 'text' | 'any'>()

  interface SetTerm {
    readonly set: ZSet
    readonly bad: ZBool
    readonly elemSort: 'int' | 'text' | 'any'
  }

  const tagSet = (set: ZSet, elemSort: 'int' | 'text' | 'any'): ZSet => {
    setElemSorts.set(set, elemSort)
    return set
  }

  const trySetOf = (term: Term, node: Node.Node): Option.Option<SetTerm> => {
    if (term.kind === 'set') {
      const set = term.value as ZSet
      return Option.some({ set, bad: never, elemSort: setElemSorts.get(set) ?? 'any' })
    }
    if (Node.$is('Lit')(node) && Array.isArray(node.value)) {
      if (node.value.length === 0) {
        return Option.some({ set: emptySet, bad: never, elemSort: 'any' })
      }
      if (node.value.every(el => typeof el === 'string')) {
        if (Node.holdsNul(node.value)) {
          return Option.some({ set: emptySet, bad: z3.Bool.val(true), elemSort: 'text' })
        }
        let acc: ZSet = emptySet
        for (const el of node.value) acc = z3.SetAdd(acc, z3.Int.val(codeOf(el)))
        return Option.some({ set: tagSet(acc, 'text'), bad: never, elemSort: 'text' })
      }
      if (node.value.every(el => typeof el === 'number')) {
        if (node.value.some(el => !Number.isFinite(el))) {
          return Option.some({ set: emptySet, bad: z3.Bool.val(true), elemSort: 'int' })
        }
        if (node.value.every(el => Number.isSafeInteger(el))) {
          let acc: ZSet = emptySet
          for (const el of node.value) acc = z3.SetAdd(acc, z3.Int.val(BigInt(el + 0)))
          return Option.some({ set: tagSet(acc, 'int'), bad: never, elemSort: 'int' })
        }
      }
      return Option.none()
    }
    if (Node.$is('Path')(node)) {
      const name = Path.format(node.segments)
      const info = shape.paths.get(name)
      if (info?.setElement !== undefined) {
        let set = sets.get(name)
        if (set === undefined) {
          set = z3.Set.const(`set:${name}`, intSort)
          sets.set(name, set)
          setElemSorts.set(set, info.setElement)
        }
        const bad = info.setValid === true ? never : flagVar(`setBad:${name}`)
        return Option.some({ set, bad, elemSort: info.setElement })
      }
    }
    return Option.none()
  }

  const requireSet = (id: Node.CoreOpId, term: Term, node: Node.Node): SetTerm =>
    Option.getOrElse(trySetOf(term, node), () => {
      throw new Unsupported(`${id} on an operand the solver does not read as a scalar set`)
    })

  const compatibleSetSort = (id: Node.CoreOpId, a: SetTerm, b: SetTerm): 'int' | 'text' | 'any' => {
    if (a.elemSort !== 'any' && b.elemSort !== 'any' && a.elemSort !== b.elemSort) {
      throw new Unsupported(`${id} across mixed element kinds`)
    }
    return a.elemSort !== 'any' ? a.elemSort : b.elemSort
  }

  const setElemOf = (
    id: Node.CoreOpId,
    term: Term,
    expected: 'int' | 'text' | 'any',
  ): { readonly elem: ZArith; readonly bad: ZBool; readonly sort: 'int' | 'text' } => {
    const val = term.value
    if (!z3.isArith(val) || !z3.isInt(val) || term.kind === 'bool' || term.kind === 'set') {
      throw new Unsupported(`${id} element is not an integer or text`)
    }
    const sort: 'int' | 'text' = term.kind === 'text' ? 'text' : 'int'
    if (expected !== 'any' && expected !== sort) {
      throw new Unsupported(`${id} element kind does not match the set`)
    }
    return { elem: val, bad: sort === 'int' ? unsafe(val) : never, sort }
  }

  /** The solver's reading of every primitive: a new one fails to compile until it has a row here. */
  const smtOps: Readonly<Record<Node.CoreOpId, Lowerer>> = {
    'bool.and': kleene(false),
    'bool.or': kleene(true),
    'bool.not': ([a]) => strict('bool', [a!], z3.Not(bool(a!))),
    'eq.is': ([a, b]) => nullSafe([a!, b!], is(a!, b!)),
    'eq.isNot': ([a, b]) => nullSafe([a!, b!], z3.Not(is(a!, b!))),
    'eq.in': ([needle], [, list]) => {
      const candidates = candidatesOf('eq.in', list!)
      return nullSafe(
        [needle!],
        candidates.length === 0
          ? never
          : z3.Or(...candidates.map(candidate => is(needle!, literal(candidate)))),
      )
    },
    'eq.equals': ([a, b]) => strict('bool', [a!, b!], sameValue(a!, b!)),
    'eq.among': ([needle], [, list]) => {
      const candidates = candidatesOf('eq.among', list!)
      // No candidate is false whatever the value, null included; only a refusal comes first.
      if (candidates.length === 0) return nullSafe([needle!], never)
      const present = candidates.filter(item => item !== null && item !== undefined)
      const matches = z3.Or(never, ...present.map(item => sameValue(needle!, literal(item))))
      const term = strict('bool', [needle!], matches)
      // No match against a null candidate is null, not false.
      return present.length < candidates.length
        ? { ...term, isNull: z3.Or(term.isNull, z3.And(z3.Not(term.refused), z3.Not(matches))) }
        : term
    },
    'null.isNull': ([a]) => nullSafe([a!], a!.isNull),
    // `b` is read only where `a` is null, so its refusal reaches no other answer.
    'null.coalesce': ([a, b]) => ({
      value: expr(z3.If(a!.isNull, ...branches(b!, a!))),
      isNull: z3.And(z3.Not(a!.refused), a!.isNull, b!.isNull),
      refused: z3.Or(a!.refused, z3.And(a!.isNull, b!.refused)),
      kind: mergeKind(a!.kind, b!.kind),
    }),
    ...text.rows,
    'ord.lt': compare(
      (a, b) => a.lt(b),
      (a, b) => a.lt(b),
    ),
    'ord.lte': compare(
      (a, b) => a.le(b),
      (a, b) => a.le(b),
    ),
    'ord.gt': compare(
      (a, b) => a.gt(b),
      (a, b) => a.gt(b),
    ),
    'ord.gte': compare(
      (a, b) => a.ge(b),
      (a, b) => a.ge(b),
    ),
    'num.add': arithmetic(
      (a, b) => a.add(b),
      (a, b) => a.add(rne, b),
    ),
    'num.sub': arithmetic(
      (a, b) => a.sub(b),
      (a, b) => a.sub(rne, b),
    ),
    'num.mul': arithmetic(
      (a, b) => a.mul(b),
      (a, b) => a.mul(rne, b),
    ),
    'num.neg': ([a]) => {
      if (z3.isFP(a!.value)) {
        const result = a!.value.neg()
        return strict('num', [a!], result, z3.Or(unsafeFp(result), result.isNaN(), result.isInf()))
      }
      const result = number(a!).neg()
      return strict('num', [a!], result, unsafe(result))
    },
    // Exact over integers. A product past the safe range is refused before it is rounded, as evaluation does.
    'num.mulScaled': ([a, b], [, , places]) => {
      const [left, right] = [number(a!), number(b!)]
      if (!z3.isInt(left) || !z3.isInt(right)) {
        throw new Unsupported('num.mulScaled of an operand the solver does not read as an integer')
      }
      if (!Node.$is('Lit')(places!) || !isShift(places.value)) {
        throw new Unsupported('num.mulScaled of a shift that is not a literal number of places')
      }
      const shift = places.value
      const product = left.mul(right)
      if (shift <= 0) {
        const moved = product.mul(10 ** -shift)
        return strict('num', [a!, b!], moved, unsafe(moved))
      }
      return strict('num', [a!, b!], halfEven(z3, product, shift), unsafe(product))
    },
    'num.div': ([a, b], [, divisorNode, modeNode, onZeroNode]) => {
      const left = number(a!)
      const right = number(b!)
      if (!z3.isInt(left) || !z3.isInt(right)) {
        throw new Unsupported('num.div of an operand the solver does not read as an integer')
      }
      if (!Node.$is('Lit')(modeNode!) || !isRoundingMode(modeNode.value)) {
        throw new Unsupported('num.div requires a literal rounding mode')
      }
      if (!Node.$is('Lit')(onZeroNode!) || !isOnZero(onZeroNode.value)) {
        throw new Unsupported('num.div requires a literal onZero policy')
      }
      const mode = modeNode.value
      const onZero = onZeroNode.value
      const zero = z3.Int.val(0)
      const litDiv =
        Node.$is('Lit')(divisorNode!) &&
        typeof divisorNode.value === 'number' &&
        Number.isSafeInteger(divisorNode.value)
          ? divisorNode.value
          : undefined
      if (litDiv === 0) {
        const term = strict(
          'num',
          [a!, b!],
          zero,
          z3.Or(unsafe(left), onZero === 'refuse' ? z3.Bool.val(true) : never),
        )
        return onZero === 'null'
          ? { ...term, isNull: z3.Or(term.isNull, z3.Not(term.refused)) }
          : term
      }
      const isZero = litDiv !== undefined ? never : right.eq(zero)
      const num =
        litDiv !== undefined
          ? litDiv < 0
            ? left.neg()
            : left
          : z3.If(right.lt(zero), left.neg(), left)
      const den: ZArith | number =
        litDiv !== undefined ? Math.abs(litDiv) : z3.If(right.lt(zero), right.neg(), right)
      const qFloor = num.div(den)
      const r = num.mod(den)
      const twice = r.mul(2)
      const quotient =
        mode === 'floor'
          ? qFloor
          : mode === 'ceiling'
            ? z3.If(r.eq(zero), qFloor, qFloor.add(1))
            : mode === 'toward-zero'
              ? z3.If(z3.Or(r.eq(zero), num.ge(zero)), qFloor, qFloor.add(1))
              : mode === 'half-even'
                ? z3.If(
                    twice.gt(den),
                    qFloor.add(1),
                    z3.If(
                      twice.lt(den),
                      qFloor,
                      z3.If(qFloor.mod(2).eq(zero), qFloor, qFloor.add(1)),
                    ),
                  )
                : z3.If(
                    twice.gt(den),
                    qFloor.add(1),
                    z3.If(twice.lt(den), qFloor, z3.If(num.ge(zero), qFloor.add(1), qFloor)),
                  )
      const refusedDiv =
        litDiv !== undefined
          ? z3.Or(unsafe(left), unsafe(quotient))
          : z3.Or(
              unsafe(left),
              unsafe(right),
              z3.And(z3.Not(isZero), unsafe(quotient)),
              onZero === 'refuse' ? isZero : never,
            )
      const term = strict('num', [a!, b!], quotient, refusedDiv)
      return onZero === 'null' && litDiv === undefined
        ? { ...term, isNull: z3.Or(term.isNull, z3.And(z3.Not(term.refused), isZero)) }
        : term
    },
    'num.rem': ([a, b], [, divisorNode, onZeroNode]) => {
      const left = number(a!)
      const right = number(b!)
      if (!z3.isInt(left) || !z3.isInt(right)) {
        throw new Unsupported('num.rem of an operand the solver does not read as an integer')
      }
      const onZero =
        onZeroNode === undefined
          ? 'refuse'
          : Node.$is('Lit')(onZeroNode) && isOnZero(onZeroNode.value)
            ? onZeroNode.value
            : undefined
      if (onZero === undefined) {
        throw new Unsupported('num.rem requires a literal onZero policy')
      }
      const zero = z3.Int.val(0)
      const litDiv =
        Node.$is('Lit')(divisorNode!) &&
        typeof divisorNode.value === 'number' &&
        Number.isSafeInteger(divisorNode.value)
          ? divisorNode.value
          : undefined
      if (litDiv === 0) {
        const term = strict(
          'num',
          [a!, b!],
          zero,
          z3.Or(unsafe(left), onZero === 'refuse' ? z3.Bool.val(true) : never),
        )
        return onZero === 'null'
          ? { ...term, isNull: z3.Or(term.isNull, z3.Not(term.refused)) }
          : term
      }
      const isZero = litDiv !== undefined ? never : right.eq(zero)
      const den: ZArith | number =
        litDiv !== undefined ? Math.abs(litDiv) : z3.If(right.lt(zero), right.neg(), right)
      const r = left.mod(den)
      const remVal = z3.If(z3.Or(r.eq(zero), left.ge(zero)), r, r.sub(den))
      const refusedRem =
        litDiv !== undefined
          ? z3.Or(unsafe(left), unsafe(remVal))
          : z3.Or(
              unsafe(left),
              unsafe(right),
              z3.And(z3.Not(isZero), unsafe(remVal)),
              onZero === 'refuse' ? isZero : never,
            )
      const term = strict('num', [a!, b!], remVal, refusedRem)
      return onZero === 'null' && litDiv === undefined
        ? { ...term, isNull: z3.Or(term.isNull, z3.And(z3.Not(term.refused), isZero)) }
        : term
    },
    'time.addDays': ([a, b]) => {
      const [da, nb] = [number(a!), number(b!)]
      if (!z3.isInt(da) || !z3.isInt(nb)) {
        throw new Unsupported('time.addDays of an operand the solver does not read as an integer')
      }
      const sum = da.add(nb)
      return strict('num', [a!, b!], sum, z3.Or(unsafe(da), unsafe(nb), unsafe(sum)))
    },
    'time.daysBetween': ([a, b]) => {
      const [da, db] = [number(a!), number(b!)]
      if (!z3.isInt(da) || !z3.isInt(db)) {
        throw new Unsupported(
          'time.daysBetween of an operand the solver does not read as an integer',
        )
      }
      const diff = da.sub(db)
      return strict('num', [a!, b!], diff, z3.Or(unsafe(da), unsafe(db), unsafe(diff)))
    },
    'time.addMonths': () => {
      throw new Unsupported('time.addMonths')
    },
    'time.startOfMonth': () => {
      throw new Unsupported('time.startOfMonth')
    },
    'time.overlaps': ([s1, e1, s2, e2]) => {
      const [a, b, c, d] = [number(s1!), number(e1!), number(s2!), number(e2!)]
      if (!z3.isInt(a) || !z3.isInt(b) || !z3.isInt(c) || !z3.isInt(d)) {
        throw new Unsupported('time.overlaps of an operand the solver does not read as an integer')
      }
      const bad = z3.Or(unsafe(a), unsafe(b), unsafe(c), unsafe(d))
      return strict('bool', [s1!, e1!, s2!, e2!], z3.And(a.lt(d), c.lt(b)), bad)
    },
    'str.len': ([a], [node]) => strict('num', [a!], length(node!)),
    'arr.count': ([a], [node]) =>
      strict(
        'num',
        [a!],
        Node.$is('Lit')(node!) && Array.isArray(node.value)
          ? z3.Int.val(node.value.length)
          : measure('arrCount', node!),
      ),
    'arr.isEmpty': ([a], [node]) => {
      if (a!.kind === 'set') {
        return strict('bool', [a!], (a!.value as ZSet).eq(emptySet))
      }
      return strict(
        'bool',
        [a!],
        Node.$is('Lit')(node!) && Array.isArray(node.value)
          ? z3.Bool.val(node.value.length === 0)
          : measure('arrCount', node!).eq(0),
      )
    },
    'arr.has': ([list, needle], [listNode, needleNode]) => {
      if (
        Node.$is('Lit')(listNode!) &&
        Array.isArray(listNode.value) &&
        listNode.value.some(el => typeof el === 'number' && !Number.isFinite(el))
      ) {
        return strict('bool', [list!, needle!], z3.Bool.val(false), z3.Bool.val(true))
      }
      const asSet = trySetOf(list!, listNode!)
      const needleVal = needle!.value
      if (
        Option.isSome(asSet) &&
        z3.isArith(needleVal) &&
        z3.isInt(needleVal) &&
        needle!.kind !== 'bool' &&
        needle!.kind !== 'set' &&
        (asSet.value.elemSort === 'any' ||
          (asSet.value.elemSort === 'text' && needle!.kind === 'text') ||
          (asSet.value.elemSort === 'int' && needle!.kind === 'num'))
      ) {
        const mem = z3.isSubset(z3.SetAdd(emptySet, needleVal), asSet.value.set)
        if (list!.kind !== 'set') {
          const count =
            Node.$is('Lit')(listNode!) && Array.isArray(listNode.value)
              ? z3.Int.val(listNode.value.length)
              : measure('arrCount', listNode!)
          solver.add(z3.Implies(mem, count.ge(1)))
        }
        return strict('bool', [list!, needle!], mem, asSet.value.bad)
      }
      const key = `arrHas:${Node.key(listNode!)}:${Node.key(needleNode!)}`
      const known = opaque.has(key)
      let sym = opaque.get(key)
      if (sym === undefined) {
        sym = z3.Bool.const(key)
        opaque.set(key, sym)
      }
      if (!known && z3.isBool(sym)) {
        const count =
          Node.$is('Lit')(listNode!) && Array.isArray(listNode.value)
            ? z3.Int.val(listNode.value.length)
            : measure('arrCount', listNode!)
        solver.add(z3.Implies(sym, count.ge(1)))
      }
      return strict('bool', [list!, needle!], sym)
    },
    'arr.append': () => listWrite('arr.append'),
    'arr.include': ([a, b], [listNode]) => {
      const s = requireSet('arr.include', a!, listNode!)
      const e = setElemOf('arr.include', b!, s.elemSort)
      const withElem = z3.SetAdd(s.set, e.elem)
      const added = tagSet(
        b!.isNull === never ? withElem : (z3.If(b!.isNull, s.set, withElem) as ZSet),
        e.sort,
      )
      const refused = z3.Or(
        a!.refused,
        z3.And(
          z3.Not(a!.isNull),
          z3.Or(b!.refused, z3.And(z3.Not(b!.isNull), z3.Or(s.bad, e.bad))),
        ),
      )
      return {
        value: added,
        isNull: z3.And(z3.Not(refused), a!.isNull),
        refused,
        kind: 'set',
      }
    },
    'arr.exclude': ([a, b], [listNode]) => {
      const s = requireSet('arr.exclude', a!, listNode!)
      const e = setElemOf('arr.exclude', b!, s.elemSort)
      const withoutElem = z3.SetDel(s.set, e.elem)
      const removed = tagSet(
        b!.isNull === never ? withoutElem : (z3.If(b!.isNull, s.set, withoutElem) as ZSet),
        e.sort,
      )
      const refused = z3.Or(
        a!.refused,
        z3.And(
          z3.Not(a!.isNull),
          z3.Or(b!.refused, z3.And(z3.Not(b!.isNull), z3.Or(s.bad, e.bad))),
        ),
      )
      return {
        value: removed,
        isNull: z3.And(z3.Not(refused), a!.isNull),
        refused,
        kind: 'set',
      }
    },
    'arr.move': () => listWrite('arr.move'),
    'set.union': ([a, b], [na, nb]) => {
      const sa = requireSet('set.union', a!, na!)
      const sb = requireSet('set.union', b!, nb!)
      const sort = compatibleSetSort('set.union', sa, sb)
      return strict(
        'set',
        [a!, b!],
        tagSet(z3.SetUnion(sa.set, sb.set), sort),
        z3.Or(sa.bad, sb.bad),
      )
    },
    'set.intersect': ([a, b], [na, nb]) => {
      const sa = requireSet('set.intersect', a!, na!)
      const sb = requireSet('set.intersect', b!, nb!)
      const sort = compatibleSetSort('set.intersect', sa, sb)
      return strict(
        'set',
        [a!, b!],
        tagSet(z3.SetIntersect(sa.set, sb.set), sort),
        z3.Or(sa.bad, sb.bad),
      )
    },
    'set.difference': ([a, b], [na, nb]) => {
      const sa = requireSet('set.difference', a!, na!)
      const sb = requireSet('set.difference', b!, nb!)
      const sort = compatibleSetSort('set.difference', sa, sb)
      return strict(
        'set',
        [a!, b!],
        tagSet(z3.SetDifference(sa.set, sb.set), sort),
        z3.Or(sa.bad, sb.bad),
      )
    },
    'set.subset': ([a, b], [na, nb]) => {
      const sa = requireSet('set.subset', a!, na!)
      const sb = requireSet('set.subset', b!, nb!)
      compatibleSetSort('set.subset', sa, sb)
      return strict('bool', [a!, b!], z3.isSubset(sa.set, sb.set), z3.Or(sa.bad, sb.bad))
    },
    'set.disjoint': ([a, b], [na, nb]) => {
      const sa = requireSet('set.disjoint', a!, na!)
      const sb = requireSet('set.disjoint', b!, nb!)
      compatibleSetSort('set.disjoint', sa, sb)
      return strict(
        'bool',
        [a!, b!],
        z3.SetIntersect(sa.set, sb.set).eq(emptySet),
        z3.Or(sa.bad, sb.bad),
      )
    },
  }

  const lower = (node: Node.Node): Term =>
    Node.$match(node, {
      // An array is read by `eq.in` and the counts, which take the node itself.
      Lit: ({ value }) =>
        Array.isArray(value)
          ? present(z3.Real.const(`array:${Node.key(node)}`), 'other')
          : literal(value),
      Path: ({ segments }): Term => {
        const name = Path.format(segments)
        const info = shape.paths.get(name)
        if (info === undefined) {
          // No Schema speaks for it: any value, or none.
          let free = vars.get(name)
          if (free === undefined) {
            free = z3.Real.const(name)
            vars.set(name, free)
          }
          return { ...present(free, 'other'), isNull: flagVar(`absent:${name}`) }
        }
        // Text codes and numbers share the solver's integers: "a" could meet 1.
        if (info.sort === 'other' && info.literals.length > 0) {
          throw new Unsupported(`mixed literal types at ${name} require a tagged solver sort`)
        }
        if (info.nan) nanReads.add(name)
        return { ...present(vars.get(name)!, sortKind[info.sort]), isNull: anyOf(info.flags) }
      },
      Call: ({ op, args }) => {
        if (Node.isForeign(op)) {
          throw new Unsupported(`the foreign operation ${op.id}@${op.version}`)
        }
        const operands = args.map(lower)
        const term = smtOps[op.id](operands, args)
        if (!abstractOps[op.id].unportable) return term
        if (op.id === 'eq.among' && noCandidate(args[1])) return term
        // Text holding a NUL is refused after a refused operand, and before null.
        const nul = z3.And(z3.Not(anyRefused(operands)), z3.Or(...args.map(nulOf)))
        return {
          ...term,
          isNull: z3.And(term.isNull, z3.Not(nul)),
          refused: z3.Or(term.refused, nul),
        }
      },
      If: ({ cond, then, otherwise }) => {
        const c = lower(cond)
        return under(c, choose(bool(c), lower(then), lower(otherwise)))
      },
      Match: ({ on, cases, otherwise }) => {
        const target = lower(on)
        if (!z3.isArith(target.value) || target.kind === 'num' || target.kind === 'bool') {
          throw new Unsupported(`a match on a ${target.kind}`)
        }
        const code = target.value
        const takes = (value: string): ZBool =>
          z3.And(z3.Not(target.isNull), code.eq(codeOf(value)))
        const arms = cases.map(([value, branch]) => [takes(value), lower(branch)] as const)
        const rest = Option.match(otherwise, {
          onSome: lower,
          onNone: (): Term => ({
            // When no case names the subject: null gives null; any other value refuses `unmatched`.
            value: z3.Int.val(0),
            isNull: target.isNull,
            refused: z3.Not(target.isNull),
            kind: 'null',
          }),
        })
        // A null subject takes no arm, so it reaches `rest`; a refused subject or one holding a NUL refuses before any arm.
        const chosen = arms.reduceRight((acc, [takesArm, arm]) => choose(takesArm, arm, acc), rest)
        const nul = z3.And(z3.Not(target.refused), z3.Not(target.isNull), nulOf(on))
        return {
          ...chosen,
          isNull: z3.And(chosen.isNull, z3.Not(target.refused), z3.Not(nul)),
          refused: z3.Or(target.refused, nul, chosen.refused),
        }
      },
      Opaque: (opaqueNode): Term => {
        const key = Node.key(opaqueNode)
        let free = opaque.get(key)
        if (free === undefined) {
          free = z3.Bool.const(key)
          opaque.set(key, free)
        }
        return { ...present(free, 'other'), isNull: flagVar(`absent:${key}`) }
      },
      Rows: rows => {
        const over = rows.over
        if (
          Node.RowsOver.$is('Related')(over) &&
          (rows.fold === 'count' || rows.fold === 'any' || rows.fold === 'every')
        ) {
          const ofTerm = lower(over.of)
          const baseKey = `relCount:${Node.key(over.of)}:${over.relation}`
          let total = lengths.get(baseKey)
          if (total === undefined) {
            total = z3.Int.const(baseKey)
            lengths.set(baseKey, total)
            opaque.set(baseKey, total)
            solver.add(total.ge(0))
            if (over.cardinality === 'one') solver.add(total.eq(1))
            else if (over.cardinality === 'optional') solver.add(total.le(1))
          }
          const matching = Option.match(rows.where, {
            onNone: () => total,
            onSome: whereNode => {
              const matchKey = `relMatch:${Node.key(over.of)}:${over.relation}:${Node.key(whereNode)}`
              let m = lengths.get(matchKey)
              if (m === undefined) {
                m = z3.Int.const(matchKey)
                lengths.set(matchKey, m)
                opaque.set(matchKey, m)
                solver.add(m.ge(0))
                solver.add(m.le(total))
              }
              return m
            },
          })
          if (rows.fold === 'count') return strict('num', [ofTerm], matching)
          if (rows.fold === 'any') return strict('bool', [ofTerm], matching.ge(1))
          return strict('bool', [ofTerm], matching.eq(total))
        }
        throw new Unsupported(`the fold rows.${rows.fold}`)
      },
    })

  /** The flags by which a model puts a NUL in text. */
  const nulFlags = (): ReadonlyArray<ZBool> =>
    Array.from(flagVars).flatMap(([name, flag]) => (name.startsWith('nul:') ? [flag] : []))

  return {
    lower,
    holds,
    flagVar,
    vars,
    sets,
    lengths,
    codeTexts,
    codeOf,
    opaque,
    nanReads,
    nulFlags,
  }
}

export type Lowered = ReturnType<typeof lowering>
