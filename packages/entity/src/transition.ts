/**
 * Transitions: what every update of an Entity must hold over the row before
 * it and the row after. An invariant judges one row; a transition relates two
 * ("a shipped order stays shipped"), each of which may be valid on its own.
 *
 * A transition is built over the Entity's fields (`before`) and each field as
 * the row after holds it (`after`, `Expr.next`), so the reference evaluator
 * judges a change over two rows and an interpreter reads each after its own
 * way.
 */
import { Metadata } from 'foldkit-metadata'
import type { Schema } from 'effect'
import { supported, truthOver, type Row } from './evaluate.js'
import { Expr, Query, type NextExpr, type Predicate, type Reads } from './expr.js'
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
}

/** Each field as the row after an update holds it, which a transition reads it through. */
export type AfterRow<E extends AnyEntity> = {
  readonly [K in keyof E['fields'] & string]: NextExpr<
    Schema.Schema.Type<E['fields'][K]['schema']>
  > &
    Reads<E['name']>
}

const Transitions = Metadata.key<Transition>('foldkit-entity/transitions', {
  merge: values => [...new Set(values)],
  summarize: transition => transition.id,
})

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
      Object.entries(fields).map(([key, field]) => [key, Expr.next(field)]),
    ) as unknown as AfterRow<E>
    const predicate = build({ before: entity.fields, after }) as Predicate
    // `where` refuses a predicate over another Entity, which the type allows when it is unmarked.
    const body = Query.from(entity).pipe(Query.where(predicate))
    // A rule's judge runs what a query's does, and reads the row after too.
    const missing = Query.unsupported(body, [...supported, 'next'])
    if (missing.length > 0) fail(entity, `"${id}" needs ${missing.join(', ')}, which no judge runs`)
    const dependencies = Query.dependencies(body)
    if (dependencies.inputs.length > 0) {
      fail(
        entity,
        `"${id}" reads the input ${dependencies.inputs.join(', ')}; it judges stored rows`,
      )
    }
    const before = dependencies.predicate.map(field => field.key)
    const afterReads = dependencies.next.map(field => field.key)
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
  for (const held of transitions) {
    const absent = [
      ...held.before.filter(key => !Object.hasOwn(before, key)),
      ...held.after.filter(key => !Object.hasOwn(after, key)),
    ]
    if (absent.length > 0) absent.forEach(key => missing.add(key))
    else if (truthOver(held.predicate, before, {}, after) !== true) failures.push(held)
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
