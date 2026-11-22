/**
 * How a list is ordered: terms over its own row's fields and calls (`Order.asc`,
 * `Order.desc`), or an order its input chooses among (`Order.chosen`). A term
 * is query structure, not an expression: it holds one, a direction, where
 * rows without a value go, and how its text compares.
 */
import { Match, Option, type Schema } from 'effect'
import type { Node } from 'metakit'
import type { Collation } from '../collation.js'
import type { AnyEntity, EntityField } from '../index.js'
import {
  collationOf,
  exprOf,
  fieldNode,
  fieldOrigin,
  fieldRead,
  folded,
  kindOf,
  originTagged,
  originOf,
  toNode,
  type AnyExpr,
  type Expr,
  type InputExpr,
  type Predicate,
  type Reads,
  type ReadsOf,
} from './operand.js'
import { show } from './show.js'

/** One term of an ordering: an expression and the direction to read it in. */
export interface OrderTerm {
  readonly _tag: 'Term'
  readonly direction: 'asc' | 'desc'
  readonly expr: AnyExpr
  /**
   * Where rows without a value go, in the term's own direction. Databases
   * disagree when it is left unsaid (Postgres puts them last ascending, SQLite
   * first), so it is always said: last ascending and first descending unless
   * a term asks otherwise, which is Postgres's.
   */
  readonly nulls: 'first' | 'last'
  /**
   * How text compares, when the term orders text: the term's own, or its
   * field's. None leaves it to the backend, which a client cannot match.
   */
  readonly collation: Option.Option<Collation>
}

/** What a term may say besides its operand. */
export interface TermOptions {
  readonly nulls?: 'first' | 'last' | undefined
  /** Overrides the field's declared collation for this term. */
  readonly collation?: Collation | undefined
}

/** A field, an expression, or a predicate: what an order term takes, since no list orders by a link. */
type OwnOperand<T> = EntityField<string, string, Schema.Constraint> | Expr<T> | Predicate

/**
 * Refuses a call no reader could order alike: its result must be a number,
 * or text under a collation every reader shares. A field's text may be left
 * to the backend; a call's has no backend column to fall back on.
 */
export const orderableCall = (node: Node.Node, collation: Option.Option<Collation>): void => {
  const fail = (why: string): never => {
    throw new Error(`[foldkit-entity] Order: ${show(exprOf(node))} ${why}`)
  }
  const kind = kindOf(node)
  if (kind === 'number') return
  if (kind !== 'text') fail('is neither a number nor text, so it orders nowhere alike')
  Option.match(collation, {
    onNone: () =>
      fail(
        'is text with no collation, so backends would order it differently; give the term or its text Collation.binary or Collation.asciiFold',
      ),
    onSome: each => {
      if (each._tag === 'Locale') {
        fail(`is ordered by the backend's "${each.locale}" collation, which a call cannot carry`)
      }
    },
  })
}

/** Whether a node is an operator's call, which a term orders by as a value its row computes. */
const isCall = (node: Node.Node): boolean => Option.isSome(originTagged(node, 'Call'))

/** A term, its nulls placed by `options` or by the direction's default. */
export const term = (
  direction: 'asc' | 'desc',
  expr: AnyExpr,
  options: TermOptions = {},
): OrderTerm => {
  // A client could not place a row by a value another row holds, and a cursor
  // over one would page by what can change under it.
  const reaching = Option.flatMap(originOf(expr.node), origin =>
    Match.value(origin).pipe(
      Match.tags({
        Hop: () => Option.some('a path'),
        Exists: () => Option.some('a path'),
        ViewerHop: () => Option.some('a path from the viewer'),
      }),
      Match.orElse(() => Option.none<string>()),
    ),
  )
  Option.map(reaching, what => {
    throw new Error(
      `[foldkit-entity] Order: ${show(expr)} is ${what}; a list orders by its own row's fields`,
    )
  })
  const carried = Option.exists(fieldRead(expr.node), read => read.slice === 'next')
    ? Option.none<Collation>()
    : collationOf(expr.node)
  // A number orders alike everywhere, and Postgres refuses a collation on one: a
  // collation it would inherit from a call's text arguments is dropped.
  const number = kindOf(expr.node) === 'number'
  if (number && options.collation !== undefined) {
    throw new Error(
      `[foldkit-entity] Order: ${show(expr)} is a number, which needs no collation; a collation orders text`,
    )
  }
  const collation = number
    ? Option.none<Collation>()
    : Option.orElse(Option.fromUndefinedOr(options.collation), () => carried)
  if (isCall(expr.node)) orderableCall(expr.node, collation)
  return Object.freeze({
    _tag: 'Term',
    direction,
    expr,
    nulls: options.nulls ?? (direction === 'asc' ? 'last' : 'first'),
    collation,
  })
}

