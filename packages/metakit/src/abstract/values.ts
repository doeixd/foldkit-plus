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

/** The predicates that refuse NaN, in either operand, besides refusing a refused one. */
const refusesNaN: ReadonlySet<string> = new Set([
  'ord.lt',
  'ord.lte',
  'ord.gt',
  'ord.gte',
  'eq.equals',
  'eq.among',
])

/** Whether `node` is never NaN: not a number, a finite one, or what an operation gave. */
function notNaN(this: AbstractState, node: Node.Node): boolean {
  return Node.$match(node, {
    Lit: ({ value }) =>
      Array.isArray(value) ? !value.some(item => Number.isNaN(item)) : !Number.isNaN(value),
    Path: path => Option.exists(this.fieldOf(path), info => info.kind !== 'number' || info.finite),
    // A number an operation gives is finite or refused, and its refusal is asked of separately.
    Call: () => true,
    If: () => false,
    Match: () => false,
    Opaque: () => false,
    Rows: () => false,
  })
}

/**
 * Whether `node` is known not to be refused, though it may be null: a read,
 * a term with a value, or a predicate over operands of which that is so and
 * that it refuses nothing of (no NUL text where it refuses one, no NaN where
 * it orders or compares numbers). What a refusal is not absorbed by.
 */
export function notRefused(this: AbstractState, node: Node.Node): boolean {
  if (isRead(node) || this.hasValue(node) || this.unrefused.has(Node.key(node))) return true
  if (!Node.$is('Call')(node) || Node.isForeign(node.op)) return false
  const row = abstractOf(node.op)
  return (
    row._tag === 'Predicate' &&
    node.args.every(arg => this.notRefused(arg)) &&
    (!row.unportable || node.args.every(arg => this.portable(arg))) &&
    (!refusesNaN.has(node.op.id) || node.args.every(arg => notNaN.call(this, arg)))
  )
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
          (info.kind === 'text' && info.nulFree) ||
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
