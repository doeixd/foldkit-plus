/**
 * Dev-only prover (`metakit/prove`) combining Tier 3 (synchronous Interval +
 * Zone) with Tier 4 (Z3 SMT solver).
 *
 * Tier 3 runs first. Only when Tier 3 returns `Unknown` (or cannot supply a
 * concrete witness) does this module dynamically import `z3-solver`. A page
 * bundle never imports `metakit/prove`.
 */
import { Effect, Option, SchemaAST } from 'effect'
import type { Schema } from 'effect'
import * as AbstractCheck from './abstract/check.js'
import * as Expr from './expr.js'
import * as Node from './node.js'
import * as Path from './path.js'
import type { Transition } from './transition.js'
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
): void => {
  if (SchemaAST.isObjects(ast)) {
    for (const prop of ast.propertySignatures) {
      if (typeof prop.name === 'string') {
        collectFieldSorts(prop.type, [...prefix, prop.name], out)
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
          if (typeof repr.payload?.['minimum'] === 'number') min = repr.payload['minimum']
          if (typeof repr.payload?.['maximum'] === 'number') max = repr.payload['maximum']
        }
        if ('checks' in c && Array.isArray(c.checks)) scanChecks(c.checks)
      }
    }
    if (ast.checks !== undefined) scanChecks(ast.checks)
    out.set(key, {
      kind: isInt ? 'int' : 'real',
      ...(min !== undefined ? { min } : {}),
      ...(max !== undefined ? { max } : {}),
      ...(exclusiveMin !== undefined ? { exclusiveMin } : {}),
      ...(exclusiveMax !== undefined ? { exclusiveMax } : {}),
    })
    return
  }
  if (SchemaAST.isBoolean(ast)) {
    out.set(key, { kind: 'bool' })
    return
  }
  if (SchemaAST.isString(ast)) {
    out.set(key, { kind: 'string' })
    return
  }
  if (SchemaAST.isLiteral(ast)) {
    const lit = ast.literal
    if (typeof lit === 'string' || typeof lit === 'number' || typeof lit === 'boolean') {
      out.set(key, { kind: 'enum', literals: [lit] })
    }
    return
  }
  if (SchemaAST.isUnion(ast)) {
    const lits: Array<string | number | boolean> = []
    let allLit = true
    for (const member of ast.types) {
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
      out.set(key, { kind: 'enum', literals: lits })
    }
  }
}

interface Z3LowerCtx {
  readonly z3: Z3Context
  readonly vars: Map<string, Z3Expr>
  readonly enumCodes: Map<string, number>
  readonly codeToEnum: Map<number, string>
  readonly opaqueVars: Map<string, Z3Expr>
  readonly lower: (node: Node.Node) => Z3Expr
  readonly encodeString: (s: string) => number
}

type Z3OpLower = (args: ReadonlyArray<Node.Node>, ctx: Z3LowerCtx) => Z3Expr

// Helper type-safe casts into Z3's Arith / Bool ASTs (internal to this module)
const asArith = (e: Z3Expr): ReturnType<Z3Context['Int']['const']> =>
  e as ReturnType<Z3Context['Int']['const']>
const asBool = (e: Z3Expr): ReturnType<Z3Context['Bool']['const']> =>
  e as ReturnType<Z3Context['Bool']['const']>

