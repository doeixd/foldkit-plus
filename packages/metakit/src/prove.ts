/**
 * Dev-only prover (`metakit/prove`): the synchronous Interval and Zone checks
 * first, then the Z3 solver for what they leave undecided.
 *
 * The solver reads an expression as evaluation does: every term is a value
 * and whether it is null, an operator over a null operand is null, `and` and
 * `or` are Kleene, and a rule holds only where it is true. Text and arrays
 * are not modelled beyond their length and count, so a goal that rests on
 * more is undecided. Whatever the solver assigns is replayed through the
 * Schemas and the evaluator before it is called a counterexample.
 */
import { Data, Effect, Option, Predicate, Result, Schema, SchemaAST } from 'effect'
import type { Arith, Bool, Context } from 'z3-solver'
import * as AbstractCheck from './abstract/check.js'
import type { Slice } from './abstract/unordered.js'
import * as Expr from './expr.js'
import type { Machine } from './machine.js'
import * as Node from './node.js'
import { notOp, orOp } from './ops/bool.js'
import { wrap } from './ops/core.js'
import { inOp } from './ops/eq.js'
import { isNullOp } from './ops/null.js'
import { gtOp, gteOp, ltOp, lteOp } from './ops/ord.js'
import * as Str from './ops/str.js'
import * as Path from './path.js'
import * as Policy from './policy.js'
import * as Temporal from './temporal.js'
import * as Transition from './transition.js'
import * as Verdict from './verdict.js'

type Z3 = Context<'metakit'>
type ZBool = Bool<'metakit'>
type ZArith = Arith<'metakit'>
type ZExpr = ZBool | ZArith

/** `z3-solver`, an optional peer, could not be loaded when a proof needed it. */
export class SolverUnavailableError extends Data.TaggedError('SolverUnavailableError')<{
  readonly cause: unknown
}> {
  override get message(): string {
    return 'metakit/prove needs the optional peer "z3-solver" for a goal its synchronous checks leave undecided'
  }
}

