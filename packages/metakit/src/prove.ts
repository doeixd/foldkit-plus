/**
 * Dev-only prover (`metakit/prove`) combining Tier 3 (synchronous Interval +
 * Zone) with Tier 4 (Z3 SMT solver).
 *
 * Implements the exhaustive `smtOps: Record<CoreOpId, SmtLowerer>` table over
 * all 15 v1 primitives — including `null.isNull` via companion Z3 boolean
 * nullability flags — with zero unsupported primitives.
 */
import { Effect, Option, Result, SchemaAST } from 'effect'
import type { Schema } from 'effect'
import * as AbstractCheck from './abstract/check.js'
import * as Expr from './expr.js'
import type { Machine } from './machine.js'
import * as Node from './node.js'
import * as Path from './path.js'
import * as Transition from './transition.js'
import * as Verdict from './verdict.js'

type Z3Context = import('z3-solver').Context<'metakit'>

type Z3Expr =
  | ReturnType<Z3Context['Int']['const']>
  | ReturnType<Z3Context['Bool']['const']>
  | ReturnType<Z3Context['Real']['const']>

let cachedZ3: Promise<Z3Context> | undefined

const getZ3 = (): Promise<Z3Context> => {
  if (cachedZ3 !== undefined) return cachedZ3
  const promise = import('z3-solver').then(async ({ init }) => {
    const { Context } = await init()
    return new Context('metakit')
  })
  cachedZ3 = promise
  return promise
}

interface FieldSort {
  readonly kind: 'int' | 'real' | 'bool' | 'enum' | 'string'
  readonly nullable: boolean
  readonly literals?: ReadonlyArray<string | number | boolean>
  readonly min?: number
  readonly max?: number
  readonly exclusiveMin?: number
  readonly exclusiveMax?: number
}

