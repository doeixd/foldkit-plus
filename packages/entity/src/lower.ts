/**
 * Today's expression nodes as metakit nodes: step 4 of the kernel convergence
 * note (`docs/design/metakit-kernel-convergence-DESIGN.md`, "Which metakit
 * node does each entity node become?"). Each reader switches to read what
 * this gives while the constructors still build the old nodes; the last step
 * of the move deletes both.
 *
 * An expression reads the slices `row` (the judged row, stored form, the row
 * a `one` relation reaches under `@relation`, the rows pointing at it under
 * `<Entity.relation`), `next`, `input`, `viewer` (per Entity name, the
 * asker's row or null) and `now`; a filter of `Expr.exists` reads the
 * pointing row under `each`. `lowerEnv.ts` builds that environment from held
 * rows. No reader imports either file yet, so neither reaches a page.
 */
import { Match, Option, Schema } from 'effect'
import { Bool, Eq, Node, Null, Ord, Str } from 'metakit'
import type {
  AnyExpr,
  CompareOperator,
  OneRelation,
  Operandish,
  OperatorDescriptor,
  OrderTerm,
  Predicate,
} from './expr.js'
import type { AnyEntity } from './index.js'
import { folded, lowerCall } from './lowerOperator.js'

/** Every node `expr.ts` and `context.ts` define: a scalar or a predicate. */
export type EntityNode = AnyExpr | Predicate

/** The rows pointing at a row through `relation`, and every filter asked of them. */
export interface RelatedSlot {
  readonly relation: OneRelation
  readonly filters: ReadonlyArray<Option.Option<Predicate>>
}

/** What the translated nodes read past their own segments, for building their environment. */
export interface Lowered {
  /** The nodes given, translated, in order. */
  readonly nodes: ReadonlyArray<Node.Node>
  /** Each order term's key, folded under its collation, in order. */
  readonly keys: ReadonlyArray<Node.Node>
  /** By segment (`<Badge.member`), the relation whose rows it holds. */
  readonly related: ReadonlyMap<string, RelatedSlot>
  /** By name, each Entity whose row `viewer.<name>` holds. */
  readonly viewers: ReadonlyMap<string, AnyEntity>
  /** By name (`id@version`), each primitive operator called as a foreign operation. */
  readonly foreign: ReadonlyMap<string, OperatorDescriptor>
}

/** Where a translation is: which slice a field reads, and what it has met. */
interface Scope {
  readonly slice: 'row' | 'each'
  readonly related: Map<string, RelatedSlot>
  readonly viewers: Map<string, AnyEntity>
  readonly foreign: Map<string, OperatorDescriptor>
}

/** The segment under a row at which the row `relation` reaches is held. */
const hopSegment = (relation: OneRelation): string => `@${relation.key}`

/** The name a relation's pointing rows are held under, as the note writes it (`Follow.followee`). */
const relationName = (relation: OneRelation): string => `${relation.owner.name}.${relation.key}`

const read = (segments: ReadonlyArray<string>, schema: Schema.Top, nullable = false): Node.Node =>
  Node.Path({
    segments,
    ast: Option.some(
      nullable ? Schema.NullOr(Schema.toEncoded(schema)).ast : Schema.toEncoded(schema).ast,
    ),
  })

const callOf = (op: Node.AnyOp, args: ReadonlyArray<Node.Node>): Node.Node =>
  Node.Call({ op, args })

const numberOrder: { readonly [K in CompareOperator]: Node.Op } = {
  lt: Ord.ltOp,
  lte: Ord.lteOp,
  gt: Ord.gtOp,
  gte: Ord.gteOp,
}

const textOrder: { readonly [K in CompareOperator]: Node.Op } = {
  lt: Str.ltOp,
  lte: Str.lteOp,
  gt: Str.gtOp,
  gte: Str.gteOp,
}

/** `and` or `or` of two or more operands, joined left to right. */
const joined = (op: Node.Op, operands: ReadonlyArray<Node.Node>): Node.Node =>
  operands.reduce((left, right) => callOf(op, [left, right]))

/** The segments of the row `via` reaches from `start`. */
const hops = (start: ReadonlyArray<string>, via: ReadonlyArray<OneRelation>) => [
  ...start,
  ...via.map(hopSegment),
]

/**
 * One function per node kind. Typed by every tag, so a node kind added to
 * `expr.ts` does not compile until it is translated here.
 */
export type LowerTable = {
  readonly [K in EntityNode['_tag']]: (node: Extract<EntityNode, { readonly _tag: K }>) => Node.Node
}