export interface ProveOptions {
  /** How long the solver may spend on one proof, in milliseconds. Default 10,000. */
  readonly timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 10_000

type Proof = Verdict.Verdict<Readonly<Record<string, unknown>>>

let loadedZ3: Option.Option<Promise<Z3>> = Option.none()

/** The solver context, loaded once; a failed load is not kept, so a later call tries again. */
const getZ3: Effect.Effect<Z3, SolverUnavailableError> = Effect.tryPromise({
  try: () => {
    if (Option.isSome(loadedZ3)) return loadedZ3.value
    const loading = import('z3-solver').then(async ({ init }) => {
      const { Context } = await init()
      return new Context('metakit')
    })
    loadedZ3 = Option.some(loading)
    loading.catch(() => {
      loadedZ3 = Option.none()
    })
    return loading
  },
  catch: cause => new SolverUnavailableError({ cause }),
})

// ---------------------------------------------------------------------------
// What a Schema says of each path
// ---------------------------------------------------------------------------

type Sort = 'int' | 'real' | 'bool' | 'text' | 'struct' | 'other'

interface PathInfo {
  readonly segments: ReadonlyArray<string>
  readonly sort: Sort
  readonly ast: SchemaAST.AST
  /** The flags any of which makes a read of this path null: its ancestors' and its own. */
  readonly flags: ReadonlyArray<string>
  readonly literals: ReadonlyArray<string | number | boolean>
  /** Inclusive bounds and exclusive ones, each the tightest declared. */
  readonly min: Option.Option<number>
  readonly max: Option.Option<number>
  readonly exclusiveMin: Option.Option<number>
  readonly exclusiveMax: Option.Option<number>
  /** A number whose Schema accepts NaN, which has no order. */
  readonly nan: boolean
}

/** A path that may read as null, and what a witness writes there: null, undefined, or no key. */
interface Absence {
  readonly segments: ReadonlyArray<string>
  readonly as: 'null' | 'undefined' | 'omitted'
}

interface Shape {
  readonly paths: Map<string, PathInfo>
  readonly absences: Map<string, Absence>
}

interface Bounds {
  min: Option.Option<number>
  max: Option.Option<number>
  exclusiveMin: Option.Option<number>
  exclusiveMax: Option.Option<number>
  int: boolean
}

const tighter = (
  prior: Option.Option<number>,
  value: unknown,
  pick: (a: number, b: number) => number,
): Option.Option<number> =>
  typeof value === 'number' && Number.isFinite(value)
    ? Option.some(Option.match(prior, { onNone: () => value, onSome: p => pick(p, value) }))
    : prior

const readChecks = (checks: ReadonlyArray<SchemaAST.Check<unknown>>, bounds: Bounds): void => {
  for (const check of checks) {
    const representation = check.annotations?.representation
    const payload: Readonly<Record<string, unknown>> = Predicate.isObject(representation?.payload)
      ? representation.payload
      : {}
    switch (representation?.id) {
      case 'effect/schema/isInt':
        bounds.int = true
        break
      case 'effect/schema/isGreaterThanOrEqualTo':
        bounds.min = tighter(bounds.min, payload['minimum'], Math.max)
        break
      case 'effect/schema/isGreaterThan':
        bounds.exclusiveMin = tighter(bounds.exclusiveMin, payload['exclusiveMinimum'], Math.max)
        break
      case 'effect/schema/isLessThanOrEqualTo':
        bounds.max = tighter(bounds.max, payload['maximum'], Math.min)
        break
      case 'effect/schema/isLessThan':
        bounds.exclusiveMax = tighter(bounds.exclusiveMax, payload['exclusiveMaximum'], Math.min)
        break
      case 'effect/schema/isBetween':
        if (payload['exclusiveMinimum'] === true) {
          bounds.exclusiveMin = tighter(bounds.exclusiveMin, payload['minimum'], Math.max)
        } else {
          bounds.min = tighter(bounds.min, payload['minimum'], Math.max)
        }
        if (payload['exclusiveMaximum'] === true) {
          bounds.exclusiveMax = tighter(bounds.exclusiveMax, payload['maximum'], Math.min)
        } else {
          bounds.max = tighter(bounds.max, payload['maximum'], Math.min)
        }
        break
    }
    if (check._tag === 'FilterGroup') readChecks(check.checks, bounds)
  }
}

const scalarLiteral = (ast: SchemaAST.AST): Option.Option<string | number | boolean> =>
  SchemaAST.isLiteral(ast) &&
  (typeof ast.literal === 'string' ||
    typeof ast.literal === 'number' ||
    typeof ast.literal === 'boolean')
    ? Option.some(ast.literal)
    : Option.none()

const noBounds = {
  min: Option.none<number>(),
  max: Option.none<number>(),
  exclusiveMin: Option.none<number>(),
  exclusiveMax: Option.none<number>(),
}

/** Read `ast` at `segments` into `shape`: every struct and field under it, with what may be null. */
const readShape = (
  ast: SchemaAST.AST,
  segments: ReadonlyArray<string>,
  above: ReadonlyArray<string>,
  optional: boolean,
  shape: Shape,
): void => {
  const name = Path.format(segments)
  const members = SchemaAST.isUnion(ast) ? ast.types : [ast]
  const present = members.filter(m => !SchemaAST.isNull(m) && !SchemaAST.isUndefined(m))
  const admitsNull = members.some(SchemaAST.isNull)
  const admitsUndefined = members.some(SchemaAST.isUndefined)
  const mayBeAbsent = admitsNull || optional || admitsUndefined
  const flag = `absent:${name}`
  const flags = mayBeAbsent ? [...above, flag] : above
  if (mayBeAbsent) {
    shape.absences.set(flag, {
      segments,
      as: admitsNull ? 'null' : admitsUndefined ? 'undefined' : 'omitted',
    })
  }
  const inner = present.length === 1 ? present[0]! : ast
  const info = (sort: Sort, more?: Partial<PathInfo>): void => {
    shape.paths.set(name, {
      segments,
      sort,
      ast: inner,
      flags,
      literals: [],
      ...noBounds,
      nan: false,
      ...more,
    })
  }
  if (present.length === 1 && SchemaAST.isObjects(inner) && inner.indexSignatures.length === 0) {
    info('struct')
    for (const property of inner.propertySignatures) {
      if (typeof property.name === 'string') {
        readShape(
          property.type,
          [...segments, property.name],
          flags,
          SchemaAST.isOptional(property.type),
          shape,
        )
      }
    }
    return
  }
  // `NullOr(Literals([...]))` holds its literals in a union of their own.
  const choices = present.length === 1 && SchemaAST.isUnion(inner) ? inner.types : present
  const literals = choices.flatMap(choice => Option.toArray(scalarLiteral(choice)))
  if (choices.length > 0 && literals.length === choices.length) {
    const kinds = new Set(literals.map(literal => typeof literal))
    // Text codes and numbers share the solver's integers, so a mixed set has no sort.
    if (kinds.size > 1) return info('other', { literals })
    const sort: Sort =
      typeof literals[0] === 'string'
        ? 'text'
        : typeof literals[0] === 'boolean'
          ? 'bool'
          : literals.every(literal => Number.isInteger(literal))
            ? 'int'
            : 'real'
    return info(sort, { literals })
  }
  if (present.length > 1 && present.every(SchemaAST.isNumber)) {
    // A union of numbers is a number that may hold a fraction; its members' bounds are not one bound.
    return info('real', { nan: Schema.is(Schema.make<Schema.Top>(ast))(Number.NaN) })
  }
  if (present.length !== 1) return info('other')
  if (SchemaAST.isNumber(inner)) {
    const bounds: Bounds = { ...noBounds, int: false }
    readChecks(inner.checks ?? [], bounds)
    const { int, ...declared } = bounds
    return info(int ? 'int' : 'real', {
      ...declared,
      nan: Schema.is(Schema.make<Schema.Top>(inner))(Number.NaN),
    })
  }
  if (SchemaAST.isBoolean(inner)) return info('bool')
  if (SchemaAST.isString(inner)) return info('text')
  return info('other')
}

const shapeOf = (slices: ReadonlyArray<Slice>): Shape => {
  const shape: Shape = { paths: new Map(), absences: new Map() }
  for (const [under, schema] of slices) readShape(schema.ast, under, [], false, shape)
  return shape
}

// ---------------------------------------------------------------------------
// Lowering to the solver
// ---------------------------------------------------------------------------

/** What a term is, where the Schema or the operator says: a mismatch is undecided, not a proof. */
type Kind = 'bool' | 'num' | 'text' | 'null' | 'other'

/**
 * A term as evaluation gives it: a value, null, or a refusal (a number past
 * the safe range). At most one of `isNull` and `refused` is true, and `value`
 * means something only where neither is.
 */
interface Term {
  readonly value: ZExpr
  readonly isNull: ZBool
  readonly refused: ZBool
  readonly kind: Kind
}

/** Thrown where the lowering cannot say what evaluation would; the proof is then undecided. */
class Unsupported extends Error {}

interface Problem {
  readonly slices: ReadonlyArray<Slice>
  /** Rules that hold of every environment considered. */
  readonly given: ReadonlyArray<Node.Node>
  /** The search is for an environment where one of these does not hold. */
  readonly goals: ReadonlyArray<Node.Node>
  readonly timeoutMs: number
}

type Solved = Data.TaggedEnum<{
  /** No environment keeps `given` and breaks a goal. */
  Unsat: {}
  /** The solver's assignment, as an environment and as `path -> value`. */
  Sat: { readonly env: unknown; readonly flat: Readonly<Record<string, unknown>> }
  Undecided: { readonly reason: string; readonly obligation: Option.Option<Verdict.Obligation> }
}>
const Solved = Data.taggedEnum<Solved>()

const undecided = (reason: string, kind: Verdict.Obligation['kind'], detail: string): Solved =>
  Solved.Undecided({ reason, obligation: Option.some({ kind, detail }) })

const sortKind: Readonly<Record<Sort, Kind>> = {
  int: 'num',
  real: 'num',
  bool: 'bool',
  text: 'text',
  struct: 'other',
  other: 'other',
}

/** A value for a path the solver holds no more of than a token: empty, where empty is valid. */
const placeholder = (ast: SchemaAST.AST): Option.Option<unknown> => {
  if (SchemaAST.isArrays(ast)) return Option.some([])
  if (SchemaAST.isObjects(ast)) return Option.some({})
  if (SchemaAST.isString(ast)) return Option.some('')
  if (SchemaAST.isNumber(ast)) return Option.some(0)
  if (SchemaAST.isBoolean(ast)) return Option.some(false)
  if (SchemaAST.isLiteral(ast)) return Option.some(ast.literal)
  if (SchemaAST.isUnion(ast)) {
    return Option.firstSomeOf(
      ast.types.filter(m => !SchemaAST.isNull(m) && !SchemaAST.isUndefined(m)).map(placeholder),
    )
  }
  return Option.none()
}

/** Text of `length` code points for the solver's `code`, distinct from other codes where it has room. */
const witnessText = (code: string, length: Option.Option<number>): string =>
  Option.match(length, {
    onNone: () => `model-string:${code}`,
    onSome: size => `#${code}`.padEnd(size, '_').slice(0, size),
  })

const solve = async (z3: Z3, problem: Problem): Promise<Solved> => {
  const shape = shapeOf(problem.slices)
  const solver = new z3.Solver()
  solver.set('timeout', problem.timeoutMs)

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
  /** A text predicate the solver cannot read: free, but for the lengths it implies. */
  const textPredicate =
    (id: 'str.startsWith' | 'str.contains', test: (text: string, part: string) => boolean) =>
    ([text, part]: ReadonlyArray<Term>, [textNode, partNode]: ReadonlyArray<Node.Node>): Term => {
      const known = (node: Node.Node): Option.Option<string> =>
        Node.$is('Lit')(node) && typeof node.value === 'string'
          ? Option.some(node.value)
          : Option.none()
      const a = known(textNode!)
      const b = known(partNode!)
      if (Option.isSome(a) && Option.isSome(b)) {
        return present(z3.Bool.val(test(a.value, b.value)), 'bool')
      }
      // Every text begins with and contains the empty one.
      if (Option.isSome(b) && b.value === '') {
        return strict('bool', [text!, part!], z3.Bool.val(true))
      }
      const key = `${id}:${Node.key(textNode!)}:${Node.key(partNode!)}`
      let free = opaque.get(key)
      if (free === undefined) {
        free = z3.Bool.const(key)
        opaque.set(key, free)
        solver.add(z3.Implies(bool(present(free, 'bool')), length(textNode!).ge(length(partNode!))))
      }
      return strict('bool', [text!, part!], free)
    }
  const length = (node: Node.Node): ZArith =>
    Node.$is('Lit')(node) && typeof node.value === 'string'
      ? z3.Int.val(Str.codePointLength(node.value))
      : measure('strLen', node)

  type Lowerer = (args: ReadonlyArray<Term>, nodes: ReadonlyArray<Node.Node>) => Term

  /** The solver's reading of every primitive: a new one fails to compile until it has a row here. */
  const smtOps: Readonly<Record<Node.CoreOpId, Lowerer>> = {
    'bool.and': kleene(false),
    'bool.or': kleene(true),
    'bool.not': ([a]) => strict('bool', [a!], z3.Not(bool(a!))),
    'eq.is': ([a, b]) => nullSafe([a!, b!], is(a!, b!)),
    'eq.isNot': ([a, b]) => nullSafe([a!, b!], z3.Not(is(a!, b!))),
    'eq.in': ([needle], [, list]) => {
      if (!Node.$is('Lit')(list!) || !Array.isArray(list.value)) {
        throw new Unsupported('eq.in of candidates that are not a literal array')
      }
      const candidates: ReadonlyArray<unknown> = list.value
      return nullSafe(
        [needle!],
        candidates.length === 0
          ? never
          : z3.Or(...candidates.map(candidate => is(needle!, literal(candidate)))),
      )
    },
    'null.isNull': ([a]) => nullSafe([a!], a!.isNull),
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
    'str.startsWith': textPredicate('str.startsWith', (text, part) => text.startsWith(part)),
    'str.contains': textPredicate('str.contains', (text, part) => text.includes(part)),
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
      Call: ({ op, args }) => smtOps[op.id](args.map(lower), args),
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
    })

