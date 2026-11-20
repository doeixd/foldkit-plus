/**
 * Tier 3 synchronous static checker combining:
 *   - Exhaustive `abstractOps: Record<CoreOpId, AbstractOp>` (`forward`,
 *     `narrow`, `addToZone`),
 *   - Effect `Schema` numeric/literal/nullable domain extraction,
 *   - Interval + Zone (DBM) relational propagation,
 *   - `bool.or` and `If` branch case-splitting,
 *   - Nullable bit tracking (`null.isNull`),
 *   - Deterministic bounded fixed-point loop (max 16 rounds), degrading
 *     soundly to `Verdict.Unknown` + `Obligation` for Tier 4 (Z3).
 */
import { Option, SchemaAST } from 'effect'
import type { Schema } from 'effect'
import * as Expr from '../expr.js'
import * as Node from '../node.js'
import * as Arr from '../ops/arr.js'
import * as Bool from '../ops/bool.js'
import * as Eq from '../ops/eq.js'
import * as Ord from '../ops/ord.js'
import * as Str from '../ops/str.js'
import * as Path from '../path.js'
import type { Transition } from '../transition.js'
import * as Verdict from '../verdict.js'
import * as Interval from './interval.js'
import { ordered, type Slice } from './unordered.js'
import { Zone, ZERO } from './zone.js'

const MAX_ROUNDS = 16
const MAX_SPLITS = 8

/** Per-operator Tier 3 contract: every `CoreOpId` fills one row. */
export interface AbstractOp {
  /** Forward interval transformer for numeric operators. */
  readonly forward?: (args: ReadonlyArray<Interval.Interval>) => Interval.Interval
  /** Backward interval narrowing given `op(args) ∈ target`. */
  readonly narrow?: (
    args: ReadonlyArray<Interval.Interval>,
    target: Interval.Interval,
  ) => ReadonlyArray<Interval.Interval>
  /** Comparison verdict over intervals for relational/equality operators. */
  readonly compare?: (args: ReadonlyArray<Interval.Interval>) => Verdict.Verdict<never>
  /** Push a boolean operator constraint into the abstract Zone state. */
  readonly addToZone?: (args: ReadonlyArray<Node.Node>, state: AbstractState) => void
}

export interface FieldInfo {
  readonly isInt: boolean
  readonly nullable: boolean
  readonly interval: Interval.Interval
  readonly literals: Option.Option<ReadonlyArray<string | number | boolean>>
}

const emptyField = (): FieldInfo => ({
  isInt: false,
  nullable: false,
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
              const rawLo = repr.payload['minimum']
              const rawHi = repr.payload['maximum']
              const lo =
                repr.payload['exclusiveMinimum'] === true && isInt ? Math.floor(rawLo) + 1 : rawLo
              const hi =
                repr.payload['exclusiveMaximum'] === true && isInt ? Math.ceil(rawHi) - 1 : rawHi
              iv = Interval.meet(iv, Interval.between(lo, hi))
            }
            break
        }
      }
    }
    if ('checks' in check && Array.isArray(check.checks)) {
      const next = extractChecksInterval(check.checks, {
        ...base,
        isInt,
        interval: iv,
      })
      isInt = next.isInt
      iv = next.interval
    }
  }
  return { ...base, isInt, interval: iv }
}

export const collectFields = (
  ast: SchemaAST.AST,
  prefix: ReadonlyArray<string>,
  fields: Map<string, FieldInfo>,
): void => {
  if (SchemaAST.isObjects(ast)) {
    for (const prop of ast.propertySignatures) {
      if (typeof prop.name === 'string') {
        collectFields(prop.type, [...prefix, prop.name], fields)
      }
    }
    return
  }
  const key = Path.format(prefix)
  let info = emptyField()
  if (SchemaAST.isNumber(ast)) {
    if (ast.checks !== undefined) info = extractChecksInterval(ast.checks, info)
    fields.set(key, info)
    return
  }
  if (SchemaAST.isBoolean(ast)) {
    fields.set(key, { ...info, literals: Option.some([true, false]) })
    return
  }
  if (SchemaAST.isString(ast)) {
    fields.set(key, info)
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
    const flatMembers: Array<SchemaAST.AST> = []
    const collectUnion = (u: SchemaAST.AST): void => {
      if (SchemaAST.isUnion(u)) {
        for (const t of u.types) collectUnion(t)
      } else {
        flatMembers.push(u)
      }
    }
    collectUnion(ast)
    const hasNull = flatMembers.some(SchemaAST.isNull)
    const nonNull = flatMembers.filter(t => !SchemaAST.isNull(t))
    if (hasNull && nonNull.length === 1) {
      const inner = nonNull[0]!
      if (SchemaAST.isNumber(inner)) {
        let innerInfo = { ...info, nullable: true }
        if (inner.checks !== undefined) innerInfo = extractChecksInterval(inner.checks, innerInfo)
        fields.set(key, innerInfo)
        return
      }
      if (SchemaAST.isBoolean(inner)) {
        fields.set(key, { ...info, nullable: true, literals: Option.some([true, false]) })
        return
      }
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
      fields.set(key, { ...info, nullable: hasNull, literals: Option.some(lits) })
      return
    }
    if (hasNull) {
      fields.set(key, { ...info, nullable: true })
    }
  }
}