const z3Ops: Readonly<Record<Node.OpId, Z3OpLower>> = {
  and: (args, ctx) => ctx.z3.And(asBool(ctx.lower(args[0]!)), asBool(ctx.lower(args[1]!))),
  or: (args, ctx) => ctx.z3.Or(asBool(ctx.lower(args[0]!)), asBool(ctx.lower(args[1]!))),
  not: (args, ctx) => ctx.z3.Not(asBool(ctx.lower(args[0]!))),
  is: (args, ctx) => asArith(ctx.lower(args[0]!)).eq(asArith(ctx.lower(args[1]!))),
  isNot: (args, ctx) => ctx.z3.Not(asArith(ctx.lower(args[0]!)).eq(asArith(ctx.lower(args[1]!)))),
  isNull: () => {
    throw new Error('unsupported-op:isNull')
  },
  oneOf: (args, ctx) => {
    const needle = asArith(ctx.lower(args[0]!))
    const list = args[1]!
    if (!Node.$is('Lit')(list) || !Array.isArray(list.value) || list.value.length === 0) {
      return ctx.z3.Bool.val(false)
    }
    const eqs = list.value.map(v => needle.eq(asArith(ctx.lower(Node.Lit({ value: v })))))
    return ctx.z3.Or(...eqs)
  },
  lt: (args, ctx) => asArith(ctx.lower(args[0]!)).lt(asArith(ctx.lower(args[1]!))),
  lte: (args, ctx) => asArith(ctx.lower(args[0]!)).le(asArith(ctx.lower(args[1]!))),
  gt: (args, ctx) => asArith(ctx.lower(args[0]!)).gt(asArith(ctx.lower(args[1]!))),
  gte: (args, ctx) => asArith(ctx.lower(args[0]!)).ge(asArith(ctx.lower(args[1]!))),
  add: (args, ctx) => asArith(ctx.lower(args[0]!)).add(asArith(ctx.lower(args[1]!))),
  sub: (args, ctx) => asArith(ctx.lower(args[0]!)).sub(asArith(ctx.lower(args[1]!))),
  mul: (args, ctx) => asArith(ctx.lower(args[0]!)).mul(asArith(ctx.lower(args[1]!))),
  neg: (args, ctx) => asArith(ctx.lower(args[0]!)).neg(),
  min: (args, ctx) => {
    const a = asArith(ctx.lower(args[0]!))
    const b = asArith(ctx.lower(args[1]!))
    return ctx.z3.If(a.le(b), a, b)
  },
  max: (args, ctx) => {
    const a = asArith(ctx.lower(args[0]!))
    const b = asArith(ctx.lower(args[1]!))
    return ctx.z3.If(a.ge(b), a, b)
  },
  abs: (args, ctx) => {
    const a = asArith(ctx.lower(args[0]!))
    return ctx.z3.If(a.ge(ctx.z3.Int.val(0)), a, a.neg())
  },
  len: () => {
    throw new Error('unsupported-op:len')
  },
  startsWith: () => {
    throw new Error('unsupported-op:startsWith')
  },
  contains: () => {
    throw new Error('unsupported-op:contains')
  },
  struct: () => {
    throw new Error('unsupported-op:struct')
  },
}

const prefixNode = (node: Node.Node, prefix: ReadonlyArray<string>): Node.Node => {
  if (prefix.length === 0) return node
  return Node.$match(node, {
    Lit: lit => lit,
    Path: ({ segments, ast }) => Node.Path({ segments: [...prefix, ...segments], ast }),
    Call: ({ op, args }) => Node.Call({ op, args: args.map(a => prefixNode(a, prefix)) }),
    If: ({ cond, then, otherwise }) =>
      Node.If({
        cond: prefixNode(cond, prefix),
        then: prefixNode(then, prefix),
        otherwise: prefixNode(otherwise, prefix),
      }),
    Match: ({ on, cases, otherwise }) =>
      Node.Match({
        on: prefixNode(on, prefix),
        cases: cases.map(([v, b]) => [v, prefixNode(b, prefix)] as const),
        otherwise: Option.map(otherwise, b => prefixNode(b, prefix)),
      }),
    Opaque: o => o,
  })
}

const substituteWrites = (node: Node.Node, writes: ReadonlyMap<string, Node.Node>): Node.Node =>
  Node.$match(node, {
    Lit: lit => lit,
    Path: path => {
      if (path.segments[0] === 'state') {
        const rel = Path.format(path.segments.slice(1))
        const rep = writes.get(rel)
        if (rep !== undefined) return rep
      }
      return path
    },
    Call: ({ op, args }) => Node.Call({ op, args: args.map(a => substituteWrites(a, writes)) }),
    If: ({ cond, then, otherwise }) =>
      Node.If({
        cond: substituteWrites(cond, writes),
        then: substituteWrites(then, writes),
        otherwise: substituteWrites(otherwise, writes),
      }),
    Match: ({ on, cases, otherwise }) =>
      Node.Match({
        on: substituteWrites(on, writes),
        cases: cases.map(([v, b]) => [v, substituteWrites(b, writes)] as const),
        otherwise: Option.map(otherwise, b => substituteWrites(b, writes)),
      }),
    Opaque: o => o,
  })