  try {
    for (const rule of problem.given) solver.add(holds(lower(rule)))
    if (problem.goals.length === 0) return Solved.Unsat()
    solver.add(z3.Or(...problem.goals.map(goal => z3.Not(holds(lower(goal))))))
  } catch (error) {
    if (!(error instanceof Unsupported) && !(error instanceof Error)) throw error
    const detail = error.message
    return undecided(`z3 lowering unsupported: ${detail}`, 'unsupported', detail)
  }

  const status = await solver.check()
  if (status === 'unknown') {
    const why = solver.reasonUnknown()
    return /timeout|canceled/.test(why)
      ? undecided(`z3 gave up after ${problem.timeoutMs}ms`, 'budget', why)
      : undecided(`z3 could not decide: ${why}`, 'nonlinear', why)
  }
  if (nanReads.size > 0 && status === 'unsat') {
    const [path] = nanReads
    return Solved.Undecided({
      reason: `"${path}" may hold NaN, which the checkers do not order`,
      obligation: Option.none(),
    })
  }
  if (status === 'unsat') return Solved.Unsat()
  if (opaque.size > 0) {
    return undecided(
      'counterexample involves opaque term',
      'opaque',
      Array.from(opaque.keys()).join(', '),
    )
  }

  const model = solver.model()
  const isSet = (flag: string): boolean => model.eval(flagVar(flag), true).toString() === 'true'
  const absent = new Set(Array.from(shape.absences.keys()).filter(isSet))
  const valueOf = (name: string, info: PathInfo): Option.Option<unknown> => {
    const assigned = model.eval(vars.get(name)!, true)
    switch (info.sort) {
      case 'bool':
        return Option.some(assigned.toString() === 'true')
      case 'int':
      case 'real':
        if (z3.isIntVal(assigned)) return Option.some(Number(assigned.value()))
        return z3.isRealVal(assigned) ? Option.some(assigned.asNumber()) : Option.none()
      case 'text': {
        const code = Number(assigned.toString())
        const measured = lengths.get(
          `strLen:${Node.key(Node.Path({ segments: info.segments, ast: Option.none() }))}`,
        )
        const size =
          measured === undefined
            ? Option.none<number>()
            : Option.some(Number(model.eval(measured, true).toString()))
        return Option.some(codeTexts.get(code) ?? witnessText(assigned.toString(), size))
      }
      case 'struct':
        return Option.some({})
      case 'other':
        return placeholder(info.ast)
    }
  }

