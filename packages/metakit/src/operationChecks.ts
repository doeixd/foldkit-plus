/**
 * Generated law checks and obligation collection for custom operations
 * (Phase 4 bout 4.6, exported from `metakit/conformance`).
 *
 * Samples each argument Schema with awkward values, range ends and seeded
 * `Arbitrary.schema` draws, runs every declared claim through `applyForeign`,
 * records the evaluated calls for optional SQL parity runners, and emits
 * `Temporal.Discharge`s for the obligations registry.
 */
import { Effect, Option, Schema, SchemaAST } from 'effect'
import * as Arbitrary from 'effect/Arbitrary'
import * as Node from './node.js'
import {
  implementationsMeta,
  type AnyOperation,
  type OperationImplementations,
} from './operation.js'
import type { SqlDialect } from './operationSql.js'
import { applyForeign } from './ops/eval.js'
import type { Expr } from './path.js'
import { sameAnswer } from './propertyChecks.js'
import * as Temporal from './temporal.js'

const AWKWARD_NUMBERS: ReadonlyArray<number> = [
  0,
  -0,
  1,
  -1,
  2,
  -2,
  Number.MAX_SAFE_INTEGER,
  -Number.MAX_SAFE_INTEGER,
  0.5,
  -0.5,
  1e200,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
]
const AWKWARD_STRINGS: ReadonlyArray<string> = ['', 'a', 'A', 'Ab', '🎉', '\ud800', '\0']
const AWKWARD_BOOLEANS: ReadonlyArray<boolean> = [true, false]

const SAMPLE_REFUSAL = new Node.Refusal({
  reason: 'failed',
  at: 'sample',
  detail: 'probe refusal',
})

const formatVal = (value: unknown): string => {
  if (Node.isRefusal(value)) return `Refusal(${value.reason})`
  if (Object.is(value, -0)) return '-0'
  if (typeof value === 'string') return JSON.stringify(value)
  return String(value)
}

const isIntSchema = (ast: SchemaAST.AST): boolean => {
  const checks =
    'checks' in ast
      ? (ast.checks as ReadonlyArray<SchemaAST.Check<unknown>> | undefined)
      : undefined
  if (checks === undefined) return false
  const hasInt = (list: ReadonlyArray<SchemaAST.Check<unknown>>): boolean =>
    list.some(c => {
      const id = (c.annotations?.representation as { readonly id?: string } | undefined)?.id
      return id === 'effect/schema/isInt' || (c._tag === 'FilterGroup' && hasInt(c.checks))
    })
  return hasInt(checks)
}

const rangeEndsOf = (schema: Schema.Top): ReadonlyArray<number> => {
  const ast = schema.ast
  const checks =
    'checks' in ast
      ? (ast.checks as ReadonlyArray<SchemaAST.Check<unknown>> | undefined)
      : undefined
  if (checks === undefined) return []
  const intOnly = isIntSchema(ast)
  const stepIn = (n: number, dir: 1 | -1): number =>
    intOnly ? n + dir : n + dir * Math.max(Number.MIN_VALUE, Math.abs(n) * Number.EPSILON * 2)
  const ends: Array<number> = []
  const visit = (list: ReadonlyArray<SchemaAST.Check<unknown>>): void => {
    for (const check of list) {
      if (check._tag === 'FilterGroup') {
        visit(check.checks)
        continue
      }
      const rep = check.annotations?.representation as
        | { readonly id?: string; readonly payload?: Record<string, unknown> }
        | undefined
      if (rep?.payload === undefined || rep.payload === null || typeof rep.payload !== 'object')
        continue
      const min = rep.payload['minimum']
      const max = rep.payload['maximum']
      if (typeof min === 'number') {
        ends.push(
          rep.id === 'effect/schema/isGreaterThan' || rep.payload['exclusiveMinimum']
            ? stepIn(min, 1)
            : min,
        )
      }
      if (typeof max === 'number') {
        ends.push(
          rep.id === 'effect/schema/isLessThan' || rep.payload['exclusiveMaximum']
            ? stepIn(max, -1)
            : max,
        )
      }
    }
  }
  visit(checks)
  return ends
}

