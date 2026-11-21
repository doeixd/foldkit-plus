import { Option } from 'effect'
import type { Arith, Bool, Context, Solver } from 'z3-solver'
import { abstractOps } from '../abstract/ops.js'
import * as Node from '../node.js'
import * as Str from '../ops/str.js'
import * as Path from '../path.js'
import type { PathInfo, Shape, Sort } from './shape.js'
import { textReading } from './text.js'

export type Z3 = Context<'metakit'>
export type ZBool = Bool<'metakit'>
export type ZArith = Arith<'metakit'>
export type ZExpr = ZBool | ZArith

/** What a term is, where the Schema or the operator says: a mismatch is undecided, not a proof. */
export type Kind = 'bool' | 'num' | 'text' | 'null' | 'other'

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
    const made = z3.Bool.const(name)
    flagVars.set(name, made)
    return made
  }
  const anyOf = (flags: ReadonlyArray<string>): ZBool =>
    flags.length === 0 ? z3.Bool.val(false) : z3.Or(...flags.map(flagVar))

  const textCodes = new Map<string, number>()
  const codeTexts = new Map<number, string>()
  const codeOf = (text: string): number => {
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
    if (z3.isBool(value) || z3.isArith(value)) return value
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
  const branches = (a: Term, b: Term): readonly [ZExpr, ZExpr] => {
    const left = a.kind === 'null' ? b.value : a.value
    const right = b.kind === 'null' ? a.value : b.value
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
    (apply: (a: ZArith, b: ZArith) => ZBool) =>
    ([a, b]: ReadonlyArray<Term>): Term =>
      strict('bool', [a!, b!], apply(...aligned(number(a!), number(b!))))
  // The solver's numbers are exact. Whatever leaves the safe range is taken
  // for refused, an integer or not: a proof then never rests on a double's rounding there.
  const arithmetic =
    (apply: (a: ZArith, b: ZArith) => ZArith) =>
    ([a, b]: ReadonlyArray<Term>): Term => {
      const result = apply(...aligned(number(a!), number(b!)))
      return strict('num', [a!, b!], result, unsafe(result))
    }
  /** Kleene: `settling` when either side is, then a refusal, then null, then the other value. */
  const kleene = (settling: boolean) => {
    const settles = settling ? holds : fails
    return (args: ReadonlyArray<Term>): Term => {
      const settled = z3.Or(...args.map(settles))
      const refused = z3.And(z3.Not(settled), anyRefused(args))
      return {
        value: settling ? settled : z3.Not(settled),
        isNull: z3.And(z3.Not(settled), z3.Not(refused), anyNull(args)),
        refused,
        kind: 'bool',
      }
    }
  }
  const length = (node: Node.Node): ZArith =>
    Node.$is('Lit')(node) && typeof node.value === 'string'
      ? z3.Int.val(Str.codePointLength(node.value))
      : measure('strLen', node)

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
  })
  const { nulOf } = text

  /** A candidate list written as a literal, as SQL's `in` takes one. */
  const candidatesOf = (id: string, list: Node.Node): ReadonlyArray<unknown> => {
    if (!Node.$is('Lit')(list) || !Array.isArray(list.value)) {
      throw new Unsupported(`${id} of candidates that are not a literal array`)
    }
    return list.value
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
    'ord.lt': compare((a, b) => a.lt(b)),
    'ord.lte': compare((a, b) => a.le(b)),
    'ord.gt': compare((a, b) => a.gt(b)),
    'ord.gte': compare((a, b) => a.ge(b)),
    'num.add': arithmetic((a, b) => a.add(b)),
    'num.sub': arithmetic((a, b) => a.sub(b)),
    'num.mul': arithmetic((a, b) => a.mul(b)),
    'num.neg': ([a]) => {
      const result = number(a!).neg()
      return strict('num', [a!], result, unsafe(result))
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
    'arr.isEmpty': ([a], [node]) =>
      strict(
        'bool',
        [a!],
        Node.$is('Lit')(node!) && Array.isArray(node.value)
          ? z3.Bool.val(node.value.length === 0)
          : measure('arrCount', node!).eq(0),
      ),
    'arr.append': () => listWrite('arr.append'),
    'arr.include': () => listWrite('arr.include'),
    'arr.exclude': () => listWrite('arr.exclude'),
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
        // Text holding a NUL is refused; a strict operator gives null first.
        const nul = z3.And(
          z3.Not(anyRefused(operands)),
          z3.Or(...args.map(nulOf)),
          op.nulls === 'strict' ? z3.Not(anyNull(operands)) : z3.Bool.val(true),
        )
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
          onNone: () => {
            // Evaluation refuses a value no case names; only a Schema that names every value rules it out.
            const named = new Set(cases.map(([value]) => value))
            const info = Node.$is('Path')(on)
              ? shape.paths.get(Path.format(on.segments))
              : undefined
            const covered =
              info !== undefined &&
              info.sort === 'text' &&
              info.literals.length > 0 &&
              info.literals.every(value => named.has(String(value)))
            if (!covered) {
              throw new Unsupported('a match that may meet a value none of its cases names')
            }
            // A null subject, the one value left, gives null.
            return literal(null)
          },
        })
        // A null subject takes no arm, so it reaches `rest`; only a refusal is the answer itself.
        const chosen = arms.reduceRight((acc, [takesArm, arm]) => choose(takesArm, arm, acc), rest)
        return { ...chosen, refused: z3.Or(target.refused, chosen.refused) }
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
      Rows: ({ fold }): Term => {
        throw new Unsupported(`the fold rows.${fold}`)
      },
    })

  /** The flags by which a model puts a NUL in text. */
  const nulFlags = (): ReadonlyArray<ZBool> =>
    Array.from(flagVars).flatMap(([name, flag]) => (name.startsWith('nul:') ? [flag] : []))

  return { lower, holds, flagVar, vars, lengths, codeTexts, opaque, nanReads, nulFlags }
}

export type Lowered = ReturnType<typeof lowering>