  let env: unknown = {}
  const flat: Record<string, unknown> = {}
  const write = (segments: ReadonlyArray<string>, value: unknown): void => {
    env = Path.set(Path.make<unknown, unknown>(segments), env, value)
  }
  // A struct comes before its fields, so a parent that is null is written once and its fields left out.
  const byDepth = Array.from(shape.paths).sort(
    ([, a], [, b]) => a.segments.length - b.segments.length,
  )
  for (const [name, info] of byDepth) {
    const flags = info.flags.filter(flag => absent.has(flag))
    if (flags.length > 0) {
      const own = shape.absences.get(`absent:${name}`)
      if (flags.length === 1 && own !== undefined && flags[0] === `absent:${name}`) {
        if (own.as === 'null') write(info.segments, null)
        if (own.as === 'undefined') write(info.segments, undefined)
        if (info.sort !== 'struct') flat[name] = null
      }
      continue
    }
    const value = valueOf(name, info)
    if (Option.isNone(value)) continue
    write(info.segments, value.value)
    if (info.sort !== 'struct' && info.sort !== 'other') flat[name] = value.value
  }
  return Solved.Sat({ env, flat })
}

// ---------------------------------------------------------------------------
// Proofs
// ---------------------------------------------------------------------------

const proved: Proof = Verdict.True(Option.some(Verdict.Proved('z3')))

