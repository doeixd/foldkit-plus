/**
 * Tier 3 synchronous static checker over intervals and a Zone (difference
 * bounds), with case splits on `bool.or`, `If` and `Match`.
 *
 * It decides the value evaluation gives, under evaluation's own rule: an
 * operator over a null operand is null, an absent key reads as null, and
 * arithmetic past the safe range is refused. A verdict of `True` says the
 * goal evaluates to true in every environment the Schemas and hypotheses
 * allow, `False` that it evaluates to false in every one, and `Unknown`
 * anything else: a goal that may be null is never `True`, and its negation
 * is not either.
 */
import { Match, Option, Predicate, Schema, SchemaAST } from 'effect'
import * as Expr from '../expr.js'
import * as Node from '../node.js'
import * as Arr from '../ops/arr.js'
import * as Bool from '../ops/bool.js'
import { wrap } from '../ops/core.js'
import * as Eq from '../ops/eq.js'
import { isFiniteNumber, isInteger, present } from '../ops/kind.js'
import * as Null from '../ops/null.js'
import * as Ord from '../ops/ord.js'
import * as Str from '../ops/str.js'
import * as Path from '../path.js'
import type { Transition } from '../transition.js'
import * as Verdict from '../verdict.js'
import * as Interval from './interval.js'
import { Zone, ZERO } from './zone.js'

const MAX_ROUNDS = 16
const MAX_SPLITS = 8

/** The integers a double holds exactly, which arithmetic must stay within or be refused. */
const SAFE = Interval.between(-Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)

const proved = (tier: Verdict.ProofTier): Verdict.Verdict<never> =>
  Verdict.True(Option.some(Verdict.Proved(tier)))

const refuted = (): Verdict.Verdict<never> => Verdict.False<never>()

/** One answer for every case: `True` or `False` only where each case gives it. */
const agree = (verdicts: ReadonlyArray<Verdict.Verdict<never>>): Verdict.Verdict<never> => {
  const [first, ...rest] = verdicts
  if (first === undefined) return proved('zone')
  if (Verdict.isUnknown(first)) return first
  return rest.every(verdict => verdict._tag === first._tag)
    ? first
    : (rest.find(Verdict.isUnknown) ?? Verdict.Unknown('the cases disagree'))
}

export type FieldKind = 'number' | 'boolean' | 'text' | 'literal' | 'struct' | 'other'

/** What a Schema says of the value at a path. */
export interface FieldInfo {
  readonly segments: ReadonlyArray<string>
  /** The field's whole Schema, null and checks included. */
  readonly ast: SchemaAST.AST
  readonly kind: FieldKind
  readonly isInt: boolean
  /** A number that is never NaN or infinite. */
  readonly finite: boolean
  /** May read as null: `NullOr`, an optional key, or a field under either. */
  readonly nullable: boolean
  readonly interval: Interval.Interval
  readonly literals: Option.Option<ReadonlyArray<string | number | boolean>>
}

const pathKey = (segments: ReadonlyArray<string>): string =>
  Node.key(Node.Path({ segments, ast: Option.none() }))

const boundOf = (
  checks: ReadonlyArray<SchemaAST.Check<unknown>>,
  isInt: boolean,
  start: Interval.Interval,
): Interval.Interval => {
  let iv = start
  for (const check of checks) {
    const representation = check.annotations?.representation
    const payload: Readonly<Record<string, unknown>> = Predicate.isObject(representation?.payload)
      ? representation.payload
      : {}
    const number = (name: string): Option.Option<number> => {
      const value = payload[name]
      return typeof value === 'number' ? Option.some(value) : Option.none()
    }
    const above = (m: number): Interval.Interval =>
      Interval.between(isInt ? Math.floor(m) + 1 : m, Infinity)
    const below = (m: number): Interval.Interval =>
      Interval.between(-Infinity, isInt ? Math.ceil(m) - 1 : m)
    const bounds: Readonly<Record<string, () => Option.Option<Interval.Interval>>> = {
      'effect/schema/isGreaterThanOrEqualTo': () =>
        Option.map(number('minimum'), m => Interval.between(m, Infinity)),
      'effect/schema/isGreaterThan': () => Option.map(number('exclusiveMinimum'), above),
      'effect/schema/isLessThanOrEqualTo': () =>
        Option.map(number('maximum'), m => Interval.between(-Infinity, m)),
      'effect/schema/isLessThan': () => Option.map(number('exclusiveMaximum'), below),
      'effect/schema/isBetween': () =>
        Option.some(
          Interval.meet(
            Option.match(number('minimum'), {
              onNone: () => Interval.top,
              onSome: m =>
                payload['exclusiveMinimum'] === true ? above(m) : Interval.between(m, Infinity),
            }),
            Option.match(number('maximum'), {
              onNone: () => Interval.top,
              onSome: m =>
                payload['exclusiveMaximum'] === true ? below(m) : Interval.between(-Infinity, m),
            }),
          ),
        ),
    }
    const id = representation?.id
    if (id !== undefined && Object.hasOwn(bounds, id)) {
      iv = Option.match(bounds[id]!(), { onNone: () => iv, onSome: b => Interval.meet(iv, b) })
    }
    if (check._tag === 'FilterGroup') iv = boundOf(check.checks, isInt, iv)
  }
  return iv
}

const isPrimitive = (value: unknown): value is string | number | boolean =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'

const flat = (ast: SchemaAST.AST): ReadonlyArray<SchemaAST.AST> =>
  SchemaAST.isUnion(ast) ? ast.types.flatMap(flat) : [ast]

/**
 * Record what `ast` says of every path under `prefix`. `under` is whether an
 * enclosing field may be null or absent, which every field below it then may
 * read as.
 */
