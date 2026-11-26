/**
 * Questions asked of the rows of another kind that point at a row
 * (`metakit/relation`): does any follow row point at this author with me as
 * its follower, how many lines does this order have, what do they sum to.
 *
 * A relation names the kind of the pointing rows and the field they point
 * by (`Follow.followee`), and the Schema of a pointing row. An environment
 * holds the rows pointing at a row under that row, at the segment
 * `<Follow.followee`, as `{ rows, whole }`, where `whole` says whether these
 * are all of them. Evaluation folds them; `Expr.judge` folds them where all
 * are held, and with some held answers `any` once one passes and `every`
 * once one fails; SQL writes a correlated subquery from a table of relations
 * (`Sql.toWhere`'s `relations`, `Drizzle.toWhere`'s); the checker and the
 * solver answer `Unknown`.
 *
 * A body reads the pointing row under `each`, and may read any slice but the
 * one the row asked about is in: SQL carries no second row into a subquery.
 */
import { Option } from 'effect'
import type { Schema } from 'effect'
import * as Node from './node.js'
import {
  assertCommutativeMonoid,
  bodyOf,
  currentEach,
  type CommutativeMonoid,
  type Each,
  type Outside,
} from './ops/arr.js'
import { toNode, wrap, type EnvOfInput, type ExprInput, type NullOf } from './ops/core.js'
import { readsOfNode } from './ops/reads.js'
import { loadRows } from './ops/rowsLoad.js'
import type { Expr } from './path.js'

/** Cardinality of a relation from parent to child rows. */
export type Cardinality = 'one' | 'optional' | 'many'

/** Referential action when the parent row is deleted. */
export type OnDelete = 'restrict' | 'cascade' | 'setNull'

/** A single field key or a composite tuple of field keys on `Row`. */
export type KeySpec<Row> =
  | (keyof Row & string)
  | readonly [keyof Row & string, ...(keyof Row & string)[]]

/** Optional relational metadata on a `Relation`. */
export interface RelationOptions {
  readonly cardinality?: Cardinality
  readonly foreignKey?: string | ReadonlyArray<string>
  readonly parentKey?: string | ReadonlyArray<string>
  readonly onDelete?: OnDelete
}

/** The rows of one kind pointing at a row of another through one of their fields. */
export interface Relation<Row> {
  readonly _tag: 'Relation'
  /** The kind and the field it points by, as `Follow.followee`. */
  readonly name: string
  /** The Schema of a pointing row. */
  readonly row: Schema.Codec<Row>
  /** Cardinality from parent row to pointing rows (`'one'`, `'optional'`, or `'many'`). */
  readonly cardinality?: Cardinality
  /** Foreign-key field(s) on the child row pointing to the parent. */
  readonly foreignKey?: string | ReadonlyArray<string>
  /** Primary/key field(s) on the parent row (default `'id'`). */
  readonly parentKey?: string | ReadonlyArray<string>
  /** Referential action when the parent row is deleted. */
  readonly onDelete?: OnDelete
}

/** Declare a relation: `Relation.make('Follow.followee', Follow, { cardinality: 'many' })`. */
export const make = <S extends Schema.Top>(
  name: string,
  row: S,
  options?: RelationOptions,
): Relation<S['Type']> => ({
  _tag: 'Relation',
  name,
  row: row as unknown as Schema.Codec<S['Type']>,
  ...(options?.cardinality === undefined ? {} : { cardinality: options.cardinality }),
  ...(options?.foreignKey === undefined ? {} : { foreignKey: options.foreignKey }),
  ...(options?.parentKey === undefined ? {} : { parentKey: options.parentKey }),
  ...(options?.onDelete === undefined ? {} : { onDelete: options.onDelete }),
})

/**
 * Declare a type-checked relation between a `parent` Schema and a `child`
 * Schema, verifying that `foreignKey` exists on `child` and `parentKey` exists
 * on `parent` (supporting both single and composite keys).
 */
export const define = <Parent extends Schema.Top, Child extends Schema.Top>(config: {
  readonly name: string
  readonly parent: Parent
  readonly child: Child
  readonly foreignKey: KeySpec<Child['Type']>
  readonly parentKey?: KeySpec<Parent['Type']>
  readonly cardinality?: Cardinality
  readonly onDelete?: OnDelete
}): Relation<Child['Type']> => {
  const fk = Array.isArray(config.foreignKey) ? config.foreignKey : [config.foreignKey]
  const pk =
    config.parentKey === undefined
      ? ['id']
      : Array.isArray(config.parentKey)
        ? config.parentKey
        : [config.parentKey]
  if (fk.length !== pk.length) {
    throw new Error(
      `[metakit] Relation.define("${config.name}"): foreignKey has ${fk.length} column(s) but parentKey has ${pk.length}.`,
    )
  }
  return make(config.name, config.child, {
    ...(config.cardinality === undefined ? {} : { cardinality: config.cardinality }),
    foreignKey: config.foreignKey,
    ...(config.parentKey === undefined ? {} : { parentKey: config.parentKey }),
    ...(config.onDelete === undefined ? {} : { onDelete: config.onDelete }),
  })
}

/**
 * Attach the rows pointing at `row` through `relation` for in-memory
 * evaluation and partial evaluation (`whole` defaults to `true`).
 */
export const withRows = <Target extends object, Row>(
  row: Target,
  relation: Relation<Row>,
  rows: ReadonlyArray<Row>,
  options?: { readonly whole?: boolean },
): Target =>
  ({
    ...row,
    [Node.relatedSegment(relation.name)]: { rows, whole: options?.whole ?? true },
  }) as Target