const collectFieldSorts = (
  ast: SchemaAST.AST,
  prefix: ReadonlyArray<string>,
  out: Map<string, FieldSort>,
  nullable = false,
): void => {
  if (SchemaAST.isObjects(ast)) {
    for (const prop of ast.propertySignatures) {
      if (typeof prop.name === 'string') {
        collectFieldSorts(prop.type, [...prefix, prop.name], out, false)
      }
    }
    return
  }
  const key = Path.format(prefix)
  if (SchemaAST.isNumber(ast)) {
    let isInt = false
    let min: number | undefined
    let max: number | undefined
    let exclusiveMin: number | undefined
    let exclusiveMax: number | undefined
    const scanChecks = (checks: ReadonlyArray<SchemaAST.Check<unknown>>) => {
      for (const c of checks) {
        const ann = c.annotations as Readonly<Record<string, unknown>> | undefined
        const repr = ann?.['representation'] as
          | { readonly id?: string; readonly payload?: Readonly<Record<string, unknown>> | null }
          | undefined
        if (repr?.id === 'effect/schema/isInt') isInt = true
        if (
          repr?.id === 'effect/schema/isGreaterThanOrEqualTo' &&
          typeof repr.payload?.['minimum'] === 'number'
        ) {
          min = min === undefined ? repr.payload['minimum'] : Math.max(min, repr.payload['minimum'])
        }
        if (
          repr?.id === 'effect/schema/isGreaterThan' &&
          typeof repr.payload?.['exclusiveMinimum'] === 'number'
        ) {
          exclusiveMin = repr.payload['exclusiveMinimum']
        }
        if (
          repr?.id === 'effect/schema/isLessThanOrEqualTo' &&
          typeof repr.payload?.['maximum'] === 'number'
        ) {
          max = max === undefined ? repr.payload['maximum'] : Math.min(max, repr.payload['maximum'])
        }
        if (
          repr?.id === 'effect/schema/isLessThan' &&
          typeof repr.payload?.['exclusiveMaximum'] === 'number'
        ) {
          exclusiveMax = repr.payload['exclusiveMaximum']
        }
        if (repr?.id === 'effect/schema/isBetween') {
          if (typeof repr.payload?.['minimum'] === 'number') {
            if (repr.payload['exclusiveMinimum'] === true) {
              exclusiveMin = repr.payload['minimum']
            } else {
              min =
                min === undefined ? repr.payload['minimum'] : Math.max(min, repr.payload['minimum'])
            }
          }
          if (typeof repr.payload?.['maximum'] === 'number') {
            if (repr.payload['exclusiveMaximum'] === true) {
              exclusiveMax = repr.payload['maximum']
            } else {
              max =
                max === undefined ? repr.payload['maximum'] : Math.min(max, repr.payload['maximum'])
            }
          }
        }
        if ('checks' in c && Array.isArray(c.checks)) scanChecks(c.checks)
      }
    }
    if (ast.checks !== undefined) scanChecks(ast.checks)
    out.set(key, {
      kind: isInt ? 'int' : 'real',
      nullable,
      ...(min !== undefined ? { min } : {}),
      ...(max !== undefined ? { max } : {}),
      ...(exclusiveMin !== undefined ? { exclusiveMin } : {}),
      ...(exclusiveMax !== undefined ? { exclusiveMax } : {}),
    })
    return
  }
  if (SchemaAST.isBoolean(ast)) {
    out.set(key, { kind: 'bool', nullable })
    return
  }
  if (SchemaAST.isString(ast)) {
    out.set(key, { kind: 'string', nullable })
    return
  }
  if (SchemaAST.isLiteral(ast)) {
    const lit = ast.literal
    if (typeof lit === 'string' || typeof lit === 'number' || typeof lit === 'boolean') {
      out.set(key, { kind: 'enum', nullable, literals: [lit] })
    }
    return
  }
  if (SchemaAST.isUnion(ast)) {
    const hasNull = ast.types.some(SchemaAST.isNull)
    const nonNull = ast.types.filter(t => !SchemaAST.isNull(t))
    if (hasNull && nonNull.length === 1) {
      collectFieldSorts(nonNull[0]!, prefix, out, true)
      return
    }
    const lits: Array<string | number | boolean> = []
    let allLit = true
    for (const member of nonNull) {
      if (SchemaAST.isLiteral(member)) {
        const lit = member.literal
        if (typeof lit === 'string' || typeof lit === 'number' || typeof lit === 'boolean') {
          lits.push(lit)
          continue
        }
      }
      allLit = false
      break
    }
    if (allLit && lits.length > 0) {
      out.set(key, { kind: 'enum', nullable: hasNull || nullable, literals: lits })
    }
  }
}

interface SmtContext {
  readonly z3: Z3Context
  readonly vars: Map<string, Z3Expr>
  readonly nullFlags: Map<string, ReturnType<Z3Context['Bool']['const']>>
  readonly enumCodes: Map<string, number>
  readonly codeToEnum: Map<number, string>
  readonly opaqueVars: Map<string, Z3Expr>
  readonly lower: (node: Node.Node) => Z3Expr
  readonly lowerIsNull: (node: Node.Node) => ReturnType<Z3Context['Bool']['const']>
  readonly encodeString: (s: string) => number
}

export type SmtLowerer = (args: ReadonlyArray<Node.Node>, ctx: SmtContext) => Z3Expr

const asArith = (e: Z3Expr): ReturnType<Z3Context['Int']['const']> =>
  e as ReturnType<Z3Context['Int']['const']>
const asBool = (e: Z3Expr): ReturnType<Z3Context['Bool']['const']> =>
  e as ReturnType<Z3Context['Bool']['const']>

const isNullLit = (node: Node.Node): boolean => Node.$is('Lit')(node) && node.value === null