export const collectFields = (
  ast: SchemaAST.AST,
  prefix: ReadonlyArray<string>,
  fields: Map<string, FieldInfo>,
  under = false,
): void => {
  const members = present(ast)
  const nullable = under || members.length !== flat(ast).length || SchemaAST.isOptional(ast)
  const base: FieldInfo = {
    segments: prefix,
    ast,
    kind: 'other',
    isInt: false,
    finite: false,
    nullable,
    interval: Interval.top,
    literals: Option.none(),
  }
  const set = (info: Partial<FieldInfo>): void => {
    fields.set(pathKey(prefix), { ...base, ...info })
  }
  const only = members.length === 1 ? members[0]! : undefined
  if (only !== undefined && SchemaAST.isObjects(only)) {
    set({ kind: 'struct' })
    for (const property of only.propertySignatures) {
      if (typeof property.name === 'string') {
        collectFields(property.type, [...prefix, property.name], fields, nullable)
      }
    }
    return
  }
  if (only !== undefined && SchemaAST.isNumber(only)) {
    const isInt = isInteger(only)
    set({
      kind: 'number',
      isInt,
      finite: isFiniteNumber(only),
      // `Schema.Int` admits safe integers only.
      interval: boundOf(only.checks ?? [], isInt, isInt ? SAFE : Interval.top),
    })
    return
  }
  if (only !== undefined && SchemaAST.isBoolean(only)) {
    set({ kind: 'boolean', literals: Option.some([true, false]) })
    return
  }
  if (only !== undefined && SchemaAST.isString(only)) {
    set({ kind: 'text' })
    return
  }
  const literals = members.flatMap(member =>
    SchemaAST.isLiteral(member) && isPrimitive(member.literal) ? [member.literal] : [],
  )
  if (literals.length > 0 && literals.length === members.length) {
    set({ kind: 'literal', literals: Option.some(literals) })
    return
  }
  set({})
}

const not = (node: Node.Node): Node.Node => Node.Call({ op: Bool.notOp, args: [node] })

const numberOf = (node: Node.Node): Option.Option<number> =>
  Node.$is('Lit')(node) && typeof node.value === 'number' ? Option.some(node.value) : Option.none()

const show = (node: Node.Node): string => Expr.show(wrap(node))

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
}

export type AbstractOp = TermOp | PredicateOp

/**
 * Relational abstract state: Zone DBM, equality and inequality facts, which
 * paths are null, which terms are known to have a value, and the
 * disjunctions still to split.
 */
export class AbstractState {
  readonly fields: ReadonlyMap<string, FieldInfo>
  readonly varIndex: Map<string, number>
  readonly intVars: Set<number>
  readonly termNodes: Map<number, Node.Node>
  readonly relations: Array<{
    readonly id: number
    readonly relation: 'add' | 'sub'
    readonly left: Node.Node
    readonly right: Node.Node
  }>
  readonly eqFacts: Map<string, unknown>
  readonly neqFacts: Map<string, Set<unknown>>
  /** Per path: `true` is null, `false` is not null. */
  readonly nullFacts: Map<string, boolean>
  /** Terms known to evaluate to a value: not null, not refused, not NaN. */
  readonly valued: Set<string>
  /** Arithmetic terms known not to be refused, though they may be null. */
  readonly unrefused: Set<string>
  readonly pendingOrs: Array<readonly [Node.Node, Node.Node]>
  zone: Zone

  constructor(
    nodes: ReadonlyArray<Node.Node>,
    fields: ReadonlyMap<string, FieldInfo>,
    from?: AbstractState,
  ) {
    this.fields = fields
    if (from !== undefined) {
      this.varIndex = from.varIndex
      this.intVars = from.intVars
      this.termNodes = from.termNodes
      this.relations = from.relations
      this.eqFacts = new Map(from.eqFacts)
      this.neqFacts = new Map(Array.from(from.neqFacts, ([k, s]) => [k, new Set(s)]))
      this.nullFacts = new Map(from.nullFacts)
      this.valued = new Set(from.valued)
      this.unrefused = new Set(from.unrefused)
      this.pendingOrs = [...from.pendingOrs]
      this.zone = from.zone.clone()
      return
    }
    this.varIndex = new Map()
    this.intVars = new Set()
    this.termNodes = new Map()
    this.relations = []
    this.eqFacts = new Map()
    this.neqFacts = new Map()
    this.nullFacts = new Map()
    this.valued = new Set()
    this.unrefused = new Set()
    this.pendingOrs = []

    for (const [key, info] of fields) {
      if (!info.nullable) this.nullFacts.set(key, false)
      if (info.kind === 'number') {
        const id = this.register(key, info.isInt)
        this.termNodes.set(id, Node.Path({ segments: info.segments, ast: Option.none() }))
      }
    }
    for (const node of nodes) this.collectTerms(node)
    this.zone = Zone.make(this.varIndex.size)
    for (const [key, info] of fields) {
      const id = this.varIndex.get(key)
      if (id === undefined) continue
      // A nullable number no number satisfies is null, not a contradiction.
      if (Interval.isBottom(info.interval) && info.nullable) this.nullFacts.set(key, true)
      else this.bound(id, info.interval)
    }
    for (const [id, term] of this.termNodes) {
      if (Node.$is('Call')(term)) {
        Match.valueTags(abstractOps[term.op.id], {
          Term: ({ range }) => this.bound(id, range),
          Predicate: () => {},
        })
      }
    }
  }

  clone(): AbstractState {
    return new AbstractState([], this.fields, this)
  }

  markBottom(): void {
    this.zone.constrainDiff(ZERO, ZERO, -1)
  }

  private bound(id: number, interval: Interval.Interval): void {
    if (Interval.isBottom(interval)) {
      this.markBottom()
      return
    }
    if (Number.isFinite(interval.lo)) this.zone.constrainLower(id, interval.lo)
    if (Number.isFinite(interval.hi)) this.zone.constrainUpper(id, interval.hi)
  }

  private register(key: string, isInt: boolean): number {
    const existing = this.varIndex.get(key)
    if (existing !== undefined) return existing
    const id = this.varIndex.size + 1
    this.varIndex.set(key, id)
    if (isInt) this.intVars.add(id)
    return id
  }

  fieldOf(node: Node.Node): Option.Option<FieldInfo> {
    return Node.$is('Path')(node)
      ? Option.fromUndefinedOr(this.fields.get(Node.key(node)))
      : Option.none()
  }