interface ArgSamples {
  readonly hand: ReadonlyArray<unknown>
  readonly seeded: ReadonlyArray<unknown>
  readonly outside: ReadonlyArray<unknown>
}

const sampleArg = (schema: Schema.Top, seed: number): ArgSamples => {
  const is = Schema.is(schema)
  const pool: ReadonlyArray<unknown> = SchemaAST.isNumber(schema.ast)
    ? [...rangeEndsOf(schema), ...AWKWARD_NUMBERS]
    : SchemaAST.isString(schema.ast)
      ? AWKWARD_STRINGS
      : SchemaAST.isBoolean(schema.ast)
        ? AWKWARD_BOOLEANS
        : [...AWKWARD_NUMBERS, ...AWKWARD_STRINGS, ...AWKWARD_BOOLEANS]

  const hand: Array<unknown> = []
  const outside: Array<unknown> = []
  const seen = new Set<string>()
  for (const val of pool) {
    const key = `${typeof val}:${formatVal(val)}`
    if (seen.has(key)) continue
    seen.add(key)
    if (is(val)) hand.push(val)
    else outside.push(val)
  }

  let seeded: ReadonlyArray<unknown> = []
  try {
    const arb = Arbitrary.schema(schema as unknown as Schema.Codec<unknown>)
    seeded = Effect.runSync(Arbitrary.sampleEffect(arb, { count: 200, seed, size: 12 })).filter(is)
  } catch {
    seeded = hand
  }
  return { hand, seeded, outside }
}

/** Runs recorded calls in one SQL statement per dialect for parity checking. */
export interface ParityRunner {
  readonly dialect: SqlDialect
  readonly evaluate: (
    op: Node.ForeignOp,
    calls: ReadonlyArray<ReadonlyArray<unknown>>,
  ) => ReadonlyArray<unknown>
}

/** Result of checking every declared claim of one custom operation. */
export interface OperationReport {
  readonly ok: boolean
  readonly seed: number
  readonly calls: number
  readonly failures: ReadonlyArray<string>
  readonly discharges: ReadonlyArray<Temporal.Discharge>
}

const failMsg = (
  op: Node.ForeignOp,
  property: string,
  args: ReadonlyArray<unknown>,
  actual: unknown,
  expected: unknown,
): string =>
  `[metakit] ${Node.foreignName(op)} claims ${property}, and it does not hold: ${op.id}(${args.map(formatVal).join(', ')}) is ${formatVal(actual)}, not ${formatVal(expected)}. Remove the claim, or narrow the argument Schemas.`

/**
 * Run generated checks for every claim declared on `op` against `table`,
 * returning a report and `Temporal.Discharge`s for the obligations registry.
 */
