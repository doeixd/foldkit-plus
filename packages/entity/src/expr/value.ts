/** The plain operands an expression starts from: a constant, an input, a field, a field after a write. */
import { Match, type Schema } from 'effect'
import { Node } from 'metakit'
import { wrap } from 'metakit/build'
import type { AnyEntity, EntityField, EntityRelation } from '../index.js'
import {
  asOne,
  exprOf,
  fieldNode,
  fieldOrigin,
  linkOrigin,
  read,
  type EntityEnv,
  type Expr,
  type InputExpr,
  type Invalid,
  type LiteralExpr,
  type OneRelation,
  type Reads,
} from './operand.js'

/** A constant. Comparisons coerce a plain value, so this is rarely written. */
export const literal = <T>(value: T): LiteralExpr<T> =>
  Object.freeze({ ...wrap<EntityEnv, T>(Node.Lit({ value })), term: 'literal' as const })

/**
 * A value the query is given when it runs. A definition builds these from its
 * `Input` schema; written by hand only when constructing a body directly.
 */
export const input = <T>(key: string, schema: Schema.Codec<T, unknown>): InputExpr<T> =>
  Object.freeze({
    ...wrap<EntityEnv, T>(read(['input', key], schema)),
    term: 'input' as const,
    key,
  })

/** `Expr.field`: an Entity field, or an expression refused with what to write instead. */
interface FieldOf {
  <Name extends string, Key extends string, S extends Schema.Constraint>(
    field: EntityField<Name, Key, S>,
  ): Expr<Schema.Schema.Type<S>> & Reads<Name>
  (
    expression: Expr<unknown> &
      Invalid<'foldkit-entity: Expr.field takes an Entity field (Post.fields.title); before.x and after.x are expressions already, so compare them as they are'>,
  ): never
}

/**
 * One field of one Entity, as an expression. An expression is one already: an
 * invariant's `before.x` and `after.x` compare as they are, so wrapping one is
 * refused with that sentence.
 */
// The second signature only refuses, at compile time: nothing but a field reaches here.
export const field = ((member: EntityField<string, string, Schema.Constraint>) =>
  exprOf(fieldNode(fieldOrigin(member), 'row'))) as FieldOf

interface NextOf {
  <Name extends string, Key extends string, S extends Schema.Constraint>(
    field: EntityField<Name, Key, S>,
  ): Expr<Schema.Schema.Type<S>> & Reads<Name>
  <Name extends string, Key extends string, Optional extends boolean>(
    relation: EntityRelation<Name, Key, AnyEntity, 'one', Optional>,
  ): Expr<Optional extends true ? string | null : string> & Reads<Name>
}

/**
 * A field, or a `one` relation as the id it points at, as the row a write
 * would leave holds it: what `Entity.invariant`'s builder hands out as `after`.
 */
// A `one` relation is the id it points at, as everywhere else it is an operand.
export const next = ((member: EntityField<string, string, Schema.Constraint> | OneRelation) =>
  exprOf(
    fieldNode(
      Match.valueTags(member, {
        Field: fieldOrigin,
        Relation: relation =>
          linkOrigin(asOne('Expr.next', relation, ', which holds no one value')),
      }),
      'next',
    ),
  )) as NextOf
