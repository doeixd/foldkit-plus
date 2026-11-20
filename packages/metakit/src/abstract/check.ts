/**
 * Tier 3 synchronous static checker combining:
 *   - Effect `Schema` numeric/literal domain extraction,
 *   - Interval + Zone (DBM) relational propagation,
 *   - Finite literal case splitting (e.g. `status: 'open' | 'frozen'`),
 *   - Deterministic bounded fixed-point loop (max 16 rounds), degrading
 *     soundly to `Verdict.Unknown` + `Obligation` for Tier 4 (Z3).
 */
import { Option, SchemaAST } from 'effect'
import type { Schema } from 'effect'
import * as Expr from '../expr.js'
import * as Node from '../node.js'
import * as Bool from '../ops/bool.js'
import * as Path from '../path.js'
import type { Transition } from '../transition.js'
import * as Verdict from '../verdict.js'
import * as Interval from './interval.js'
import { Zone, ZERO } from './zone.js'

const MAX_ROUNDS = 16

interface FieldInfo {
  readonly isInt: boolean
  readonly interval: Interval.Interval
  readonly literals: Option.Option<ReadonlyArray<string | number | boolean>>
}

interface EnvModel {
  readonly fields: Map<string, FieldInfo>
  readonly invariants: Array<Node.Node>
}

const emptyField = (): FieldInfo => ({
  isInt: false,
  interval: Interval.top,
  literals: Option.none(),
})

const extractChecksInterval = (
  checks: ReadonlyArray<SchemaAST.Check<unknown>>,
  base: FieldInfo,
): FieldInfo => {
  let isInt = base.isInt
  let iv = base.interval
  for (const check of checks) {
    const ann = check.annotations as Readonly<Record<string, unknown>> | undefined
    if (ann !== undefined) {
      const repr = ann['representation'] as
        | { readonly id?: string; readonly payload?: Readonly<Record<string, unknown>> | null }
        | undefined
      if (repr !== undefined && typeof repr.id === 'string') {
        switch (repr.id) {
          case 'effect/schema/isInt':
            isInt = true
            break
          case 'effect/schema/isGreaterThanOrEqualTo':
            if (typeof repr.payload?.['minimum'] === 'number') {
              iv = Interval.meet(iv, Interval.between(repr.payload['minimum'], Infinity))
            }
            break
          case 'effect/schema/isGreaterThan':
            if (typeof repr.payload?.['exclusiveMinimum'] === 'number') {
              const m = repr.payload['exclusiveMinimum']
              iv = Interval.meet(iv, Interval.between(isInt ? Math.floor(m) + 1 : m, Infinity))
            }
            break
          case 'effect/schema/isLessThanOrEqualTo':
            if (typeof repr.payload?.['maximum'] === 'number') {
              iv = Interval.meet(iv, Interval.between(-Infinity, repr.payload['maximum']))
            }
            break
          case 'effect/schema/isLessThan':
            if (typeof repr.payload?.['exclusiveMaximum'] === 'number') {
              const m = repr.payload['exclusiveMaximum']
              iv = Interval.meet(iv, Interval.between(-Infinity, isInt ? Math.ceil(m) - 1 : m))
            }
            break
          case 'effect/schema/isBetween':
            if (
              typeof repr.payload?.['minimum'] === 'number' &&
              typeof repr.payload?.['maximum'] === 'number'
            ) {
              const lo = repr.payload['minimum']
              const hi = repr.payload['maximum']
              iv = Interval.meet(iv, Interval.between(lo, hi))
            }
            break
        }
      }
    }
    if ('checks' in check && Array.isArray(check.checks)) {
      const next = extractChecksInterval(check.checks, {
        isInt,
        interval: iv,
        literals: base.literals,
      })
      isInt = next.isInt
      iv = next.interval
    }
  }
  return { isInt, interval: iv, literals: base.literals }
}

