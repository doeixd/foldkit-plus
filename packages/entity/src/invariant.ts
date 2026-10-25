/**
 * Invariants: what every stored row of an Entity must hold, and what every
 * change of one must, declared once on the Entity through its metadata and read
 * from there by each interpreter: the reference judge here, a Schema check, a
 * form, a server's writer.
 *
 * One is built over the row before a write (`before`, the Entity's fields) and
 * the row after it (`after`, each field as `Expr.next`). What it reads decides
 * when it is judged:
 *
 * ```text
 * reads `after` only  -> a state invariant: every create and update, a CHECK constraint
 * reads `before` too  -> a transition invariant: every update, which has a row before
 * ```
 *
 * It reads no input and no principal. Who may write is a guard's; whether a
 * write applies now is its `when`'s.
 */
import { Metadata } from 'foldkit-metadata'
import { Option, Schema, type SchemaAST } from 'effect'
import { truthOver, type Row } from './evaluate.js'
import { Expr, Query, type NextExpr, type Predicate, type Reads } from './expr.js'
// A cycle with `index.ts`, safe because `Entity` is read only when an invariant is attached.
import {
  Entity,
  type AnyEntity,
  type EntityField,
  type EntityInput,
  type InputMember,
} from './index.js'

type AnyField = EntityField<string, string, Schema.Constraint>

/** One invariant of an Entity, as its interpreters read it. */
export interface Invariant {
  /** Stable, unique within its Entity: what a refusal names, and forms and logs key on. */
  readonly id: string
  readonly predicate: Predicate
  /** What someone the rules let write is told when a write would break it. */
  readonly message: string
  /** The fields a form shows the failure beside. */
  readonly path: ReadonlyArray<string>
  /** The fields it reads of the row before a write; none for a state invariant. */
  readonly before: ReadonlyArray<string>
  /** The fields it reads of the row after. */
  readonly after: ReadonlyArray<string>
}

/** Each field as the row after a write holds it, which an invariant reads it through. */
export type AfterRow<E extends AnyEntity> = {
  readonly [K in keyof E['fields'] & string]: NextExpr<
    Schema.Schema.Type<E['fields'][K]['schema']>
  > &
    Reads<E['name']>
}

/** A row, or a change from one row to another, as an invariant is judged over it. */
export interface Change {
  readonly after: Row
  /** The row before an update; none for a create, which judges no transition invariant. */
  readonly before?: Row
}

const Invariants = Metadata.key<Invariant>('foldkit-entity/invariants', {
  // The same invariant reached twice (two annotated copies combined) is one.
  merge: values => [...new Set(values)],
  summarize: invariant => invariant.id,
})

/** What a row, or a change, comes to under an Entity's invariants. */
export type Judgement =
  | { readonly _tag: 'Valid' }
  | { readonly _tag: 'Invalid'; readonly failures: ReadonlyArray<Invariant> }
  /** Some invariant reads a field a row does not have, so validity is not known. */
  | { readonly _tag: 'Undecided'; readonly fields: ReadonlyArray<string> }

/** Whether an invariant reads the row before, and so is judged only where there is one. */
export const readsBefore = (held: Invariant): boolean => held.before.length > 0

/**
 * An invariant as declared: the step that attaches it to its Entity, carrying
 * its id, so a refusal is matched against the declaration rather than a
 * string spelled again (`Refusal.isInvalidBy(refusal, reservedWithinQuantity)`).
 */
export interface DeclaredInvariant<E extends AnyEntity> {
  (entity: E): E
  readonly id: string
}

const fail = (entity: AnyEntity, message: string): never => {
  throw new Error(`[foldkit-entity] Entity.invariant on ${entity.name}: ${message}`)
}

export const invariant = <E extends AnyEntity>(
  id: string,
  build: (rows: {
    readonly before: E['fields']
    readonly after: AfterRow<E>
  }) => Predicate & Reads<E['name']>,
  options: {
    readonly message: string
    readonly path?: ReadonlyArray<keyof E['fields'] & string>
  },
): DeclaredInvariant<E> =>
  Object.assign(
    (entity: E): E => {
      if (id.length === 0) fail(entity, 'an invariant needs an id')
      if (invariantsOf(entity).some(held => held.id === id))
        fail(entity, `"${id}" is declared twice`)
      const fields = entity.fields as Readonly<Record<string, E['fields'][string]>>
      const after = Object.fromEntries(
        Object.entries(fields).map(([key, field]) => [key, Expr.next(field)]),
      ) as unknown as AfterRow<E>
      const predicate = build({ before: entity.fields, after }) as Predicate
      // `where` refuses a predicate over another Entity, which the type allows when it is unmarked.
      const body = Query.from(entity).pipe(Query.where(predicate))
      const dependencies = Query.dependencies(body)
      if (dependencies.inputs.length > 0) {
        fail(
          entity,
          `"${id}" reads the input ${dependencies.inputs.join(', ')}; it judges stored rows`,
        )
      }
      const before = dependencies.predicate.map(field => field.key)
      const afterReads = dependencies.next.map(field => field.key)
      const path = options.path ?? [...new Set([...afterReads, ...before])]
      for (const key of path) {
        if (!Object.hasOwn(fields, key)) fail(entity, `"${id}"'s path names "${key}", not a field`)
      }
      return entity.pipe(
        Entity.annotate(
          Invariants.of(
            Object.freeze({
              id,
              predicate,
              message: options.message,
              path: Object.freeze([...path]),
              before: Object.freeze(before),
              after: Object.freeze(afterReads),
            }),
          ),
        ),
      ) as E
    },
    { id },
  )