/** Exhaustive Tier 4 SMT lowering table over all 15 `CoreOpId` primitives. */
export const smtOps: Readonly<Record<Node.CoreOpId, SmtLowerer>> = {
  'bool.and': (args, ctx) => ctx.z3.And(asBool(ctx.lower(args[0]!)), asBool(ctx.lower(args[1]!))),
  'bool.or': (args, ctx) => ctx.z3.Or(asBool(ctx.lower(args[0]!)), asBool(ctx.lower(args[1]!))),
  'bool.not': (args, ctx) => ctx.z3.Not(asBool(ctx.lower(args[0]!))),
  'eq.is': (args, ctx) => {
    const [a, b] = args
    if (isNullLit(a!) && isNullLit(b!)) return ctx.z3.Bool.val(true)
    if (isNullLit(a!)) return ctx.lowerIsNull(b!)
    if (isNullLit(b!)) return ctx.lowerIsNull(a!)
    const aNull = ctx.lowerIsNull(a!)
    const bNull = ctx.lowerIsNull(b!)
    const bothNull = ctx.z3.And(aNull, bNull)
    const bothNonNullEq = ctx.z3.And(
      ctx.z3.Not(aNull),
      ctx.z3.Not(bNull),
      asArith(ctx.lower(a!)).eq(asArith(ctx.lower(b!))),
    )
    return ctx.z3.Or(bothNull, bothNonNullEq)
  },
  'eq.isNot': (args, ctx) => ctx.z3.Not(asBool(smtOps['eq.is'](args, ctx))),
  'eq.in': (args, ctx) => {
    const [needle, list] = args
    if (!Node.$is('Lit')(list!) || !Array.isArray(list.value) || list.value.length === 0) {
      return ctx.z3.Bool.val(false)
    }
    const eqs = list.value.map(v => asBool(smtOps['eq.is']([needle!, Node.Lit({ value: v })], ctx)))
    return ctx.z3.Or(...eqs)
  },
  'null.isNull': (args, ctx) => ctx.lowerIsNull(args[0]!),
  'ord.lt': (args, ctx) => asArith(ctx.lower(args[0]!)).lt(asArith(ctx.lower(args[1]!))),
  'ord.lte': (args, ctx) => asArith(ctx.lower(args[0]!)).le(asArith(ctx.lower(args[1]!))),
  'ord.gt': (args, ctx) => asArith(ctx.lower(args[0]!)).gt(asArith(ctx.lower(args[1]!))),
  'ord.gte': (args, ctx) => asArith(ctx.lower(args[0]!)).ge(asArith(ctx.lower(args[1]!))),
  'num.add': (args, ctx) => asArith(ctx.lower(args[0]!)).add(asArith(ctx.lower(args[1]!))),
  'num.sub': (args, ctx) => asArith(ctx.lower(args[0]!)).sub(asArith(ctx.lower(args[1]!))),
  'num.mul': (args, ctx) => asArith(ctx.lower(args[0]!)).mul(asArith(ctx.lower(args[1]!))),
  'num.neg': (args, ctx) => asArith(ctx.lower(args[0]!)).neg(),
}

const substituteWrites = (node: Node.Node, writes: ReadonlyMap<string, Node.Node>): Node.Node =>
  Node.substitutePaths(node, segments =>
    segments[0] === 'state'
      ? Option.fromUndefinedOr(writes.get(Path.format(segments.slice(1))))
      : Option.none(),
  )