const unreproduced: Proof = Verdict.Unknown(
  'the solver assignment could not be reproduced on a valid environment',
)

/** A rule holds only where it evaluates to true: not where it is null, and not where it is refused. */
const holdsOf = (node: Node.Node, env: unknown): boolean =>
  Result.match(Expr.evalResult(wrap<unknown, unknown>(node), env), {
    onSuccess: value => value === true,
    onFailure: () => false,
  })

const at = (env: unknown, under: ReadonlyArray<string>): unknown =>
  Option.getOrUndefined(Path.get(Path.make<unknown, unknown>(under), env))

const valid = (slices: ReadonlyArray<Slice>, env: unknown): boolean =>
  slices.every(([under, schema]) => Schema.is(schema)(at(env, under)))

/**
 * Search for an environment the Schemas of `slices` accept where every rule
 * of `given` holds and one of `goals` does not. `True`: there is none.
 * `False`: one was found and replayed. Anything else is `Unknown`.
 */
const refute = (
  slices: ReadonlyArray<Slice>,
  given: ReadonlyArray<Node.Node>,
  goals: ReadonlyArray<Node.Node>,
  options: ProveOptions | undefined,
  reproduces: (env: unknown) => boolean,
): Effect.Effect<
  { readonly verdict: Proof; readonly env: Option.Option<unknown> },
  SolverUnavailableError
> =>
  Effect.gen(function* () {
    const z3 = yield* getZ3
    const rules = slices.flatMap(([under, schema]) =>
      Expr.refinementsOf(schema).map(rule => Node.prefix(rule.node, under)),
    )
    const solved = yield* Effect.promise(() =>
      solve(z3, {
        slices,
        given: [...rules, ...given],
        goals,
        timeoutMs: options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      }),
    )
    return Solved.$match(solved, {
      Unsat: () => ({ verdict: proved, env: Option.none() }),
      Undecided: ({ reason, obligation }) => ({
        verdict: Verdict.Unknown(reason, obligation),
        env: Option.none(),
      }),
      Sat: ({ env, flat }) =>
        valid(slices, env) && given.every(rule => holdsOf(rule, env)) && reproduces(env)
          ? { verdict: Verdict.False(Option.some(flat)), env: Option.some(env) }
          : { verdict: unreproduced, env: Option.none() },
    })
  })

/** Prove that every value `schema` accepts satisfies `goal`. Runs Tier 3 first; asks Z3 only where it is undecided. */
export const invariant = <S extends Schema.Top>(
  schema: S,
  goal: Expr.Expr<S['Type'], boolean>,
  options?: ProveOptions,
): Effect.Effect<Proof, SolverUnavailableError> => {
  const tier3 = AbstractCheck.checkInvariant(schema, goal)
  if (Verdict.isTrue(tier3)) return Effect.succeed(tier3)
  return Effect.map(
    refute([[[], schema]], [], [goal.node], options, env => !holdsOf(goal.node, env)),
    ({ verdict }) => verdict,
  )
}

/** The value `written` puts at the path `rest` under its target, where that can be followed. */
const project = (written: Node.Node, rest: ReadonlyArray<string>): Node.Node =>
  Node.$match(written, {
    Path: ({ segments }) => Node.Path({ segments: [...segments, ...rest], ast: Option.none() }),
    Lit: ({ value }) =>
      Node.Lit({ value: Option.getOrNull(Path.get(Path.make<unknown, unknown>(rest), value)) }),
    If: ({ cond, then, otherwise }) =>
      Node.If({ cond, then: project(then, rest), otherwise: project(otherwise, rest) }),
    Match: ({ on, cases, otherwise }) =>
      Node.Match({
        on,
        cases: cases.map(([value, branch]) => [value, project(branch, rest)] as const),
        otherwise: Option.map(otherwise, branch => project(branch, rest)),
      }),
    Call: () => {
      throw new Unsupported('a rule reads a field of a value an operator computes')
    },
    Opaque: () => {
      throw new Unsupported('a rule reads a field of a value an opaque term computes')
    },
  })

/**
 * `rule` over the state the writes leave. A write to a parent replaces what a
 * rule reads beneath it; a write beneath what a rule reads whole cannot be
 * followed, and is refused.
 */
const afterWrites = (
  rule: Node.Node,
  writes: ReadonlyArray<Transition.WriteEquation<never, never>>,
): Node.Node =>
  Node.substitutePaths(rule, segments => {
    if (segments[0] !== 'state') return Option.none()
    const read = segments.slice(1)
    for (const { target, value } of writes) {
      if (Path.isPrefix(target, read)) {
        return Option.some(
          target.length === read.length
            ? value.node
            : project(value.node, read.slice(target.length)),
        )
      }
      if (Path.isPrefix(read, target)) {
        throw new Unsupported(
          `a rule reads "${Path.format(read)}" whole and the transition writes "${Path.format(target)}" within it`,
        )
      }
    }
    return Option.none()
  })

