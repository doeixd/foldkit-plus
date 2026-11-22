/**
 * Which rows a query is about, as a value (`Query.from`, `Query.where`,
 * `Query.orderBy`): an Entity to read, the predicates every row must satisfy,
 * and the order to read them in. It says nothing about which fields to
 * return, nor about pagination, liveness, or whether absence is an error.
 *
 * Composing one performs no work. `Query.from(Post)` names no table and opens
 * no connection; a reader turns the value into a query when something asks.
 */
import { Match, Option, Pipeable } from 'effect'
import { EntityTypeId } from '../ids.js'
import type { AnyEntity } from '../index.js'
import type { Refinement } from '../refine.js'
import { own } from '../record.js'
import { uncollatedText } from '../uncollated.js'
import {
  dependenciesOf,
  membersRead,
  missingFrom,
  writtenSize,
  type Operation,
  type QueryDependencies,
  type Walked,
} from './dependencies.js'
import {
  exprOf,
  fieldRead,
  maxQueryNodes,
  originOf,
  type Invalid,
  type Predicate,
  type ReadsOf,
} from './operand.js'
import {
  missingName,
  noOperators,
  operatorName,
  unsupportedIn,
  type OperatorTable,
} from './table.js'
import { idTermOf, term, type ChosenOrder, type OrderTerm, type Ordering } from './order.js'
import { isOr, show as showExpr } from './show.js'

/**
 * Which rows a query is about: an Entity, the predicates every row holds, and
 * the order to read them in.
 */
export interface Query<E extends AnyEntity> extends Pipeable.Pipeable {
  readonly _tag: 'Query'
  readonly entity: E
  /**
   * Every predicate holds: the list *is* the conjunction. Keeping it a list
   * rather than folding it into one `and` is what makes each `where` a reusable
   * fragment.
   */
  readonly where: ReadonlyArray<Predicate>
  /** In order of significance; a later `orderBy` appends less significant terms. */
  readonly orderBy: ReadonlyArray<Ordering>
}

/** A `Query` over any Entity, for the places that hold one without caring which. */
export type AnyQuery = Query<AnyEntity>

/**
 * Whether a client can order rows the way the server does, for one input: the
 * answer `Query.placement` gives, and the reason when it cannot.
 */
export type Placement =
  | { readonly _tag: 'Placeable' }
  | { readonly _tag: 'NotPlaceable'; readonly reason: string }

/**
 * Nothing when a query's predicates read its own Entity, none, or one unknown
 * to the type (checked at run time instead); else a failure naming both.
 */
type OverEntity<
  Names extends string,
  Name extends string,
  What extends string,
> = string extends Names
  ? unknown
  : [Names] extends [Name]
    ? unknown
    : Invalid<`foldkit-entity: ${What} reads ${Exclude<Names, Name>}, but the query is from ${Name}`>

/**
 * A query reads one Entity, so a predicate or ordering term naming a different
 * one cannot be answered. Compared by identity, not by name, because two
 * Entities defined with the same name are two Entities.
 */
const checkOwnership = (
  step: string,
  what: string,
  entity: AnyEntity,
  walked: ReadonlyArray<Walked>,
): void => {
  for (const field of membersRead(walked)) {
    if (field.owner.token !== entity.identity.token) {
      // The type compares names, so a namesake reaches here unrefused (#479).
      const namesake =
        field.owner.name === entity.name
          ? `: the field belongs to another Entity defined with that name, and two definitions are two Entities`
          : ''
      throw new Error(
        `[foldkit-entity] Query.${step}: ${what} reads ${field.owner.name}.${field.key}, but the query is from ${entity.name}${namesake}`,
      )
    }
  }
}

const QueryProto = {
  _tag: 'Query' as const,
  pipe() {
    return Pipeable.pipeArguments(this, arguments)
  },
}

const query = <E extends AnyEntity>(
  entity: E,
  where: ReadonlyArray<Predicate>,
  orderBy: ReadonlyArray<Ordering>,
): Query<E> =>
  Object.freeze(
    Object.assign(Object.create(QueryProto), {
      entity,
      where: Object.freeze(where),
      orderBy: Object.freeze(orderBy),
    }),
  ) as Query<E>

/**
 * Refuses a query whose predicates and order terms (every chosen alternative
 * among them) expand past `maxQueryNodes`, counting a shared node on every
 * path that reaches it: what a reader walks, and SQL writes out.
 */
const checkSize = (
  step: 'where' | 'orderBy',
  where: ReadonlyArray<Predicate>,
  orderBy: ReadonlyArray<Ordering>,
): void => {
  const sizes = new Map()
  const terms = orderBy.flatMap(ordering =>
    Match.valueTags(ordering, {
      Term: ({ expr }) => [expr],
      Chosen: ({ choices }) => Object.values(choices),
    }),
  )
  const size = [...where, ...terms].reduce((sum, each) => sum + writtenSize(each.node, sizes), 0)
  if (size > maxQueryNodes) {
    throw new Error(
      `[foldkit-entity] Query.${step}: the query expands to more than ${maxQueryNodes} nodes, counting a shared node on every path that reaches it`,
    )
  }
}