const solveWithZ3 = async (
  fields: ReadonlyMap<string, FieldSort>,
  hypotheses: ReadonlyArray<Node.Node>,
  goals: ReadonlyArray<Node.Node>,
): Promise<Verdict.Verdict<Readonly<Record<string, unknown>>>> => {
  const z3 = await getZ3()
  const solver = new z3.Solver()
  const vars = new Map<string, Z3Expr>()
  const nullFlags = new Map<string, ReturnType<Z3Context['Bool']['const']>>()
  const enumCodes = new Map<string, number>()
  const codeToEnum = new Map<number, string>()
  const opaqueVars = new Map<string, Z3Expr>()
  let nextEnumCode = 1

  const encodeString = (s: string): number => {
    const existing = enumCodes.get(s)
    if (existing !== undefined) return existing
    const code = nextEnumCode++
    enumCodes.set(s, code)
    codeToEnum.set(code, s)
    return code
  }

  for (const [name, sort] of fields) {
    const nf = z3.Bool.const(`isNull:${name}`)
    nullFlags.set(name, nf)
    if (!sort.nullable) {
      solver.add(z3.Not(nf))
    }
    if (sort.kind === 'int') {
      const v = z3.Int.const(name)
      vars.set(name, v)
      const guard = (c: ReturnType<Z3Context['Bool']['const']>) =>
        sort.nullable ? z3.Implies(z3.Not(nf), c) : c
      if (sort.min !== undefined) solver.add(guard(v.ge(z3.Int.val(sort.min))))
      if (sort.max !== undefined) solver.add(guard(v.le(z3.Int.val(sort.max))))
      if (sort.exclusiveMin !== undefined) solver.add(guard(v.gt(z3.Int.val(sort.exclusiveMin))))
      if (sort.exclusiveMax !== undefined) solver.add(guard(v.lt(z3.Int.val(sort.exclusiveMax))))
    } else if (sort.kind === 'real') {
      const v = z3.Real.const(name)
      vars.set(name, v)
      const guard = (c: ReturnType<Z3Context['Bool']['const']>) =>
        sort.nullable ? z3.Implies(z3.Not(nf), c) : c
      if (sort.min !== undefined) solver.add(guard(v.ge(z3.Real.val(sort.min))))
      if (sort.max !== undefined) solver.add(guard(v.le(z3.Real.val(sort.max))))
      if (sort.exclusiveMin !== undefined) solver.add(guard(v.gt(z3.Real.val(sort.exclusiveMin))))
      if (sort.exclusiveMax !== undefined) solver.add(guard(v.lt(z3.Real.val(sort.exclusiveMax))))
    } else if (sort.kind === 'bool') {
      vars.set(name, z3.Bool.const(name))
    } else if (sort.kind === 'enum' || sort.kind === 'string') {
      const v = z3.Int.const(name)
      vars.set(name, v)
      if (sort.literals !== undefined && sort.literals.length > 0) {
        const domain = sort.literals.map(lit =>
          typeof lit === 'string'
            ? v.eq(z3.Int.val(encodeString(lit)))
            : typeof lit === 'number'
              ? v.eq(z3.Int.val(lit))
              : v.eq(z3.Int.val(lit ? 1 : 0)),
        )
        const c = z3.Or(...domain)
        solver.add(sort.nullable ? z3.Implies(z3.Not(nf), c) : c)
      }
    }
  }

  const lowerIsNull = (node: Node.Node): ReturnType<Z3Context['Bool']['const']> =>
    Node.$match(node, {
      Lit: ({ value }) => z3.Bool.val(value === null || value === undefined),
      Path: ({ segments }) => {
        const name = Path.format(segments)
        return nullFlags.get(name) ?? z3.Bool.val(false)
      },
      If: ({ cond, then, otherwise }) =>
        z3.If(asBool(ctx.lower(cond)), lowerIsNull(then), lowerIsNull(otherwise)),
      Call: () => z3.Bool.val(false),
      Match: ({ on, cases, otherwise }) => {
        if (cases.length === 0) {
          return Option.match(otherwise, {
            onNone: () => z3.Bool.val(true),
            onSome: lowerIsNull,
          })
        }
        const target = asArith(ctx.lower(on))
        let acc = Option.match(otherwise, {
          onNone: () => lowerIsNull(cases[cases.length - 1]![1]),
          onSome: lowerIsNull,
        })
        const start = Option.isSome(otherwise) ? cases.length - 1 : cases.length - 2
        for (let i = start; i >= 0; i--) {
          const [val, branch] = cases[i]!
          acc = z3.If(target.eq(z3.Int.val(encodeString(val))), lowerIsNull(branch), acc)
        }
        return acc
      },
      Opaque: opaque => {
        const k = `isNull:${Node.key(opaque)}`
        let v = opaqueVars.get(k)
        if (v === undefined) {
          v = z3.Bool.const(k)
          opaqueVars.set(k, v)
        }
        return asBool(v)
      },
    })

  const ctx: SmtContext = {
    z3,
    vars,
    nullFlags,
    enumCodes,
    codeToEnum,
    opaqueVars,
    encodeString,
    lowerIsNull,
    lower: node =>
      Node.$match(node, {
        Lit: ({ value }) => {
          if (typeof value === 'boolean') return z3.Bool.val(value)
          if (typeof value === 'number') {
            return Number.isInteger(value) ? z3.Int.val(value) : z3.Real.val(value)
          }
          if (typeof value === 'string') return z3.Int.val(encodeString(value))
          if (value === null) return z3.Int.val(0)
          throw new Error(`unsupported-lit:${typeof value}`)
        },
        Path: ({ segments }) => {
          const name = Path.format(segments)
          let v = vars.get(name)
          if (v === undefined) {
            v = z3.Int.const(name)
            vars.set(name, v)
          }
          return v
        },
        Call: ({ op, args }) => smtOps[op.id](args, ctx),
        If: ({ cond, then, otherwise }) =>
          z3.If(asBool(ctx.lower(cond)), asArith(ctx.lower(then)), asArith(ctx.lower(otherwise))),
        Match: ({ on, cases, otherwise }) => {
          const target = asArith(ctx.lower(on))
          if (cases.length === 0) {
            if (Option.isSome(otherwise)) return ctx.lower(otherwise.value)
            throw new Error('empty-match')
          }
          let acc: Z3Expr = Option.match(otherwise, {
            onNone: () => ctx.lower(cases[cases.length - 1]![1]),
            onSome: fb => ctx.lower(fb),
          })
          const start = Option.isSome(otherwise) ? cases.length - 1 : cases.length - 2
          for (let i = start; i >= 0; i--) {
            const [val, branch] = cases[i]!
            const cond = target.eq(z3.Int.val(encodeString(val)))
            acc = z3.If(cond, asArith(ctx.lower(branch)), asArith(acc))
          }
          return acc
        },
        Opaque: opaque => {
          const k = Node.key(opaque)
          let v = opaqueVars.get(k)
          if (v === undefined) {
            v = z3.Bool.const(k)
            opaqueVars.set(k, v)
          }
          return v
        },
      }),
  }

  try {
    for (const h of hypotheses) {
      solver.add(asBool(ctx.lower(h)))
    }
    const negatedGoals = goals.map(g => z3.Not(asBool(ctx.lower(g))))
    if (negatedGoals.length === 0) {
      return Verdict.True(Option.some(Verdict.Proved('z3')))
    }
    solver.add(negatedGoals.length === 1 ? negatedGoals[0]! : z3.Or(...negatedGoals))
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    return Verdict.Unknown(
      `z3 lowering unsupported: ${detail}`,
      Option.some({ kind: 'unsupported', detail }),
    )
  }

  const status = await solver.check()
  if (status === 'unsat') {
    return Verdict.True(Option.some(Verdict.Proved('z3')))
  }
  if (status === 'sat') {
    if (opaqueVars.size > 0) {
      return Verdict.Unknown(
        'counterexample involves opaque term',
        Option.some({ kind: 'opaque', detail: Array.from(opaqueVars.keys()).join(', ') }),
      )
    }
    const model = solver.model()
    const witness: Record<string, unknown> = {}
    for (const [name, v] of vars) {
      const nf = nullFlags.get(name)
      if (nf !== undefined && model.eval(nf, true).toString() === 'true') {
        witness[name] = null
        continue
      }
      const evaluated = model.eval(v, true).toString()
      const sort = fields.get(name)
      if (sort?.kind === 'bool') {
        witness[name] = evaluated === 'true'
      } else if (sort?.kind === 'enum') {
        const num = Number(evaluated)
        witness[name] = codeToEnum.get(num) ?? evaluated
      } else {
        const num = Number(evaluated)
        witness[name] = Number.isNaN(num) ? evaluated : num
      }
    }
    return Verdict.False(Option.some(witness))
  }
  return Verdict.Unknown(
    'z3 solver returned unknown',
    Option.some({ kind: 'nonlinear', detail: 'z3 returned unknown' }),
  )
}