const call = (op: Node.Op, ...args: ReadonlyArray<Node.Node>): Node.Node => Node.Call({ op, args })
const lit = (value: unknown): Node.Node => Node.Lit({ value })

/**
 * What the state Schema asks of a written field beyond its rules: a field
 * that may not be null is not, and a bound or a set of literals declared
 * inside `NullOr` or `optional` (which no rule reads) holds of what is written.
 */
const writtenFits = (info: PathInfo, value: Node.Node, shape: Shape): ReadonlyArray<Node.Node> => {
  const isNull = call(isNullOp, value)
  const bound = (op: Node.Op, limit: Option.Option<number>): ReadonlyArray<Node.Node> =>
    Option.match(limit, { onNone: () => [], onSome: at => [call(op, value, lit(at))] })
  const fits = [
    ...bound(gteOp, info.min),
    ...bound(lteOp, info.max),
    ...bound(gtOp, info.exclusiveMin),
    ...bound(ltOp, info.exclusiveMax),
    ...(info.literals.length > 0 && info.sort !== 'other'
      ? [call(inOp, value, lit(info.literals))]
      : []),
  ]
  if (info.flags.length > 0) return fits.map(fit => call(orOp, isNull, fit))
  return mayBeNull(value, shape) ? [call(notOp, isNull), ...fits] : fits
}

/** Whether `node` can be null, read off its form: an operator is null only of a null operand. */
const mayBeNull = (node: Node.Node, shape: Shape): boolean =>
  Node.$match(node, {
    Lit: ({ value }) => value === null || value === undefined,
    Path: ({ segments }) =>
      Option.match(Option.fromUndefinedOr(shape.paths.get(Path.format(segments))), {
        onNone: () => true,
        onSome: info => info.flags.length > 0,
      }),
    Call: ({ op, args }) =>
      (op.nulls === 'strict' || op.id === 'bool.and' || op.id === 'bool.or') &&
      args.some(arg => mayBeNull(arg, shape)),
    If: ({ cond, then, otherwise }) => [cond, then, otherwise].some(part => mayBeNull(part, shape)),
    Match: () => true,
    Opaque: () => true,
  })

interface Replay {
  readonly before: unknown
  readonly input: unknown
  readonly after: unknown
}

const proveTransition = <State, Input, Emit>(
  stateSchema: Schema.Codec<State>,
  tr: Transition.Transition<State, Input, Emit>,
  options: ProveOptions | undefined,
): Effect.Effect<
  { readonly verdict: Proof; readonly replay: Option.Option<Replay> },
  SolverUnavailableError
> => {
  const slices: Array<Slice> = [[['state'], stateSchema]]
  if (Option.isSome(tr.inputSchema)) slices.push([['input'], tr.inputSchema.value])
  const tier3 = AbstractCheck.checkTransition(stateSchema, tr)
  if (Verdict.isTrue(tier3)) return Effect.succeed({ verdict: tier3, replay: Option.none() })

  const shape = shapeOf(slices)
  const rules = Expr.refinementsOf(stateSchema).map(rule => Node.prefix(rule.node, ['state']))
  const fits = tr.writes.flatMap(write =>
    Option.match(Option.fromUndefinedOr(shape.paths.get(Path.format(['state', ...write.target]))), {
      onNone: () => [],
      onSome: info => writtenFits(info, write.value.node, shape),
    }),
  )

  let goals: ReadonlyArray<Node.Node>
  try {
    goals = [...rules.map(rule => afterWrites(rule, tr.writes)), ...fits]
  } catch (error) {
    if (!(error instanceof Unsupported)) throw error
    return Effect.succeed({
      verdict: Verdict.Unknown(
        error.message,
        Option.some({ kind: 'unsupported', detail: error.message }),
      ),
      replay: Option.none(),
    })
  }

  let replayed = Option.none<Replay>()
  return Effect.map(
    refute(slices, [tr.when.node], goals, options, env => {
      const before = at(env, ['state']) as State
      const input = (at(env, ['input']) ?? {}) as Input
      const stepped = Transition.run(tr, before, input)
      if (Result.isFailure(stepped) || Schema.is(stateSchema)(stepped.success)) return false
      replayed = Option.some({ before, input, after: stepped.success })
      return true
    }),
    ({ verdict }) => ({ verdict, replay: replayed }),
  )
}

/**
 * Prove that `transition` leaves every state `stateSchema` accepts, under an
 * input its input Schema accepts and a guard that holds, a state the Schema
 * still accepts.
 */
export const transition = <S extends Schema.Top, I, Emit>(
  stateSchema: S,
  tr: Transition.Transition<S['Type'], I, Emit>,
  options?: ProveOptions,
): Effect.Effect<Proof, SolverUnavailableError> =>
  Effect.map(
    proveTransition(stateSchema as unknown as Schema.Codec<S['Type']>, tr, options),
    ({ verdict }) => verdict,
  )

/**
 * Prove that `goal` holds of every environment the Schemas of `shape` accept
 * and every rule of `options.hypotheses` holds of.
 */
