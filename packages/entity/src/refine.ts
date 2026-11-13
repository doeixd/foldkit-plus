/**
 * Refinements: a named state of an Entity's row (`Draft`, `Published`,
 * `InStock`), declared once on the Entity and read as a value. Not a
 * descriptor: every reader of an Entity would have to tell one apart, and one
 * that did not would treat `Draft` as `Product` and say nothing. A query, a
 * guard rule or a write's `from` and `becomes` read the predicate it holds.
 */
import { Match, Option, Schema } from 'effect'
import { Judge, OperatorMissingError, type Row } from './evaluate.js'
import {
  Expr,
  Query,
  nameNode,
  type FieldExpr,
  type NextExpr,
  type OneRelation,
  type Predicate,
  type Reads,
} from './expr.js'
import { Held } from './held.js'
import type { AnyEntity, EntityField, EntityIdentity, EntityMember } from './index.js'
import type { BeforeRow } from './invariant.js'
import { kernelOperators } from './memoryTable.js'
import type { MemoryOperators } from './operators.js'

type AnyField = EntityField<string, string, Schema.Constraint>

/**
 * A named state of `E`'s row. `Narrow` is what `is` narrows a row to: the
 * fields a literal form names, nothing for a predicate form.
 */
export interface Refinement<E extends AnyEntity, Name extends string, Narrow> {
  readonly _tag: 'Refinement'
  readonly entity: E
  readonly name: Name
  /** Over the row as stored: a `Query.where`, a guard row rule, a write's `when`. */
  readonly predicate: Predicate & Reads<E['name']>
  /**
   * Over the row a write leaves (each field as `Expr.next`): what an invariant
   * reads. Throws for a refinement that reaches another row.
   */
  readonly after: Predicate & Reads<E['name']>
  /** Whether it reads its own row alone: only such a one is a write's `from` or `becomes`. */
  readonly local: boolean
  /** The fields of its own row it reads, by key. */
  readonly reads: ReadonlyArray<string>
  /**
   * Whether a row (as an application holds it, decoded) is definitely in the
   * state, narrowing the fields a literal form names. False where it lacks a
   * field the state reads, and for a refinement reaching another row.
   */
  is<R extends object>(row: R): row is R & Narrow
}

export type AnyRefinement = Refinement<AnyEntity, string, unknown>

/** A refinement of the Entity named `Name`, as a write over any descriptor of it takes one. */
export type RefinementOf<E extends AnyEntity> = Refinement<
  AnyEntity & { readonly name: E['name'] },
  string,
  unknown
>

/** The literal form: a value per field, each typed by what the field stores. */
export type RefinementLiteral<E extends AnyEntity> = {
  readonly [K in keyof E['fields'] & string]?: Schema.Codec.Encoded<E['fields'][K]['schema']>
}

/** The predicate form: built over `row`, each field as `Expr.field`, and nothing of the past. */
export type RefinementBuild<E extends AnyEntity> = (rows: {
  readonly row: BeforeRow<E>
}) => Predicate & Reads<E['name']>

const declared = new WeakMap<EntityIdentity<string>, Array<AnyRefinement>>()

const fail = (entity: AnyEntity, name: string, message: string): never => {
  throw new Error(`[foldkit-entity] Entity.refine ${entity.name}.${name}: ${message}`)
}

/** The row `build` reads: each field, and each `one` relation as the id it points at, read by `read`. */
const rowOf = (
  entity: AnyEntity,
  read: (member: AnyField | OneRelation) => FieldExpr<unknown> | NextExpr<unknown>,
): Readonly<Record<string, unknown>> => {
  const relations = entity.relations as Readonly<Record<string, EntityMember>>
  const links = Object.values(relations).flatMap(member => {
    if (member._tag !== 'Relation' || member.cardinality !== 'one') return []
    return [member as OneRelation]
  })
  return Object.fromEntries([
    ...Object.entries(entity.fields as Readonly<Record<string, AnyField>>).map(
      ([key, field]) => [key, read(field)] as const,
    ),
    ...links.map(link => [link.key, read(link)] as const),
  ])
}

const literalPredicate = (
  entity: AnyEntity,
  name: string,
  literal: Readonly<Record<string, unknown>>,
  row: Readonly<Record<string, unknown>>,
): Predicate => {
  const fields = entity.fields as Readonly<Record<string, AnyField>>
  const checks = Object.entries(literal).map(([key, value]) => {
    if (!Object.hasOwn(fields, key)) return fail(entity, name, `"${key}" is not a field`)
    const stored = Schema.toEncoded(fields[key]!.schema as unknown as Schema.Top)
    if (!Schema.is(stored as Schema.Codec<unknown>)(value))
      fail(entity, name, `${JSON.stringify(value)} is no value "${key}" stores`)
    return value === null
      ? Expr.isNull(row[key] as FieldExpr<unknown>)
      : Expr.eq(row[key] as FieldExpr<unknown>, value as never)
  })
  if (checks.length === 0) fail(entity, name, 'the literal form names no field')
  return checks.length === 1 ? checks[0]! : Expr.and(checks[0]!, ...checks.slice(1))
}

/** A row as stored, held: a key it lacks is unheld, so a state reading it is undecided. */
const heldRow = (entity: AnyEntity, row: Row) =>
  Held.rows([{ entity, rows: [row], complete: false }]).rows(entity)[0]!