/** Prove that `schema` entails `goal`. Runs Tier 3 first; escalates to Z3 only on `Unknown` or `False`. */
export const invariant = <S extends Schema.Top>(
  schema: S,
  goal: Expr.Expr<S['Type'], boolean>,
): Effect.Effect<Verdict.Verdict<Readonly<Record<string, unknown>>>> =>
  Effect.promise(async () => {
    const tier3 = AbstractCheck.checkInvariant(schema, goal)
    if (Verdict.isTrue(tier3)) return tier3
    const fields = new Map<string, FieldSort>()
    collectFieldSorts(schema.ast, [], fields)
    const hypotheses = Expr.refinementsOf(schema).map(r => r.node)
    return solveWithZ3(fields, hypotheses, [goal.node])
  })

/** Prove that `transition` preserves every invariant on `stateSchema`. */
export const transition = <S extends Schema.Top, I, Emit>(
  stateSchema: S,
  tr: Transition.Transition<S['Type'], I, Emit>,
): Effect.Effect<Verdict.Verdict<Readonly<Record<string, unknown>>>> =>
  Effect.promise(async () => {
    const tier3 = AbstractCheck.checkTransition(stateSchema, tr)
    if (Verdict.isTrue(tier3)) return tier3

    const fields = new Map<string, FieldSort>()
    collectFieldSorts(stateSchema.ast, ['state'], fields)
    const preInvariants = Expr.refinementsOf(stateSchema).map(r => Node.prefix(r.node, ['state']))
    const inputInvariants: Array<Node.Node> = []
    if (Option.isSome(tr.inputSchema)) {
      collectFieldSorts(tr.inputSchema.value.ast, ['input'], fields)
      for (const r of Expr.refinementsOf(tr.inputSchema.value)) {
        inputInvariants.push(Node.prefix(r.node, ['input']))
      }
    }
    const writeMap = new Map<string, Node.Node>()
    for (const eq of tr.writes) {
      writeMap.set(Path.format(eq.target), eq.value.node)
    }
    const postGoals = preInvariants.map(inv => substituteWrites(inv, writeMap))
    const hypotheses = [...preInvariants, ...inputInvariants, tr.when.node]
    return solveWithZ3(fields, hypotheses, postGoals)
  })