export const policy = <Shape extends Readonly<Record<string, Schema.Top>>>(
  shape: Shape,
  goal: Expr.Expr<Path.EnvOf<Shape>, boolean>,
  options?: ProveOptions & {
    readonly hypotheses?: ReadonlyArray<Expr.Expr<Path.EnvOf<Shape>, boolean>>
  },
): Effect.Effect<Proof, SolverUnavailableError> =>
  Effect.map(
    refute(
      Object.entries(shape).map(([slice, schema]): Slice => [[slice], schema]),
      (options?.hypotheses ?? []).map(hypothesis => hypothesis.node),
      [goal.node],
      options,
      env => !holdsOf(goal.node, env),
    ),
    ({ verdict }) => verdict,
  )

/** Structured counterexample report for a refuted transition. */
export interface WitnessReport {
  readonly before: Readonly<Record<string, unknown>>
  readonly input: Readonly<Record<string, unknown>>
  readonly after: Readonly<Record<string, unknown>>
  /** The rules the state after breaks; never empty. */
  readonly violated: ReadonlyArray<string>
  readonly reproducer: string
}

export interface MachineProofEntry<Tag extends string = string> {
  readonly tag: Tag
  readonly status: 'proved' | 'refuted' | 'undecided'
  readonly pinned: boolean
  readonly pinBroken: boolean
  readonly allowedReason: Option.Option<string>
  readonly verdict: Proof
  /** The replayed counterexample of a refuted transition. */
  readonly witness: Option.Option<WitnessReport>
}

export interface MachineProofReport<Tag extends string = string> {
  readonly ok: boolean
  readonly entries: ReadonlyArray<MachineProofEntry<Tag>>
  /**
   * What no entry proves: each pair of transitions whose order matters, to be
   * shown by a walk (`Temporal.discharge`). They do not move `ok`; assert
   * `Temporal.undischarged(report.obligations, discharges)` is empty.
   */
  readonly obligations: ReadonlyArray<Temporal.WalkObligation<`${Tag}/${Tag}`, Tag>>
  /** Human-readable multi-line verification summary. */
  readonly format: () => string
}

const witnessReport = <State>(
  tag: string,
  stateSchema: Schema.Codec<State>,
  { before, input, after }: Replay,
): WitnessReport => {
  const broken = Expr.refinementsOf(stateSchema)
    .filter(rule => !holdsOf(rule.node, after))
    .map(rule => Expr.show(rule))
  return {
    before: before as Readonly<Record<string, unknown>>,
    input: input as Readonly<Record<string, unknown>>,
    after: after as Readonly<Record<string, unknown>>,
    // A replayed state the Schema refuses breaks a rule, or a check no rule reads.
    violated: broken.length > 0 ? broken : ['a check of the state Schema that is no rule'],
    reproducer: `Transition.run(${tag}, ${JSON.stringify(before)}, ${JSON.stringify(input)})`,
  }
}

const formatEntry = (entry: MachineProofEntry): string => {
  let pinLabel = ''
  if (entry.pinBroken) {
    pinLabel = ' [PIN BROKEN]'
  } else if (entry.pinned) {
    pinLabel = ' [pinned]'
  }
  if (entry.status === 'proved') {
    const tier =
      Verdict.isTrue(entry.verdict) && Option.isSome(entry.verdict.evidence)
        ? entry.verdict.evidence.value.tier
        : 'proved'
    return `PROVED (${tier}) ${entry.tag}${pinLabel}`
  }
  if (entry.status === 'undecided') {
    const reason = Verdict.isUnknown(entry.verdict) ? entry.verdict.reason : 'unknown'
    const allow = Option.match(entry.allowedReason, {
      onNone: () => 'disallowed',
      onSome: why => `allowed: ${why}`,
    })
    return `UNDECIDED (${allow}) ${entry.tag}${pinLabel}: ${reason}`
  }
  const lines = [`REFUTED ${entry.tag}${pinLabel}`]
  if (Option.isSome(entry.witness)) {
    const w = entry.witness.value
    lines.push(`  before:   ${JSON.stringify(w.before)}`)
    lines.push(`  input:    ${JSON.stringify(w.input)}`)
    lines.push(`  after:    ${JSON.stringify(w.after)}`)
    lines.push(`  violated: ${w.violated.join(' ; ')}`)
    lines.push(`  repro:    ${w.reproducer}`)
  }
  return lines.join('\n')
}

/**
 * Verify every transition in a `Machine` under strict/pinned CI discipline:
 *   - `strict` (default `true`): fails if any transition is `refuted`, or
 *     `undecided` without a non-empty reason in `allowUnknown`.
 *   - `pin`: transitions that must remain `proved` (degrading to `undecided`
 *     or `refuted` fails the report with `pinBroken: true`).
 */