/** Negate an atomic boolean `Node`, pushing `bool.not` through comparisons. */
const negateNode = (node: Node.Node): Node.Node => {
  if (Node.$is('Lit')(node) && typeof node.value === 'boolean') {
    return Node.Lit({ value: !node.value })
  }
  if (Node.$is('Call')(node)) {
    const [a, b] = node.args
    switch (node.op.id) {
      case 'bool.not':
        return a!
      case 'bool.and':
        return Node.Call({ op: Bool.orOp, args: [negateNode(a!), negateNode(b!)] })
      case 'bool.or':
        return Node.Call({ op: Bool.andOp, args: [negateNode(a!), negateNode(b!)] })
      case 'ord.lt':
        return Node.Call({ op: Ord.gteOp, args: [a!, b!] })
      case 'ord.lte':
        return Node.Call({ op: Ord.gtOp, args: [a!, b!] })
      case 'ord.gt':
        return Node.Call({ op: Ord.lteOp, args: [a!, b!] })
      case 'ord.gte':
        return Node.Call({ op: Ord.ltOp, args: [a!, b!] })
      case 'eq.is':
        return Node.Call({ op: Eq.isNotOp, args: [a!, b!] })
      case 'eq.isNot':
        return Node.Call({ op: Eq.isOp, args: [a!, b!] })
    }
  }
  return Node.Call({ op: Bool.notOp, args: [node] })
}

/**
 * Relational abstract state: Zone DBM + equality/inequality facts + nullable
 * bit tracking + disjunction queue for sound branch case-splitting.
 */
export class AbstractState {
  readonly fields: ReadonlyMap<string, FieldInfo>
  readonly varIndex: Map<string, number>
  readonly intVars: Set<number>
  readonly termNodes: Map<number, Node.Node>
  readonly subTerms: Array<{
    readonly id: number
    readonly left: Node.Node
    readonly right: Node.Node
  }>
  readonly addTerms: Array<{
    readonly id: number
    readonly left: Node.Node
    readonly right: Node.Node
  }>
  readonly eqFacts: Map<string, unknown>
  readonly neqFacts: Map<string, Set<unknown>>
  /** Tracks proven nullability per path: `true` = definitely null, `false` = definitely non-null. */
  readonly nullFacts: Map<string, boolean>
  readonly pendingOrs: Array<readonly [Node.Node, Node.Node]>
  zone: Zone

  constructor(
    nodes: ReadonlyArray<Node.Node>,
    fields: ReadonlyMap<string, FieldInfo>,
    fromClone?: {
      readonly varIndex: Map<string, number>
      readonly intVars: Set<number>
      readonly termNodes: Map<number, Node.Node>
      readonly subTerms: Array<{
        readonly id: number
        readonly left: Node.Node
        readonly right: Node.Node
      }>
      readonly addTerms: Array<{
        readonly id: number
        readonly left: Node.Node
        readonly right: Node.Node
      }>
      readonly eqFacts: Map<string, unknown>
      readonly neqFacts: Map<string, Set<unknown>>
      readonly nullFacts: Map<string, boolean>
      readonly pendingOrs: Array<readonly [Node.Node, Node.Node]>
      readonly zone: Zone
    },
  ) {
    this.fields = fields
    if (fromClone !== undefined) {
      this.varIndex = fromClone.varIndex
      this.intVars = fromClone.intVars
      this.termNodes = fromClone.termNodes
      this.subTerms = fromClone.subTerms
      this.addTerms = fromClone.addTerms
      this.eqFacts = new Map(fromClone.eqFacts)
      this.neqFacts = new Map(
        Array.from(fromClone.neqFacts.entries()).map(([k, s]) => [k, new Set(s)]),
      )
      this.nullFacts = new Map(fromClone.nullFacts)
      this.pendingOrs = [...fromClone.pendingOrs]
      this.zone = fromClone.zone.clone()
      return
    }
    this.varIndex = new Map()
    this.intVars = new Set()
    this.termNodes = new Map()
    this.subTerms = []
    this.addTerms = []
    this.eqFacts = new Map()
    this.neqFacts = new Map()
    this.nullFacts = new Map()
    this.pendingOrs = []

    for (const [fieldKey, info] of fields) {
      if (!info.nullable) {
        this.nullFacts.set(fieldKey, false)
      }
      if (Option.isNone(info.literals)) {
        const id = this.registerKey(fieldKey, info.isInt)
        this.termNodes.set(
          id,
          Node.Path({ segments: fieldKey === '$' ? [] : fieldKey.split('.'), ast: Option.none() }),
        )
      }
    }
    for (const node of nodes) {
      this.collectTerms(node)
    }
    this.zone = Zone.make(this.varIndex.size)
    for (const [fieldKey, info] of fields) {
      const id = this.varIndex.get(fieldKey)
      if (id !== undefined) {
        if (Number.isFinite(info.interval.lo)) this.zone.constrainLower(id, info.interval.lo)
        if (Number.isFinite(info.interval.hi)) this.zone.constrainUpper(id, info.interval.hi)
      }
    }
    for (const [id, term] of this.termNodes) {
      if (Node.$is('Call')(term) && (term.op.id === 'str.len' || term.op.id === 'arr.count')) {
        this.zone.constrainLower(id, 0)
      }
    }
  }

  clone(): AbstractState {
    return new AbstractState([], this.fields, {
      varIndex: this.varIndex,
      intVars: this.intVars,
      termNodes: this.termNodes,
      subTerms: this.subTerms,
      addTerms: this.addTerms,
      eqFacts: this.eqFacts,
      neqFacts: this.neqFacts,
      nullFacts: this.nullFacts,
      pendingOrs: this.pendingOrs,
      zone: this.zone,
    })
  }

