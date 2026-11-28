import { Match, Option } from 'effect'
import * as Node from '../node.js'
import type { ForeignImplementations } from '../ops/eval.js'
import * as Verdict from '../verdict.js'
import { assumeLeq, decide, entails, entailsLeq, propagate } from './entail.js'
import { SAFE, type FieldInfo } from './fields.js'
import { fits } from './fits.js'
import * as Interval from './interval.js'
import { evalMatchInterval, matchCandidates, resolveMatchArm } from './matches.js'
import { foldProperties } from '../properties.js'
import { countBounds, type CountBounds } from './lists.js'
import { abstractOf } from './rowOf.js'
import { MAX_SPLITS, noCandidate, show } from './support.js'
import { hasValue, notRefused, portable } from './values.js'
import { Zone, ZERO } from './zone.js'

/**
 * Relational abstract state: Zone DBM, equality and inequality facts, which
 * paths are null, which terms are known to have a value, and the
 * disjunctions still to split.
 *
 * The methods that answer and narrow (`assumeLeq`, `propagate`, `entails`,
 * `decide`, `entailsLeq`, `fits`) have their bodies in `entail.ts` and
 * `fits.ts`, which keeps each file reviewable; they are functions with `this`
 * typed as the state, so their text reads as it did in the class.
 */