export const machine = <State, Transitions extends Readonly<Record<string, unknown>>>(
  m: Machine<State, Transitions>,
  options?: ProveOptions & {
    readonly pin?: ReadonlyArray<keyof Transitions & string>
    readonly allowUnknown?: Readonly<Partial<Record<keyof Transitions & string, string>>>
    readonly strict?: boolean
  },
): Effect.Effect<MachineProofReport<keyof Transitions & string>, SolverUnavailableError> => {
  type Tag = keyof Transitions & string
  const tags = new Set(Object.keys(m.transitions))
  const pinnedSet = new Set<string>()
  if (options?.pin !== undefined) {
    for (const tag of options.pin) {
      if (!tags.has(tag)) {
        throw new Error(`[metakit] Prove.machine pin references unknown transition "${tag}"`)
      }
      pinnedSet.add(tag)
    }
  }
  const allowedMap = new Map<string, string>()
  if (options?.allowUnknown !== undefined) {
    for (const [tag, reason] of Object.entries(options.allowUnknown)) {
      if (reason === undefined) continue
      if (!tags.has(tag)) {
        throw new Error(
          `[metakit] Prove.machine allowUnknown references unknown transition "${tag}"`,
        )
      }
      if (pinnedSet.has(tag)) {
        throw new Error(
          `[metakit] Prove.machine transition "${tag}" cannot appear in both pin and allowUnknown`,
        )
      }
      if (reason.trim().length === 0) {
        throw new Error(
          `[metakit] Prove.machine allowUnknown for "${tag}" requires a non-empty reason`,
        )
      }
      allowedMap.set(tag, reason.trim())
    }
  }
  const strict = options?.strict ?? true

  return Effect.gen(function* () {
    const entries: Array<MachineProofEntry<Tag>> = []
    let ok = true
    for (const [rawTag, rawTr] of Object.entries(m.transitions)) {
      const tag = rawTag as Tag
      const tr = rawTr as Transition.Transition<State, unknown, unknown>
      const { verdict, replay } = yield* proveTransition(m.stateSchema, tr, options)
      const pinned = pinnedSet.has(tag)
      const allowedReason = Option.fromUndefinedOr(allowedMap.get(tag))
      const status: MachineProofEntry<Tag>['status'] = Verdict.match(verdict, {
        True: () => 'proved',
        False: () => 'refuted',
        Unknown: () => 'undecided',
      })
      const pinBroken = pinned && status !== 'proved'
      const witness = Option.map(replay, replayed => witnessReport(tag, m.stateSchema, replayed))

      if (
        pinBroken ||
        status === 'refuted' ||
        (strict && status === 'undecided' && Option.isNone(allowedReason))
      ) {
        ok = false
      }

      entries.push({ tag, status, pinned, pinBroken, allowedReason, verdict, witness })
    }
    const obligations = Temporal.obligations(m)
    return {
      ok,
      entries,
      obligations,
      format: () =>
        [
          ...entries.map(formatEntry),
          ...obligations.map(owed => `OBLIGATION (walk) ${owed.name}: ${owed.detail}`),
        ].join('\n'),
    }
  })
}

const policyShape = <Row, Principal>(pol: {
  readonly rowSchema: Schema.Codec<Row>
  readonly principalSchema: Schema.Codec<Principal>
}) => ({ row: pol.rowSchema, principal: pol.principalSchema })

/**
 * Prove that `policy.rules[from]` (with the `row` and `principal` Schemas)
 * entails `policy.rules[to]`: non-disclosure is `Update => Read`.
 *
 * Runs Tier 3 first and asks Z3 where it is undecided. `False` carries a
 * replayed environment that `from` allows and `to` does not.
 */
export const policyImplies = <
  Row,
  Principal,
  Rules extends Readonly<Record<string, Expr.Expr<Policy.PolicyEnv<Row, Principal>, boolean>>>,
>(
  pol: Policy.Definition<Row, Principal, Rules>,
  from: keyof Rules & string,
  to: keyof Rules & string,
  options?: ProveOptions,
): Effect.Effect<Proof, SolverUnavailableError> => {
  const tier3 = Policy.checkImplication(pol, from, to)
  if (Verdict.isTrue(tier3)) return Effect.succeed(tier3)
  return policy(policyShape(pol), pol.rules[to]!, { ...options, hypotheses: [pol.rules[from]!] })
}

/**
 * Whether `policy.rules[rule]` can allow anything: `True` with a rule some
 * environment satisfies, `False` for a rule none does (a dead rule), and
 * `Unknown` where an opaque term or the solver leaves it undecided.
 */
export const policyConsistent = <
  Row,
  Principal,
  Rules extends Readonly<Record<string, Expr.Expr<Policy.PolicyEnv<Row, Principal>, boolean>>>,
>(
  pol: Policy.Definition<Row, Principal, Rules>,
  rule: keyof Rules & string,
  options?: ProveOptions,
): Effect.Effect<Proof, SolverUnavailableError> => {
  const tier3 = Policy.checkConsistent(pol, rule)
  if (Verdict.isFalse(tier3)) return Effect.succeed(Verdict.False(Option.none()))
  // An environment where the rule holds refutes "nothing satisfies it".
  return Effect.map(
    policy(policyShape(pol), Expr.lit(false), { ...options, hypotheses: [pol.rules[rule]!] }),
    reachable =>
      Verdict.match(reachable, {
        True: () => Verdict.False(Option.none()),
        False: () => proved,
        Unknown: unknown => unknown,
      }),
  )
}
