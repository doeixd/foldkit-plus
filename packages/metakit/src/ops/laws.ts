/**
 * The rewrite rules partial evaluation applies to a call some of whose
 * operands are not yet known, as data and one function over them, read by
 * both readers of a partly known environment: `residualizeNode`, which keeps
 * the expression left over, and `judgeNode`, which keeps only what it
 * decides. Each reader shows its operands through a `View`, so a rule is
 * written once and means one thing to both.
 *
 * Only the fields evaluation reads are here; the checker's (`commutative`,
 * `associative`, `invertible`, `monotone`) and the ways of writing are in
 * `properties.ts`, which joins both into `opProperties`.
 */
import { Match, Option, SchemaAST } from 'effect'
import * as Node from '../node.js'
import { optionInner } from '../path.js'
import type { Direction, OpProperties } from '../properties.js'
import { equalsOp, isOp } from './eq.js'
import { present } from './kind.js'
import { wellFormed } from './str.js'
import { EARLIEST_DAY, LATEST_DAY } from './time.js'

/** The properties partial evaluation reads of an operation. */
export type OpLaws = Pick<
  OpProperties,
  'identity' | 'absorbing' | 'idempotent' | 'reflexive' | 'involution'
>

export const opLaws: { readonly [Id in Node.CoreOpId]: OpLaws } = {
  'bool.and': {
    identity: { value: true, side: 'both' },
    absorbing: { value: false, result: false, side: 'both', unlessRefused: true },
    idempotent: true,
  },
  'bool.or': {
    identity: { value: false, side: 'both' },
    absorbing: { value: true, result: true, side: 'both', unlessRefused: true },
    idempotent: true,
  },
  'bool.not': { involution: true },
  'eq.is': { reflexive: { value: true } },
  'eq.isNot': { reflexive: { value: false } },
  'eq.in': {},
  'eq.equals': {},
  'eq.among': {},
  'null.isNull': {},
  'null.coalesce': { identity: { value: null, side: 'both' }, idempotent: true },
  'str.lowerAscii': { idempotent: true },
  'str.upperAscii': { idempotent: true },
  'str.trim': { idempotent: true },
  'str.concat': { identity: { value: '', side: 'both', over: 'portableText' } },
  'str.lt': {},
  'str.lte': {},
  'str.gt': {},
  'str.gte': {},
  'ord.lt': {},
  'ord.lte': {},
  'ord.gt': {},
  'ord.gte': {},
  'num.add': { identity: { value: 0, side: 'both' } },
  // No `x - x -> 0` and no `x * 0 -> 0`: over a null `x` each is null.
  'num.sub': { identity: { value: 0, side: 'right' } },
  'num.mul': { identity: { value: 1, side: 'both' } },
  'num.neg': { involution: true },
  // No identity: the unit that leaves a product alone is `10^shift`, which the closed set cannot name per call.
  'num.mulScaled': {},
  'num.div': {},
  'num.rem': {},
  'time.addDays': { identity: { value: 0, side: 'right', over: 'integers' } },
  'time.addMonths': { identity: { value: 0, side: 'right', over: 'calendarDays' } },
  'time.daysBetween': {},
  'time.startOfMonth': { idempotent: true },
  'time.overlaps': {},
  'str.len': {},
  'str.startsWith': {},
  'str.endsWith': {},
  'str.contains': {},
  'arr.count': {},
  'arr.isEmpty': {},
  'arr.has': {},
  'arr.append': {},
  'arr.include': {},
  'arr.exclude': {},
}

/** What partial evaluation reads of `any` and `every`: the answer that decides each. */
export interface FoldLaws {
  /** One element whose test gives `value` decides the answer, `result`, whatever the others give. */
  readonly absorbing?: { readonly value: boolean; readonly result: unknown }
  /** More elements never give a smaller answer (`up`), or never a larger one (`down`), where neither is refused. */
  readonly monotone: Direction
}

/**
 * `any` and `every` take the value that decides them from `bool.or` and
 * `bool.and`. A fold decides over an element whose test was refused
 * (`rows.ts`), so it absorbs over every value, where the operation absorbs
 * only over values that are not refused.
 */
const decided = (from: 'bool.or' | 'bool.and', monotone: Direction): FoldLaws => {
  const absorbing = opLaws[from].absorbing
  return {
    ...(absorbing === undefined
      ? {}
      : { absorbing: { value: absorbing.value === true, result: absorbing.result } }),
    monotone,
  }
}

