/**
 * Whether a term of `AbstractState` has a value, and whether it holds no
 * text with a NUL: two of its methods, whose bodies are kept here to keep
 * each file reviewable, as `entail.ts` keeps others.
 */
import { Match, Option } from 'effect'
import * as Node from '../node.js'
import { countBounds, refusesNothing } from './lists.js'
import { resolveMatchArm } from './matches.js'
import { abstractOf } from './rowOf.js'
import type { AbstractState } from './state.js'
import { isRead } from './support.js'

/**
 * Whether `node` is known to evaluate to a value: not null (so no nullable
 * or absent operand reaches it), not refused, and not NaN.
 */
export function hasValue(this: AbstractState, node: Node.Node): boolean {
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
      // An insert's list is a written value, which was not refused: it has a value where its list has.
      const inserted = Option.filter(countBounds(call), bounds => bounds.kind === 'inserted')
      if (Option.isSome(inserted)) return this.hasValue(inserted.value.base)
      const settled = (arg: Node.Node): boolean => isRead(arg) || this.hasValue(arg)
      const row = abstractOf(call.op)
      if (row.unportable && !call.args.every(arg => this.portable(arg))) return false
      if (row._tag !== 'Term' && row.valued !== undefined) return row.valued(call.args, this)
      if (call.op.nulls === 'strict') {
        return call.args.every(arg => this.hasValue(arg)) && this.inRange(call)
      }
      return Match.valueTags(row, {
        Term: () => false,
        Value: () => false,
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
            Option.match(resolveMatchArm(match, value), {
              onNone: () => false,
              onSome: arm => this.hasValue(arm),
            }),
          ),
      }),
    Opaque: () => false,
    // A count of a list that has one, whose test can refuse for no element, is a number.
    Rows: rows =>
      rows.fold === 'count' &&
      this.hasValue(Node.rowsSource(rows.over)) &&
      Option.match(rows.where, { onNone: () => true, onSome: refusesNothing }),
  })
}

/**
 * Whether `node` holds no text with a NUL character, which a text or
 * equality operation refuses: a number, a boolean, a literal of none, a
 * value an operation gave (one that takes text refuses a NUL), or a term
 * such an operation took without refusing.
 */
export function portable(this: AbstractState, node: Node.Node): boolean {
  if (this.portableKeys.has(Node.key(node))) return true
  return Node.$match(node, {
    Lit: ({ value }) => !Node.holdsNul([value]),
    Path: path =>
      Option.match(this.fieldOf(path), {
        onNone: () => false,
        onSome: info =>
          info.kind === 'number' ||
          info.kind === 'boolean' ||
          info.kind === 'struct' ||
          (info.kind === 'literal' && !Node.holdsNul(Option.getOrElse(info.literals, () => []))),
      }),
    Call: ({ op, args }) => op.returns !== 'operand' || args.every(arg => this.portable(arg)),
    If: ({ then, otherwise }) => this.portable(then) && this.portable(otherwise),
    Match: ({ cases, otherwise }) =>
      cases.every(([, arm]) => this.portable(arm)) &&
      Option.match(otherwise, { onNone: () => true, onSome: arm => this.portable(arm) }),
    Opaque: () => false,
    Rows: ({ fold }) => fold !== 'find' && fold !== 'keep' && fold !== 'patch',
  })
}