/** Prove a policy/guard implication over an `Env` shape using Schema invariants as hypotheses. */
export const policy = <Shape extends Readonly<Record<string, Schema.Top>>>(
  shape: Shape,
  goal: Expr.Expr<Path.EnvOf<Shape>, boolean>,
  options?: {
    readonly hypotheses?: ReadonlyArray<Expr.Expr<Path.EnvOf<Shape>, boolean>>
  },
): Effect.Effect<Verdict.Verdict<Readonly<Record<string, unknown>>>> =>
  Effect.promise(async () => {
    const fields = new Map<string, FieldSort>()
    const hypotheses: Array<Node.Node> = []
    for (const [slice, schema] of Object.entries(shape)) {
      collectFieldSorts(schema.ast, [slice], fields)
      for (const r of Expr.refinementsOf(schema)) {
        hypotheses.push(Node.prefix(r.node, [slice]))
      }
    }
    if (options?.hypotheses !== undefined) {
      for (const h of options.hypotheses) hypotheses.push(h.node)
    }
    return solveWithZ3(fields, hypotheses, [goal.node])
  })

/** Structured counterexample report for a refuted transition. */
export interface WitnessReport {
  readonly before: Readonly<Record<string, unknown>>
  readonly input: Readonly<Record<string, unknown>>
  readonly after: Option.Option<Readonly<Record<string, unknown>>>
  readonly violated: ReadonlyArray<string>
  readonly reproducer: string
}

