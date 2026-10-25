/**
 * Transitions: what every update of an Entity must hold over the row before
 * it and the row after. An invariant judges one row; a transition relates two
 * ("a shipped order stays shipped"), each of which may be valid on its own.
 *
 * A transition is built over the Entity's fields (`before`) and one input
 * placeholder per field (`after`, keyed `after:<field>`), so the reference
 * evaluator judges a change as a row and an input, and an interpreter puts its
 * own scalar where each placeholder stands.
 */
import { Metadata } from 'foldkit-metadata'
import { Option, Schema } from 'effect'
import { assertSupported, truthOver, type Row } from './evaluate.js'
import {
  Expr,
  Query,
  type AnyExpr,
  type FieldExpr,
  type InputExpr,
  type Predicate,
  type Reads,
} from './expr.js'
// A cycle with `index.ts`, safe because `Entity` is read only when a transition is attached.
import { Entity, type AnyEntity } from './index.js'
import { invariantsOf, type Judgement } from './invariant.js'

/** One transition of an Entity, as its interpreters read it. */
export interface Transition {
  /** Unique within its Entity, among its invariants too: a refusal names it. */
  readonly id: string
  readonly predicate: Predicate
  readonly message: string
  readonly path: ReadonlyArray<string>
  /** The fields it reads of the row before. */
  readonly before: ReadonlyArray<string>
  /** The fields it reads of the row after. */
  readonly after: ReadonlyArray<string>
  /** Each field it reads after, as a scalar: what a write that leaves it alone leaves it as. */
  readonly fields: Readonly<Record<string, AnyExpr>>
}

/** The placeholders a transition reads the row after through, one per field. */
export type AfterRow<E extends AnyEntity> = {
  readonly [K in keyof E['fields'] & string]: InputExpr<
    Schema.Schema.Type<E['fields'][K]['schema']>
  >
}

const Transitions = Metadata.key<Transition>('foldkit-entity/transitions', {
  merge: values => [...new Set(values)],
  summarize: transition => transition.id,
})

const AFTER = 'after:'
const afterKey = (key: string): string => `${AFTER}${key}`
const afterField = (key: string): Option.Option<string> =>
  key.startsWith(AFTER) ? Option.some(key.slice(AFTER.length)) : Option.none()

const fail = (entity: AnyEntity, message: string): never => {
  throw new Error(`[foldkit-entity] Entity.transition on ${entity.name}: ${message}`)
}

export const transitionsOf = (entity: AnyEntity): ReadonlyArray<Transition> =>
  Transitions.get(entity.metadata)

export const transition =
  <E extends AnyEntity>(
    id: string,
    build: (rows: {
      readonly before: E['fields']
      readonly after: AfterRow<E>
    }) => Predicate & Reads<E['name']>,
    options: {
      readonly message: string
      readonly path?: ReadonlyArray<keyof E['fields'] & string>
    },
  ) =>
  (entity: E): E => {
    if (id.length === 0) fail(entity, 'a transition needs an id')
    const taken = [...transitionsOf(entity), ...invariantsOf(entity)]
    if (taken.some(held => held.id === id)) fail(entity, `"${id}" is declared twice`)
    const fields = entity.fields as Readonly<Record<string, E['fields'][string]>>
    const after = Object.fromEntries(
      Object.entries(fields).map(([key, field]) => [
        key,
        Expr.input(afterKey(key), field.schema as unknown as Schema.Codec<unknown, unknown>),
      ]),
    ) as unknown as AfterRow<E>
    const predicate = build({ before: entity.fields, after }) as Predicate
    // `where` refuses a predicate over another Entity, which the type allows when it is unmarked.
    const body = Query.from(entity).pipe(Query.where(predicate))
    assertSupported(body)
    const dependencies = Query.dependencies(body)
    const foreign = dependencies.inputs.filter(key => Option.isNone(afterField(key)))
    if (foreign.length > 0) {
      fail(entity, `"${id}" reads the input ${foreign.join(', ')}; it judges stored rows`)
    }
    const before = dependencies.predicate.map(field => field.key)
    const afterReads = dependencies.inputs.flatMap(key => Option.toArray(afterField(key)))
    const path = options.path ?? [...new Set([...before, ...afterReads])]
    for (const key of path) {
      if (!Object.hasOwn(fields, key)) fail(entity, `"${id}"'s path names "${key}", not a field`)
    }
    return entity.pipe(
      Entity.annotate(
        Transitions.of(
          Object.freeze({
            id,
            predicate,
            message: options.message,
            path: Object.freeze([...path]),
            before: Object.freeze(before),
            after: Object.freeze(afterReads),
            fields: Object.freeze(
              Object.fromEntries(afterReads.map(key => [key, Expr.field(fields[key]!)])),
            ),
          }),
        ),
      ),
    ) as E
  }

/** `judgeChange` with the transitions given, as a binding that keeps them holds them. */
export const judgeChangeAgainst = (
  transitions: ReadonlyArray<Transition>,
  before: Row,
  after: Row,
): Judgement<Transition> => {
  const missing = new Set<string>()
  const failures: Array<Transition> = []
  const input = Object.fromEntries(
    Object.entries(after).map(([key, value]) => [afterKey(key), value]),
  )
  for (const held of transitions) {
    const absent = [
      ...held.before.filter(key => !Object.hasOwn(before, key)),
      ...held.after.filter(key => !Object.hasOwn(after, key)),
    ]
    if (absent.length > 0) absent.forEach(key => missing.add(key))
    else if (truthOver(held.predicate, before, input) !== true) failures.push(held)
  }
  if (failures.length > 0) return { _tag: 'Invalid', failures }
  if (missing.size > 0) return { _tag: 'Undecided', fields: [...missing] }
  return { _tag: 'Valid' }
}

/**
 * The change from `before` to `after` (each as the store holds it) under every
 * transition: valid only when each is true, a null failing one, and undecided
 * when either row lacks a field one reads.
 */
export const judgeChange = (entity: AnyEntity, before: Row, after: Row): Judgement<Transition> =>
  judgeChangeAgainst(transitionsOf(entity), before, after)

/**
 * A transition as one statement judges an update: each field the write sets
 * read after as its new value, each in `moved` as the field under the key
 * `after:<field>` (for an interpreter to bind to its column moved by an
 * amount), and every other as the field itself, which the write leaves alone.
 */
export const changeOver = (
  held: Transition,
  values: Readonly<Record<string, unknown>>,
  moved: ReadonlySet<string>,
): Predicate =>
  Expr.substituteInputs(held.predicate, key =>
    Option.map(afterField(key), (field): AnyExpr => {
      if (Object.hasOwn(values, field)) return Expr.literal(values[field])
      const scalar = held.fields[field]!
      if (!moved.has(field)) return scalar
      return Object.freeze({ ...(scalar as FieldExpr<unknown>), key: afterKey(field) })
    }),
  )