  isIntNode(node: Node.Node): boolean {
    return Node.$match(node, {
      Lit: ({ value }) => typeof value === 'number' && Number.isInteger(value),
      Path: path =>
        Option.match(this.fieldOf(path), { onNone: () => false, onSome: info => info.isInt }),
      Call: ({ op, args }) =>
        Match.valueTags(abstractOps[op.id], {
          Term: ({ integral }) => integral(args.map(arg => this.isIntNode(arg))),
          Predicate: () => false,
        }),
      If: ({ then, otherwise }) => this.isIntNode(then) && this.isIntNode(otherwise),
      Match: ({ cases, otherwise }) =>
        cases.every(([, arm]) => this.isIntNode(arm)) &&
        Option.match(otherwise, { onNone: () => true, onSome: arm => this.isIntNode(arm) }),
      Opaque: () => false,
    })
  }

  private collectTerms(node: Node.Node): void {
    Node.$match(node, {
      Lit: () => {},
      Path: () => {},
      Call: ({ op, args }) => {
        for (const arg of args) this.collectTerms(arg)
        Match.valueTags(abstractOps[op.id], {
          Term: ({ relation }) => {
            const isInt = this.isIntNode(node)
            const id = this.register(Node.key(node), isInt)
            this.termNodes.set(id, node)
            // Sums and differences of doubles round, so only integers relate exactly.
            if (relation !== 'none' && isInt && args.length === 2) {
              this.relations.push({ id, relation, left: args[0]!, right: args[1]! })
            }
          },
          Predicate: ({ measures }) => {
            for (const measure of measures(args)) this.collectTerms(measure)
          },
        })
      },
      If: ({ cond, then, otherwise }) => {
        this.collectTerms(cond)
        this.collectTerms(then)
        this.collectTerms(otherwise)
      },
      Match: ({ on, cases, otherwise }) => {
        this.collectTerms(on)
        for (const [, arm] of cases) this.collectTerms(arm)
        if (Option.isSome(otherwise)) this.collectTerms(otherwise.value)
      },
      Opaque: () => {},
    })
  }

  varOf(node: Node.Node): Option.Option<number> {
    return Option.fromUndefinedOr(this.varIndex.get(Node.key(node)))
  }

  isIntRef(node: Node.Node): boolean {
    if (Node.$is('Lit')(node)) return typeof node.value === 'number' && Number.isInteger(node.value)
    const v = this.varOf(node)
    return Option.isSome(v) && this.intVars.has(v.value)
  }

  /** Whether an arithmetic term's result is known to stay in the safe range, so it is not refused. */
  private inRange(node: Node.Call): boolean {
    return Match.valueTags(abstractOps[node.op.id], {
      Predicate: () => true,
      Term: ({ refuses }) =>
        !refuses ||
        this.unrefused.has(Node.key(node)) ||
        Interval.within(this.evalInterval(node), SAFE),
    })
  }

  /**
   * Whether `node` is known to evaluate to a value: not null (so no nullable
   * or absent operand reaches it), not refused, and not NaN.
   */
  hasValue(node: Node.Node): boolean {
    if (this.valued.has(Node.key(node))) return true
    return Node.$match(node, {
      Lit: ({ value }) =>
        value !== null &&
        value !== undefined &&
        !Node.isRefusal(value) &&
        (typeof value !== 'number' || Number.isFinite(value)),
      Path: path =>
        this.nullFacts.get(Node.key(path)) === false &&
        Option.match(this.fieldOf(path), {
          onNone: () => true,
          onSome: info => info.kind !== 'number' || info.finite,
        }),
      Call: call => {
        const settled = (arg: Node.Node): boolean => isRead(arg) || this.hasValue(arg)
        if (call.op.nulls === 'strict') {
          return call.args.every(arg => this.hasValue(arg)) && this.inRange(call)
        }
        return Match.valueTags(abstractOps[call.op.id], {
          Term: () => false,
          Predicate: ({ neverNull }) =>
            call.args.every(arg => (neverNull ? settled(arg) : this.hasValue(arg))),
        })
      },
      If: ({ cond, then, otherwise }) =>
        this.hasValue(cond) && this.hasValue(then) && this.hasValue(otherwise),
      Match: match =>
        Option.match(this.scrutinized(match.on), {
          onNone: () => false,
          onSome: values =>
            values.every(value =>
              Option.match(this.resolveMatchArm(match, value), {
                onNone: () => false,
                onSome: arm => this.hasValue(arm),
              }),
            ),
        }),
      Opaque: () => false,
    })
  }

  /** The values a match's scrutinee may hold, where they are known to be few. */
  private scrutinized(on: Node.Node): Option.Option<ReadonlyArray<unknown>> {
    if (Node.$is('Lit')(on)) return Option.some([on.value ?? null])
    if (!Node.$is('Path')(on)) return Option.none()
    const pk = Node.key(on)
    if (this.nullFacts.get(pk) === true) return Option.some([null])
    if (this.eqFacts.has(pk)) return Option.some([this.eqFacts.get(pk)])
    return this.matchCandidates(pk)
  }

  /** Record that `node` evaluates to a value, and so does every operand a strict operator passed through. */
  markValued(node: Node.Node): void {
    const key = Node.key(node)
    if (this.valued.has(key)) return
    this.valued.add(key)
    Node.$match(node, {
      Lit: ({ value }) => {
        if (value === null || value === undefined || Node.isRefusal(value)) this.markBottom()
      },
      Path: () => {
        if (this.nullFacts.get(key) === true) this.markBottom()
        else this.nullFacts.set(key, false)
      },
      Call: call => {
        if (call.op.nulls !== 'strict') return
        for (const arg of call.args) this.markValued(arg)
        this.keepInRange(call)
      },
      If: ({ cond }) => this.markValued(cond),
      Match: () => {},
      Opaque: () => {},
    })
  }