/** Whether `Query.from` was given a state of an Entity rather than an Entity. */
const isRefinement = <E extends AnyEntity>(
  source: E | Refinement<E, string, unknown>,
): source is Refinement<E, string, unknown> => !(EntityTypeId in source)

/**
 * Every row of an Entity, the query each transformation narrows; or every row
 * in a state of one (`Query.from(Draft)`), its predicate in `where`.
 */
export const from = <E extends AnyEntity>(source: E | Refinement<E, string, unknown>): Query<E> =>
  isRefinement(source) ? query(source.entity, [source.predicate], []) : query(source, [], [])

/**
 * Narrows to the rows the predicate holds for. Two `where`s conjoin (the
 * second never replaces the first), so a fragment can be written once and
 * piped into any query over the same Entity:
 *
 * ```ts
 * const published = Query.where(Expr.eq(Post.fields.published, true))
 * Query.from(Post).pipe(published, Query.where(byTitle))
 * ```
 */
export const where =
  <const P extends ReadonlyArray<Predicate>>(...predicates: P) =>
  <E extends AnyEntity>(
    self: Query<E> & OverEntity<ReadsOf<P[number]>, E['name'], 'a predicate'>,
  ): Query<E> => {
    if (predicates.length === 0) return self
    checkOwnership('where', 'a predicate', self.entity, predicates)
    const all = [...self.where, ...predicates]
    checkSize('where', all, self.orderBy)
    return query(self.entity, all, self.orderBy)
  }

/**
 * Reads the rows in this order. Two `orderBy`s append, so an earlier term
 * stays the more significant one and a later call adds a tie-breaker rather
 * than silently winning.
 */
export const orderBy =
  <const T extends ReadonlyArray<Ordering>>(...terms: T) =>
  <E extends AnyEntity>(
    self: Query<E> & OverEntity<ReadsOf<T[number]>, E['name'], 'an ordering term'>,
  ): Query<E> => {
    if (terms.length === 0) return self
    checkOwnership('orderBy', 'a term', self.entity, terms)
    const all = [...self.orderBy, ...terms]
    checkSize('orderBy', self.where, all)
    return query(self.entity, self.where, all)
  }

/** The fixed term a chosen order is for one input, or none for a `null` sort. */
const chosenTerms = (
  chosen: ChosenOrder,
  input: Readonly<Record<string, unknown>>,
): ReadonlyArray<OrderTerm> => {
  const sort = own(input, chosen.sort.key)
  if (sort === null || sort === undefined) return []
  const picked =
    typeof sort === 'object' && 'by' in sort && typeof sort.by === 'string' ? sort.by : undefined
  const direction = typeof sort === 'object' && 'direction' in sort ? sort.direction : undefined
  if (
    picked === undefined ||
    !Object.hasOwn(chosen.choices, picked) ||
    (direction !== 'asc' && direction !== 'desc')
  ) {
    throw new Error(
      `[foldkit-entity] Order.chosen: $${chosen.sort.key} names no order it offers (${Object.keys(chosen.choices).join(', ')})`,
    )
  }
  return [term(direction, chosen.choices[picked]!)]
}

/**
 * The fixed terms this query orders by for one input: each chosen order
 * resolved to the field its input names, or to nothing for a `null` sort,
 * and the Entity's id last, ascending, unless the terms already read it. So
 * the order is total, and every reader breaks ties the same way.
 */
export const orderFor = (
  self: AnyQuery,
  input: Readonly<Record<string, unknown>>,
): ReadonlyArray<OrderTerm> => {
  const terms = self.orderBy.flatMap(entry =>
    Match.valueTags(entry, {
      Term: each => [each],
      Chosen: each => chosenTerms(each, input),
    }),
  )
  // Every field an order reads is this Entity's: `orderBy` refuses another's.
  const endsOnId = terms.some(each =>
    Option.exists(
      fieldRead(each.expr.node),
      read => read.slice === 'row' && read.field.key === 'id',
    ),
  )
  return endsOnId ? terms : [...terms, idTermOf(self.entity)]
}

const neither = Option.some('it orders by something that is neither a field nor a call')