/** The row a question is asked of: an expression giving it, null where there is none. */
type RowInput = ExprInput<never, object | null>

/** A body over the pointing rows, which reads nothing of the slice the row asked of is in. */
const bodyOver = <Row>(
  of: Node.Node,
  relation: Relation<Row>,
  build: (each: Each<Row>) => unknown,
  name: string,
  each: string,
): Node.Node => {
  const body = bodyOf(
    Option.some(relation.row.ast),
    build as (each: Each<unknown>) => unknown,
    name,
    each,
  )
  const slice = Node.$is('Path')(of) ? of.segments[0] : undefined
  const reads = Option.getOrElse(readsOfNode(body), () => [])
  const own = reads.find(segments => slice !== undefined && segments[0] === slice)
  if (own !== undefined) {
    throw new Error(
      `[metakit] ${name}: a body over ${relation.name} reads "${own.join('.')}", in the slice of the row it is asked of; SQL carries no second row`,
    )
  }
  return body
}

const related = <Row>(
  fold: Node.RowsFold,
  of: RowInput,
  relation: Relation<Row>,
  parts: {
    readonly test?: ((each: Each<Row>) => unknown) | undefined
    readonly value?: ((each: Each<Row>) => unknown) | undefined
    readonly op?: Node.ForeignOp | undefined
  },
): Node.Node => {
  const row = toNode(of)
  const name = `Relation.${fold}`
  const each = currentEach()
  loadRows()
  return Node.Rows({
    fold,
    over: Node.RowsOver.Related({
      of: row,
      relation: relation.name,
      ...(relation.cardinality === undefined ? {} : { cardinality: relation.cardinality }),
    }),
    where: Option.map(Option.fromUndefinedOr(parts.test), test =>
      bodyOver(row, relation, test, name, each),
    ),
    value: Option.map(Option.fromUndefinedOr(parts.value), value =>
      bodyOver(row, relation, value, name, each),
    ),
    set: [],
    ...(parts.op === undefined ? {} : { op: parts.op }),
    ...(each === Node.EACH ? {} : { each }),
  })
}

type Test = ExprInput<never, boolean | null>
type Value = ExprInput<never, number | null>

/** Whether some row pointing at `of` through `relation` passes `test` (`exists`): false over none. */
export const any = <O extends RowInput, Row, R extends Test>(
  of: O,
  relation: Relation<Row>,
  test: (each: Each<Row>) => R,
): Expr<EnvOfInput<O> & Outside<EnvOfInput<R>>, boolean | NullOf<O>> =>
  wrap(related('any', of, relation, { test }))

/** Whether every row pointing at `of` passes `test`: true over none, and a null test fails. */
export const every = <O extends RowInput, Row, R extends Test>(
  of: O,
  relation: Relation<Row>,
  test: (each: Each<Row>) => R,
): Expr<EnvOfInput<O> & Outside<EnvOfInput<R>>, boolean | NullOf<O>> =>
  wrap(related('every', of, relation, { test }))

/** How many rows point at `of`, or how many of them pass `test`. */
export const count = <O extends RowInput, Row, R extends Test = true>(
  of: O,
  relation: Relation<Row>,
  test?: (each: Each<Row>) => R,
): Expr<EnvOfInput<O> & Outside<EnvOfInput<R>>, number | NullOf<O>> =>
  wrap(related('count', of, relation, { test }))

/** A fold of `value` over the rows pointing at `of` that pass `test`. */
type Numeric<Result> = <O extends RowInput, Row, V extends Value, R extends Test = true>(
  of: O,
  relation: Relation<Row>,
  value: (each: Each<Row>) => V,
  test?: (each: Each<Row>) => R,
) => Expr<EnvOfInput<O> & Outside<EnvOfInput<V>> & Outside<EnvOfInput<R>>, Result | NullOf<O>>

const numeric =
  (fold: Node.RowsFold) =>
  (
    of: RowInput,
    relation: Relation<unknown>,
    value: (each: Each<unknown>) => unknown,
    test?: (each: Each<unknown>) => unknown,
  ): Expr<unknown, unknown> =>
    wrap(related(fold, of, relation, { value, test }))

/** The total of `value` over the rows pointing at `of` that pass `test`: 0 over none. */
export const sum: Numeric<number> = numeric('sum') as Numeric<number>

/** The least `value` of the rows pointing at `of` that pass `test`: null over none. */
export const min: Numeric<number | null> = numeric('min') as Numeric<number | null>

/** The greatest `value` of the rows pointing at `of` that pass `test`: null over none. */
export const max: Numeric<number | null> = numeric('max') as Numeric<number | null>

/**
 * Fold `value` over the rows pointing at `of` that pass `test` using a
 * declared commutative-monoid operation `op`: returns `op`'s identity over no
 * rows and skips null contributions.
 */
export const reduce = <
  O extends RowInput,
  Row,
  Op extends CommutativeMonoid,
  V extends ExprInput<never, Schema.Schema.Type<Op['descriptor']['result']> | null>,
  R extends Test = true,
>(
  of: O,
  relation: Relation<Row>,
  op: Op,
  value: (each: Each<Row>) => V,
  test?: (each: Each<Row>) => R,
): Expr<
  EnvOfInput<O> & Outside<EnvOfInput<V>> & Outside<EnvOfInput<R>>,
  Schema.Schema.Type<Op['descriptor']['result']> | NullOf<O>
> => {
  assertCommutativeMonoid(op.descriptor, 'Relation.reduce')
  return wrap(related('reduce', of, relation, { op: op.descriptor, value, test }))
}