export interface MachineProofEntry<Tag extends string = string> {
  readonly tag: Tag
  readonly status: 'proved' | 'refuted' | 'undecided'
  readonly pinned: boolean
  readonly pinBroken: boolean
  readonly allowedReason: Option.Option<string>
  readonly verdict: Verdict.Verdict<Readonly<Record<string, unknown>>>
  readonly witness: Option.Option<WitnessReport>
}

export interface MachineProofReport<Tag extends string = string> {
  readonly ok: boolean
  readonly entries: ReadonlyArray<MachineProofEntry<Tag>>
  /** Human-readable multi-line verification summary. */
  readonly format: () => string
}

const nestWitness = (
  flat: Readonly<Record<string, unknown>>,
  prefix: string,
): Readonly<Record<string, unknown>> => {
  let out: Record<string, unknown> = {}
  const lead = `${prefix}.`
  for (const [k, v] of Object.entries(flat)) {
    if (!k.startsWith(lead)) continue
    const segments = k.slice(lead.length).split('.')
    out = Path.set(Path.make<Record<string, unknown>, unknown>(segments), out, v)
  }
  return out
}

const buildWitnessReport = <State>(
  tag: string,
  stateSchema: Schema.Codec<State>,
  tr: Transition.Transition<State, unknown, unknown>,
  raw: Readonly<Record<string, unknown>>,
): WitnessReport => {
  const before = nestWitness(raw, 'state')
  const input = nestWitness(raw, 'input')
  const stepRes = Transition.run(tr, before as State, input)
  const after = Result.isSuccess(stepRes)
    ? Option.some(stepRes.success as Readonly<Record<string, unknown>>)
    : Option.none()
  const violated: Array<string> = []
  if (Option.isSome(after)) {
    for (const inv of Expr.refinementsOf(stateSchema)) {
      if (!Expr.eval(inv, after.value as State)) {
        violated.push(Expr.show(inv))
      }
    }
  }
  const reproducer = `Transition.run(${tag}, ${JSON.stringify(before)}, ${JSON.stringify(input)})`
  return { before, input, after, violated, reproducer }
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
    if (Option.isSome(w.after)) lines.push(`  after:    ${JSON.stringify(w.after.value)}`)
    if (w.violated.length > 0) lines.push(`  violated: ${w.violated.join(' ; ')}`)
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
  options?: {
    readonly pin?: ReadonlyArray<keyof Transitions & string>
    readonly allowUnknown?: Readonly<Partial<Record<keyof Transitions & string, string>>>
    readonly strict?: boolean
  },
): Effect.Effect<MachineProofReport<keyof Transitions & string>> => {
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
      const verdict = yield* transition(m.stateSchema, tr)
      const pinned = pinnedSet.has(tag)
      const allowedReason = Option.fromUndefinedOr(allowedMap.get(tag))
      const status: MachineProofEntry<Tag>['status'] = Verdict.match(verdict, {
        True: () => 'proved',
        False: () => 'refuted',
        Unknown: () => 'undecided',
      })
      const pinBroken = pinned && status !== 'proved'
      const witness: Option.Option<WitnessReport> =
        Verdict.isFalse(verdict) && Option.isSome(verdict.witness)
          ? Option.some(buildWitnessReport(tag, m.stateSchema, tr, verdict.witness.value))
          : Option.none()

      if (
        pinBroken ||
        status === 'refuted' ||
        (strict && status === 'undecided' && Option.isNone(allowedReason))
      ) {
        ok = false
      }

      entries.push({ tag, status, pinned, pinBroken, allowedReason, verdict, witness })
    }
    return {
      ok,
      entries,
      format: () => entries.map(formatEntry).join('\n'),
    }
  })
}