export const foldLaws: { readonly any: FoldLaws; readonly every: FoldLaws } = {
  any: decided('bool.or', 'up'),
  every: decided('bool.and', 'down'),
}

/**
 * What a reader shows of an operand it has partly evaluated: the value it is
 * known to hold, and what its residual would be: its kind, whether it cannot
 * be refused (`cannotRefuse`), whether it is a read, a read holding no NUL
 * text (`isPortableRead`), a call of one argument, or the same term as
 * another.
 */
export interface View<T> {
  readonly known: (operand: T) => Option.Option<unknown>
  readonly kind: (operand: T) => Option.Option<Node.ValueKind>
  readonly cannotRefuse: (operand: T) => boolean
  readonly isRead: (operand: T) => boolean
  readonly isPortableRead: (operand: T) => boolean
  /** A number it holds is within ±(2^53−1) (`isSafeRead`). */
  readonly safe: (operand: T) => boolean
  readonly unary: (operand: T) => { readonly id: string; readonly arg: T } | undefined
  readonly same: (left: T, right: T) => boolean
  /** Static Schema AST of an open operand (a path or a custom call's result), where known. */
  readonly ast?: (operand: T) => Option.Option<SchemaAST.AST>
}

/** What a rule makes of a call: a value, one of its operands (or an operand's own), or a call of another operation over the operand and a literal. */
export type Rewrite<T> =
  | { readonly value: unknown }
  | { readonly operand: T }
  | { readonly call: Node.Op; readonly operand: T; readonly literal: unknown }

/**
 * Whether a strict call is null whatever its operands not yet known hold: one
 * is a known null, and every other cannot be refused nor give a value the
 * operation refuses before null (`cannotRefuse`), as its Schema or its form
 * says.
 */
export const nullBesideUnrefused = <T>(
  view: View<T>,
  op: Node.AnyOp,
  args: ReadonlyArray<T>,
): boolean => {
  // A foreign call with no implementation is refused before its null rule.
  if (Node.isForeign(op) || op.nulls !== 'strict') return false
  const known = args.map(view.known)
  if (known.every(Option.isSome)) return false
  const isNull = (index: number): boolean => Option.exists(known[index]!, value => value === null)
  return (
    args.some((_, index) => isNull(index)) &&
    args.every((arg, index) => isNull(index) || view.cannotRefuse(arg))
  )
}

/**
 * The size-reducing rewrite of a core call some of whose operands are not
 * known, from the operation's row of `opLaws`, then its fold over a known list
 * of candidates (`eq.in`, `eq.among`). A law that returns an operand holds
 * only where the operand is what the operation would have returned: `x + 0`
 * over text is refused, `x` is not, and so is `x + 0` over 2^60.
 */