const collectFieldsFromAst = (
  ast: SchemaAST.AST,
  prefix: ReadonlyArray<string>,
  fields: Map<string, FieldInfo>,
): void => {
  if (SchemaAST.isObjects(ast)) {
    for (const prop of ast.propertySignatures) {
      if (typeof prop.name === 'string') {
        collectFieldsFromAst(prop.type, [...prefix, prop.name], fields)
      }
    }
    return
  }
  const key = Path.format(prefix)
  let info = emptyField()
  if (SchemaAST.isNumber(ast)) {
    if (ast.checks !== undefined) {
      info = extractChecksInterval(ast.checks, info)
    }
    fields.set(key, info)
    return
  }
  if (SchemaAST.isBoolean(ast)) {
    fields.set(key, { ...info, literals: Option.some([true, false]) })
    return
  }
  if (SchemaAST.isLiteral(ast)) {
    const lit = ast.literal
    if (typeof lit === 'string' || typeof lit === 'number' || typeof lit === 'boolean') {
      fields.set(key, { ...info, literals: Option.some([lit]) })
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
      fields.set(key, { ...info, literals: Option.some(lits) })
    }
  }
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

/** Flatten top-level `and` conjunctions into a list of conjuncts. */
const flattenAnd = (node: Node.Node, out: Array<Node.Node>): void => {
  if (Node.$is('Call')(node) && node.op.id === 'and' && node.args.length === 2) {
    flattenAnd(node.args[0]!, out)
    flattenAnd(node.args[1]!, out)
    return
  }
  out.push(node)
}

/** Negate a boolean `Node` (pushing `not` through comparisons where possible). */
const negateNode = (node: Node.Node): Node.Node => {
  if (Node.$is('Lit')(node) && typeof node.value === 'boolean') {
    return Node.Lit({ value: !node.value })
  }
  if (Node.$is('Call')(node)) {
    const [a, b] = node.args
    switch (node.op.id) {
      case 'not':
        return a!
      case 'lt':
        return Node.Call({
          op: { id: 'gte', evaluate: args => (args[0] as number) >= (args[1] as number) },
          args: [a!, b!],
        })
      case 'lte':
        return Node.Call({
          op: { id: 'gt', evaluate: args => (args[0] as number) > (args[1] as number) },
          args: [a!, b!],
        })
      case 'gt':
        return Node.Call({
          op: { id: 'lte', evaluate: args => (args[0] as number) <= (args[1] as number) },
          args: [a!, b!],
        })
      case 'gte':
        return Node.Call({
          op: { id: 'lt', evaluate: args => (args[0] as number) < (args[1] as number) },
          args: [a!, b!],
        })
      case 'is':
        return Node.Call({
          op: { id: 'isNot', evaluate: args => args[0] !== args[1] },
          args: [a!, b!],
        })
      case 'isNot':
        return Node.Call({
          op: { id: 'is', evaluate: args => args[0] === args[1] },
          args: [a!, b!],
        })
    }
  }
  return Node.Call({ op: Bool.notOp, args: [node] })
}

/**
 * Relational abstract state: maps numeric terms (`Node.key`) to Zone variable
 * indices, tracks integer-ness, and holds equality constraints on non-numeric
 * terms (such as literal status enums).
 */
class AbstractState {
  readonly varIndex = new Map<string, number>()
  readonly intVars = new Set<number>()
  readonly termNodes = new Map<number, Node.Node>()
  readonly subTerms: Array<{
    readonly id: number
    readonly left: Node.Node
    readonly right: Node.Node
  }> = []
  readonly addTerms: Array<{
    readonly id: number
    readonly left: Node.Node
    readonly right: Node.Node
  }> = []
  readonly eqFacts = new Map<string, unknown>()
  readonly neqFacts = new Map<string, Set<unknown>>()
  zone: Zone

  constructor(nodes: ReadonlyArray<Node.Node>, env: EnvModel) {
    // 1. Register every numeric field from Schema
    for (const [fieldKey, info] of env.fields) {
      if (Option.isNone(info.literals)) {
        const id = this.registerKey(fieldKey, info.isInt)
        this.termNodes.set(
          id,
          Node.Path({ segments: fieldKey === '$' ? [] : fieldKey.split('.'), ast: Option.none() }),
        )
      }
    }
    // 2. Register every numeric sub-expression appearing in the nodes
    for (const node of nodes) {
      this.collectTerms(node, env)
    }
    this.zone = Zone.make(this.varIndex.size)
    // 3. Seed schema bounds
    for (const [fieldKey, info] of env.fields) {
      const id = this.varIndex.get(fieldKey)
      if (id !== undefined) {
        if (Number.isFinite(info.interval.lo)) this.zone.constrainLower(id, info.interval.lo)
        if (Number.isFinite(info.interval.hi)) this.zone.constrainUpper(id, info.interval.hi)
      }
    }
  }

  private registerKey(k: string, isInt: boolean): number {
    const existing = this.varIndex.get(k)
    if (existing !== undefined) {
      if (isInt) this.intVars.add(existing)
      return existing
    }
    const id = this.varIndex.size + 1
    this.varIndex.set(k, id)
    if (isInt) this.intVars.add(id)
    return id
  }

  private isIntNode(node: Node.Node, env: EnvModel): boolean {
    if (Node.$is('Lit')(node)) return typeof node.value === 'number' && Number.isInteger(node.value)
    if (Node.$is('Path')(node)) {
      const info = env.fields.get(Path.format(node.segments))
      return info?.isInt ?? false
    }
    if (Node.$is('Call')(node)) {
      if (
        node.op.id === 'add' ||
        node.op.id === 'sub' ||
        node.op.id === 'mul' ||
        node.op.id === 'neg' ||
        node.op.id === 'min' ||
        node.op.id === 'max' ||
        node.op.id === 'abs'
      ) {
        return node.args.every(a => this.isIntNode(a, env))
      }
      if (node.op.id === 'len') return true
    }
    return false
  }

  private collectTerms(node: Node.Node, env: EnvModel): void {
    Node.$match(node, {
      Lit: () => {},
      Path: ({ segments }) => {
        const fk = Path.format(segments)
        const info = env.fields.get(fk)
        if (info !== undefined && Option.isNone(info.literals)) {
          this.registerKey(fk, info.isInt)
        }
      },
      Call: ({ op, args }) => {
        for (const a of args) this.collectTerms(a, env)
        if (op.id === 'sub' && args.length === 2) {
          const id = this.registerKey(Node.key(node), this.isIntNode(node, env))
          this.termNodes.set(id, node)
          this.subTerms.push({ id, left: args[0]!, right: args[1]! })
        } else if (op.id === 'add' && args.length === 2) {
          const id = this.registerKey(Node.key(node), this.isIntNode(node, env))
          this.termNodes.set(id, node)
          this.addTerms.push({ id, left: args[0]!, right: args[1]! })
        } else if (
          op.id === 'mul' ||
          op.id === 'neg' ||
          op.id === 'min' ||
          op.id === 'max' ||
          op.id === 'abs' ||
          op.id === 'len'
        ) {
          const id = this.registerKey(Node.key(node), this.isIntNode(node, env))
          this.termNodes.set(id, node)
        }
      },
      If: ({ cond, then, otherwise }) => {
        this.collectTerms(cond, env)
        this.collectTerms(then, env)
        this.collectTerms(otherwise, env)
      },
      Match: ({ on, cases, otherwise }) => {
        this.collectTerms(on, env)
        for (const [, b] of cases) this.collectTerms(b, env)
        if (Option.isSome(otherwise)) this.collectTerms(otherwise.value, env)
      },
      Opaque: () => {},
    })
  }

  varOf(node: Node.Node): Option.Option<number> {
    if (Node.$is('Path')(node)) {
      return Option.fromUndefinedOr(this.varIndex.get(Path.format(node.segments)))
    }
    return Option.fromUndefinedOr(this.varIndex.get(Node.key(node)))
  }

  /** Interval of any numeric node from the current Zone. */
  evalInterval(node: Node.Node): Interval.Interval {
    if (Node.$is('Lit')(node) && typeof node.value === 'number') {
      return Interval.constant(node.value)
    }
    const v = this.varOf(node)
    const fromZone = Option.isSome(v) ? this.zone.intervalOf(v.value) : Interval.top
    if (Node.$is('Call')(node)) {
      const [a, b] = node.args
      switch (node.op.id) {
        case 'add':
          return Interval.meet(fromZone, Interval.add(this.evalInterval(a!), this.evalInterval(b!)))
        case 'sub':
          return Interval.meet(fromZone, Interval.sub(this.evalInterval(a!), this.evalInterval(b!)))
        case 'mul':
          return Interval.meet(fromZone, Interval.mul(this.evalInterval(a!), this.evalInterval(b!)))
        case 'neg':
          return Interval.meet(fromZone, Interval.neg(this.evalInterval(a!)))
        case 'min':
          return Interval.meet(fromZone, Interval.min(this.evalInterval(a!), this.evalInterval(b!)))
        case 'max':
          return Interval.meet(fromZone, Interval.max(this.evalInterval(a!), this.evalInterval(b!)))
        case 'abs':
          return Interval.meet(fromZone, Interval.abs(this.evalInterval(a!)))
        case 'len':
          return Interval.meet(fromZone, Interval.between(0, Infinity))
      }
    }
    return fromZone
  }

  /**
   * Add a linear comparison `left <= right` (or `<` when `strict` is true).
   * Handles:
   *   - `var <= const`, `const <= var`, `var1 <= var2`
   *   - `y <= x - z` <=> `z <= x - y` (so `amount <= balance - reserved`
   *     directly links `reserved <= balance - amount` in the Zone!)
   */
  assumeLeq(left: Node.Node, right: Node.Node, strict: boolean): void {
    const bothInt = this.isIntRef(left) && this.isIntRef(right)
    const delta = strict ? (bothInt ? -1 : 0) : 0

    // Direct var / const cases
    const lv = this.varOf(left)
    const rv = this.varOf(right)
    const lConst = Node.$is('Lit')(left) && typeof left.value === 'number' ? left.value : undefined
    const rConst =
      Node.$is('Lit')(right) && typeof right.value === 'number' ? right.value : undefined

    if (Option.isSome(lv) && rConst !== undefined) {
      this.zone.constrainUpper(lv.value, rConst + delta)
    } else if (lConst !== undefined && Option.isSome(rv)) {
      this.zone.constrainLower(rv.value, lConst - delta)
    } else if (Option.isSome(lv) && Option.isSome(rv)) {
      this.zone.constrainDiff(lv.value, rv.value, delta)
    }

    // Algebraic swap: y <= x - z  ==>  z <= x - y (for any registered sub(x, y))
    if (Node.$is('Call')(right) && right.op.id === 'sub' && right.args.length === 2) {
      const [x, z] = right.args
      const swappedKey = Node.key(Node.Call({ op: right.op, args: [x!, left] }))
      const swappedVar = this.varIndex.get(swappedKey)
      const zv = this.varOf(z!)
      if (swappedVar !== undefined && Option.isSome(zv)) {
        this.zone.constrainDiff(zv.value, swappedVar, delta)
      }
      // Also if x is constant c: y <= c - z => ...
      // And if z is constant c: y - x <= -c + delta
      const xv = this.varOf(x!)
      const zConst = Node.$is('Lit')(z!) && typeof z!.value === 'number' ? z!.value : undefined
      if (Option.isSome(lv) && Option.isSome(xv) && zConst !== undefined) {
        this.zone.constrainDiff(lv.value, xv.value, -zConst + delta)
      }
    }

    // Algebraic swap: x - z <= y  ==>  x - y <= z
    if (Node.$is('Call')(left) && left.op.id === 'sub' && left.args.length === 2) {
      const [x, z] = left.args
      const swappedKey = Node.key(Node.Call({ op: left.op, args: [x!, right] }))
      const swappedVar = this.varIndex.get(swappedKey)
      const zv = this.varOf(z!)
      if (swappedVar !== undefined && Option.isSome(zv)) {
        this.zone.constrainDiff(swappedVar, zv.value, delta)
      }
      const xv = this.varOf(x!)
      const zConst = Node.$is('Lit')(z!) && typeof z!.value === 'number' ? z!.value : undefined
      if (Option.isSome(xv) && Option.isSome(rv) && zConst !== undefined) {
        this.zone.constrainDiff(xv.value, rv.value, zConst + delta)
      }
    }
  }

  private isIntRef(node: Node.Node): boolean {
    if (Node.$is('Lit')(node)) return typeof node.value === 'number' && Number.isInteger(node.value)
    const v = this.varOf(node)
    return Option.isSome(v) && this.intVars.has(v.value)
  }

  /** Assume a boolean constraint holds in this abstract state. */
  assume(node: Node.Node): void {
    const conjuncts: Array<Node.Node> = []
    flattenAnd(node, conjuncts)
    for (const c of conjuncts) {
      if (Node.$is('Lit')(c)) {
        if (c.value === false) this.zone.constrainDiff(ZERO, ZERO, -1)
        continue
      }
      if (!Node.$is('Call')(c)) continue
      const [a, b] = c.args
      switch (c.op.id) {
        case 'lte':
          this.assumeLeq(a!, b!, false)
          break
        case 'lt':
          this.assumeLeq(a!, b!, true)
          break
        case 'gte':
          this.assumeLeq(b!, a!, false)
          break
        case 'gt':
          this.assumeLeq(b!, a!, true)
          break
        case 'is': {
          const av = this.varOf(a!)
          const bv = this.varOf(b!)
          const aLit = Node.$is('Lit')(a!) ? Option.some(a!.value) : Option.none()
          const bLit = Node.$is('Lit')(b!) ? Option.some(b!.value) : Option.none()
          if (Option.isSome(av) && Option.isSome(bv)) {
            this.zone.constrainEq(av.value, bv.value, 0)
          } else if (Option.isSome(av) && Option.isSome(bLit) && typeof bLit.value === 'number') {
            this.zone.constrainEq(av.value, ZERO, bLit.value)
          } else if (Option.isSome(bv) && Option.isSome(aLit) && typeof aLit.value === 'number') {
            this.zone.constrainEq(bv.value, ZERO, aLit.value)
          } else if (Node.$is('Path')(a!) && Option.isSome(bLit)) {
            const pk = Path.format(a!.segments)
            const prev = this.eqFacts.get(pk)
            if (prev !== undefined && prev !== bLit.value) {
              this.zone.constrainDiff(ZERO, ZERO, -1)
            } else {
              this.eqFacts.set(pk, bLit.value)
            }
          } else if (Node.$is('Path')(b!) && Option.isSome(aLit)) {
            const pk = Path.format(b!.segments)
            const prev = this.eqFacts.get(pk)
            if (prev !== undefined && prev !== aLit.value) {
              this.zone.constrainDiff(ZERO, ZERO, -1)
            } else {
              this.eqFacts.set(pk, aLit.value)
            }
          }
          break
        }
        case 'isNot': {
          if (Node.$is('Path')(a!) && Node.$is('Lit')(b!)) {
            const pk = Path.format(a!.segments)
            if (this.eqFacts.get(pk) === b!.value) {
              this.zone.constrainDiff(ZERO, ZERO, -1)
            }
            const set = this.neqFacts.get(pk) ?? new Set()
            set.add(b!.value)
            this.neqFacts.set(pk, set)
          }
          break
        }
        case 'not':
          this.assume(negateNode(a!))
          break
      }
    }
  }

  /**
   * Bounded fixed-point propagation of `add`/`sub` relationships and interval
   * bounds into the Zone (capped at `MAX_ROUNDS` to guarantee termination).
   */
  propagate(): boolean {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      if (!this.zone.close()) return false
      let changed = false

      const tighten = (i: number, j: number, bound: number) => {
        if (!Number.isFinite(bound)) return
        const before = this.zone.diffBound(i, j)
        if (bound < before) {
          this.zone.constrainDiff(i, j, bound)
          changed = true
        }
      }

      // Propagate sub(x, y): t = x - y
      for (const { id, left, right } of this.subTerms) {
        const iv = Interval.sub(this.evalInterval(left), this.evalInterval(right))
        tighten(id, ZERO, iv.hi)
        tighten(ZERO, id, -iv.lo)
        const lv = this.varOf(left)
        const rv = this.varOf(right)
        const riv = this.evalInterval(right)
        if (Option.isSome(lv)) {
          // t - x = -y => t - x <= -y.lo and x - t <= y.hi
          if (Number.isFinite(riv.lo)) tighten(id, lv.value, -riv.lo)
          if (Number.isFinite(riv.hi)) tighten(lv.value, id, riv.hi)
        }
        // Relational Zone bounds on t = x - y:
        // x - y <= diffBound(x, y)  ==>  t <= diffBound(x, y)
        // y - x <= diffBound(y, x)  ==>  -t <= diffBound(y, x)  ==>  0 - t <= diffBound(y, x)
        if (Option.isSome(lv) && Option.isSome(rv)) {
          tighten(id, ZERO, this.zone.diffBound(lv.value, rv.value))
          tighten(ZERO, id, this.zone.diffBound(rv.value, lv.value))
        }
      }

      // Propagate add(x, y): t = x + y
      for (const { id, left, right } of this.addTerms) {
        const iv = Interval.add(this.evalInterval(left), this.evalInterval(right))
        tighten(id, ZERO, iv.hi)
        tighten(ZERO, id, -iv.lo)
        const lv = this.varOf(left)
        const rv = this.varOf(right)
        const liv = this.evalInterval(left)
        const riv = this.evalInterval(right)
        if (Option.isSome(lv)) {
          if (Number.isFinite(riv.lo)) tighten(lv.value, id, -riv.lo)
          if (Number.isFinite(riv.hi)) tighten(id, lv.value, riv.hi)
        }
        if (Option.isSome(rv)) {
          if (Number.isFinite(liv.lo)) tighten(rv.value, id, -liv.lo)
          if (Number.isFinite(liv.hi)) tighten(id, rv.value, liv.hi)
        }
      }

      // Propagate general interval bounds for other ops (mul, min, max, abs, neg, len)
      for (const [id, term] of this.termNodes) {
        if (!Node.$is('Call')(term)) continue
        const iv = this.evalInterval(term)
        tighten(id, ZERO, iv.hi)
        tighten(ZERO, id, -iv.lo)
      }

      if (!changed) break
    }
    return this.zone.close()
  }

  /** Check whether `goal` is entailed (`True`), refuted (`False`), or `Unknown`. */
  entails(goal: Node.Node): Verdict.Verdict<never> {
    if (!this.propagate()) {
      return Verdict.True(Option.some(Verdict.Proved('zone')))
    }
    if (Node.$is('Lit')(goal)) {
      return Boolean(goal.value)
        ? Verdict.True(Option.some(Verdict.Proved('concrete')))
        : Verdict.False()
    }
    if (Node.$is('Opaque')(goal)) {
      return Verdict.Unknown(
        `opaque term "${goal.name}"`,
        Option.some({ kind: 'opaque', detail: goal.name }),
      )
    }
    if (!Node.$is('Call')(goal)) {
      return Verdict.Unknown('non-atomic goal')
    }

    const [a, b] = goal.args
    switch (goal.op.id) {
      case 'and':
        return Verdict.and(this.entails(a!), this.entails(b!))
      case 'or':
        return Verdict.or(this.entails(a!), this.entails(b!))
      case 'not':
        return Verdict.not(this.entails(a!))
      case 'lte':
        return this.entailsLeq(a!, b!, false)
      case 'lt':
        return this.entailsLeq(a!, b!, true)
      case 'gte':
        return this.entailsLeq(b!, a!, false)
      case 'gt':
        return this.entailsLeq(b!, a!, true)
      case 'is': {
        if (Node.$is('Path')(a!) && Node.$is('Lit')(b!)) {
          const pk = Path.format(a!.segments)
          if (this.eqFacts.has(pk)) {
            return this.eqFacts.get(pk) === b!.value
              ? Verdict.True(Option.some(Verdict.Proved('zone')))
              : Verdict.False()
          }
          if (this.neqFacts.get(pk)?.has(b!.value)) {
            return Verdict.False()
          }
        }
        return Interval.is(this.evalInterval(a!), this.evalInterval(b!))
      }
      case 'isNot':
        return Verdict.not(
          this.entails(
            Node.Call({ op: { id: 'is', evaluate: args => args[0] === args[1] }, args: [a!, b!] }),
          ),
        )
      default:
        return Verdict.Unknown(
          `operator "${goal.op.id}" requires higher-tier solver`,
          Option.some({ kind: 'unsupported', detail: goal.op.id }),
        )
    }
  }

  private entailsLeq(left: Node.Node, right: Node.Node, strict: boolean): Verdict.Verdict<never> {
    const lv = this.varOf(left)
    const rv = this.varOf(right)
    const lConst = Node.$is('Lit')(left) && typeof left.value === 'number' ? left.value : undefined
    const rConst =
      Node.$is('Lit')(right) && typeof right.value === 'number' ? right.value : undefined
    const bothInt = this.isIntRef(left) && this.isIntRef(right)
    const reqBound = strict ? (bothInt ? -1 : -Number.EPSILON) : 0

    // Direct Zone entailment check
    if (Option.isSome(lv) && Option.isSome(rv)) {
      if (strict && !bothInt) {
        if (this.zone.diffBound(lv.value, rv.value) < 0) {
          return Verdict.True(Option.some(Verdict.Proved('zone')))
        }
      } else if (this.zone.impliesDiff(lv.value, rv.value, reqBound)) {
        return Verdict.True(Option.some(Verdict.Proved('zone')))
      }
      // Refutation: if Zone implies left > right (or >= for strict)
      if (strict) {
        if (this.zone.impliesDiff(rv.value, lv.value, 0)) return Verdict.False()
      } else if (bothInt && this.zone.impliesDiff(rv.value, lv.value, -1)) {
        return Verdict.False()
      }
    } else if (Option.isSome(lv) && rConst !== undefined) {
      const bound = strict ? (bothInt ? rConst - 1 : rConst) : rConst
      if (strict && !bothInt) {
        if (this.zone.diffBound(lv.value, ZERO) < rConst) {
          return Verdict.True(Option.some(Verdict.Proved('zone')))
        }
      } else if (this.zone.impliesDiff(lv.value, ZERO, bound)) {
        return Verdict.True(Option.some(Verdict.Proved('zone')))
      }
    } else if (lConst !== undefined && Option.isSome(rv)) {
      const bound = strict ? (bothInt ? -(lConst + 1) : -lConst) : -lConst
      if (strict && !bothInt) {
        if (this.zone.diffBound(ZERO, rv.value) < -lConst) {
          return Verdict.True(Option.some(Verdict.Proved('zone')))
        }
      } else if (this.zone.impliesDiff(ZERO, rv.value, bound)) {
        return Verdict.True(Option.some(Verdict.Proved('zone')))
      }
    }

    // Fallback to Interval comparison
    const liv = this.evalInterval(left)
    const riv = this.evalInterval(right)
    return strict ? Interval.lt(liv, riv) : Interval.lte(liv, riv)
  }
}