export const checkOperation = (
  op: AnyOperation,
  table: OperationImplementations,
  options?: {
    readonly seed?: number
    readonly sql?: ReadonlyArray<ParityRunner>
  },
): OperationReport => {
  const desc = op.descriptor
  const name = Node.foreignName(desc)
  const { name: tableName } = implementationsMeta(table)
  const seed = options?.seed ?? 1
  const next = Temporal.generator(seed)
  const argSamples = desc.args.map((schema, i) => sampleArg(schema, seed + i * 31))

  const recordedKeys = new Set<string>()
  const recordedCalls: Array<ReadonlyArray<unknown>> = []
  const recordedAnswers: Array<unknown> = []
  let callCount = 0

  const run = (target: Node.ForeignOp, args: ReadonlyArray<unknown>, record = true): unknown => {
    callCount += 1
    const answer = applyForeign(target, args, table)
    if (
      record &&
      target === desc &&
      !args.some(a => a === null || Node.isRefusal(a)) &&
      !Node.isRefusal(answer) &&
      recordedCalls.length < 2000
    ) {
      const k = args.map(formatVal).join('\u0000')
      if (!recordedKeys.has(k)) {
        recordedKeys.add(k)
        recordedCalls.push(args)
        recordedAnswers.push(answer)
      }
    }
    return answer
  }

  const pick = (pool: ReadonlyArray<unknown>): unknown => pool[Math.floor(next() * pool.length)]!

  const failures: Array<string> = []
  const discharges: Array<Temporal.Discharge> = []
  const recordClaim = (claimName: string, runs: number, failure: string | undefined): void => {
    const obligation = `law:${name}/${claimName}/${tableName}`
    if (failure !== undefined) {
      failures.push(failure)
      discharges.push({
        obligation,
        result: Temporal.WalkResult.Broken({
          seed,
          interleaving: [],
          minimal: [],
          reason: failure,
        }),
      })
    } else {
      discharges.push({
        obligation,
        result: Temporal.WalkResult.Held({ seed, runs }),
      })
    }
  }

  // Verify out-of-domain values are refused by the Schema guard.
  for (let i = 0; i < argSamples.length; i++) {
    const base = argSamples.map(s => s.hand[0] ?? s.seeded[0] ?? null)
    for (const bad of argSamples[i]!.outside) {
      const args = base.map((v, idx) => (idx === i ? bad : v))
      const ans = run(desc, args, false)
      if (!Node.isRefusal(ans) && !args.some(v => v === null)) {
        failures.push(
          `[metakit] ${name}: out-of-Schema argument ${i + 1} (${formatVal(bad)}) was not refused`,
        )
        break
      }
    }
  }

  // Strict null/refusal check.
  if (desc.nulls === 'strict' && desc.args.length > 0) {
    const base = argSamples.map(s => s.hand[0] ?? s.seeded[0] ?? 0)
    const nullArgs = [null, ...base.slice(1)]
    const nullAns = run(desc, nullArgs, false)
    if (nullAns !== null) {
      failures.push(failMsg(desc, 'nulls: strict', nullArgs, nullAns, null))
    }
    const refArgs = [SAMPLE_REFUSAL, ...base.slice(1)]
    const refAns = run(desc, refArgs, false)
    if (!sameAnswer(refAns, SAMPLE_REFUSAL)) {
      failures.push(failMsg(desc, 'nulls: strict', refArgs, refAns, SAMPLE_REFUSAL))
    }
  }

  const allOf = (i: number): ReadonlyArray<unknown> => [
    ...argSamples[i]!.hand,
    ...argSamples[i]!.seeded,
  ]
  const claims = desc.claims

  if (claims.identity !== undefined) {
    const { value: idVal, side } = claims.identity
    const pool = allOf(0)
    let bad: string | undefined
    for (const x of pool) {
      if (side === 'left' || side === 'both') {
        const res = run(desc, [idVal, x])
        if (!sameAnswer(res, x)) {
          bad = failMsg(desc, 'identity', [idVal, x], res, x)
          break
        }
      }
      if (side === 'right' || side === 'both') {
        const res = run(desc, [x, idVal])
        if (!sameAnswer(res, x)) {
          bad = failMsg(desc, 'identity', [x, idVal], res, x)
          break
        }
      }
    }
    recordClaim('identity', pool.length, bad)
  }

  if (claims.absorbing !== undefined) {
    const { value: absVal, result: absRes, side } = claims.absorbing
    const pool = allOf(0)
    let bad: string | undefined
    for (const x of pool) {
      if (side === 'left' || side === 'both') {
        const res = run(desc, [absVal, x])
        if (!sameAnswer(res, absRes)) {
          bad = failMsg(desc, 'absorbing', [absVal, x], res, absRes)
          break
        }
      }
      if (side === 'right' || side === 'both') {
        const res = run(desc, [x, absVal])
        if (!sameAnswer(res, absRes)) {
          bad = failMsg(desc, 'absorbing', [x, absVal], res, absRes)
          break
        }
      }
    }
    recordClaim('absorbing', pool.length, bad)
  }

  if (claims.idempotent === true) {
    const pool = allOf(0)
    let bad: string | undefined
    if (desc.args.length === 1) {
      for (const x of pool) {
        const once = run(desc, [x])
        const twice = run(desc, [once])
        if (!sameAnswer(twice, once)) {
          bad = failMsg(desc, 'idempotent', [once], twice, once)
          break
        }
      }
    } else {
      for (const x of pool) {
        const res = run(desc, [x, x])
        if (!sameAnswer(res, x)) {
          bad = failMsg(desc, 'idempotent', [x, x], res, x)
          break
        }
      }
    }
    recordClaim('idempotent', pool.length, bad)
  }

  if (claims.commutative === true) {
    const hand = argSamples[0]!.hand
    const pool = allOf(0)
    let bad: string | undefined
    let runs = 0
    const checkPair = (a: unknown, b: unknown): boolean => {
      runs += 1
      const ab = run(desc, [a, b])
      const ba = run(desc, [b, a])
      if (!sameAnswer(ab, ba)) {
        bad = failMsg(desc, 'commutative', [a, b], ab, ba)
        return false
      }
      return true
    }
    outer: for (const a of hand) {
      for (const b of hand) {
        if (!checkPair(a, b)) break outer
      }
    }
    if (bad === undefined && pool.length > 0) {
      for (let i = 0; i < 1000; i++) {
        if (!checkPair(pick(pool), pick(pool))) break
      }
    }
    recordClaim('commutative', runs, bad)
  }

  if (claims.associative !== undefined) {
    const unlessRefused = typeof claims.associative === 'object' && claims.associative.unlessRefused
    const hand = argSamples[0]!.hand.slice(0, 8)
    const pool = allOf(0)
    let bad: string | undefined
    let runs = 0
    const checkTriple = (a: unknown, b: unknown, c: unknown): boolean => {
      runs += 1
      const ab = run(desc, [a, b])
      const lhs = run(desc, [ab, c])
      const bc = run(desc, [b, c])
      const rhs = run(desc, [a, bc])
      if (unlessRefused && (Node.isRefusal(lhs) || Node.isRefusal(rhs))) return true
      if (!sameAnswer(lhs, rhs)) {
        bad = failMsg(desc, 'associative', [ab, c], lhs, rhs)
        return false
      }
      return true
    }
    outer: for (const a of hand) {
      for (const b of hand) {
        for (const c of hand) {
          if (!checkTriple(a, b, c)) break outer
        }
      }
    }
    if (bad === undefined && pool.length > 0) {
      for (let i = 0; i < 1000; i++) {
        if (!checkTriple(pick(pool), pick(pool), pick(pool))) break
      }
    }
    recordClaim('associative', runs, bad)
  }

  if (claims.invertible !== undefined) {
    const invOp = claims.invertible.inverse === 'self' ? desc : claims.invertible.inverse
    const handA = argSamples[0]!.hand
    const handB = argSamples[1]!.hand
    const poolA = allOf(0)
    const poolB = allOf(1)
    let bad: string | undefined
    let runs = 0
    const checkInv = (a: unknown, b: unknown): boolean => {
      runs += 1
      const forward = run(desc, [a, b])
      if (Node.isRefusal(forward)) return true
      const back = run(invOp, [forward, b], false)
      if (!sameAnswer(back, a)) {
        bad = failMsg(desc, 'invertible', [forward, b], back, a)
        return false
      }
      return true
    }
    outer: for (const a of handA) {
      for (const b of handB) {
        if (!checkInv(a, b)) break outer
      }
    }
    if (bad === undefined && poolA.length > 0 && poolB.length > 0) {
      for (let i = 0; i < 1000; i++) {
        if (!checkInv(pick(poolA), pick(poolB))) break
      }
    }
    recordClaim('invertible', runs, bad)
  }

  if (claims.monotone !== undefined) {
    const dirs = claims.monotone
    const pools = argSamples.map((_, i) => allOf(i))
    let bad: string | undefined
    let runs = 0
    for (let pos = 0; pos < dirs.length && bad === undefined; pos++) {
      const dir = dirs[pos]!
      if (dir === 'none') continue
      const pool = pools[pos]!
      if (pool.length < 2) continue
      for (let i = 0; i < 300 && bad === undefined; i++) {
        const base = pools.map(p => pick(p))
        const x = pick(pool)
        const y = pick(pool)
        if (typeof x !== 'number' || typeof y !== 'number' || x === y) continue
        const [lo, hi] = x < y ? [x, y] : [y, x]
        const argsLo = base.map((v, idx) => (idx === pos ? lo : v))
        const argsHi = base.map((v, idx) => (idx === pos ? hi : v))
        runs += 1
        const rLo = run(desc, argsLo)
        const rHi = run(desc, argsHi)
        if (typeof rLo !== 'number' || typeof rHi !== 'number') continue
        const ok = dir === 'up' ? rLo <= rHi : rLo >= rHi
        if (!ok) {
          bad = failMsg(desc, 'monotone', argsHi, rHi, `${dir === 'up' ? '>=' : '<='} ${rLo}`)
        }
      }
    }
    recordClaim('monotone', Math.max(runs, 1), bad)
  }

  // Optional SQL parity runners over the recorded calls.
  for (const runner of options?.sql ?? []) {
    const obligation = `law:${name}/parity/${runner.dialect}`
    const sqlAnswers = runner.evaluate(desc, recordedCalls)
    let bad: string | undefined
    for (let i = 0; i < recordedCalls.length; i++) {
      if (!sameAnswer(sqlAnswers[i], recordedAnswers[i])) {
        bad = `[metakit] ${name} ${runner.dialect} parity failed: ${desc.id}(${recordedCalls[i]!.map(formatVal).join(', ')}) gave ${formatVal(sqlAnswers[i])}, memory gave ${formatVal(recordedAnswers[i])}.`
        break
      }
    }
    if (bad !== undefined) {
      failures.push(bad)
      discharges.push({
        obligation,
        result: Temporal.WalkResult.Broken({ seed, interleaving: [], minimal: [], reason: bad }),
      })
    } else {
      discharges.push({
        obligation,
        result: Temporal.WalkResult.Held({ seed, runs: Math.max(recordedCalls.length, 1) }),
      })
    }
  }

  return { ok: failures.length === 0, seed, calls: callCount, failures, discharges }
}