export const rewrite = <T>(
  view: View<T>,
  op: Node.Op,
  args: ReadonlyArray<T>,
): Option.Option<Rewrite<T>> => {
  const laws = opLaws[op.id]
  const ofKind = (operand: T): boolean =>
    op.returns === 'operand' ||
    (Option.exists(view.kind(operand), kind => kind === op.returns) &&
      (op.returns !== 'number' || view.safe(operand)))
  const isLit = (operand: T, expected: unknown): boolean =>
    Option.exists(
      view.known(operand),
      value => Object.is(value, expected) || (value === 0 && expected === 0),
    )

  if (args.length === 1) {
    const inner = view.unary(args[0]!)
    const again = inner !== undefined && inner.id === op.id
    if (again && laws.idempotent === true) return Option.some({ operand: args[0]! })
    if (again && laws.involution === true && ofKind(inner.arg)) {
      return Option.some({ operand: inner.arg })
    }
  }

  if (args.length === 2) {
    const left = args[0]!
    const right = args[1]!

    if (laws.absorbing !== undefined) {
      const { value, result, side, unlessRefused } = laws.absorbing
      // A refusal is not absorbed: the operand dropped must be one that cannot be refused.
      const drops = (operand: T): boolean => unlessRefused !== true || view.cannotRefuse(operand)
      if ((side === 'left' || side === 'both') && isLit(left, value) && drops(right)) {
        return Option.some({ value: result })
      }
      if ((side === 'right' || side === 'both') && isLit(right, value) && drops(left)) {
        return Option.some({ value: result })
      }
    }

    if (laws.identity !== undefined) {
      const { value, side, over } = laws.identity
      const fitsIdentity = (operand: T): boolean => {
        if (!ofKind(operand)) return false
        if (over === undefined || over === 'all') return true
        if (over === 'portableText') {
          const known = view.known(operand)
          if (Option.isSome(known)) {
            if (known.value === null) return true
            return (
              typeof known.value === 'string' &&
              !Node.holdsNul([known.value]) &&
              wellFormed(known.value) === known.value
            )
          }
          const inner = view.unary(operand)
          return (
            inner !== undefined &&
            (inner.id === 'str.lowerAscii' ||
              inner.id === 'str.upperAscii' ||
              inner.id === 'str.trim')
          )
        }
        const known = view.known(operand)
        if (Option.isSome(known)) {
          if (known.value === null) return true
          if (typeof known.value !== 'number' || !Number.isSafeInteger(known.value)) return false
          return over === 'integers' || (known.value >= EARLIEST_DAY && known.value <= LATEST_DAY)
        }
        if (view.ast === undefined) return false
        const ast = view.ast(operand)
        if (Option.isNone(ast)) return false
        const members = present(ast.value)
        if (members.length === 0) return false
        return members.every(member => {
          if (!SchemaAST.isNumber(member)) return false
          const checks = flatChecks(member.checks)
          const isInt = checks.some(
            c => c.annotations?.representation?.id === 'effect/schema/isInt',
          )
          if (!isInt) return false
          if (over === 'integers') return true
          let lo = -Infinity
          let hi = Infinity
          for (const c of checks) {
            const rep = c.annotations?.representation as
              | { readonly id?: string; readonly payload?: Record<string, unknown> }
              | undefined
            if (typeof rep?.payload?.['minimum'] === 'number')
              lo = Math.max(lo, rep.payload['minimum'])
            if (typeof rep?.payload?.['maximum'] === 'number')
              hi = Math.min(hi, rep.payload['maximum'])
          }
          return lo >= EARLIEST_DAY && hi <= LATEST_DAY
        })
      }
      if ((side === 'left' || side === 'both') && isLit(left, value) && fitsIdentity(right)) {
        return Option.some({ operand: right })
      }
      if ((side === 'right' || side === 'both') && isLit(right, value) && fitsIdentity(left)) {
        return Option.some({ operand: left })
      }
    }

    const same = view.same(left, right)
    if (laws.idempotent === true && same && ofKind(left)) return Option.some({ operand: left })
    if (laws.reflexive !== undefined && same && view.isPortableRead(left)) {
      return Option.some({ value: laws.reflexive.value })
    }

    const candidates = Option.filter(view.known(right), Array.isArray)
    if (Option.isSome(candidates) && (op.id === 'eq.in' || op.id === 'eq.among')) {
      const list = candidates.value
      if (op.id === 'eq.in') {
        // A refused needle is refused, not false: only a read of no NUL text is known not to be.
        if (list.length === 0 && view.isPortableRead(left)) return Option.some({ value: false })
        if (list.length === 1) return Option.some({ call: isOp, operand: left, literal: list[0] })
      } else {
        // A value that is not refused is among no candidate.
        if (list.length === 0 && (view.isRead(left) || view.cannotRefuse(left))) {
          return Option.some({ value: false })
        }
        const [only] = list
        if (list.length === 1 && only !== null && only !== undefined) {
          return Option.some({ call: equalsOp, operand: left, literal: only })
        }
      }
    }
  }

  return Option.none()
}

const flatChecks = (
  checks: ReadonlyArray<SchemaAST.Check<unknown>> | undefined,
): ReadonlyArray<SchemaAST.Check<unknown>> =>
  (checks ?? []).flatMap(check =>
    Match.valueTags(check, {
      FilterGroup: group => flatChecks(group.checks),
      Filter: filter => [filter],
    }),
  )

const sameCheck = (have: SchemaAST.Check<unknown>, need: SchemaAST.Check<unknown>): boolean => {
  if (have === need) return true
  const h = have.annotations?.representation
  const n = need.annotations?.representation
  if (h?.id === undefined || n?.id === undefined || h.id !== n.id) return false
  return JSON.stringify(h.payload ?? null) === JSON.stringify(n.payload ?? null)
}