/** Substitute post-state write equations into a state invariant `Node`. */
const substituteStateWrites = (
  node: Node.Node,
  writes: ReadonlyMap<string, Node.Node>,
): Node.Node =>
  Node.$match(node, {
    Lit: lit => lit,
    Path: path => {
      if (path.segments[0] === 'state') {
        const rel = Path.format(path.segments.slice(1))
        const replacement = writes.get(rel)
        if (replacement !== undefined) return replacement
      }
      return path
    },
    Call: ({ op, args }) =>
      Node.Call({ op, args: args.map(a => substituteStateWrites(a, writes)) }),
    If: ({ cond, then, otherwise }) =>
      Node.If({
        cond: substituteStateWrites(cond, writes),
        then: substituteStateWrites(then, writes),
        otherwise: substituteStateWrites(otherwise, writes),
      }),
    Match: ({ on, cases, otherwise }) =>
      Node.Match({
        on: substituteStateWrites(on, writes),
        cases: cases.map(([v, b]) => [v, substituteStateWrites(b, writes)] as const),
        otherwise: Option.map(otherwise, b => substituteStateWrites(b, writes)),
      }),
    Opaque: o => o,
  })

/**
 * Tier 3 synchronous check: does `schema` (including its `Expr.refine`
 * invariants) entail `goal`?
 */
