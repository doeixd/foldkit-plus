/** `AbstractState.fits`, kept apart from the class: `this` is the state. */
import { Option, Schema, SchemaAST } from 'effect'
import * as Node from '../node.js'
import { present } from '../ops/kind.js'
import { textChecksOf } from '../ops/textChecks.js'
import * as Str from '../ops/str.js'
import * as Verdict from '../verdict.js'
import { flat, isPrimitive, type FieldInfo, type FieldKind } from './fields.js'
import { abstractOf } from './rowOf.js'
import type { AbstractState } from './state.js'
import { agree, proved, refuted, show } from './support.js'

export function fits(
  this: AbstractState,
  value: Node.Node,
  info: FieldInfo,
): Verdict.Verdict<never> {
  const acceptsNull = flat(info.ast).some(SchemaAST.isNull)
  return Node.$match(value, {
    Lit: ({ value: literal }) =>
      Schema.is(Schema.make(info.ast))(literal ?? null) ? proved('concrete') : refuted(),
    Opaque: ({ name }) =>
      Verdict.Unknown(`opaque term "${name}"`, Option.some({ kind: 'opaque', detail: name })),
    Rows: ({ fold }) =>
      Verdict.Unknown(
        `the value of rows.${fold} is not bounded in Tier 3`,
        Option.some({ kind: 'unsupported', detail: `rows.${fold}` }),
      ),
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
    Path: path => fitsTerm.call(this, path, info, acceptsNull),
    Call: call => fitsTerm.call(this, call, info, acceptsNull),
  })
}

function fitsTerm(
  this: AbstractState,
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
  } else if (value.op.id !== 'null.coalesce') {
    state.markValued(value)
  } else {
    state.markNotNull(value)
  }
  if (!state.propagate()) return proved('zone')
  const source = state.fieldOf(value)
  const sourceKind = Option.match(source, { onNone: () => 'other', onSome: s => s.kind })
  const unknown = Verdict.Unknown(`"${show(value)}" is not known to be what the field takes`)
  const byKind: Readonly<Record<FieldKind, () => Verdict.Verdict<never>>> = {
    number: () => {
      const numeric =
        sourceKind === 'number' ||
        (Node.$is('Call')(value) && abstractOf(value.op, state.foreign)._tag === 'Term')
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
    text: () => {
      const target = present(info.ast)[0]!
      // One Schema object on both sides admits the same values.
      if (Option.exists(source, s => present(s.ast)[0] === target)) return proved('zone')
      const made = Node.$is('Call')(value) && value.op.returns === 'text'
      if (sourceKind !== 'text' && !made) return unknown
      const checks = textChecksOf(target)
      if (!checks.modelled) return unknown
      // A text operation refuses a NUL, so what it gives holds none.
      if (checks.nulFree && !made && !state.portable(value)) return unknown
      // A Schema counts UTF-16 units, at least one and at most two per character `str.len` counts.
      const length = Node.Call({ op: Str.lenOp, args: [value] })
      const lit = (bound: number): Node.Node => Node.Lit({ value: bound })
      return Verdict.and(
        checks.minLength > 0
          ? state.entailsLeq(lit(checks.minLength), length, false)
          : proved('interval'),
        Number.isFinite(checks.maxLength)
          ? state.entailsLeq(length, lit(Math.floor(checks.maxLength / 2)), false)
          : proved('interval'),
      )
    },
    literal: () => {
      const allowed: ReadonlyArray<unknown> = Option.getOrElse(info.literals, () => [])
      const held = Node.$is('Path')(value) ? state.eqFacts.get(Node.key(value)) : undefined
      // A fact holds text up to `wellFormed`: one holding U+FFFD may stand for a lone surrogate.
      const exact = typeof held !== 'string' || !held.includes('�')
      const possible =
        held !== undefined && isPrimitive(held) && exact
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