const tableFor = (scope: Scope): LowerTable => {
  const lower = (node: Operandish): Node.Node => lowerNode(node, scope)
  return {
    Literal: ({ value }) => Node.Lit({ value }),
    Field: field => read([scope.slice, field.key], field.schema),
    Input: input => read(['input', input.key], input.schema),
    Next: ({ field }) => read(['next', field.key], field.schema),
    Now: now => read(['now'], now.schema),
    Viewer: viewer => {
      const entity = viewer.target()
      scope.viewers.set(entity.name, entity)
      return read(['viewer', entity.name, 'id'], viewer.schema, true)
    },
    Path: path => read([...hops([scope.slice], path.via), path.field.key], path.field.schema, true),
    ViewerPath: path => {
      const entity = path.viewer.target()
      scope.viewers.set(entity.name, entity)
      return read(
        [...hops(['viewer', entity.name], path.via), path.field.key],
        path.field.schema,
        true,
      )
    },
    Call: call => lowerCall(call, lower, scope.foreign),
    Test: test => lowerCall(test, lower, scope.foreign),
    Eq: ({ left, right }) => callOf(Eq.equalsOp, [lower(left), lower(right)]),
    Null: ({ operand, present }) => {
      const absent = callOf(Null.isNullOp, [lower(operand)])
      return present ? callOf(Bool.notOp, [absent]) : absent
    },
    Contains: ({ value, search }) =>
      callOf(Str.containsOp, [
        callOf(Str.lowerAsciiOp, [lower(value)]),
        callOf(Str.lowerAsciiOp, [lower(search)]),
      ]),
    In: ({ value, among }) => callOf(Eq.amongOp, [lower(value), lower(among)]),
    And: ({ operands }) => joined(Bool.andOp, operands.map(lower)),
    Or: ({ operands }) => joined(Bool.orOp, operands.map(lower)),
    Not: ({ operand }) => callOf(Bool.notOp, [lower(operand)]),
    Compare: ({ operator, left, right, collation }) =>
      Option.match(collation, {
        // A comparison carries a collation exactly when it compares text (`collationFor`).
        onNone: () => callOf(numberOrder[operator], [lower(left), lower(right)]),
        onSome: each =>
          callOf(textOrder[operator], [folded(each, lower(left)), folded(each, lower(right))]),
      }),
    Exists: exists => {
      const name = relationName(exists.relation)
      const segment = Node.relatedSegment(name)
      const known = scope.related.get(segment)
      if (known !== undefined && known.relation !== exists.relation) {
        throw new Error(
          `[foldkit-entity] lower: two relations are named ${name}; an environment holds the rows of one`,
        )
      }
      scope.related.set(segment, {
        relation: exists.relation,
        filters: [...(known?.filters ?? []), exists.where],
      })
      return Node.Rows({
        fold: 'any',
        over: Node.RowsOver.Related({
          of: Node.Path({ segments: hops([scope.slice], exists.via), ast: Option.none() }),
          relation: name,
        }),
        // The filter reads the pointing row's own fields and the input (`existsOf`).
        where: Option.map(exists.where, where => lowerNode(where, { ...scope, slice: 'each' })),
        value: Option.none(),
        set: [],
      })
    },
  }
}

const lowerNode = (node: Operandish, scope: Scope): Node.Node =>
  Match.valueTags(node, tableFor(scope))

/** The key a term orders by: its operand, its text folded under its collation. */
const keyOf = (term: OrderTerm, scope: Scope): Node.Node => {
  const key = lowerNode(term.expr, scope)
  return Option.match(term.collation, { onNone: () => key, onSome: each => folded(each, key) })
}

/**
 * `nodes` and the keys of `terms` (an order's, after `Query.orderFor`) as
 * metakit nodes, with what they read past their segments. Refuses a node no
 * reader in memory can hold: a backend's locale collation, two relations of
 * one name, a primitive operator whose result is not a number, a boolean or
 * text.
 */
export const lower = (
  nodes: ReadonlyArray<Operandish>,
  terms: ReadonlyArray<OrderTerm> = [],
): Lowered => {
  const scope: Scope = {
    slice: 'row',
    related: new Map(),
    viewers: new Map(),
    foreign: new Map(),
  }
  return {
    nodes: nodes.map(node => lowerNode(node, scope)),
    keys: terms.map(term => keyOf(term, scope)),
    related: scope.related,
    viewers: scope.viewers,
    foreign: scope.foreign,
  }
}