const collectNodeOps = (node: Node.Node, out: Map<string, Node.ForeignOp>): void => {
  const visitOp = (op: Node.ForeignOp): void => {
    const key = Node.foreignName(op)
    if (out.has(key)) return
    out.set(key, op)
    if (op.claims.invertible !== undefined && op.claims.invertible.inverse !== 'self') {
      visitOp(op.claims.invertible.inverse)
    }
  }
  Node.$match(node, {
    Lit: () => {},
    Path: () => {},
    Call: ({ op, args }) => {
      if (Node.isForeign(op)) visitOp(op)
      for (const arg of args) collectNodeOps(arg, out)
    },
    If: ({ cond, then, otherwise }) => {
      collectNodeOps(cond, out)
      collectNodeOps(then, out)
      collectNodeOps(otherwise, out)
    },
    Match: ({ on, cases, otherwise }) => {
      collectNodeOps(on, out)
      for (const [, arm] of cases) collectNodeOps(arm, out)
      if (Option.isSome(otherwise)) collectNodeOps(otherwise.value, out)
    },
    Opaque: () => {},
    Rows: rows => {
      collectNodeOps(Node.rowsSource(rows.over), out)
      for (const body of Node.rowsBody(rows)) collectNodeOps(body, out)
    },
  })
}

