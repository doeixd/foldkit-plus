/**
 * Invariants: what every stored row of an Entity must hold, judged over the
 * whole row a write would leave rather than the input it was given. Declared
 * once on the Entity, through its metadata, and read from there by each
 * interpreter: the reference judge here, a Schema check, a server's writer.
 *
 * An invariant reads the row's own fields and nothing else: no input, no
 * principal. Who may write is a guard's; whether a write applies now is its
 * `when`'s.
 */
import { Metadata } from 'foldkit-metadata'
import { Option, Schema, type SchemaAST } from 'effect'
import { assertSupported, truthOver, type Row } from './evaluate.js'
import { Query, type Predicate, type Reads } from './expr.js'
import { transitionsOf } from './transition.js'
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
  /** Stable, unique within its Entity: what forms and logs key on. */
  readonly id: string
  readonly predicate: Predicate
  /** What someone the rules let write is told when a write would break it. */
  readonly message: string
  /** The fields a form shows the failure beside. */
  readonly path: ReadonlyArray<string>
  /** The fields it reads, which a row must hold for it to be judged. */
  readonly reads: ReadonlyArray<string>
}

const Invariants = Metadata.key<Invariant>('foldkit-entity/invariants', {
  // The same invariant reached twice (two annotated copies combined) is one.
  merge: values => [...new Set(values)],
  summarize: invariant => invariant.id,
})

/** What a row, or a change, comes to under an Entity's invariants, or its transitions. */
export type Judgement<Failure = Invariant> =
  | { readonly _tag: 'Valid' }
  | { readonly _tag: 'Invalid'; readonly failures: ReadonlyArray<Failure> }
  /** Some invariant reads a field the row does not have, so validity is not known. */
  | { readonly _tag: 'Undecided'; readonly fields: ReadonlyArray<string> }

const fail = (entity: AnyEntity, message: string): never => {
  throw new Error(`[foldkit-entity] Entity.invariant on ${entity.name}: ${message}`)
}

export const invariant =
  <E extends AnyEntity>(
    id: string,
    build: (fields: E['fields']) => Predicate & Reads<E['name']>,
    options: {
      readonly message: string
      readonly path?: ReadonlyArray<keyof E['fields'] & string>
    },
  ) =>
  (entity: E): E => {
    if (id.length === 0) fail(entity, 'an invariant needs an id')
    const taken = [...invariantsOf(entity), ...transitionsOf(entity)]
    if (taken.some(held => held.id === id)) fail(entity, `"${id}" is declared twice`)
    const predicate = build(entity.fields) as Predicate
    // `where` refuses a predicate over another Entity, which the type allows when it is unmarked.
    const body = Query.from(entity).pipe(Query.where(predicate))
    assertSupported(body)
    const dependencies = Query.dependencies(body)
    if (dependencies.inputs.length > 0) {
      fail(
        entity,
        `"${id}" reads the input ${dependencies.inputs.join(', ')}; it judges stored rows`,
      )
    }
    const reads = dependencies.predicate.map(field => field.key)
    const path = options.path ?? reads
    for (const key of path) {
      if (!Object.hasOwn(entity.fields, key))
        fail(entity, `"${id}"'s path names "${key}", not a field`)
    }
    return entity.pipe(
      Entity.annotate(
        Invariants.of(
          Object.freeze({
            id,
            predicate,
            message: options.message,
            path: Object.freeze([...path]),
            reads: Object.freeze(reads),
          }),
        ),
      ),
    ) as E
  }

export const invariantsOf = (entity: AnyEntity): ReadonlyArray<Invariant> =>
  Invariants.get(entity.metadata)

/**
 * A stored row (each field as the store holds it, encoded) under every
 * invariant: valid only when each is true. SQL's unknown, from a null, fails an
 * invariant, as a `WHERE` drops the row; a field the row does not have leaves it
 * undecided, never valid.
 */
export const judge = (entity: AnyEntity, row: Row): Judgement =>
  judgeAgainst(invariantsOf(entity), row)

/** `judge` with the invariants given, as a binding that keeps them holds them. */
export const judgeAgainst = (invariants: ReadonlyArray<Invariant>, row: Row): Judgement => {
  const missing = new Set<string>()
  const failures: Array<Invariant> = []
  for (const held of invariants) {
    const absent = held.reads.filter(key => !Object.hasOwn(row, key))
    if (absent.length > 0) absent.forEach(key => missing.add(key))
    else if (truthOver(held.predicate, row) !== true) failures.push(held)
  }
  if (failures.length > 0) return { _tag: 'Invalid', failures }
  if (missing.size > 0) return { _tag: 'Undecided', fields: [...missing] }
  return { _tag: 'Valid' }
}

/**
 * The row an input's value describes, judged under its Entity's invariants:
 * each key mapped to a field, encoded as the store holds it. An invariant over
 * a field the input does not set (an `Option` holding nothing, a key left out)
 * is undecided, so a partial input is never called valid on its account.
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
  return judgeAgainst(invariants, row)
}

/**
 * The Entity's invariants as an Effect Schema check over its row type: each
 * failure at its path, with its message. The value is encoded first, field by
 * field, so it is judged as the store would hold it.
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
    const judged = judge(entity, row)
    if (judged._tag !== 'Invalid') return undefined
    return judged.failures.flatMap((failure): ReadonlyArray<Schema.FilterIssue> =>
      failure.path.length === 0
        ? [failure.message]
        : failure.path.map(key => ({ path: [key], issue: failure.message })),
    )
  })