const memberWithin = (
  member: SchemaAST.AST,
  target: SchemaAST.AST,
  checkArg: (value: unknown) => boolean,
): boolean => {
  if (member === target) return true
  if (SchemaAST.isUnion(target)) return target.types.some(t => memberWithin(member, t, checkArg))
  if (SchemaAST.isLiteral(member)) return checkArg(member.literal)
  if (member._tag !== target._tag) return false
  if (SchemaAST.isNumber(member) || SchemaAST.isString(member) || SchemaAST.isBoolean(member)) {
    const have = flatChecks(member.checks)
    const need = flatChecks(target.checks)
    return need.every(req => have.some(candidate => sameCheck(candidate, req)))
  }
  return false
}

const admitsNull = (ast: SchemaAST.AST): boolean =>
  SchemaAST.isNull(ast) ||
  SchemaAST.isUndefined(ast) ||
  Option.isSome(optionInner(ast)) ||
  (SchemaAST.isUnion(ast) && ast.types.some(admitsNull))

const astWithin = (
  source: SchemaAST.AST,
  target: SchemaAST.AST,
  checkArg: (value: unknown) => boolean,
  allowNull: boolean,
): boolean => {
  if (!allowNull && admitsNull(source)) return false
  if (source === target) return true
  const members = present(source)
  if (members.length === 0) return false
  return members.every(member => memberWithin(member, target, checkArg))
}

/**
 * Size-reducing rewrites for a declared custom operation (`ForeignOp`) from
 * its `claims`: `identity`, `absorbing` and `idempotent`. An operand dropped
 * or returned must be statically known to lie within the argument Schema (or
 * null for a strict operation's `identity`/`idempotent`), and for `absorbing`
 * must also be known not to be refused.
 */
export const rewriteForeign = <T>(
  view: View<T>,
  op: Node.ForeignOp,
  args: ReadonlyArray<T>,
): Option.Option<Rewrite<T>> => {
  const { claims, args: argSchemas, checkArgs } = op
  if (claims === undefined || argSchemas === undefined || checkArgs === undefined) {
    return Option.none()
  }

  const isLit = (operand: T, expected: unknown): boolean =>
    Option.exists(
      view.known(operand),
      value => Object.is(value, expected) || (value === 0 && expected === 0),
    )

  const withinSchema = (operand: T, index: number, allowNull: boolean): boolean => {
    const target = argSchemas[index]
    const check = checkArgs[index]
    if (target === undefined || check === undefined) return false
    const known = view.known(operand)
    if (Option.isSome(known)) {
      if (known.value === null) return allowNull
      return !Node.isRefusal(known.value) && check.is(known.value)
    }
    const ast = view.ast === undefined ? Option.none() : view.ast(operand)
    return Option.exists(ast, source => astWithin(source, target.ast, check.is, allowNull))
  }

  const strict = op.nulls === 'strict'

  if (args.length === 1 && claims.idempotent === true) {
    const inner = view.unary(args[0]!)
    if (
      inner !== undefined &&
      inner.id === Node.foreignName(op) &&
      withinSchema(args[0]!, 0, strict)
    ) {
      return Option.some({ operand: args[0]! })
    }
  }

  if (args.length === 2) {
    const left = args[0]!
    const right = args[1]!

    if (claims.absorbing !== undefined) {
      const { value, result, side } = claims.absorbing
      const drops = (operand: T, index: number): boolean =>
        view.cannotRefuse(operand) && withinSchema(operand, index, false)
      if ((side === 'left' || side === 'both') && isLit(left, value) && drops(right, 1)) {
        return Option.some({ value: result })
      }
      if ((side === 'right' || side === 'both') && isLit(right, value) && drops(left, 0)) {
        return Option.some({ value: result })
      }
    }

    if (claims.identity !== undefined) {
      const { value, side } = claims.identity
      if (
        (side === 'left' || side === 'both') &&
        isLit(left, value) &&
        withinSchema(right, 1, strict)
      ) {
        return Option.some({ operand: right })
      }
      if (
        (side === 'right' || side === 'both') &&
        isLit(right, value) &&
        withinSchema(left, 0, strict)
      ) {
        return Option.some({ operand: left })
      }
    }

    if (
      claims.idempotent === true &&
      view.same(left, right) &&
      withinSchema(left, 0, strict) &&
      withinSchema(right, 1, strict)
    ) {
      return Option.some({ operand: left })
    }
  }

  return Option.none()
}