  /**
   * Record that `node` is not null. For a path that is all it says: the
   * number there may still be NaN, which only a comparison rules out. An
   * operator's result that is not null is a value.
   */
  markNotNull(node: Node.Node): void {
    Node.$match(node, {
      Lit: ({ value }) => {
        if (value === null || value === undefined) this.markBottom()
      },
      Path: path => {
        const pk = Node.key(path)
        if (this.nullFacts.get(pk) === true) this.markBottom()
        else this.nullFacts.set(pk, false)
      },
      Call: call => this.markValued(call),
      If: () => {},
      Match: () => {},
      Opaque: () => {},
    })
  }

  /** An integer arithmetic term that was not refused, over operands with values, is a safe integer. */
  private keepInRange(call: Node.Call): void {
    const id = this.varOf(call)
    if (Option.isNone(id) || !this.intVars.has(id.value)) return
    Match.valueTags(abstractOps[call.op.id], {
      Predicate: () => {},
      Term: ({ refuses }) => {
        if (refuses) this.bound(id.value, SAFE)
      },
    })
  }

  /**
   * Record that `node` was evaluated without a refusal, as a written value
   * is: a strict operator was refused if an operand was. The value may still
   * be null.
   */
  assumeEvaluated(node: Node.Node): void {
    if (!Node.$is('Call')(node) || node.op.nulls !== 'strict') return
    for (const arg of node.args) this.assumeEvaluated(arg)
    this.unrefused.add(Node.key(node))
    if (node.args.every(arg => this.hasValue(arg))) this.keepInRange(node)
  }

  /** Interval of a numeric node where it has a value (including `If` branches such as `min`/`max`/`abs`/`clamp`). */
  evalInterval(node: Node.Node): Interval.Interval {
    if (Node.$is('Lit')(node)) {
      return typeof node.value === 'number' ? Interval.constant(node.value) : Interval.top
    }
    if (Node.$is('If')(node)) {
      const cond = this.decide(node.cond)
      if (Verdict.isTrue(cond)) return this.evalInterval(node.then)
      if (Verdict.isFalse(cond)) return this.evalInterval(node.otherwise)
      // Narrow each branch with its guard for tighter bounds (e.g. abs(x) >= 0).
      const taken = this.clone()
      taken.assume(node.cond)
      const skipped = this.clone()
      skipped.refute(node.cond)
      return Interval.join(
        taken.propagate() ? taken.evalInterval(node.then) : Interval.bottom,
        skipped.propagate() ? skipped.evalInterval(node.otherwise) : Interval.bottom,
      )
    }
    if (Node.$is('Match')(node)) return this.evalMatchInterval(node)
    const fromZone = Option.match(this.varOf(node), {
      onNone: () => Interval.top,
      onSome: id => this.zone.intervalOf(id),
    })
    if (!Node.$is('Call')(node)) return fromZone
    return Match.valueTags(abstractOps[node.op.id], {
      Predicate: () => fromZone,
      Term: ({ range, forward }) => {
        if (node.args.every(Node.$is('Lit'))) {
          const value = Node.apply(
            node.op,
            node.args.map(arg => arg.value),
          )
          return typeof value === 'number' ? Interval.constant(value) : Interval.top
        }
        return Interval.meet(
          fromZone,
          Interval.meet(range, forward(node.args.map(arg => this.evalInterval(arg)))),
        )
      },
    })
  }

  private resolveMatchArm(node: Node.Match, value: unknown): Option.Option<Node.Node> {
    for (const [k, arm] of node.cases) {
      if (k === value) return Option.some(arm)
    }
    return node.otherwise
  }

  /**
   * Finite candidate values for a `Path` field, including `null` whenever the
   * field may read as null (so case-splitting is sound for a nullable or
   * optional enumeration).
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
    const known = this.nullFacts.get(pk)
    const candidates = domain.filter(
      value =>
        (value === null ? known !== false : known !== true) &&
        (excluded === undefined || !excluded.has(value)),
    )
    if (candidates.length === 0 || candidates.length > MAX_SPLITS) return Option.none()
    return Option.some(candidates)
  }

  /** This state with `pk` holding `candidate`. */
  private withCandidate(pk: string, candidate: string | number | boolean | null): AbstractState {
    const branch = this.clone()
    if (candidate === null) branch.nullFacts.set(pk, true)
    else {
      branch.eqFacts.set(pk, candidate)
      branch.nullFacts.set(pk, false)
    }
    return branch
  }

  private evalMatchInterval(node: Node.Match): Interval.Interval {
    const armInterval = (state: AbstractState, value: unknown): Interval.Interval =>
      // No arm: the match is null or refused, and has no number to bound.
      Option.match(state.resolveMatchArm(node, value), {
        onNone: () => Interval.bottom,
        onSome: arm => state.evalInterval(arm),
      })
    if (Node.$is('Lit')(node.on)) return armInterval(this, node.on.value ?? null)
    if (Node.$is('Path')(node.on)) {
      const pk = Node.key(node.on)
      if (this.nullFacts.get(pk) === true) return armInterval(this, null)
      if (this.eqFacts.has(pk)) return armInterval(this, this.eqFacts.get(pk))
      const candidates = this.matchCandidates(pk)
      if (Option.isSome(candidates)) {
        return candidates.value.reduce<Interval.Interval>((acc, candidate) => {
          const branch = this.withCandidate(pk, candidate)
          return branch.propagate() ? Interval.join(acc, armInterval(branch, candidate)) : acc
        }, Interval.bottom)
      }
    }
    return [...node.cases.map(([, arm]) => arm), ...Option.toArray(node.otherwise)].reduce(
      (acc, arm) => Interval.join(acc, this.evalInterval(arm)),
      Interval.bottom,
    )
  }