  markBottom(): void {
    this.zone.constrainDiff(ZERO, ZERO, -1)
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

  private isIntNode(node: Node.Node): boolean {
    if (Node.$is('Lit')(node)) return typeof node.value === 'number' && Number.isInteger(node.value)
    if (Node.$is('Path')(node)) {
      const info = this.fields.get(Path.format(node.segments))
      return info?.isInt ?? false
    }
    if (Node.$is('Call')(node)) {
      if (node.op.id === 'str.len' || node.op.id === 'arr.count') {
        return true
      }
      if (
        node.op.id === 'num.add' ||
        node.op.id === 'num.sub' ||
        node.op.id === 'num.mul' ||
        node.op.id === 'num.neg'
      ) {
        return node.args.every(a => this.isIntNode(a))
      }
    }
    if (Node.$is('If')(node)) {
      return this.isIntNode(node.then) && this.isIntNode(node.otherwise)
    }
    return false
  }

  private collectTerms(node: Node.Node): void {
    Node.$match(node, {
      Lit: () => {},
      Path: ({ segments }) => {
        const fk = Path.format(segments)
        const info = this.fields.get(fk)
        if (info !== undefined && Option.isNone(info.literals)) {
          this.registerKey(fk, info.isInt)
        }
      },
      Call: ({ op, args }) => {
        for (const a of args) this.collectTerms(a)
        if (op.id === 'num.sub' && args.length === 2) {
          const id = this.registerKey(Node.key(node), this.isIntNode(node))
          this.termNodes.set(id, node)
          this.subTerms.push({ id, left: args[0]!, right: args[1]! })
        } else if (op.id === 'num.add' && args.length === 2) {
          const id = this.registerKey(Node.key(node), this.isIntNode(node))
          this.termNodes.set(id, node)
          this.addTerms.push({ id, left: args[0]!, right: args[1]! })
        } else if (
          op.id === 'num.mul' ||
          op.id === 'num.neg' ||
          op.id === 'str.len' ||
          op.id === 'arr.count'
        ) {
          const id = this.registerKey(Node.key(node), this.isIntNode(node))
          this.termNodes.set(id, node)
        } else if (op.id === 'str.startsWith' || op.id === 'str.contains') {
          const lenNode = Node.Call({ op: Str.lenOp, args: [args[0]!] })
          const id = this.registerKey(Node.key(lenNode), true)
          this.termNodes.set(id, lenNode)
        } else if (op.id === 'arr.isEmpty') {
          const countNode = Node.Call({ op: Arr.countOp, args: [args[0]!] })
          const id = this.registerKey(Node.key(countNode), true)
          this.termNodes.set(id, countNode)
        }
      },
      If: ({ cond, then, otherwise }) => {
        this.collectTerms(cond)
        this.collectTerms(then)
        this.collectTerms(otherwise)
      },
      Match: ({ on, cases, otherwise }) => {
        this.collectTerms(on)
        for (const [, b] of cases) this.collectTerms(b)
        if (Option.isSome(otherwise)) this.collectTerms(otherwise.value)
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

  isIntRef(node: Node.Node): boolean {
    if (Node.$is('Lit')(node)) return typeof node.value === 'number' && Number.isInteger(node.value)
    const v = this.varOf(node)
    return Option.isSome(v) && this.intVars.has(v.value)
  }

  /** Interval of any numeric node (including `If` branches such as `min`/`max`/`abs`/`clamp`). */
  evalInterval(node: Node.Node): Interval.Interval {
    if (Node.$is('Lit')(node) && typeof node.value === 'number') {
      return Interval.constant(node.value)
    }
    if (Node.$is('If')(node)) {
      const condV = this.entailsAtomic(node.cond)
      if (Verdict.isTrue(condV)) return this.evalInterval(node.then)
      if (Verdict.isFalse(condV)) return this.evalInterval(node.otherwise)
      // Narrow each branch with its guard for tighter bounds (e.g. abs(x) >= 0!)
      const tBranch = this.clone()
      tBranch.assume(node.cond)
      const fBranch = this.clone()
      fBranch.assume(negateNode(node.cond))
      const tIv = tBranch.propagate() ? tBranch.evalInterval(node.then) : Interval.bottom
      const fIv = fBranch.propagate() ? fBranch.evalInterval(node.otherwise) : Interval.bottom
      return Interval.join(tIv, fIv)
    }
    if (Node.$is('Match')(node)) {
      return this.evalMatchInterval(node)
    }
    const v = this.varOf(node)
    const fromZone = Option.isSome(v) ? this.zone.intervalOf(v.value) : Interval.top
    if (Node.$is('Call')(node)) {
      if (node.op.id === 'str.len') {
        const arg = node.args[0]!
        if (Node.$is('Lit')(arg) && typeof arg.value === 'string') {
          return Interval.constant(Str.codePointLength(arg.value))
        }
        return Interval.meet(fromZone, Interval.between(0, Infinity))
      }
      if (node.op.id === 'arr.count') {
        const arg = node.args[0]!
        if (Node.$is('Lit')(arg) && Array.isArray(arg.value)) {
          return Interval.constant(arg.value.length)
        }
        return Interval.meet(fromZone, Interval.between(0, Infinity))
      }
      const forward = abstractOps[node.op.id].forward
      if (forward !== undefined) {
        return Interval.meet(fromZone, forward(node.args.map(a => this.evalInterval(a))))
      }
    }
    return fromZone
  }

  private resolveMatchArm(node: Node.Match, value: unknown): Option.Option<Node.Node> {
    for (const [k, arm] of node.cases) {
      if (k === value) return Option.some(arm)
    }
    return node.otherwise
  }

  /**
   * Finite candidate values for a `Path` field, including `null` whenever the
   * field is nullable (so case-splitting is sound for `Schema.NullOr(Literals)`).
   */
  private matchCandidates(
    pk: string,
  ): Option.Option<ReadonlyArray<string | number | boolean | null>> {
    const info = this.fields.get(pk)
    if (info === undefined || Option.isNone(info.literals)) return Option.none()
    const excluded = this.neqFacts.get(pk)
    const domain: ReadonlyArray<string | number | boolean | null> = info.nullable
      ? [...info.literals.value, null]
      : info.literals.value
    const candidates = excluded === undefined ? domain : domain.filter(v => !excluded.has(v))
    if (candidates.length === 0 || candidates.length > MAX_SPLITS) return Option.none()
    return Option.some(candidates)
  }

  private evalMatchInterval(node: Node.Match): Interval.Interval {
    if (Node.$is('Lit')(node.on)) {
      return Option.match(this.resolveMatchArm(node, node.on.value), {
        onNone: () => Interval.top,
        onSome: arm => this.evalInterval(arm),
      })
    }
    if (Node.$is('Path')(node.on)) {
      const pk = Path.format(node.on.segments)
      if (this.eqFacts.has(pk)) {
        return Option.match(this.resolveMatchArm(node, this.eqFacts.get(pk)), {
          onNone: () => Interval.top,
          onSome: arm => this.evalInterval(arm),
        })
      }
      const candidates = this.matchCandidates(pk)
      if (Option.isSome(candidates)) {
        let acc = Interval.bottom
        for (const lit of candidates.value) {
          const arm = this.resolveMatchArm(node, lit)
          if (Option.isNone(arm)) return Interval.top
          const branch = this.clone()
          branch.eqFacts.set(pk, lit)
          if (branch.propagate()) {
            acc = Interval.join(acc, branch.evalInterval(arm.value))
          }
        }
        return acc
      }
    }
    // Unconstrained target: sound hull over all listed arms only if otherwise is present
    if (Option.isNone(node.otherwise)) return Interval.top
    let acc = this.evalInterval(node.otherwise.value)
    for (const [, arm] of node.cases) {
      acc = Interval.join(acc, this.evalInterval(arm))
    }
    return acc
  }

  private findSplittableMatchPath(node: Node.Node): Option.Option<string> {
    return Node.$match(node, {
      Lit: () => Option.none(),
      Path: () => Option.none(),
      Opaque: () => Option.none(),
      Call: ({ args }) => {
        for (const a of args) {
          const found = this.findSplittableMatchPath(a)
          if (Option.isSome(found)) return found
        }
        return Option.none()
      },
      If: ({ cond, then, otherwise }) =>
        Option.orElse(this.findSplittableMatchPath(cond), () =>
          Option.orElse(this.findSplittableMatchPath(then), () =>
            this.findSplittableMatchPath(otherwise),
          ),
        ),
      Match: ({ on, cases, otherwise }) => {
        if (Node.$is('Path')(on)) {
          const pk = Path.format(on.segments)
          if (!this.eqFacts.has(pk) && Option.isSome(this.matchCandidates(pk))) {
            return Option.some(pk)
          }
        }
        for (const [, arm] of cases) {
          const found = this.findSplittableMatchPath(arm)
          if (Option.isSome(found)) return found
        }
        return Option.flatMap(otherwise, arm => this.findSplittableMatchPath(arm))
      },
    })
  }

  /** Add `left <= right` (or `<` when `strict` is true) into the Zone. */
  assumeLeq(left: Node.Node, right: Node.Node, strict: boolean): void {
    const bothInt = this.isIntRef(left) && this.isIntRef(right)
    const delta = strict ? (bothInt ? -1 : 0) : 0

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

    // Algebraic swap: y <= x - z  ==>  z <= x - y
    if (Node.$is('Call')(right) && right.op.id === 'num.sub' && right.args.length === 2) {
      const [x, z] = right.args
      const swappedKey = Node.key(Node.Call({ op: right.op, args: [x!, left] }))
      const swappedVar = this.varIndex.get(swappedKey)
      const zv = this.varOf(z!)
      if (swappedVar !== undefined && Option.isSome(zv)) {
        this.zone.constrainDiff(zv.value, swappedVar, delta)
      }
      const xv = this.varOf(x!)
      const zConst = Node.$is('Lit')(z!) && typeof z!.value === 'number' ? z!.value : undefined
      if (Option.isSome(lv) && Option.isSome(xv) && zConst !== undefined) {
        this.zone.constrainDiff(lv.value, xv.value, -zConst + delta)
      }
    }

    // Algebraic swap: x - z <= y  ==>  x - y <= z
    if (Node.$is('Call')(left) && left.op.id === 'num.sub' && left.args.length === 2) {
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

  /** Assume a boolean constraint holds in this abstract state. */
  assume(node: Node.Node): void {
    if (Node.$is('Lit')(node)) {
      if (node.value === false) this.markBottom()
      return
    }
    if (Node.$is('Path')(node)) {
      const pk = Path.format(node.segments)
      if (this.eqFacts.get(pk) === false) this.markBottom()
      else this.eqFacts.set(pk, true)
      return
    }
    if (!Node.$is('Call')(node)) return
    const addToZone = abstractOps[node.op.id].addToZone
    if (addToZone !== undefined) {
      addToZone(node.args, this)
    }
  }

  /** Bounded fixed-point propagation (max `MAX_ROUNDS` rounds). */
  propagate(): boolean {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      if (!this.zone.close()) return false
      let changed = false

      const tighten = (i: number, j: number, bound: number) => {
        if (!Number.isFinite(bound)) return
        const before = this.zone.rawBound(i, j)
        if (bound < before) {
          this.zone.constrainDiff(i, j, bound)
          changed = true
        }
      }

      for (const { id, left, right } of this.subTerms) {
        const iv = Interval.sub(this.evalInterval(left), this.evalInterval(right))
        tighten(id, ZERO, iv.hi)
        tighten(ZERO, id, -iv.lo)
        const lv = this.varOf(left)
        const rv = this.varOf(right)
        const riv = this.evalInterval(right)
        if (Option.isSome(lv)) {
          if (Number.isFinite(riv.lo)) tighten(id, lv.value, -riv.lo)
          if (Number.isFinite(riv.hi)) tighten(lv.value, id, riv.hi)
        }
        if (Option.isSome(lv) && Option.isSome(rv)) {
          tighten(id, ZERO, this.zone.rawBound(lv.value, rv.value))
          tighten(ZERO, id, this.zone.rawBound(rv.value, lv.value))
        }
      }

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

  /** Entailment check with bounded `bool.or` case-splitting. */
  entails(goal: Node.Node, splitsLeft = MAX_SPLITS): Verdict.Verdict<never> {
    if (!this.propagate()) {
      return Verdict.True(Option.some(Verdict.Proved('zone')))
    }
    const direct = this.entailsAtomic(goal)
    // Short-circuit immediately on True; only short-circuit on False when no
    // unsplit disjunctions remain (an unsatisfiable pendingOr is vacuously True).
    if (Verdict.isTrue(direct)) return direct
    if (Verdict.isFalse(direct) && this.pendingOrs.length === 0) return direct
    if (this.pendingOrs.length > 0 && splitsLeft > 0) {
      const [leftOr, rightOr] = this.pendingOrs[0]!
      const rest = this.pendingOrs.slice(1)
      const b1 = this.clone()
      b1.pendingOrs.length = 0
      b1.pendingOrs.push(...rest)
      b1.assume(leftOr)
      const b2 = this.clone()
      b2.pendingOrs.length = 0
      b2.pendingOrs.push(...rest)
      b2.assume(rightOr)
      return Verdict.and(b1.entails(goal, splitsLeft - 1), b2.entails(goal, splitsLeft - 1))
    }
    // Case-split on any finite-domain enum Path scrutinized by a Match inside goal
    if (splitsLeft > 0) {
      const splitPk = this.findSplittableMatchPath(goal)
      if (Option.isSome(splitPk)) {
        const pk = splitPk.value
        const candidates = this.matchCandidates(pk)
        if (Option.isSome(candidates)) {
          let acc: Verdict.Verdict<never> = Verdict.True(Option.some(Verdict.Proved('zone')))
          for (const lit of candidates.value) {
            const branch = this.clone()
            branch.eqFacts.set(pk, lit)
            acc = Verdict.and(acc, branch.entails(goal, splitsLeft - 1))
            if (Verdict.isFalse(acc)) return acc
          }
          return acc
        }
      }
    }
    return this.pendingOrs.length > 0 ? Verdict.Unknown('disjunction split budget reached') : direct
  }

  private entailsAtomic(goal: Node.Node): Verdict.Verdict<never> {
    if (Node.$is('Lit')(goal)) {
      return Boolean(goal.value)
        ? Verdict.True(Option.some(Verdict.Proved('concrete')))
        : Verdict.False()
    }
    if (Node.$is('Path')(goal)) {
      const pk = Path.format(goal.segments)
      const known = this.eqFacts.get(pk)
      if (known === true) return Verdict.True(Option.some(Verdict.Proved('zone')))
      if (known === false) return Verdict.False()
      return Verdict.Unknown(`boolean path "${pk}" unknown`)
    }
    if (Node.$is('Opaque')(goal)) {
      return Verdict.Unknown(
        `opaque term "${goal.name}"`,
        Option.some({ kind: 'opaque', detail: goal.name }),
      )
    }
    if (Node.$is('If')(goal)) {
      const cv = this.entailsAtomic(goal.cond)
      if (Verdict.isTrue(cv)) return this.entailsAtomic(goal.then)
      if (Verdict.isFalse(cv)) return this.entailsAtomic(goal.otherwise)
      const b1 = this.clone()
      b1.assume(goal.cond)
      const b2 = this.clone()
      b2.assume(negateNode(goal.cond))
      return Verdict.and(b1.entails(goal.then, 0), b2.entails(goal.otherwise, 0))
    }
    if (Node.$is('Match')(goal)) {
      if (Node.$is('Lit')(goal.on)) {
        return Option.match(this.resolveMatchArm(goal, goal.on.value), {
          onNone: () => Verdict.Unknown('match arm missing'),
          onSome: arm => this.entails(arm, 0),
        })
      }
      if (Node.$is('Path')(goal.on)) {
        const pk = Path.format(goal.on.segments)
        if (this.eqFacts.has(pk)) {
          return Option.match(this.resolveMatchArm(goal, this.eqFacts.get(pk)), {
            onNone: () => Verdict.Unknown('match arm missing'),
            onSome: arm => this.entails(arm, 0),
          })
        }
      }
      return Verdict.Unknown('match scrutinee unknown')
    }
    if (!Node.$is('Call')(goal)) {
      return Verdict.Unknown('non-atomic goal')
    }

    const [a, b] = goal.args
    switch (goal.op.id) {
      case 'bool.and':
        return Verdict.and(this.entailsAtomic(a!), this.entailsAtomic(b!))
      case 'bool.or': {
        const directOr = Verdict.or(this.entailsAtomic(a!), this.entailsAtomic(b!))
        if (Verdict.isTrue(directOr) || Verdict.isFalse(directOr)) return directOr
        // Classical deduction: Γ ⊢ A ∨ B  <=>  Γ, ¬A ⊢ B
        const assumedNotA = this.clone()
        assumedNotA.assume(negateNode(a!))
        const underNotA = assumedNotA.entails(b!, 1)
        return Verdict.isTrue(underNotA) ? underNotA : directOr
      }
      case 'bool.not':
        return Verdict.not(this.entailsAtomic(a!))
      case 'ord.lte':
        return this.entailsLeq(a!, b!, false)
      case 'ord.lt':
        return this.entailsLeq(a!, b!, true)
      case 'ord.gte':
        return this.entailsLeq(b!, a!, false)
      case 'ord.gt':
        return this.entailsLeq(b!, a!, true)
      case 'null.isNull': {
        if (Node.$is('Path')(a!)) {
          const pk = Path.format(a!.segments)
          const known = this.nullFacts.get(pk)
          if (known === true) return Verdict.True(Option.some(Verdict.Proved('zone')))
          if (known === false) return Verdict.False()
        }
        return Verdict.Unknown('nullability unknown')
      }
      case 'eq.is': {
        if (Node.key(a!) === Node.key(b!)) {
          return Verdict.True(Option.some(Verdict.Proved('concrete')))
        }
        const pathNode = Node.$is('Path')(a!) ? a! : Node.$is('Path')(b!) ? b! : undefined
        const litNode = Node.$is('Lit')(a!) ? a! : Node.$is('Lit')(b!) ? b! : undefined
        if (pathNode !== undefined && litNode !== undefined) {
          const pk = Path.format(pathNode.segments)
          if (litNode.value === null) {
            const knownNull = this.nullFacts.get(pk)
            if (knownNull === true) return Verdict.True(Option.some(Verdict.Proved('zone')))
            if (knownNull === false) return Verdict.False()
          }
          if (this.eqFacts.has(pk)) {
            return this.eqFacts.get(pk) === litNode.value
              ? Verdict.True(Option.some(Verdict.Proved('zone')))
              : Verdict.False()
          }
          if (this.neqFacts.get(pk)?.has(litNode.value)) {
            return Verdict.False()
          }
        }
        return Interval.is(this.evalInterval(a!), this.evalInterval(b!))
      }
      case 'eq.isNot':
        return Verdict.not(this.entailsAtomic(Node.Call({ op: Eq.isOp, args: [a!, b!] })))
      case 'arr.isEmpty': {
        const countNode = Node.Call({ op: Arr.countOp, args: [a!] })
        const iv = this.evalInterval(countNode)
        if (iv.hi <= 0) return Verdict.True(Option.some(Verdict.Proved('zone')))
        if (iv.lo >= 1) return Verdict.False()
        return Verdict.Unknown('array emptiness unknown')
      }
      case 'str.startsWith':
      case 'str.contains': {
        if (Node.$is('Lit')(b!) && b!.value === '') {
          return Verdict.True(Option.some(Verdict.Proved('concrete')))
        }
        if (
          Node.$is('Lit')(a!) &&
          Node.$is('Lit')(b!) &&
          typeof a!.value === 'string' &&
          typeof b!.value === 'string'
        ) {
          const holds =
            goal.op.id === 'str.startsWith'
              ? a!.value.startsWith(b!.value)
              : a!.value.includes(b!.value)
          return holds ? Verdict.True(Option.some(Verdict.Proved('concrete'))) : Verdict.False()
        }
        return Verdict.Unknown(`${goal.op.id} unknown`)
      }
      case 'eq.in': {
        if (Node.$is('Lit')(b!) && Array.isArray(b!.value) && Node.$is('Path')(a!)) {
          const pk = Path.format(a!.segments)
          if (this.eqFacts.has(pk)) {
            return b!.value.includes(this.eqFacts.get(pk))
              ? Verdict.True(Option.some(Verdict.Proved('zone')))
              : Verdict.False()
          }
        }
        return Verdict.Unknown('membership undecided in Tier 3')
      }
      default:
        return Verdict.Unknown('undecided in Tier 3')
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

    if (Option.isSome(lv) && Option.isSome(rv)) {
      if (strict && !bothInt) {
        if (this.zone.diffBound(lv.value, rv.value) < 0) {
          return Verdict.True(Option.some(Verdict.Proved('zone')))
        }
      } else if (this.zone.impliesDiff(lv.value, rv.value, reqBound)) {
        return Verdict.True(Option.some(Verdict.Proved('zone')))
      }
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

    const liv = this.evalInterval(left)
    const riv = this.evalInterval(right)
    return strict ? Interval.lt(liv, riv) : Interval.lte(liv, riv)
  }
}

/** Exhaustive Tier 3 table over all 15 `CoreOpId` primitives. */
export const abstractOps: Readonly<Record<Node.CoreOpId, AbstractOp>> = {
  'bool.and': {
    addToZone: (args, state) => {
      state.assume(args[0]!)
      state.assume(args[1]!)
    },
  },
  'bool.or': {
    addToZone: (args, state) => {
      state.pendingOrs.push([args[0]!, args[1]!])
    },
  },
  'bool.not': {
    addToZone: (args, state) => {
      const inner = args[0]!
      if (Node.$is('Path')(inner)) {
        const pk = Path.format(inner.segments)
        if (state.eqFacts.get(pk) === true) state.markBottom()
        else state.eqFacts.set(pk, false)
        return
      }
      if (
        Node.$is('Call')(inner) &&
        inner.op.id === 'null.isNull' &&
        Node.$is('Path')(inner.args[0]!)
      ) {
        const pk = Path.format(inner.args[0]!.segments)
        if (state.nullFacts.get(pk) === true) {
          state.markBottom()
        } else {
          state.nullFacts.set(pk, false)
        }
        return
      }
      if (Node.$is('Call')(inner) && inner.op.id === 'arr.isEmpty') {
        const countNode = Node.Call({ op: Arr.countOp, args: [inner.args[0]!] })
        const cv = state.varOf(countNode)
        if (Option.isSome(cv)) state.zone.constrainLower(cv.value, 1)
        return
      }
      const negated = negateNode(inner)
      if (Node.$is('Call')(negated) && negated.op.id === 'bool.not') return
      state.assume(negated)
    },
  },
  'eq.is': {
    compare: args => Interval.is(args[0]!, args[1]!),
    narrow: args => Interval.narrowEq(args[0]!, args[1]!),
    addToZone: (args, state) => {
      const [a, b] = args
      const av = state.varOf(a!)
      const bv = state.varOf(b!)
      const aLit = Node.$is('Lit')(a!) ? Option.some(a!.value) : Option.none()
      const bLit = Node.$is('Lit')(b!) ? Option.some(b!.value) : Option.none()
      if (Option.isSome(av) && Option.isSome(bv)) {
        state.zone.constrainEq(av.value, bv.value, 0)
      } else if (Option.isSome(av) && Option.isSome(bLit) && typeof bLit.value === 'number') {
        state.zone.constrainEq(av.value, ZERO, bLit.value)
      } else if (Option.isSome(bv) && Option.isSome(aLit) && typeof aLit.value === 'number') {
        state.zone.constrainEq(bv.value, ZERO, aLit.value)
      } else {
        const pathNode = Node.$is('Path')(a!) ? a! : Node.$is('Path')(b!) ? b! : undefined
        const litNode = Node.$is('Lit')(a!) ? a! : Node.$is('Lit')(b!) ? b! : undefined
        if (pathNode !== undefined && litNode !== undefined) {
          const pk = Path.format(pathNode.segments)
          if (litNode.value === null) {
            if (state.nullFacts.get(pk) === false) state.markBottom()
            else state.nullFacts.set(pk, true)
            return
          }
          if (state.nullFacts.get(pk) === true) {
            state.markBottom()
            return
          }
          state.nullFacts.set(pk, false)
          const prev = state.eqFacts.get(pk)
          if (prev !== undefined && prev !== litNode.value) {
            state.markBottom()
          } else {
            state.eqFacts.set(pk, litNode.value)
          }
        }
      }
    },
  },
  'eq.isNot': {
    compare: args => Interval.isNot(args[0]!, args[1]!),
    addToZone: (args, state) => {
      const [a, b] = args
      const pathNode = Node.$is('Path')(a!) ? a! : Node.$is('Path')(b!) ? b! : undefined
      const litNode = Node.$is('Lit')(a!) ? a! : Node.$is('Lit')(b!) ? b! : undefined
      if (pathNode !== undefined && litNode !== undefined) {
        const pk = Path.format(pathNode.segments)
        if (litNode.value === null) {
          if (state.nullFacts.get(pk) === true) state.markBottom()
          else state.nullFacts.set(pk, false)
          return
        }
        if (state.eqFacts.get(pk) === litNode.value) {
          state.markBottom()
        }
        const set = state.neqFacts.get(pk) ?? new Set()
        set.add(litNode.value)
        state.neqFacts.set(pk, set)
      }
    },
  },
  'eq.in': {
    addToZone: (args, state) => {
      const [a, b] = args
      if (!Node.$is('Lit')(b!) || !Array.isArray(b!.value)) return
      const values = b!.value
      if (values.length === 0) {
        state.markBottom()
        return
      }
      const nums = values.filter((v): v is number => typeof v === 'number')
      const av = state.varOf(a!)
      if (Option.isSome(av) && nums.length === values.length) {
        state.zone.constrainLower(av.value, Math.min(...nums))
        state.zone.constrainUpper(av.value, Math.max(...nums))
      }
    },
  },
  'null.isNull': {
    addToZone: (args, state) => {
      const target = args[0]!
      if (Node.$is('Path')(target)) {
        const pk = Path.format(target.segments)
        if (state.nullFacts.get(pk) === false) state.markBottom()
        else state.nullFacts.set(pk, true)
      }
    },
  },
  'ord.lt': {
    compare: args => Interval.lt(args[0]!, args[1]!),
    addToZone: (args, state) => state.assumeLeq(args[0]!, args[1]!, true),
  },
  'ord.lte': {
    compare: args => Interval.lte(args[0]!, args[1]!),
    narrow: args => Interval.narrowLte(args[0]!, args[1]!),
    addToZone: (args, state) => state.assumeLeq(args[0]!, args[1]!, false),
  },
  'ord.gt': {
    compare: args => Interval.gt(args[0]!, args[1]!),
    addToZone: (args, state) => state.assumeLeq(args[1]!, args[0]!, true),
  },
  'ord.gte': {
    compare: args => Interval.gte(args[0]!, args[1]!),
    narrow: args => Interval.narrowGte(args[0]!, args[1]!),
    addToZone: (args, state) => state.assumeLeq(args[1]!, args[0]!, false),
  },
  'num.add': {
    forward: args => Interval.add(args[0]!, args[1]!),
    narrow: (args, target) => Interval.narrowAdd(args[0]!, args[1]!, target),
  },
  'num.sub': {
    forward: args => Interval.sub(args[0]!, args[1]!),
    narrow: (args, target) => Interval.narrowSub(args[0]!, args[1]!, target),
  },
  'num.mul': {
    forward: args => Interval.mul(args[0]!, args[1]!),
    narrow: (args, target) => Interval.narrowMul(args[0]!, args[1]!, target),
  },
  'num.neg': {
    forward: args => Interval.neg(args[0]!),
    narrow: (args, target) => Interval.narrowNeg(args[0]!, target),
  },
  'str.len': {},
  'str.startsWith': {
    addToZone: (args, state) => {
      if (Node.$is('Lit')(args[1]!) && typeof args[1]!.value === 'string') {
        const minLen = Str.codePointLength(args[1]!.value)
        const lenNode = Node.Call({ op: Str.lenOp, args: [args[0]!] })
        const lv = state.varOf(lenNode)
        if (Option.isSome(lv)) state.zone.constrainLower(lv.value, minLen)
      }
    },
  },
  'str.contains': {
    addToZone: (args, state) => {
      if (Node.$is('Lit')(args[1]!) && typeof args[1]!.value === 'string') {
        const minLen = Str.codePointLength(args[1]!.value)
        const lenNode = Node.Call({ op: Str.lenOp, args: [args[0]!] })
        const lv = state.varOf(lenNode)
        if (Option.isSome(lv)) state.zone.constrainLower(lv.value, minLen)
      }
    },
  },
  'arr.count': {},
  'arr.isEmpty': {
    addToZone: (args, state) => {
      const countNode = Node.Call({ op: Arr.countOp, args: [args[0]!] })
      const cv = state.varOf(countNode)
      if (Option.isSome(cv)) state.zone.constrainEq(cv.value, ZERO, 0)
    },
  },
}

const substituteStateWrites = (
  node: Node.Node,
  writes: ReadonlyMap<string, Node.Node>,
): Node.Node =>
  Node.substitutePaths(node, segments =>
    segments[0] === 'state'
      ? Option.fromUndefinedOr(writes.get(Path.format(segments.slice(1))))
      : Option.none(),
  )

/** Tier 3 synchronous check: does `schema` entail `goal`? */
export const checkInvariant = <S extends Schema.Top>(
  schema: S,
  goal: Expr.Expr<S['Type'], boolean>,
): Verdict.Verdict<never> => {
  const fields = new Map<string, FieldInfo>()
  collectFields(schema.ast, [], fields)
  const invariants = Expr.refinementsOf(schema).map(r => r.node)
  const state = new AbstractState([...invariants, goal.node], fields)
  for (const inv of invariants) state.assume(inv)
  return ordered(state.entails(goal.node), [[[], schema]], [goal.node])
}

/** Tier 3 synchronous check: does `transition` preserve every invariant on `stateSchema`? */
export const checkTransition = <S extends Schema.Top, I, Emit>(
  stateSchema: S,
  transition: Transition<S['Type'], I, Emit>,
): Verdict.Verdict<never> => {
  const preInvariants = Expr.refinementsOf(stateSchema).map(r => Node.prefix(r.node, ['state']))
  if (preInvariants.length === 0) {
    return Verdict.True(Option.some(Verdict.Proved('concrete')))
  }

  const fields = new Map<string, FieldInfo>()
  collectFields(stateSchema.ast, ['state'], fields)

  const slices: Array<Slice> = [[['state'], stateSchema]]
  const inputInvariants: Array<Node.Node> = []
  if (Option.isSome(transition.inputSchema)) {
    const inputSchema = transition.inputSchema.value
    slices.push([['input'], inputSchema])
    collectFields(inputSchema.ast, ['input'], fields)
    for (const r of Expr.refinementsOf(inputSchema)) {
      inputInvariants.push(Node.prefix(r.node, ['input']))
    }
  }

  const writeMap = new Map<string, Node.Node>()
  for (const eq of transition.writes) {
    writeMap.set(Path.format(eq.target), eq.value.node)
  }
  const postGoals = preInvariants.map(inv => substituteStateWrites(inv, writeMap))

  const allHypotheses = [...preInvariants, ...inputInvariants, transition.when.node]
  const state = new AbstractState([...allHypotheses, ...postGoals], fields)
  for (const hyp of allHypotheses) state.assume(hyp)

  let overall: Verdict.Verdict<never> = Verdict.True(Option.some(Verdict.Proved('zone')))
  for (const goal of postGoals) {
    overall = Verdict.and(overall, state.entails(goal))
    if (Verdict.isFalse(overall)) break
  }
  return ordered(overall, slices, [transition.when.node, ...postGoals])
}