export const invariantsOf = (entity: AnyEntity): ReadonlyArray<Invariant> =>
  Invariants.get(entity.metadata)

/** `judge` with the invariants given, as a binding that keeps them holds them. */
export const judgeAgainst = (invariants: ReadonlyArray<Invariant>, change: Change): Judgement => {
  const missing = new Set<string>()
  const failures: Array<Invariant> = []
  const { after, before } = change
  for (const held of invariants) {
    // A create has no row before, so a transition invariant has nothing to judge.
    if (readsBefore(held) && before === undefined) continue
    const absent = [
      ...held.after.filter(key => !Object.hasOwn(after, key)),
      ...held.before.filter(key => !Object.hasOwn(before ?? {}, key)),
    ]
    if (absent.length > 0) absent.forEach(key => missing.add(key))
    else if (truthOver(held.predicate, before ?? {}, {}, after) !== true) failures.push(held)
  }
  if (failures.length > 0) return { _tag: 'Invalid', failures }
  if (missing.size > 0) return { _tag: 'Undecided', fields: [...missing] }
  return { _tag: 'Valid' }
}

/**
 * A row, or a change, under every invariant (each row as the store holds it,
 * encoded): valid only when each is true. SQL's unknown, from a null, fails
 * one, as a `WHERE` drops the row; a field a row does not have leaves it
 * undecided, never valid. Without `before` (a create), transition invariants
 * are not judged.
 */
export const judge = (entity: AnyEntity, change: Change): Judgement =>
  judgeAgainst(invariantsOf(entity), change)

/**
 * The row an input's value describes, judged under its Entity's state
 * invariants: each key mapped to a field, encoded as the store holds it. An
 * invariant over a field the input does not set (an `Option` holding nothing, a
 * key left out) is undecided, so a partial input is never called valid on its
 * account. It has no row before, so it judges no transition.
 */
export const judgeInput = (
  input: EntityInput<AnyEntity, any, any>,
  value: Readonly<Record<string, unknown>>,
): Judgement => {
  const invariants = invariantsOf(input.entity)
  if (invariants.length === 0) return { _tag: 'Valid' }
  const members = input.members as Readonly<Record<string, InputMember>>
  const row: Record<string, unknown> = {}
  for (const [key, member] of Object.entries(members)) {
    if (member._tag !== 'Field' || !Object.hasOwn(value, key)) continue
    const encode = Schema.encodeUnknownOption(
      member.schema as unknown as Schema.Codec<unknown, unknown>,
    )
    const given = value[key]
    const held = Option.isOption(given) ? given : Option.fromUndefinedOr(given)
    // The value as the field holds it: itself for a field typed `Option`, else what it holds.
    // One the field cannot hold is no row the store would keep, so it decides nothing here.
    const stored = Option.orElse(encode(given), () => Option.flatMap(held, encode))
    Option.map(
      Option.flatMap(held, () => stored),
      encoded => {
        row[member.key] = encoded
      },
    )
  }
  return judgeAgainst(invariants, { after: row })
}

/**
 * The Entity's state invariants as an Effect Schema check over its row type:
 * each failure at its path, with its message. The value is encoded first,
 * field by field, so it is judged as the store would hold it.
 */
export const check = <E extends AnyEntity>(
  entity: E,
): SchemaAST.Filter<Schema.Schema.Type<E['schema']>> =>
  Schema.makeFilter(value => {
    const fields = entity.fields as Readonly<Record<string, AnyField>>
    const decoded = value as Readonly<Record<string, unknown>>
    const row: Record<string, unknown> = {}
    for (const [key, field] of Object.entries(fields)) {
      if (!Object.hasOwn(decoded, key)) continue
      row[key] = Schema.encodeUnknownSync(
        field.schema as unknown as Schema.Codec<unknown, unknown>,
      )(decoded[key])
    }
    const judged = judge(entity, { after: row })
    if (judged._tag !== 'Invalid') return undefined
    return judged.failures.flatMap((failure): ReadonlyArray<Schema.FilterIssue> =>
      failure.path.length === 0
        ? [failure.message]
        : failure.path.map(key => ({ path: [key], issue: failure.message })),
    )
  })