  private findSplittableMatchPath(node: Node.Node): Option.Option<string> {
    const first = (nodes: ReadonlyArray<Node.Node>): Option.Option<string> =>
      Option.firstSomeOf(nodes.map(each => this.findSplittableMatchPath(each)))
    return Node.$match(node, {
      Lit: () => Option.none(),
      Path: () => Option.none(),
      Opaque: () => Option.none(),
      Call: ({ args }) => first(args),
      If: ({ cond, then, otherwise }) => first([cond, then, otherwise]),
      Match: ({ on, cases, otherwise }) => {
        if (Node.$is('Path')(on)) {
          const pk = Node.key(on)
          const open = !this.eqFacts.has(pk) && this.nullFacts.get(pk) !== true
          if (open && Option.isSome(this.matchCandidates(pk))) return Option.some(pk)
        }
        return first([...cases.map(([, arm]) => arm), ...Option.toArray(otherwise)])
      },
    })
  }

  /** Add `left <= right` (or `<` when `strict` is true) into the Zone. */
  assumeLeq(left: Node.Node, right: Node.Node, strict: boolean): void {
    const bothInt = this.isIntRef(left) && this.isIntRef(right)
    const delta = strict ? (bothInt ? -1 : 0) : 0

    const lv = this.varOf(left)
    const rv = this.varOf(right)
    const lConst = numberOf(left)
    const rConst = numberOf(right)

    if (Option.isSome(lv) && Option.isSome(rConst)) {
      this.zone.constrainUpper(lv.value, rConst.value + delta)
    } else if (Option.isSome(lConst) && Option.isSome(rv)) {
      this.zone.constrainLower(rv.value, lConst.value - delta)
    } else if (Option.isSome(lv) && Option.isSome(rv)) {
      this.zone.constrainDiff(lv.value, rv.value, delta)
    }
    // The rewrites below move a term across the comparison, which is exact
    // for integers and not for doubles (`x <= y + 0.1` does not give
    // `x - y <= 0.1`).
    if (!bothInt) return

    // y <= x - z  ==>  z <= x - y
    if (Node.$is('Call')(right) && right.op.id === 'num.sub' && right.args.length === 2) {
      const [x, z] = right.args
      const swapped = this.varOf(Node.Call({ op: right.op, args: [x!, left] }))
      const zv = this.varOf(z!)
      if (Option.isSome(swapped) && Option.isSome(zv) && this.intVars.has(swapped.value)) {
        this.zone.constrainDiff(zv.value, swapped.value, delta)
      }
      const xv = this.varOf(x!)
      const zConst = numberOf(z!)
      if (Option.isSome(lv) && Option.isSome(xv) && Option.isSome(zConst)) {
        this.zone.constrainDiff(lv.value, xv.value, -zConst.value + delta)
      }
    }

    // x - z <= y  ==>  x - y <= z
    if (Node.$is('Call')(left) && left.op.id === 'num.sub' && left.args.length === 2) {
      const [x, z] = left.args
      const swapped = this.varOf(Node.Call({ op: left.op, args: [x!, right] }))
      const zv = this.varOf(z!)
      if (Option.isSome(swapped) && Option.isSome(zv) && this.intVars.has(swapped.value)) {
        this.zone.constrainDiff(swapped.value, zv.value, delta)
      }
      const xv = this.varOf(x!)
      const zConst = numberOf(z!)
      if (Option.isSome(xv) && Option.isSome(rv) && Option.isSome(zConst)) {
        this.zone.constrainDiff(xv.value, rv.value, zConst.value + delta)
      }
    }
  }

  /** Record that `node` evaluates to true. */
  assume(node: Node.Node): void {
    Node.$match(node, {
      Lit: ({ value }) => {
        if (value !== true) this.markBottom()
      },
      Path: path => {
        const pk = Node.key(path)
        if (this.eqFacts.get(pk) === false) this.markBottom()
        else this.eqFacts.set(pk, true)
        this.markValued(path)
      },
      Call: call => this.settle(call, true),
      If: () => {},
      Match: () => {},
      Opaque: () => {},
    })
  }

  /** Record that `node` evaluates to false. */
  refute(node: Node.Node): void {
    Node.$match(node, {
      Lit: ({ value }) => {
        if (value !== false) this.markBottom()
      },
      Path: path => {
        const pk = Node.key(path)
        if (this.eqFacts.get(pk) === true) this.markBottom()
        else this.eqFacts.set(pk, false)
        this.markValued(path)
      },
      Call: call => this.settle(call, false),
      If: () => {},
      Match: () => {},
      Opaque: () => {},
    })
  }