/** The key a term orders by: its expression, its text folded under its collation. */
export const keyOf = (orderTerm: OrderTerm): Node.Node =>
  Option.match(orderTerm.collation, {
    onNone: () => orderTerm.expr.node,
    onSome: each => folded(each, orderTerm.expr.node),
  })

/** How a list is sorted, as its input holds it: one of its named orders, which way, or none. */
export type ChosenSort<By extends string> = {
  readonly by: By
  readonly direction: 'asc' | 'desc'
} | null

/**
 * An ordering the input chooses: one of several named fields, which way, or
 * none. It is how a list sorts by what its reader picked, said in the body, so
 * the server and the client read one declaration of what each name means.
 */
export interface ChosenOrder {
  readonly _tag: 'Chosen'
  readonly sort: InputExpr<ChosenSort<string>>
  readonly choices: Readonly<Record<string, AnyExpr>>
}

/** One entry of a body's ordering: fixed, or chosen by the input. */
export type Ordering = OrderTerm | ChosenOrder

/**
 * What an order term orders by, refusing a link: a client holds a link as a
 * ref, not the id it orders by, so it could not place a row there.
 */
const orderOperand = (value: unknown, step: 'asc' | 'desc' | 'chosen'): AnyExpr => {
  // tag-check: open, an operand is any value a caller passed
  if ((value as { readonly _tag?: unknown } | null)?._tag === 'Relation') {
    throw new Error(
      `[foldkit-entity] Order.${step}: a list orders by its own fields, not by where a relation points`,
    )
  }
  return exprOf(toNode(value))
}

/** Smallest first; rows without a value last, unless `nulls` says first. */
export const asc = <E extends OwnOperand<any>>(
  expr: E,
  options?: TermOptions,
): OrderTerm & Reads<ReadsOf<E>> => term('asc', orderOperand(expr, 'asc'), options)

/** Largest first; rows without a value first, unless `nulls` says last. */
export const desc = <E extends OwnOperand<any>>(
  expr: E,
  options?: TermOptions,
): OrderTerm & Reads<ReadsOf<E>> => term('desc', orderOperand(expr, 'desc'), options)

/**
 * The order the input names, among `choices`: every name the sort can hold
 * maps to a field or a call that orders, so a name left out is a type error
 * here, not a query that silently orders by nothing. A `null` sort chooses
 * none, and the terms after it decide.
 *
 * ```ts
 * Query.orderBy(Order.chosen(input.sort, { title: Post.fields.title }))
 * ```
 */
export const chosen = <
  By extends string,
  const Choices extends { readonly [K in By]: OwnOperand<any> },
>(
  sort: InputExpr<ChosenSort<By>>,
  choices: Choices,
): ChosenOrder & Reads<ReadsOf<Choices[keyof Choices]>> => {
  const fields: Record<string, AnyExpr> = Object.create(null)
  for (const [name, choice] of Object.entries<OwnOperand<any>>(choices)) {
    const expr = orderOperand(choice, 'chosen')
    const field = Option.exists(fieldRead(expr.node), read => read.slice === 'row')
    if (!field && !isCall(expr.node)) {
      throw new Error(`[foldkit-entity] Order.chosen: "${name}" is neither a field nor a call`)
    }
    // Checked as a term now, so an alternative no input has chosen yet is refused where written.
    if (!field) orderableCall(expr.node, collationOf(expr.node))
    fields[name] = expr
  }
  return Object.freeze({
    _tag: 'Chosen',
    sort: sort as InputExpr<ChosenSort<string>>,
    choices: Object.freeze(fields),
  })
}

/** Each Entity's id tie-break, made once, so a resolved order reuses one term. */
const idTerms = new WeakMap<AnyEntity, OrderTerm>()

/** An Entity's id, ascending: the term every order ends on. */
export const idTermOf = (entity: AnyEntity): OrderTerm => {
  const known = idTerms.get(entity)
  if (known !== undefined) return known
  const id = entity.fields.id
  if (id === undefined) {
    throw new Error(`[foldkit-entity] ${entity.name} has no id field to break an order's ties by`)
  }
  const tieBreak = term('asc', exprOf(fieldNode(fieldOrigin(id), 'row')))
  idTerms.set(entity, tieBreak)
  return tieBreak
}