/** Whether a stored row is in the state: none where it lacks a field the state reads. */
const judged = (
  refinement: AnyRefinement,
  row: Row,
  operators: MemoryOperators,
): Option.Option<boolean> => {
  if (!refinement.local) return Option.none()
  try {
    const verdict = Judge.predicate(refinement.predicate, heldRow(refinement.entity, row), {
      operators,
    })
    return Match.valueTags(verdict, {
      Unknown: () => Option.none(),
      Known: ({ truth }) => Option.some(truth === true),
    })
  } catch (error) {
    if (error instanceof OperatorMissingError) return Option.none()
    throw error
  }
}

/**
 * Declares a named state of `entity`'s row, on the Entity itself (every
 * descriptor of it sees it), and returns it. The literal form is a value per
 * field (`{ status: 'draft' }`); the predicate form is built over `row`
 * (`({ row }) => Expr.gt(row.stock, row.reserved)`), and may reach another
 * row (`Expr.exists`, `Expr.path`), which makes it no write's `from` or
 * `becomes`. A name declared twice on one Entity throws.
 */
export function refine<
  E extends AnyEntity,
  const Name extends string,
  const L extends RefinementLiteral<E>,
>(
  entity: E,
  name: Name,
  literal: L & { readonly [K in Exclude<keyof L, keyof E['fields']>]: never },
): Refinement<E, Name, { readonly [K in keyof L]: L[K] }>
export function refine<E extends AnyEntity, const Name extends string>(
  entity: E,
  name: Name,
  build: RefinementBuild<E>,
): Refinement<E, Name, {}>
export function refine(
  entity: AnyEntity,
  name: string,
  form: Readonly<Record<string, unknown>> | RefinementBuild<AnyEntity>,
): AnyRefinement {
  if (name.length === 0) fail(entity, name, 'a state needs a name')
  const known = declared.get(entity.identity) ?? []
  if (known.some(state => state.name === name)) fail(entity, name, 'is declared twice')
  const build = (row: Readonly<Record<string, unknown>>): Predicate =>
    typeof form === 'function'
      ? (form({ row: row as BeforeRow<AnyEntity> }) as Predicate)
      : literalPredicate(entity, name, form, row)
  const predicate = build(rowOf(entity, member => Expr.field(member as never)))
  // `where` refuses a predicate over another Entity, which the type allows when it is unmarked.
  const read = Query.dependencies(Query.from(entity).pipe(Query.where(predicate)))
  if (read.inputs.length > 0)
    fail(entity, name, `reads the input ${read.inputs.join(', ')}; a state is of the row alone`)
  if (read.next.length > 0) fail(entity, name, 'reads the row after a write; build it over `row`')
  const local = read.reaches.length === 0
  // Built again over the row after, as an invariant's `after` is; a reach would still read the row before.
  const after = local
    ? Option.some(build(rowOf(entity, member => Expr.next(member as never) as never)))
    : Option.none<Predicate>()
  nameNode(predicate, `${entity.name}.${name}`)
  Option.map(after, node => nameNode(node, `next ${entity.name}.${name}`))
  const reads = Object.freeze(read.predicate.map(field => field.key))
  const refinement: AnyRefinement = Object.freeze({
    _tag: 'Refinement' as const,
    entity,
    name,
    predicate,
    get after(): Predicate {
      return Option.getOrElse(after, () =>
        fail(entity, name, 'reaches another row, so it has no row after a write'),
      )
    },
    local,
    reads,
    is: (row: object): row is never => {
      const fields = entity.fields as Readonly<Record<string, AnyField>>
      const values = row as Readonly<Record<string, unknown>>
      const stored: Record<string, unknown> = {}
      for (const key of reads) {
        if (!Object.hasOwn(values, key)) return false
        const encoded = Schema.encodeUnknownOption(
          fields[key]!.schema as unknown as Schema.Codec<unknown, unknown>,
        )(values[key])
        if (Option.isNone(encoded)) return false
        stored[key] = encoded.value
      }
      return Option.getOrElse(judged(refinement, stored, kernelOperators), () => false)
    },
  })
  declared.set(entity.identity, [...known, refinement])
  return refinement
}

/** Every state declared on the Entity, in the order they were declared. */
export const states = (entity: AnyEntity): ReadonlyArray<AnyRefinement> =>
  declared.get(entity.identity) ?? []

/**
 * Whether a row as stored (encoded, as `Entity.judge` reads it) is in the
 * state: none where the row lacks a field the state reads, an operator it calls
 * is not in `operators`, or the state reaches another row.
 */
export const inState = (
  refinement: AnyRefinement,
  row: Row,
  operators: MemoryOperators = kernelOperators,
): Option.Option<boolean> => judged(refinement, row, operators)

/** Refuses a refinement of another Entity, or one reaching another row, as a write's `role`. */
export const localTo = (
  entity: AnyEntity,
  refinement: AnyRefinement,
  role: 'from' | 'becomes',
): AnyRefinement => {
  if (refinement.entity.identity !== entity.identity)
    throw new Error(
      `[foldkit-entity] Write of ${entity.name}: its ${role} is ${refinement.entity.name}.${refinement.name}, a state of another Entity`,
    )
  if (!refinement.local)
    throw new Error(
      `[foldkit-entity] Write of ${entity.name}: its ${role} ${entity.name}.${refinement.name} reaches another row, and a writer judges the row it writes alone`,
    )
  return refinement
}