  /** A call with a truth value was evaluated: a strict one over operands that all have values. */
  private settle(call: Node.Call, truth: boolean): void {
    Match.valueTags(abstractOps[call.op.id], {
      Term: () => {},
      Predicate: row => {
        if (call.op.nulls === 'strict') for (const arg of call.args) this.markValued(arg)
        if (truth) row.assume(call.args, this)
        else row.refute(call.args, this)
      },
    })
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

      for (const { id, relation, left, right } of this.relations) {
        const lv = this.varOf(left)
        const rv = this.varOf(right)
        const liv = this.evalInterval(left)
        const riv = this.evalInterval(right)
        if (relation === 'sub') {
          if (Option.isSome(lv)) {
            if (Number.isFinite(riv.lo)) tighten(id, lv.value, -riv.lo)
            if (Number.isFinite(riv.hi)) tighten(lv.value, id, riv.hi)
          }
          if (Option.isSome(lv) && Option.isSome(rv)) {
            tighten(id, ZERO, this.zone.rawBound(lv.value, rv.value))
            tighten(ZERO, id, this.zone.rawBound(rv.value, lv.value))
          }
        } else {
          if (Option.isSome(lv)) {
            if (Number.isFinite(riv.lo)) tighten(lv.value, id, -riv.lo)
            if (Number.isFinite(riv.hi)) tighten(id, lv.value, riv.hi)
          }
          if (Option.isSome(rv)) {
            if (Number.isFinite(liv.lo)) tighten(rv.value, id, -liv.lo)
            if (Number.isFinite(liv.hi)) tighten(id, rv.value, liv.hi)
          }
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

  /** The verdicts of the reachable `branches`, as one: an unreachable case says nothing. */
  private cases(
    branches: ReadonlyArray<AbstractState>,
    goal: Node.Node,
    splitsLeft: number,
  ): Verdict.Verdict<never> {
    return agree(
      branches.filter(branch => branch.propagate()).map(branch => branch.entails(goal, splitsLeft)),
    )
  }

  /** The verdict on `goal`'s value, splitting disjunctions and enumerations within a budget. */
  entails(goal: Node.Node, splitsLeft = MAX_SPLITS): Verdict.Verdict<never> {
    if (!this.propagate()) return proved('zone')
    const direct = this.decide(goal)
    const pending = this.pendingOrs[0]
    // A disjunction still to split may leave no case at all, where even a refuted goal holds.
    const settled = Verdict.isTrue(direct) || (Verdict.isFalse(direct) && pending === undefined)
    if (settled || splitsLeft <= 0) return direct
    if (pending !== undefined) {
      return this.cases(
        pending.map(disjunct => {
          const branch = this.clone()
          branch.pendingOrs.shift()
          branch.assume(disjunct)
          return branch
        }),
        goal,
        splitsLeft - 1,
      )
    }
    // Case-split on a finite-domain path a `Match` inside the goal scrutinizes.
    return Option.match(this.findSplittableMatchPath(goal), {
      onNone: () => direct,
      onSome: pk =>
        Option.match(this.matchCandidates(pk), {
          onNone: () => direct,
          onSome: candidates =>
            this.cases(
              candidates.map(candidate => this.withCandidate(pk, candidate)),
              goal,
              splitsLeft - 1,
            ),
        }),
    })
  }

  /** The verdict on `goal`'s value in this state, without splitting. */
  decide(goal: Node.Node): Verdict.Verdict<never> {
    return Node.$match(goal, {
      Lit: ({ value }) => {
        if (value === true) return proved('concrete')
        return value === false ? refuted() : Verdict.Unknown('not a truth value')
      },
      Path: path => {
        const pk = Node.key(path)
        const known = this.eqFacts.get(pk)
        if (known === true) return proved('zone')
        if (known === false) return refuted()
        return Verdict.Unknown(`boolean path "${show(path)}" unknown`)
      },
      Opaque: ({ name }) =>
        Verdict.Unknown(`opaque term "${name}"`, Option.some({ kind: 'opaque', detail: name })),
      If: branch => {
        const cond = this.decide(branch.cond)
        if (Verdict.isTrue(cond)) return this.decide(branch.then)
        if (Verdict.isFalse(cond)) return this.decide(branch.otherwise)
        // A condition that may be null gives a null neither branch answers for.
        if (!this.hasValue(branch.cond)) return this.unvalued(branch.cond)
        const taken = this.clone()
        taken.assume(branch.cond)
        const skipped = this.clone()
        skipped.refute(branch.cond)
        return agree([
          ...(taken.propagate() ? [taken.entails(branch.then, 0)] : []),
          ...(skipped.propagate() ? [skipped.entails(branch.otherwise, 0)] : []),
        ])
      },
      Match: match => {
        const arm = (value: unknown): Verdict.Verdict<never> =>
          Option.match(this.resolveMatchArm(match, value), {
            onNone: () => Verdict.Unknown('no case of the match is taken'),
            onSome: taken => this.decide(taken),
          })
        if (Node.$is('Lit')(match.on)) return arm(match.on.value ?? null)
        if (Node.$is('Path')(match.on)) {
          const pk = Node.key(match.on)
          if (this.nullFacts.get(pk) === true) return arm(null)
          if (this.eqFacts.has(pk)) return arm(this.eqFacts.get(pk))
        }
        return Verdict.Unknown('match scrutinee unknown')
      },
      Call: call =>
        Match.valueTags(abstractOps[call.op.id], {
          Term: () => Verdict.Unknown('not a truth value'),
          Predicate: row => {
            if (call.op.nulls === 'strict') {
              const open = call.args.find(arg => !this.hasValue(arg))
              if (open !== undefined) return this.unvalued(open)
            }
            return row.decide(call.args, this)
          },
        }),
    })
  }

  private unvalued(node: Node.Node): Verdict.Verdict<never> {
    return Verdict.Unknown(
      `"${show(node)}" may be null, absent, NaN or past the safe range, so what reads it may not hold`,
    )
  }

  /** The verdict on `left <= right` (`<` when `strict`) for operands with values. */
  entailsLeq(left: Node.Node, right: Node.Node, strict: boolean): Verdict.Verdict<never> {
    const lv = this.varOf(left)
    const rv = this.varOf(right)
    const lConst = numberOf(left)
    const rConst = numberOf(right)
    const bothInt = this.isIntRef(left) && this.isIntRef(right)
    // Over integers `a < b` is `a <= b - 1`; over reals it needs a strictly negative difference.
    const strictReal = strict && !bothInt
    const slack = strict && bothInt ? 1 : 0
    const holds = (i: number, j: number, bound: number): boolean =>
      strictReal ? this.zone.diffBound(i, j) < bound : this.zone.impliesDiff(i, j, bound - slack)

    if (Option.isSome(lv) && Option.isSome(rv)) {
      if (holds(lv.value, rv.value, 0)) return proved('zone')
      if (strict) {
        if (this.zone.impliesDiff(rv.value, lv.value, 0)) return refuted()
      } else if (bothInt && this.zone.impliesDiff(rv.value, lv.value, -1)) {
        return refuted()
      }
    } else if (Option.isSome(lv) && Option.isSome(rConst)) {
      if (holds(lv.value, ZERO, rConst.value)) return proved('zone')
    } else if (Option.isSome(lConst) && Option.isSome(rv)) {
      if (holds(ZERO, rv.value, -lConst.value)) return proved('zone')
    }

    const liv = this.evalInterval(left)
    const riv = this.evalInterval(right)
    return strict ? Interval.lt(liv, riv) : Interval.lte(liv, riv)
  }

  /**
   * Whether a value written to the field `info` describes is one its Schema
   * admits: `True` where every value `value` may take is, `False` where none
   * is.
   */
  fits(value: Node.Node, info: FieldInfo): Verdict.Verdict<never> {
    const acceptsNull = flat(info.ast).some(SchemaAST.isNull)
    return Node.$match(value, {
      Lit: ({ value: literal }) =>
        Schema.is(Schema.make(info.ast))(literal ?? null) ? proved('concrete') : refuted(),
      Opaque: ({ name }) =>
        Verdict.Unknown(`opaque term "${name}"`, Option.some({ kind: 'opaque', detail: name })),
      If: branch => {
        if (!acceptsNull && !this.hasValue(branch.cond)) return this.unvalued(branch.cond)
        const taken = this.clone()
        taken.assume(branch.cond)
        const skipped = this.clone()
        skipped.refute(branch.cond)
        return agree([
          ...(taken.propagate() ? [taken.fits(branch.then, info)] : []),
          ...(skipped.propagate() ? [skipped.fits(branch.otherwise, info)] : []),
        ])
      },
      Match: match => {
        if (!acceptsNull && Option.isNone(match.otherwise) && !this.hasValue(match.on)) {
          return this.unvalued(match.on)
        }
        return agree(
          [...match.cases.map(([, arm]) => arm), ...Option.toArray(match.otherwise)].map(arm =>
            this.fits(arm, info),
          ),
        )
      },
      Path: path => this.fitsTerm(path, info, acceptsNull),
      Call: call => this.fitsTerm(call, info, acceptsNull),
    })
  }

  private fitsTerm(
    value: Node.PathNode | Node.Call,
    info: FieldInfo,
    acceptsNull: boolean,
  ): Verdict.Verdict<never> {
    if (!acceptsNull && !this.hasValue(value)) return this.unvalued(value)
    // Where the field takes null, what is left to show is of a value that is not.
    const state = this.clone()
    if (Node.$is('Path')(value)) {
      const pk = Node.key(value)
      if (state.nullFacts.get(pk) === true) return proved('zone')
      state.nullFacts.set(pk, false)
    } else {
      state.markValued(value)
    }
    if (!state.propagate()) return proved('zone')
    const source = state.fieldOf(value)
    const sourceKind = Option.match(source, { onNone: () => 'other', onSome: s => s.kind })
    const unknown = Verdict.Unknown(`"${show(value)}" is not known to be what the field takes`)
    const byKind: Readonly<Record<FieldKind, () => Verdict.Verdict<never>>> = {
      number: () => {
        const numeric =
          sourceKind === 'number' ||
          (Node.$is('Call')(value) && abstractOps[value.op.id]._tag === 'Term')
        if (!numeric) return unknown
        if (info.isInt && !state.isIntNode(value)) return unknown
        if (info.finite && !state.hasValue(value)) return state.unvalued(value)
        const lit = (bound: number): Node.Node => Node.Lit({ value: bound })
        return Verdict.and(
          Number.isFinite(info.interval.lo)
            ? state.entailsLeq(lit(info.interval.lo), value, false)
            : proved('interval'),
          Number.isFinite(info.interval.hi)
            ? state.entailsLeq(value, lit(info.interval.hi), false)
            : proved('interval'),
        )
      },
      boolean: () =>
        sourceKind === 'boolean' || (Node.$is('Call')(value) && value.op.returns === 'boolean')
          ? proved('zone')
          : unknown,
      text: () => (sourceKind === 'text' ? proved('zone') : unknown),
      literal: () => {
        const allowed: ReadonlyArray<unknown> = Option.getOrElse(info.literals, () => [])
        const held = Node.$is('Path')(value) ? state.eqFacts.get(Node.key(value)) : undefined
        const possible =
          held !== undefined && isPrimitive(held)
            ? Option.some([held])
            : Option.flatMap(source, s => s.literals)
        return Option.match(possible, {
          onNone: () => unknown,
          onSome: values => {
            if (values.every(each => allowed.includes(each))) return proved('zone')
            return values.some(each => allowed.includes(each)) ? unknown : refuted()
          },
        })
      },
      struct: () => unknown,
      other: () =>
        Option.match(source, {
          onNone: () => unknown,
          // One Schema object on both sides admits the same values.
          onSome: s => (present(s.ast)[0] === present(info.ast)[0] ? proved('zone') : unknown),
        }),
    }
    return byKind[info.kind]()
  }
}

const arithmetic = (relation: TermOp['relation'], forward: TermOp['forward']): TermOp => ({
  _tag: 'Term',
  range: Interval.top,
  forward,
  integral: args => args.every(Boolean),
  refuses: true,
  relation,
})

/** A length or a count: an integer that is never negative and never refused. */
const measure: TermOp = {
  _tag: 'Term',
  range: Interval.between(0, Infinity),
  forward: () => Interval.between(0, Infinity),
  integral: () => true,
  refuses: false,
  relation: 'none',
}

const none = (): ReadonlyArray<Node.Node> => []

const comparison = (
  /** The operands as `lesser`, `greater` of the `<=` or `<` the row is. */
  order: (args: ReadonlyArray<Node.Node>) => readonly [Node.Node, Node.Node],
  strict: boolean,
): PredicateOp => ({
  _tag: 'Predicate',
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

/** A literal that is not a refusal, or a path: a term evaluation reads and cannot refuse. */
const isRead = (node: Node.Node): boolean =>
  Node.$is('Path')(node) || (Node.$is('Lit')(node) && !Node.isRefusal(node.value))

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
    neverNull: false,
    measures: none,
    decide: (args, state) => Verdict.not(state.decide(args[0]!)),
    assume: (args, state) => state.refute(args[0]!),
    refute: (args, state) => state.assume(args[0]!),
  },
  'eq.is': {
    _tag: 'Predicate',
    neverNull: true,
    measures: none,
    decide: decideEqual,
    assume: assumeEqual,
    refute: assumeUnequal,
  },
  'eq.isNot': {
    _tag: 'Predicate',
    neverNull: true,
    measures: none,
    decide: (args, state) => Verdict.not(decideEqual(args, state)),
    assume: assumeUnequal,
    refute: assumeEqual,
  },
  'eq.in': {
    _tag: 'Predicate',
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
  'num.add': arithmetic('add', args => Interval.add(args[0]!, args[1]!)),
  'num.sub': arithmetic('sub', args => Interval.sub(args[0]!, args[1]!)),
  'num.mul': arithmetic('none', args => Interval.mul(args[0]!, args[1]!)),
  'num.neg': arithmetic('none', args => Interval.neg(args[0]!)),
  'str.len': measure,
  'str.startsWith': search(Str.startsWithOp),
  'str.contains': search(Str.containsOp),
  'arr.count': measure,
  'arr.isEmpty': {
    _tag: 'Predicate',
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

interface Write {
  readonly target: ReadonlyArray<string>
  readonly value: Node.Node
}

/** A read no checker can see into: part of a value the transition wrote as a whole. */
const unreadable = (segments: ReadonlyArray<string>): Node.Node =>
  Node.Opaque({
    name: `written:${Path.format(segments)}`,
    reads: Option.none(),
    run: () => null,
  })

/**
 * `node` over the state the writes leave: a read of a written path is its
 * value, a read under a written path is that part of its value, and a read
 * of a struct a write reaches into is one nothing here can follow.
 */
const afterWrites = (node: Node.Node, writes: ReadonlyArray<Write>): Node.Node =>
  Node.substitutePaths(node, segments => {
    if (segments[0] !== 'state') return Option.none()
    const read = segments.slice(1)
    for (const { target, value } of writes) {
      if (Path.isPrefix(target, read)) {
        const rest = read.slice(target.length)
        if (rest.length === 0) return Option.some(value)
        return Option.some(
          Node.$is('Path')(value)
            ? Node.Path({ segments: [...value.segments, ...rest], ast: Option.none() })
            : unreadable(segments),
        )
      }
      if (Path.isPrefix(read, target)) return Option.some(unreadable(segments))
    }
    return Option.none()
  })

/**
 * The rules of `schema`, read under `under`. A rule on a field that may be
 * absent says nothing where it is: it is the rule, or the field is null.
 */
const rulesUnder = (
  schema: Schema.Top,
  under: ReadonlyArray<string>,
  fields: ReadonlyMap<string, FieldInfo>,
): ReadonlyArray<Node.Node> =>
  Expr.rulesOf(schema).map(rule => {
    const node = Node.prefix(rule.expr.node, under)
    const at = [...under, ...rule.at]
    const info = fields.get(pathKey(at))
    if (info === undefined || !info.nullable) return node
    const absent = Node.Call({
      op: Null.isNullOp,
      args: [Node.Path({ segments: at, ast: Option.none() })],
    })
    return Node.Call({ op: Bool.orOp, args: [absent, node] })
  })

/** Tier 3 synchronous check: does `schema` entail `goal`? */
export const checkInvariant = <S extends Schema.Top>(
  schema: S,
  goal: Expr.Expr<S['Type'], boolean | null>,
): Verdict.Verdict<never> => {
  const fields = new Map<string, FieldInfo>()
  collectFields(schema.ast, [], fields)
  const invariants = rulesUnder(schema, [], fields)
  const state = new AbstractState([...invariants, goal.node], fields)
  for (const inv of invariants) state.assume(inv)
  return state.entails(goal.node)
}

/**
 * Tier 3 synchronous check: does `transition` leave a state `stateSchema`
 * admits? Every rule on the Schema must hold of the state after the writes,
 * and every written value must be one its field's Schema takes: its type, its
 * bounds, whether it is an integer, a literal of its enumeration, or null.
 */
export const checkTransition = <S extends Schema.Top, I, Emit>(
  stateSchema: S,
  transition: Transition<S['Type'], I, Emit>,
): Verdict.Verdict<never> => {
  const fields = new Map<string, FieldInfo>()
  collectFields(stateSchema.ast, ['state'], fields)
  const preInvariants = rulesUnder(stateSchema, ['state'], fields)

  const inputInvariants: Array<Node.Node> = []
  if (Option.isSome(transition.inputSchema)) {
    const inputSchema = transition.inputSchema.value
    collectFields(inputSchema.ast, ['input'], fields)
    inputInvariants.push(...rulesUnder(inputSchema, ['input'], fields))
  }

  const writes: ReadonlyArray<Write> = transition.writes.map(eq => ({
    target: eq.target,
    value: eq.value.node,
  }))
  const postGoals = preInvariants.map(inv => afterWrites(inv, writes))

  const hypotheses = [...preInvariants, ...inputInvariants, transition.when.node]
  const state = new AbstractState(
    [...hypotheses, ...postGoals, ...writes.map(write => write.value)],
    fields,
  )
  for (const hypothesis of hypotheses) state.assume(hypothesis)
  // A write whose value is refused refuses the transition, so no state follows it.
  for (const write of writes) state.assumeEvaluated(write.value)
  if (!state.propagate()) return proved('zone')

  let overall: Verdict.Verdict<never> = proved('zone')
  for (const { target, value } of writes) {
    const written = ['state', ...target]
    const inside = Array.from(fields.values()).filter(
      info =>
        info.kind !== 'struct' &&
        Path.isPrefix(written, info.segments) &&
        info.segments.length > written.length,
    )
    const whole = fields.get(pathKey(written))
    if (whole === undefined) return Verdict.Unknown(`no Schema for "${Path.format(written)}"`)
    if (inside.length === 0) {
      overall = Verdict.and(overall, state.fits(value, whole))
    } else if (Node.$is('Path')(value)) {
      // A struct written from a path: each field takes the field of the same name.
      if (!whole.nullable && !state.hasValue(value)) {
        return Verdict.Unknown(`"${Path.format(value.segments)}" may be null`)
      }
      for (const info of inside) {
        const part = Node.Path({
          segments: [...value.segments, ...info.segments.slice(written.length)],
          ast: Option.none(),
        })
        overall = Verdict.and(overall, state.fits(part, info))
      }
    } else {
      overall = Verdict.and(overall, state.fits(value, whole))
    }
    if (Verdict.isFalse(overall)) return overall
  }
  for (const goal of postGoals) {
    overall = Verdict.and(overall, state.entails(goal))
    if (Verdict.isFalse(overall)) break
  }
  return overall
}