const claimNamesOf = (claims: Node.ForeignClaims): ReadonlyArray<string> => {
  const names: Array<string> = []
  if (claims.identity !== undefined) names.push('identity')
  if (claims.absorbing !== undefined) names.push('absorbing')
  if (claims.idempotent === true) names.push('idempotent')
  if (claims.commutative === true) names.push('commutative')
  if (claims.associative !== undefined) names.push('associative')
  if (claims.invertible !== undefined) names.push('invertible')
  if (claims.monotone !== undefined) names.push('monotone')
  return names
}

/**
 * Collect every law obligation reachable from a Machine, Transition, Expr, or
 * list of Operations, for each `OperationImplementations` table (and optional SQL dialects).
 */
export const lawObligations = (
  from:
    | { readonly transitions: Readonly<Record<string, unknown>> }
    | {
        readonly when: Expr<never, boolean>
        readonly writes: ReadonlyArray<{ readonly value: Expr<never, unknown> }>
        readonly emits: ReadonlyArray<{
          readonly fields: ReadonlyArray<readonly [string, Node.Node]>
        }>
      }
    | Expr<never, unknown>
    | ReadonlyArray<AnyOperation>,
  tables: ReadonlyArray<OperationImplementations>,
  options?: { readonly dialects?: ReadonlyArray<SqlDialect> },
): ReadonlyArray<Temporal.WalkObligation> => {
  const ops = new Map<string, Node.ForeignOp>()
  const addOp = (op: Node.ForeignOp): void => {
    const key = Node.foreignName(op)
    if (ops.has(key)) return
    ops.set(key, op)
    if (op.claims.invertible !== undefined && op.claims.invertible.inverse !== 'self') {
      addOp(op.claims.invertible.inverse)
    }
  }
  const addTransition = (t: {
    readonly when: Expr<never, boolean>
    readonly writes: ReadonlyArray<{ readonly value: Expr<never, unknown> }>
    readonly emits: ReadonlyArray<{
      readonly fields: ReadonlyArray<readonly [string, Node.Node]>
    }>
  }): void => {
    collectNodeOps(t.when.node, ops)
    for (const w of t.writes) collectNodeOps(w.value.node, ops)
    for (const e of t.emits) {
      for (const [, fieldNode] of e.fields) collectNodeOps(fieldNode, ops)
    }
  }

  if (Array.isArray(from)) {
    for (const op of from) addOp(op.descriptor)
  } else if ('transitions' in from) {
    for (const t of Object.values(from.transitions)) {
      addTransition(
        t as {
          readonly when: Expr<never, boolean>
          readonly writes: ReadonlyArray<{ readonly value: Expr<never, unknown> }>
          readonly emits: ReadonlyArray<{
            readonly fields: ReadonlyArray<readonly [string, Node.Node]>
          }>
        },
      )
    }
  } else if ('writes' in from) {
    addTransition(from)
  } else {
    collectNodeOps((from as Expr<never, unknown>).node, ops)
  }

  const obligations: Array<Temporal.WalkObligation> = []
  for (const [name, op] of ops) {
    for (const claim of claimNamesOf(op.claims)) {
      for (const table of tables) {
        const { name: tableName } = implementationsMeta(table)
        obligations.push(
          Temporal.obligation({
            name: `law:${name}/${claim}/${tableName}`,
            over: [],
            shows: `${name} keeps its ${claim} claim in "${tableName}"`,
          }),
        )
      }
    }
    for (const dialect of options?.dialects ?? []) {
      obligations.push(
        Temporal.obligation({
          name: `law:${name}/parity/${dialect}`,
          over: [],
          shows: `${name} matches memory on ${dialect}`,
        }),
      )
    }
  }
  return obligations
}
