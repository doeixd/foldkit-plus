/**
 * What `AbstractState` answers and narrows by: its methods whose bodies are
 * kept here to keep each file reviewable. Each is a function with `this` typed
 * as the state, called through the method of the same name on the class.
 */
import { Match, Option } from 'effect'
import * as Node from '../node.js'
import * as Verdict from '../verdict.js'
import * as Interval from './interval.js'
import { abstractOf } from './rowOf.js'
import {
  findSplittableMatchPath,
  matchCandidates,
  resolveMatchArm,
  withCandidate,
} from './matches.js'
import type { AbstractState } from './state.js'
import { MAX_SPLITS, agree, numberOf, proved, refuted, show } from './support.js'
import { notNaN, refusesNaN } from './values.js'
import { ZERO } from './zone.js'

const MAX_ROUNDS = 16

export function assumeLeq(
  this: AbstractState,
  left: Node.Node,
  right: Node.Node,
  strict: boolean,
): void {
  const bothInt = this.isIntRef(left) && this.isIntRef(right)
  const delta = strict ? (bothInt ? -1 : 0) : 0

  const lv = this.varOf(left)
  const rv = this.varOf(right)
  const lConst = numberOf(left)
  const rConst = numberOf(right)

  // A term is a double, so against a constant `x < m` is `x <= nextDown(m)`
  // exactly; between two terms the difference rounds, so `<` keeps `<=`.
  const strictReal = strict && !bothInt
  if (Option.isSome(lv) && Option.isSome(rConst)) {
    this.zone.constrainUpper(
      lv.value,
      strictReal ? Interval.nextDown(rConst.value) : rConst.value + delta,
    )
  } else if (Option.isSome(lConst) && Option.isSome(rv)) {
    this.zone.constrainLower(
      rv.value,
      strictReal ? Interval.nextUp(lConst.value) : lConst.value - delta,
    )
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

export function propagate(this: AbstractState): boolean {
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

    for (const { id, relation, exact, left, right } of this.relations) {
      const lv = this.varOf(left)
      const rv = this.varOf(right)
      // Of a double's difference only one thing survives rounding, which is
      // monotone: where `x - y <= c` for a double `c`, the rounded `x - y` is
      // too, so the difference's bounds bound the term (and not the reverse).
      if (!exact) {
        if (relation === 'sub' && Option.isSome(lv) && Option.isSome(rv)) {
          tighten(id, ZERO, this.zone.rawBound(lv.value, rv.value))
          tighten(ZERO, id, this.zone.rawBound(rv.value, lv.value))
        }
        continue
      }
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
const cases = (
  branches: ReadonlyArray<AbstractState>,
  goal: Node.Node,
  splitsLeft: number,
): Verdict.Verdict<never> =>
  agree(
    branches.filter(branch => branch.propagate()).map(branch => branch.entails(goal, splitsLeft)),
  )

export function entails(
  this: AbstractState,
  goal: Node.Node,
  splitsLeft = MAX_SPLITS,
): Verdict.Verdict<never> {
  if (!this.propagate()) return proved('zone')
  const direct = this.decide(goal)
  const pending = this.pendingOrs[0]
  // A disjunction still to split may leave no case at all, where even a refuted goal holds.
  const settled = Verdict.isTrue(direct) || (Verdict.isFalse(direct) && pending === undefined)
  if (settled || splitsLeft <= 0) return direct
  if (pending !== undefined) {
    return cases(
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
  return Option.match(findSplittableMatchPath(this, goal), {
    onNone: () => direct,
    onSome: pk =>
      Option.match(matchCandidates(this, pk), {
        onNone: () => direct,
        onSome: candidates =>
          cases(
            candidates.map(candidate => withCandidate(this, pk, candidate)),
            goal,
            splitsLeft - 1,
          ),
      }),
  })
}

export function decide(this: AbstractState, goal: Node.Node): Verdict.Verdict<never> {
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
    Rows: ({ fold }) =>
      Verdict.Unknown(
        `rows.${fold} undecided in Tier 3`,
        Option.some({ kind: 'unsupported', detail: `rows.${fold}` }),
      ),
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
        Option.match(resolveMatchArm(match, value), {
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
      Match.valueTags(abstractOf(call.op, this.foreign), {
        Term: () => Verdict.Unknown('not a truth value'),
        Value: () => Verdict.Unknown(`${call.op.id} undecided in Tier 3`),
        Predicate: row => {
          if (call.op.nulls === 'strict') {
            const open = call.args.find(arg => !this.hasValue(arg))
            if (open !== undefined) return this.unvalued(open)
          }
          // Text holding a NUL is refused, which is neither true nor false.
          if (row.unportable && !call.args.every(arg => this.portable(arg))) {
            return Verdict.Unknown('an operand may be text holding a NUL')
          }
          // NaN is refused by equality and ordering operations, which is neither true nor false.
          if (refusesNaN.has(call.op.id) && !call.args.every(arg => notNaN.call(this, arg))) {
            return Verdict.Unknown('an operand may be NaN')
          }
          return row.decide(call.args, this)
        },
      }),
  })
}

export function entailsLeq(
  this: AbstractState,
  left: Node.Node,
  right: Node.Node,
  strict: boolean,
): Verdict.Verdict<never> {
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