/** Why a term cannot be placed by a client running `operators`, if it cannot. */
const unplaceable = (orderTerm: OrderTerm, operators: OperatorTable): Option.Option<string> =>
  Option.match(originOf(orderTerm.expr.node), {
    onNone: () => neither,
    onSome: origin =>
      Match.value(origin).pipe(
        // Checked when the term was made: a number, or text under a shared collation.
        // Left is whether the client runs every primitive operator it calls.
        Match.tag('Call', () => {
          const missing = missingFrom(
            dependenciesOf(orderTerm.expr).operators,
            operators,
            operator => missingName(operator, operators),
          )
          return missing.length === 0
            ? Option.none<string>()
            : Option.some(
                `it orders by ${showExpr(orderTerm.expr)}, and this client does not run ${missing.join(', ')}`,
              )
        }),
        Match.tag('Field', ({ slice, field }) =>
          slice !== 'row'
            ? neither
            : Option.match(orderTerm.collation, {
                onNone: () => uncollatedText(orderTerm),
                onSome: collation =>
                  Match.valueTags(collation, {
                    Binary: () => Option.none<string>(),
                    AsciiFold: () => Option.none<string>(),
                    Locale: ({ locale }) =>
                      Option.some(
                        `it orders ${field.owner.name}.${field.key} by the backend's "${locale}" collation`,
                      ),
                  }),
              }),
        ),
        Match.orElse(() => neither),
      ),
  })

const placeable: Placement = Object.freeze({ _tag: 'Placeable' })
const notPlaceable = (reason: string): Placement => Object.freeze({ _tag: 'NotPlaceable', reason })

/**
 * Whether a client can order this query's rows exactly as the server does,
 * for one input: every term over a number or a boolean (a row may lack it),
 * or over text with a portable collation (`binary`, `asciiFold`), or a call
 * whose primitive operators the client's table (`operators`; none when not
 * given) runs. A body that names no order leaves it to the server, and is
 * never placeable.
 */
export const placement = (
  self: AnyQuery,
  input: Readonly<Record<string, unknown>>,
  options: { readonly operators?: OperatorTable | undefined } = {},
): Placement => {
  if (self.orderBy.length === 0) {
    return notPlaceable("its order is the server's: the body names none")
  }
  const operators = options.operators ?? noOperators
  for (const orderTerm of orderFor(self, input)) {
    const reason = unplaceable(orderTerm, operators)
    if (Option.isSome(reason)) return notPlaceable(reason.value)
  }
  return placeable
}

/**
 * What the whole query reads: the fields and inputs of every predicate and
 * every ordering term, and the operations it uses, with the fields also
 * split by role.
 */
export const dependencies = (self: AnyQuery): QueryDependencies => ({
  ...dependenciesOf(...self.where, ...self.orderBy),
  predicate: dependenciesOf(...self.where).fields,
  order: dependenciesOf(...self.orderBy).fields,
})

/**
 * Each operator the body calls, by name (`id`, or `id@version` past the
 * first), in the order it first calls them: a defined one, and each
 * primitive one its expansion calls.
 */
export const operators = (self: AnyQuery): ReadonlyArray<string> =>
  dependencies(self).operators.map(operatorName)

/**
 * The operations this query needs that `supported` does not list, in the
 * order the query uses them, then each primitive operator `operators` does
 * not implement, by name. Without `operators`, every primitive operator is
 * named: a list of operations implements none. Empty means an interpreter
 * declaring both can answer it.
 *
 * ```ts
 * const missing = Query.unsupported(body, ['eq', 'isNull', 'isNotNull'])
 * if (missing.length > 0) throw new Error(`cannot run ${missing.join(', ')}`)
 * ```
 */
export const unsupported = (
  self: AnyQuery,
  supported: ReadonlyArray<Operation>,
  table: OperatorTable = noOperators,
): ReadonlyArray<string> => unsupportedIn([...self.where, ...self.orderBy], supported, table)

/**
 * The whole query as readable text, one clause per line:
 *
 * ```text
 * FROM Post
 * WHERE Post.slug = $slug
 *   AND Post.published = true
 * ORDER BY Post.updatedAt DESC
 * ```
 *
 * For an explanation or a diagnostic, never for a reader that runs it. A
 * query with no `where` or no `orderBy` omits that line.
 */
export const show = (self: AnyQuery): string =>
  [
    `FROM ${self.entity.name}`,
    // Among several, an `or` is parenthesised: `WHERE a or b` over `AND c`
    // would read as `a or (b and c)`.
    ...self.where.map(
      (predicate, index) =>
        `${index === 0 ? 'WHERE' : '  AND'} ${
          isOr(predicate.node) && self.where.length > 1
            ? `(${showExpr(predicate)})`
            : showExpr(predicate)
        }`,
    ),
    ...(self.orderBy.length === 0
      ? []
      : [
          `ORDER BY ${self.orderBy
            .map(entry =>
              Match.valueTags(entry, {
                Term: each => `${showExpr(each.expr)} ${each.direction.toUpperCase()}`,
                Chosen: each =>
                  `$${each.sort.key} among (${Object.entries(each.choices)
                    .map(([name, field]) => `${name}: ${showExpr(field)}`)
                    .join(', ')})`,
              }),
            )
            .join(', ')}`,
        ]),
  ].join('\n')