const solveWithZ3 = async (
  fields: ReadonlyMap<string, FieldSort>,
  hypotheses: ReadonlyArray<Node.Node>,
  goals: ReadonlyArray<Node.Node>,
): Promise<Verdict.Verdict<Readonly<Record<string, unknown>>>> => {
  const z3 = await getZ3()
  const solver = new z3.Solver()
  const vars = new Map<string, Z3Expr>()
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
    if (sort.kind === 'int') {
      const v = z3.Int.const(name)
      vars.set(name, v)
      if (sort.min !== undefined) solver.add(v.ge(z3.Int.val(sort.min)))
      if (sort.max !== undefined) solver.add(v.le(z3.Int.val(sort.max)))
      if (sort.exclusiveMin !== undefined) solver.add(v.gt(z3.Int.val(sort.exclusiveMin)))
      if (sort.exclusiveMax !== undefined) solver.add(v.lt(z3.Int.val(sort.exclusiveMax)))
    } else if (sort.kind === 'real') {
      const v = z3.Real.const(name)
      vars.set(name, v)
      if (sort.min !== undefined) solver.add(v.ge(z3.Real.val(sort.min)))
      if (sort.max !== undefined) solver.add(v.le(z3.Real.val(sort.max)))
      if (sort.exclusiveMin !== undefined) solver.add(v.gt(z3.Real.val(sort.exclusiveMin)))
      if (sort.exclusiveMax !== undefined) solver.add(v.lt(z3.Real.val(sort.exclusiveMax)))
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
        solver.add(z3.Or(...domain))
      }
    }
  }

  const ctx: Z3LowerCtx = {
    z3,
    vars,
    enumCodes,
    codeToEnum,
    opaqueVars,
    encodeString,
    lower: node =>
      Node.$match(node, {
        Lit: ({ value }) => {
          if (typeof value === 'boolean') return z3.Bool.val(value)
          if (typeof value === 'number') {
            return Number.isInteger(value) ? z3.Int.val(value) : z3.Real.val(value)
          }
          if (typeof value === 'string') return z3.Int.val(encodeString(value))
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
        Call: ({ op, args }) => z3Ops[op.id](args, ctx),
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
          // Uninterpreted boolean symbol: sound over-approximation
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
    const model = solver.model()
    const witness: Record<string, unknown> = {}
    for (const [name, v] of vars) {
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

/**
 * Prove that `schema` (with its `Expr.refine` invariants) entails `goal`.
 * Runs Tier 3 synchronously first; escalates to Tier 4 (Z3) only if Tier 3
 * returns `Unknown` or `False` (to produce a concrete counterexample).
 */
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

/**
 * Prove that `transition` preserves every `Expr.refine` invariant on
 * `stateSchema` for all valid pre-states and inputs satisfying `when`.
 *
 * Runs Tier 3 (Interval + Zone) synchronously first — proving transitions like
 * `Withdraw` without loading Z3. Escalates to Z3 only on `Unknown` or to find
 * a concrete counterexample witness.
 */
export const transition = <S extends Schema.Top, I, Emit>(
  stateSchema: S,
  tr: Transition<S['Type'], I, Emit>,
): Effect.Effect<Verdict.Verdict<Readonly<Record<string, unknown>>>> =>
  Effect.promise(async () => {
    const tier3 = AbstractCheck.checkTransition(stateSchema, tr)
    if (Verdict.isTrue(tier3)) return tier3

    const fields = new Map<string, FieldSort>()
    collectFieldSorts(stateSchema.ast, ['state'], fields)
    const preInvariants = Expr.refinementsOf(stateSchema).map(r => prefixNode(r.node, ['state']))
    const inputInvariants: Array<Node.Node> = []
    if (Option.isSome(tr.inputSchema)) {
      collectFieldSorts(tr.inputSchema.value.ast, ['input'], fields)
      for (const r of Expr.refinementsOf(tr.inputSchema.value)) {
        inputInvariants.push(prefixNode(r.node, ['input']))
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

/**
 * Prove a policy/guard implication over an `Env` shape (e.g.
 * `{ row: Account, principal: Principal }`). Automatically imports every
 * `Expr.refine` invariant from the schemas in `shape` as valid hypotheses.
 */
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
        hypotheses.push(prefixNode(r.node, [slice]))
      }
    }
    if (options?.hypotheses !== undefined) {
      for (const h of options.hypotheses) hypotheses.push(h.node)
    }
    return solveWithZ3(fields, hypotheses, [goal.node])
  })