export class AbstractState {
  readonly fields: ReadonlyMap<string, FieldInfo>
  readonly foreign: ForeignImplementations
  readonly varIndex: Map<string, number>
  readonly intVars: Set<number>
  readonly termNodes: Map<number, Node.Node>
  readonly relations: Array<{
    readonly id: number
    readonly relation: 'add' | 'sub'
    /** Over integers, where the result is the exact sum or difference. */
    readonly exact: boolean
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
  /** Terms known to hold no text with a NUL: an operation that refuses such text took them. */
  readonly portableKeys: Set<string>
  readonly pendingOrs: Array<readonly [Node.Node, Node.Node]>
  /** Each count of a list's passing elements, with the count of the whole list. */
  readonly counted: Array<readonly [count: Node.Node, bounds: CountBounds]>
  zone: Zone

  constructor(
    nodes: ReadonlyArray<Node.Node>,
    fields: ReadonlyMap<string, FieldInfo>,
    from?: AbstractState,
    foreign: ForeignImplementations = {},
  ) {
    this.fields = fields
    if (from !== undefined) {
      this.foreign = from.foreign
      this.varIndex = from.varIndex
      this.intVars = from.intVars
      this.termNodes = from.termNodes
      this.relations = from.relations
      this.eqFacts = new Map(from.eqFacts)
      this.neqFacts = new Map(Array.from(from.neqFacts, ([k, s]) => [k, new Set(s)]))
      this.nullFacts = new Map(from.nullFacts)
      this.valued = new Set(from.valued)
      this.unrefused = new Set(from.unrefused)
      this.portableKeys = new Set(from.portableKeys)
      this.pendingOrs = [...from.pendingOrs]
      this.counted = from.counted
      this.zone = from.zone.clone()
      return
    }
    this.foreign = foreign
    this.varIndex = new Map()
    this.intVars = new Set()
    this.termNodes = new Map()
    this.relations = []
    this.eqFacts = new Map()
    this.neqFacts = new Map()
    this.nullFacts = new Map()
    this.valued = new Set()
    this.unrefused = new Set()
    this.portableKeys = new Set()
    this.pendingOrs = []
    this.counted = []

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
        Match.valueTags(abstractOf(term.op, this.foreign), {
          Term: ({ range }) => this.bound(id, range),
          Predicate: () => {},
          Value: () => {},
        })
      }
    }
    // A count is a list's length, which no JavaScript array takes past
    // 2^32 - 1, and lies where `countBounds` puts it against another; that of
    // the elements that pass reads `count` monotone.
    for (const [part, { base, below, above, kind }] of this.counted) {
      const [id, at] = [this.varOf(part), this.varOf(base)]
      if (Option.isNone(id) || Option.isNone(at)) continue
      for (const each of [id.value, at.value]) this.bound(each, Interval.between(0, 2 ** 32 - 1))
      if (kind === 'passing' && foldProperties.count.monotone !== 'up') continue
      this.zone.constrainDiff(id.value, at.value, above)
      if (Number.isFinite(below)) this.zone.constrainDiff(at.value, id.value, -below)
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
        Match.valueTags(abstractOf(op, this.foreign), {
          Term: ({ integral }) => integral(args.map(arg => this.isIntNode(arg))),
          Predicate: () => false,
          Value: () => false,
        }),
      If: ({ then, otherwise }) => this.isIntNode(then) && this.isIntNode(otherwise),
      Match: ({ cases, otherwise }) =>
        cases.every(([, arm]) => this.isIntNode(arm)) &&
        Option.match(otherwise, { onNone: () => true, onSome: arm => this.isIntNode(arm) }),
      Opaque: () => false,
      Rows: ({ fold }) => fold === 'count',
    })
  }

  private collectTerms(node: Node.Node): void {
    Node.$match(node, {
      Lit: () => {},
      Path: () => {},
      Call: ({ op, args }) => {
        for (const arg of args) this.collectTerms(arg)
        Match.valueTags(abstractOf(op, this.foreign), {
          Term: ({ relation }) => {
            const isInt = this.isIntNode(node)
            const id = this.register(Node.key(node), isInt)
            this.termNodes.set(id, node)
            // Sums and differences of doubles round, so only integers relate
            // exactly; `propagate` reads of a double what rounding keeps.
            if (relation !== 'none' && args.length === 2) {
              this.relations.push({ id, relation, exact: isInt, left: args[0]!, right: args[1]! })
            }
            this.collectCount(node)
          },
          Predicate: ({ measures }) => {
            for (const measure of measures(args)) this.collectTerms(measure)
          },
          Value: () => {},
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
      Rows: () => this.collectCount(node),
    })
  }

  /** A count the list's own count bounds (`countBounds`) is a term, related to that count. */
  private collectCount(node: Node.Node): void {
    const bounds = countBounds(node)
    if (Option.isNone(bounds)) return
    this.termNodes.set(this.register(Node.key(node), true), node)
    this.collectTerms(bounds.value.base)
    this.counted.push([node, bounds.value])
  }

  varOf(node: Node.Node): Option.Option<number> {
    return Option.fromUndefinedOr(this.varIndex.get(Node.key(node)))
  }

  isIntRef(node: Node.Node): boolean {
    if (Node.$is('Lit')(node)) return typeof node.value === 'number' && Number.isInteger(node.value)
    const v = this.varOf(node)
    return Option.isSome(v) && this.intVars.has(v.value)
  }

  /** Whether an arithmetic term's operands and result are known to stay in the safe range, so it is not refused. */
  inRange(node: Node.Call): boolean {
    return Match.valueTags(abstractOf(node.op, this.foreign), {
      Predicate: () => true,
      Value: () => true,
      Term: ({ refuses, unrefused }) =>
        !refuses ||
        this.unrefused.has(Node.key(node)) ||
        (unrefused === undefined
          ? // Evaluation refuses an operand past the safe range as it does a result.
            [node, ...node.args].every(term => Interval.within(this.evalInterval(term), SAFE))
          : unrefused(
              node.args.map(arg => this.evalInterval(arg)),
              node.args.map(arg => this.isIntNode(arg)),
            )),
    })
  }

  /** Whether `node` is known to evaluate to a value: not null, not refused, and not NaN. */
  hasValue(node: Node.Node): boolean {
    return hasValue.call(this, node)
  }

  /** Whether `node` holds no text with a NUL character, which a text or equality operation refuses. */
  portable(node: Node.Node): boolean {
    return portable.call(this, node)
  }

  /** Whether `node` is known not to be refused, though it may be null. */
  notRefused(node: Node.Node): boolean {
    return notRefused.call(this, node)
  }

  /**
   * Record what a strict call that was not null says of its operands: each
   * has a value (a core operation refuses NaN where it takes a number), or,
   * of a foreign one, which may take NaN, each is not null.
   */
  private markOperands(call: Node.Call): void {
    for (const arg of call.args) {
      if (Node.isForeign(call.op)) this.markNotNull(arg)
      else this.markValued(arg)
    }
  }

  /**
   * Record that an operation refusing text with a NUL took `args` without
   * refusing; it refuses one before null. `eq.among` of no candidate reads
   * no operand, so it says nothing.
   */
  private markPortable(call: Node.Call): void {
    if (!abstractOf(call.op, this.foreign).unportable) return
    if (call.op.id === 'eq.among' && noCandidate(call.args[1])) return
    for (const arg of call.args) this.portableKeys.add(Node.key(arg))
  }

  /** The values a match's scrutinee may hold, where they are known to be few. */
  scrutinized(on: Node.Node): Option.Option<ReadonlyArray<unknown>> {
    if (Node.$is('Lit')(on)) return Option.some([on.value ?? null])
    if (!Node.$is('Path')(on)) return Option.none()
    const pk = Node.key(on)
    if (this.nullFacts.get(pk) === true) return Option.some([null])
    if (this.eqFacts.has(pk)) return Option.some([this.eqFacts.get(pk)])
    return matchCandidates(this, pk)
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
        this.markPortable(call)
        if (call.op.nulls !== 'strict') return
        this.markOperands(call)
        this.keepInRange(call)
      },
      If: ({ cond }) => this.markValued(cond),
      Match: () => {},
      Opaque: () => {},
      Rows: () => {},
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
      Rows: () => {},
    })
  }

  /** An integer arithmetic term that was not refused, over operands with values, is a safe integer. */
  private keepInRange(call: Node.Call): void {
    const id = this.varOf(call)
    if (Option.isNone(id) || !this.intVars.has(id.value)) return
    Match.valueTags(abstractOf(call.op, this.foreign), {
      Predicate: () => {},
      Value: () => {},
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
    if (!Node.$is('Call')(node)) return
    this.markPortable(node)
    if (node.op.nulls !== 'strict') return
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
    if (Node.$is('Match')(node)) return evalMatchInterval(this, node)
    const fromZone = Option.match(this.varOf(node), {
      onNone: () => Interval.top,
      onSome: id => this.zone.intervalOf(id),
    })
    if (!Node.$is('Call')(node)) return fromZone
    // An insert's count is where `countBounds` put it; its `If` is not split again.
    if (Option.isSome(countBounds(node))) return fromZone
    return Match.valueTags(abstractOf(node.op, this.foreign), {
      Predicate: () => fromZone,
      Value: () => fromZone,
      Term: ({ range, forward }) => {
        const op = node.op
        if (!Node.isForeign(op) && node.args.every(Node.$is('Lit'))) {
          const value = Node.apply(
            op,
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

  /** Add `left <= right` (or `<` when `strict` is true) into the Zone. */
  assumeLeq(left: Node.Node, right: Node.Node, strict: boolean): void {
    assumeLeq.call(this, left, right, strict)
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
      Rows: () => {},
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
      Rows: () => {},
    })
  }

  /** A call with a truth value was evaluated: a strict one over operands that all have values. */
  private settle(call: Node.Call, truth: boolean): void {
    Match.valueTags(abstractOf(call.op, this.foreign), {
      Term: () => {},
      // A value of `null.coalesce` that is true says nothing this state holds.
      Value: () => {},
      Predicate: row => {
        this.markPortable(call)
        if (call.op.nulls === 'strict') this.markOperands(call)
        if (truth) row.assume(call.args, this)
        else row.refute(call.args, this)
      },
    })
  }

  /** Bounded fixed-point propagation. */
  propagate(): boolean {
    return propagate.call(this)
  }

  /** The verdict on `goal`'s value, splitting disjunctions and enumerations within a budget. */
  entails(goal: Node.Node, splitsLeft = MAX_SPLITS): Verdict.Verdict<never> {
    return entails.call(this, goal, splitsLeft)
  }

  /** The verdict on `goal`'s value in this state, without splitting. */
  decide(goal: Node.Node): Verdict.Verdict<never> {
    return decide.call(this, goal)
  }

  unvalued(node: Node.Node): Verdict.Verdict<never> {
    return Verdict.Unknown(
      `"${show(node)}" may be null, absent, NaN or past the safe range, so what reads it may not hold`,
    )
  }

  /** The verdict on `left <= right` (`<` when `strict`) for operands with values. */
  entailsLeq(left: Node.Node, right: Node.Node, strict: boolean): Verdict.Verdict<never> {
    return entailsLeq.call(this, left, right, strict)
  }

  /**
   * Whether a value written to the field `info` describes is one its Schema
   * admits: `True` where every value `value` may take is, `False` where none
   * is.
   */
  fits(value: Node.Node, info: FieldInfo): Verdict.Verdict<never> {
    return fits.call(this, value, info)
  }
}