export const checkInvariant = <S extends Schema.Top>(
  schema: S,
  goal: Expr.Expr<S['Type'], boolean>,
): Verdict.Verdict<never> => {
  const fields = new Map<string, FieldInfo>()
  collectFieldsFromAst(schema.ast, [], fields)
  const invariants = Expr.refinementsOf(schema).map(r => r.node)
  const env: EnvModel = { fields, invariants }
  const state = new AbstractState([...invariants, goal.node], env)
  for (const inv of invariants) state.assume(inv)
  return state.entails(goal.node)
}

/**
 * Tier 3 synchronous check: does `transition` preserve every `Expr.refine`
 * invariant on `stateSchema` for every valid pre-state and input satisfying
 * `transition.when`?
 */
export const checkTransition = <S extends Schema.Top, I, Emit>(
  stateSchema: S,
  transition: Transition<S['Type'], I, Emit>,
): Verdict.Verdict<never> => {
  const preInvariants = Expr.refinementsOf(stateSchema).map(r => prefixNode(r.node, ['state']))
  if (preInvariants.length === 0) {
    return Verdict.True(Option.some(Verdict.Proved('concrete')))
  }

  const fields = new Map<string, FieldInfo>()
  collectFieldsFromAst(stateSchema.ast, ['state'], fields)

  const inputInvariants: Array<Node.Node> = []
  if (Option.isSome(transition.inputSchema)) {
    const inputSchema = transition.inputSchema.value
    collectFieldsFromAst(inputSchema.ast, ['input'], fields)
    for (const r of Expr.refinementsOf(inputSchema)) {
      inputInvariants.push(prefixNode(r.node, ['input']))
    }
  }

  const writeMap = new Map<string, Node.Node>()
  for (const eq of transition.writes) {
    writeMap.set(Path.format(eq.target), eq.value.node)
  }
  const postGoals = preInvariants.map(inv => substituteStateWrites(inv, writeMap))

  const allHypotheses = [...preInvariants, ...inputInvariants, transition.when.node]
  const env: EnvModel = { fields, invariants: allHypotheses }
  const state = new AbstractState([...allHypotheses, ...postGoals], env)
  for (const hyp of allHypotheses) state.assume(hyp)

  let overall: Verdict.Verdict<never> = Verdict.True(Option.some(Verdict.Proved('zone')))
  for (const goal of postGoals) {
    overall = Verdict.and(overall, state.entails(goal))
    if (Verdict.isFalse(overall)) return overall
  }
  return overall
}
