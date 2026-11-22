/**
 * A write as a value: what an operation changes, declared over the input it
 * takes, so the changes can be known before it runs and its interpreters can
 * agree on what it means.
 *
 * A `Write` is built on `Entity.input`, which already says which input key is
 * which member of the Entity. `Write.update`, `Write.insert` and `Write.delete`
 * add what to do with them: the key that names the row, and optionally the key
 * holding the revision it was read at. Every other key mapped to a field is
 * set; a key mapped to `Entity.unmapped` is about the operation and is not
 * written.
 *
 * It is authority someone declared, never something derived from an Entity: an
 * Entity having a field does not mean anyone may set it.
 */
import { Data, Effect, Match, Option, Schema, SchemaAST } from 'effect'
import { Node, Num, Str } from 'metakit'
import { evalNode } from 'metakit/build'
import type {
  AnyEntity,
  EntityMember,
  EntityField,
  EntityInput,
  EntityRef,
  EntityRelation,
  InputMember,
} from './index.js'
import { dependenciesOf, type Operation } from './expr/dependencies.js'
import {
  exprOf,
  kindOf,
  originOf,
  originTagged,
  toNode,
  type AnyExpr,
  type InputExpr,
  type Predicate,
  type Reads,
} from './expr/operand.js'
import { add, sub } from './expr/arithmetic.js'
import { field as fieldExpr, input as inputExpr } from './expr/value.js'
import { callOperator, foldsArgument } from './expr/primitive.js'
import {
  from as queryFrom,
  where as queryWhere,
  dependencies as queryDependencies,
  type AnyQuery,
} from './expr/query.js'
import { foreignOf, readingOf } from './reading.js'
import { OperatorMissingError, refusedBy } from './queryErrors.js'
import type { BeforeRow, Invariant } from './invariant.js'
import {
  contextValue,
  matchContext,
  viewerIdOf,
  type ExprContext,
  type ViewerPathExpr,
} from './context.js'
import { Held, idOfRef } from './held.js'
import type { MemoryOperators } from './operators.js'
import { own, put } from './record.js'
import { SchemaShape } from './shape.js'
import type { ContextValue } from './sets.js'
import { Steps, steps } from './enumerate.js'
import { Footprint } from './footprint.js'
import { inState, localTo, type AnyRefinement, type RefinementOf } from './refine.js'

type AnyField = EntityField<string, string, Schema.Constraint>
type OneRelation = EntityRelation<string, string, AnyEntity, 'one', boolean>

/** One input key the write sets, and the field it sets. */
export interface WriteSet {
  readonly key: string
  readonly field: AnyField
}

/**
 * One input key holding an amount, and the field it moves. `integer` is whether
 * the amount's schema holds it to an integer (`Schema.isInt`): a writer over an
 * integer column refuses an increment without it, which the Entity cannot see.
 * `direction` is which way: `increment` adds the amount, `decrement` takes it
 * away, bound as the amount negated (`Write.bind`), so every writer adds.
 */
export interface WriteIncrement extends WriteSet {
  readonly integer: boolean
  readonly direction: 'increment' | 'decrement'
}

/**
 * One field the write computes (`label := concat(title, ' draft')`): an
 * expression over the row before the write and the input, every defined
 * operator in it expanded, so what is carried is primitive calls alone.
 */
export interface WriteAssignment {
  readonly field: AnyField
  readonly expr: AnyExpr
  /**
   * Whether `expr` comes to an integer, by the schemas of what it reads and
   * calls: a writer over an integer column refuses an assignment without it,
   * which the Entity cannot see.
   */
  readonly integer: boolean
}

/**
 * A computed assignment as data, bound to one input: what travels to a server
 * and sits in a client's pending patch, which holds no descriptor and no
 * function. A field of the row before the write, a stored value, or a call of
 * a primitive operator by name (`id`, or `id@version`). A collation is not
 * carried: text compared under one reaches the call folded, as a call of
 * `lowerAsciiName`.
 */
export type Computation = Data.TaggedEnum<{
  Field: { readonly key: string }
  Value: { readonly value: unknown }
  Call: {
    readonly operator: string
    readonly args: ReadonlyArray<Computation>
  }
}>
export const Computation = Data.taggedEnum<Computation>()

/** The wire name of the fold metakit's `str.lowerAscii` is: what an ASCII-folding collation writes. */
export const lowerAsciiName = 'text.lowerAscii'

/** One input key the write points at another row with: a `one` relation, by the target's id. */
export interface WriteLink {
  readonly key: string
  readonly relation: OneRelation
}

/** One member the write's context sets (`Entity.sets`): a field or a `one` relation, and its value. */
export interface ContextSet {
  readonly member: AnyField | OneRelation
  readonly value: ContextValue
}

/** What a declared write does to its row. */
export type WriteKind = 'Update' | 'Insert' | 'Delete'

/**
 * One row of an Entity, by id, from an operation's input: updated, inserted
 * with an id the client chose, or deleted. `Kind` is the one its constructor
 * made, so what it may be refused with can follow it.
 */
export interface Write<
  E extends AnyEntity,
  Fields extends Schema.Struct.Fields,
  Kind extends WriteKind = WriteKind,
> {
  readonly _tag: Kind
  readonly input: EntityInput<E, Fields, any>
  /** The input key holding the row's id, and the Entity's `id` field it is. */
  readonly id: WriteSet & { readonly key: keyof Fields & string }
  /**
   * The input key holding the revision the row was read at, and its field, when
   * the write is refused for a row that moved on since.
   */
  readonly expect: (WriteSet & { readonly key: keyof Fields & string }) | undefined
  /**
   * What the row must hold for the write to land, over the Entity, read
   * before the write and checked where it commits: an interpreter writes only
   * a row it holds of, and refuses the rest as unmet.
   */
  readonly when: Option.Option<AnyQuery>
  /**
   * The state the row must be in for the write to land (`from: Draft`): its
   * predicate is in `when` too, so a row in another state is refused as unmet.
   */
  readonly from: Option.Option<AnyRefinement>
  /**
   * The state every row the write can start from is in once it lands
   * (`becomes: Published`): proved where the write is declared, by
   * enumerating them, or, where enumeration cannot decide, kept by `ensures`.
   */
  readonly becomes: Option.Option<AnyRefinement>
  /**
   * The postcondition a `becomes` enumeration could not decide is held to
   * where the write commits: an invariant of this write alone, with the id
   * `becomes:<State>`, judged by each writer beside the Entity's invariants
   * and refused as `Invalid`. None for a write with no such claim.
   */
  readonly ensures: Option.Option<Invariant>
  /** The keys it sets, in the input's order. */
  readonly sets: ReadonlyArray<WriteSet>
  /**
   * The fields it moves by an amount the input holds (`stock + quantity`, or
   * `balance - amount` for a decrement), computed where the write commits: the
   * input key, the field it moves, and which way.
   */
  readonly increments: ReadonlyArray<WriteIncrement>
  /** The fields it computes, each from the row before the write and the input. */
  readonly assignments: ReadonlyArray<WriteAssignment>
  /** The `one` relations it points elsewhere, in the input's order. */
  readonly links: ReadonlyArray<WriteLink>
  /**
   * What the write's context sets where it lands (`Entity.sets`): an insert
   * every such member, an update those set `on: 'write'`, a delete none.
   */
  readonly context: ReadonlyArray<ContextSet>
}

export type AnyWrite = Write<AnyEntity, any>

/** A write declared with a precondition, so it may be refused as unmet. */
export type ConditionedWrite<
  E extends AnyEntity,
  Fields extends Schema.Struct.Fields,
  Kind extends WriteKind = WriteKind,
> = Write<E, Fields, Kind> & { readonly when: Option.Some<AnyQuery> }

interface RowOptions<Fields extends Schema.Struct.Fields> {
  readonly id: keyof Fields & string
  readonly expect?: keyof Fields & string
}

/** A write's states: the one it starts from, and, for an update or insert, the one it leaves. */
interface StateOptions<E extends AnyEntity> {
  readonly from?: RefinementOf<E> | undefined
  readonly becomes?: RefinementOf<E> | undefined
}

/** The keys of `Fields` whose values are numbers. */
type NumberKeys<Fields> = {
  [K in keyof Fields & string]: Fields[K] extends Schema.Top
    ? Schema.Schema.Type<Fields[K]> extends number
      ? K
      : never
    : never
}[keyof Fields & string]

/** An update's increments (or decrements): a number field of the Entity, by the input key holding the amount. */
export type WriteIncrements<E extends AnyEntity, Fields extends Schema.Struct.Fields> = {
  readonly [
    K in NumberKeys<{ [F in keyof E['fields']]: E['fields'][F]['schema'] }>
  ]?: NumberKeys<Fields>
}

/**
 * An update's computed fields: each a field of the Entity, by what it comes
 * to over the row before the write (`row`, each field as `Expr.field`) and
 * the input. Its kind is checked against the field's where it is declared.
 */
export type WriteComputations<E extends AnyEntity, Fields extends Schema.Struct.Fields> = {
  readonly [F in keyof E['fields'] & string]?: (context: {
    readonly row: BeforeRow<E>
    readonly input: {
      readonly [K in keyof Fields & string]: InputExpr<Schema.Schema.Type<Fields[K]>>
    }
  }) => AnyExpr
}

/** An update's options: a row's, what it moves by an amount, and what it computes. */
type UpdateOptions<
  E extends AnyEntity,
  Fields extends Schema.Struct.Fields,
> = RowOptions<Fields> & {
  readonly increment?: WriteIncrements<E, Fields>
  readonly decrement?: WriteIncrements<E, Fields>
  readonly compute?: WriteComputations<E, Fields>
  readonly becomes?: RefinementOf<E> | undefined
}

/** `update`: conditioned when given `when` or `from`, which the overloads tell apart. */
interface UpdateWrite {
  <E extends AnyEntity, Fields extends Schema.Struct.Fields>(
    input: EntityInput<E, Fields, any>,
    options: UpdateOptions<E, Fields> & {
      readonly when: WriteCondition<E, Fields>
      readonly from?: RefinementOf<E> | undefined
    },
  ): ConditionedWrite<E, Fields, 'Update'>
  <E extends AnyEntity, Fields extends Schema.Struct.Fields>(
    input: EntityInput<E, Fields, any>,
    options: UpdateOptions<E, Fields> & {
      readonly when?: undefined
      readonly from: RefinementOf<E>
    },
  ): ConditionedWrite<E, Fields, 'Update'>
  // `when?: undefined`, so an optional `when` in a variable cannot pick this one and lose `Unmet`.
  <E extends AnyEntity, Fields extends Schema.Struct.Fields>(
    input: EntityInput<E, Fields, any>,
    options: UpdateOptions<E, Fields> & { readonly when?: undefined; readonly from?: undefined },
  ): Write<E, Fields, 'Update'>
}

/** `delete`: conditioned when given `when` or `from`, as an update is. */
interface DeleteWrite {
  <E extends AnyEntity, Fields extends Schema.Struct.Fields>(
    input: EntityInput<E, Fields, any>,
    options: RowOptions<Fields> & {
      readonly when: WriteCondition<E, Fields>
      readonly from?: RefinementOf<E> | undefined
    },
  ): ConditionedWrite<E, Fields, 'Delete'>
  <E extends AnyEntity, Fields extends Schema.Struct.Fields>(
    input: EntityInput<E, Fields, any>,
    options: RowOptions<Fields> & { readonly when?: undefined; readonly from: RefinementOf<E> },
  ): ConditionedWrite<E, Fields, 'Delete'>
  <E extends AnyEntity, Fields extends Schema.Struct.Fields>(
    input: EntityInput<E, Fields, any>,
    options: RowOptions<Fields> & { readonly when?: undefined; readonly from?: undefined },
  ): Write<E, Fields, 'Delete'>
}

// `declared` sets `when` exactly when `when` or `from` is given, which is what the overloads say.
const update: UpdateWrite = (
  input: EntityInput<AnyEntity, any, any>,
  options: UpdateOptions<AnyEntity, any> & StateOptions<AnyEntity>,
) =>
  becoming(
    settingSomething(
      Object.freeze({
        ...declared('Update', input, options),
        context: contextOf(input.entity, 'write'),
      }),
    ),
  ) as never

const remove: DeleteWrite = (
  input: EntityInput<AnyEntity, any, any>,
  options: RowOptions<any> & { readonly from?: RefinementOf<AnyEntity> | undefined },
) => {
  const write = declared('Delete', input, options)
  const named = [...write.sets, ...write.links][0]
  if (named !== undefined) fail(input, `a delete sets nothing, but "${named.key}" is mapped`)
  return write as never
}

/**
 * A write's precondition: a predicate over its Entity's row before the write
 * (`row`, each field as `Expr.field`, as `compute` reads it; or the Entity's
 * own fields), given one placeholder per input key, as a `Query.define` body
 * is. It is built once, so `input` stands for what the write will be given:
 * `({ row, input }) => Expr.lte(input.amount, row.balance)`.
 */
export type WriteCondition<E extends AnyEntity, Fields extends Schema.Struct.Fields> = (context: {
  readonly row: BeforeRow<E>
  readonly input: {
    readonly [K in keyof Fields & string]: InputExpr<Schema.Schema.Type<Fields[K]>>
  }
}) => Predicate & Reads<E['name']>

/** One row's new values, in the store's wire shape: what a client patches and a server writes. */
export interface BoundWrite {
  readonly entity: string
  readonly id: string
  readonly values: Readonly<Record<string, unknown>>
  /**
   * Each `one` relation it points, by the relation's key: the row it points at,
   * or none for an optional relation set to nothing. How a ref is carried (a
   * key on the wire, a foreign key in a table) is each interpreter's.
   */
  readonly links: Readonly<Record<string, Option.Option<EntityRef>>>
  /** Each field it moves, by the amount, encoded (a decrement's negated): added by the server, and predicted over what a client holds. */
  readonly increments: Readonly<Record<string, number>>
  /** Each field it computes, as data: run by the server where it writes, predicted by a client. */
  readonly assignments: Readonly<Record<string, Computation>>
}

const fail = (input: EntityInput<AnyEntity, any, any>, message: string): never => {
  throw new Error(`[foldkit-entity] Write of ${input.entity.name}: ${message}`)
}

/** The context terms (`Expr.viewer`, `Expr.now`) an expression's reads include. */
const contextTerms = (reads: { readonly operations: ReadonlyArray<Operation> }) =>
  reads.operations.filter(operation => operation === 'viewer' || operation === 'now')

const membersOf = (
  input: EntityInput<AnyEntity, any, any>,
): Readonly<Record<string, InputMember | undefined>> => input.members

/** A field's value as the store holds it. A field's schema needs no service, so none is asked. */
const encoded = (field: AnyField, value: unknown): unknown =>
  Schema.encodeUnknownSync(field.schema as unknown as Schema.Codec<unknown, unknown>)(value)

/**
 * A key's value as given, when it was: an absent key, and an `Option` that
 * holds nothing, give none, and a `Some` what it holds. What `Entity.input`
 * lets a key map itself to, a write can bind.
 */
const given = (value: unknown): Option.Option<unknown> => {
  if (value === undefined) return Option.none()
  return Option.isOption(value) ? value : Option.some(value)
}

const fieldAt = (input: EntityInput<AnyEntity, any, any>, key: string, role: string): AnyField => {
  const member = own(membersOf(input), key)
  if (member === undefined) return fail(input, `${role} "${key}" is not a key of the input`)
  const unmapped = () => fail(input, `${role} "${key}" is not mapped to a field`)
  return Match.valueTags(member, {
    Field: field => field,
    Unmapped: unmapped,
    RelationInput: unmapped,
    NestedInput: unmapped,
  })
}

/**
 * What every kind shares: the key naming the row, the expected revision, and
 * what the other keys set or point. A kind adds its own checks.
 */
const declared = <E extends AnyEntity, Fields extends Schema.Struct.Fields, Kind extends WriteKind>(
  kind: Kind,
  input: EntityInput<E, Fields, any>,
  options: {
    readonly id: keyof Fields & string
    readonly expect?: keyof Fields & string
    readonly when?: WriteCondition<E, Fields> | undefined
    readonly from?: RefinementOf<E> | undefined
    readonly becomes?: RefinementOf<E> | undefined
    readonly increment?: Readonly<Record<string, string | undefined>>
    readonly decrement?: Readonly<Record<string, string | undefined>>
    readonly compute?: WriteComputations<E, Fields> | undefined
  },
): Write<E, Fields, Kind> => {
  const id = fieldAt(input, options.id, 'id')
  if (id.key !== 'id') fail(input, `id "${options.id}" is mapped to "${id.key}", not to "id"`)
  const idSchema = input.schema.fields[options.id] as unknown as Schema.Top
  const takes = Schema.is(Schema.toType(idSchema) as Schema.Codec<unknown>)
  if (SchemaAST.isOptional(idSchema.ast) || takes(undefined) || takes(Option.none()))
    fail(input, `id "${options.id}" may be absent, and a declared write names its row`)
  if (options.expect === options.id) fail(input, 'expect cannot be the id')
  const expect =
    options.expect === undefined
      ? undefined
      : Object.freeze({ key: options.expect, field: fieldAt(input, options.expect, 'expect') })
  const sets: Array<WriteSet> = []
  const links: Array<WriteLink> = []
  for (const [key, member] of Object.entries(membersOf(input))) {
    if (member === undefined || key === options.id || key === options.expect) continue
    switch (member._tag) {
      case 'Field':
        sets.push(Object.freeze({ key, field: member }))
        break
      case 'Unmapped':
        break
      case 'RelationInput':
        if (member.relation.cardinality !== 'one') {
          fail(input, `"${key}" is a many relation; a write points one relation at a time`)
        }
        links.push(Object.freeze({ key, relation: member.relation as OneRelation }))
        break
      case 'NestedInput':
        fail(input, `"${key}" writes a nested row; a write writes its own row only`)
    }
  }
  const placeholders: Record<string, InputExpr<unknown>> = Object.create(null)
  for (const [key, schema] of Object.entries(input.schema.fields)) {
    placeholders[key] = inputExpr(key, schema as unknown as Schema.Codec<unknown, unknown>)
  }
  const from = Option.map(Option.fromUndefinedOr(options.from), state =>
    localTo(input.entity, state as AnyRefinement, 'from'),
  )
  const becomes = Option.map(Option.fromUndefinedOr(options.becomes), state =>
    localTo(input.entity, state as AnyRefinement, 'becomes'),
  )
  const fields = input.entity.fields as Readonly<Record<string, E['fields'][string]>>
  const row = Object.fromEntries(
    Object.entries(fields).map(([key, field]) => [key, fieldExpr(field)]),
  ) as unknown as BeforeRow<E>
  // The `from` state's predicate joins the `when`, so another state is refused as unmet.
  const conditions = [
    ...Option.toArray(Option.map(from, state => state.predicate as Predicate)),
    ...Option.toArray(
      Option.map(
        Option.fromUndefinedOr(options.when),
        condition => condition({ row, input: placeholders as never }) as Predicate,
      ),
    ),
  ]
  // A precondition is judged on the row before the write and the input alone.
  const asking = contextTerms(dependenciesOf(...conditions))
  if (asking.length > 0) {
    fail(
      input,
      `its \`when\` reads ${asking.map(term => `Expr.${term}`).join(' and ')}; a precondition reads the row and the input only, and a guard rule says who is asking`,
    )
  }
  // `where` refuses a predicate over another Entity, which the type allows when it is unmarked.
  const when =
    conditions.length === 0
      ? Option.none<AnyQuery>()
      : Option.some(queryFrom(input.entity).pipe(queryWhere(...conditions)) as AnyQuery)
  const increments: Array<WriteIncrement> = []
  for (const direction of ['increment', 'decrement'] as const) {
    for (const [fieldKey, key] of Object.entries(options[direction] ?? {})) {
      if (key !== undefined)
        increments.push(incrementOf(input, fieldKey, key, direction, { expect, sets, increments }))
    }
  }
  const computes: ReadonlyArray<
    readonly [string, WriteComputations<E, Fields>[keyof E['fields'] & string]]
  > = Object.entries(options.compute ?? {})
  const assignments = computes.flatMap(([fieldKey, compute]) =>
    compute === undefined
      ? []
      : [
          assignmentOf(input, fieldKey, () => compute({ row, input: placeholders as never }), {
            expect,
            sets,
            increments,
          }),
        ],
  )
  // What the context sets is never the input's, on any write.
  const written = [
    ...sets.map(set => set.field.key),
    ...links.map(link => link.relation.key),
    ...increments.map(increment => increment.field.key),
    ...assignments.map(assignment => assignment.field.key),
  ].find(key => Object.hasOwn(input.entity.sets, key))
  if (written !== undefined)
    fail(input, `"${written}" is set by the write's context (Entity.sets); no input sets it`)
  return Object.freeze({
    _tag: kind,
    input,
    id: Object.freeze({ key: options.id, field: id }),
    expect,
    when,
    from,
    becomes,
    ensures: Option.none(),
    sets: Object.freeze(sets),
    increments: Object.freeze(increments),
    assignments: Object.freeze(assignments),
    links: Object.freeze(links),
    context: [],
  })
}

/**
 * What the context sets on a write of `entity`: every member on an insert
 * (`create`), those set `on: 'write'` on an update (`write`).
 */
const contextOf = (entity: AnyEntity, on: 'create' | 'write'): ReadonlyArray<ContextSet> => {
  const relations: Readonly<Record<string, EntityMember>> = entity.relations
  const fields: Readonly<Record<string, AnyField>> = entity.fields
  // `Entity.sets` took a field, or a `one` relation.
  return Object.entries(entity.sets).flatMap(([key, set]) =>
    on === 'write' && set.on === 'create'
      ? []
      : [
          Object.freeze({
            member: Object.hasOwn(relations, key) ? (relations[key] as OneRelation) : fields[key]!,
            value: set.value,
          }),
        ],
  )
}

/** The kind of one stored form, as far as an assignment must agree with its field. */
const storedKind = (ast: SchemaAST.AST): string => {
  if (SchemaAST.isNull(ast)) return 'null'
  const literal = SchemaAST.isLiteral(ast) ? typeof ast.literal : undefined
  if (SchemaAST.isNumber(ast) || literal === 'number') return 'number'
  if (SchemaAST.isString(ast) || SchemaAST.isTemplateLiteral(ast) || literal === 'string') {
    return 'text'
  }
  if (SchemaAST.isBoolean(ast) || literal === 'boolean') return 'boolean'
  return 'other'
}

/** What a write's context comes to: see `Write.contextValues`. */
export interface ContextValues {
  readonly values: Readonly<Record<string, unknown>>
  readonly links: Readonly<Record<string, Option.Option<EntityRef>>>
  readonly unfilled: ReadonlyArray<string>
}

/**
 * One member of one row, as a holder has it: a field's encoded value, or a
 * `one` relation's ref key (`'User:ada'`) or null; unheld where it lacks it. A
 * server reads every row its asker may see, and reads a hidden one as null.
 */
export type ContextRead<E, R> = (row: EntityRef, key: string) => Effect.Effect<Held<unknown>, E, R>

/**
 * What a path from the viewer reads: null for a visitor or a viewer of
 * another Entity, or where a link is null; unheld where `read` lacks a row.
 */
const walked = <E, R>(
  value: ViewerPathExpr<unknown>,
  by: ExprContext,
  read: ContextRead<E, R>,
): Effect.Effect<Held<unknown>, E, R> => {
  const path = viewerHopOf(value)
  return Option.match(viewerIdOf(path.viewer, by), {
    onNone: () => Effect.succeed(Held.of(null)),
    onSome: id =>
      Effect.gen(function* () {
        let at: EntityRef = { entity: path.viewer.name, id }
        for (const relation of path.via) {
          const link = yield* read(at, relation.key)
          if (link._tag === 'Unheld') return link
          if (link.value === null || link.value === undefined) return Held.of(null)
          at = {
            entity: relation.target().name,
            id: idOfRef(link.value, `${relation.owner.name}.${relation.key}`),
          }
        }
        const end = yield* read(at, path.field.key)
        return Held.match(end, {
          onHeld: value => Held.of(value ?? null),
          onUnheld: () => end,
        })
      }),
  })
}

/** What a path from the viewer reads: the viewer's Entity, the relations from it, the field. */
const viewerHopOf = (value: ViewerPathExpr<unknown>) =>
  Option.getOrThrowWith(
    originTagged(value.node, 'ViewerHop'),
    () => new Error('[foldkit-entity] a path from the viewer was not built by Expr.path'),
  )

/** Whether a field stores a null. */
const holdsNull = (field: AnyField): boolean =>
  storedKinds(Schema.toEncoded(field.schema as unknown as Schema.Top).ast).has('null')

/** Every kind a stored form may hold: a union's members' kinds. */
const storedKinds = (ast: SchemaAST.AST): ReadonlySet<string> =>
  new Set(
    SchemaAST.isUnion(ast)
      ? ast.types.flatMap(member => [...storedKinds(member)])
      : [storedKind(ast)],
  )

/** A defined operator's call is what its body builds; anything else is itself. */
const expandedNode = (node: Node.Node): Node.Node =>
  Option.match(originTagged(node, 'Call'), {
    onNone: () => node,
    onSome: ({ expansion }) =>
      Option.match(expansion, { onNone: () => node, onSome: expandedNode }),
  })

/** A primitive operator's call, with the arguments it was written with. */
const primitiveCall = (node: Node.Node) =>
  Option.filter(originTagged(expandedNode(node), 'Call'), call => Option.isNone(call.expansion))

/** The stored kinds a value may come to, by what it is. */
const kindsOf = (written: Node.Node): ReadonlySet<string> => {
  const node = expandedNode(written)
  return Option.match(primitiveCall(node), {
    onSome: ({ operator }) => storedKinds(Schema.toEncoded(operator.output).ast),
    onNone: () =>
      Option.match(originOf(node), {
        onNone: () =>
          Node.$match(node, {
            Lit: ({ value }) =>
              new Set([
                value === null ? 'null' : typeof value === 'string' ? 'text' : typeof value,
              ]),
            // An input, the viewer or the time, a path reaching no row reading null.
            Path: ({ ast }) =>
              Option.match(ast, { onNone: () => new Set(['other']), onSome: storedKinds }),
            Call: () => new Set([kindOf(node)]),
            If: () => new Set(['other']),
            Match: () => new Set(['other']),
            Opaque: () => new Set(['other']),
            Rows: () => new Set([kindOf(node)]),
          }),
        onSome: origin =>
          Match.value(origin).pipe(
            Match.tag('Field', ({ field }) => storedKinds(Schema.toEncoded(field.schema).ast)),
            // Refused in an assignment, below; a path reaching no row reads null.
            Match.tags({
              Hop: ({ field }) =>
                new Set([...storedKinds(Schema.toEncoded(field.schema).ast), 'null']),
              ViewerHop: ({ field }) =>
                new Set([...storedKinds(Schema.toEncoded(field.schema).ast), 'null']),
            }),
            Match.orElse(() => new Set([kindOf(node)])),
          ),
      }),
  })
}

/**
 * Whether `node` may come to null: a nullable field or input, a null literal,
 * an operator answering one, or a strict operator given an argument that may
 * be null, which it answers with null.
 */
const mayBeNull = (node: Node.Node): boolean =>
  kindsOf(node).has('null') ||
  Option.exists(
    primitiveCall(node),
    ({ operator, args }) =>
      operator.nulls === 'strict' && args.some(arg => !isPredicateNode(arg) && mayBeNull(arg)),
  )

/** Whether every value a schema stores, null aside, is checked to be an integer. */
const storesIntegers = (schema: Schema.Top): boolean => holdsIntegers(Schema.toEncoded(schema).ast)

const holdsIntegers = (ast: SchemaAST.AST): boolean => {
  const present = SchemaShape.present(ast)
  return present.length > 0 && present.every(SchemaShape.holdsIntegers)
}

/** Whether a value comes to an integer (or null) by what it is: its schema, or a literal's value. */
const comesToInteger = (written: Node.Node): boolean => {
  const node = expandedNode(written)
  return Option.match(primitiveCall(node), {
    // A sum or difference of integers is one, whatever the operator's number output says.
    onSome: ({ operator, args }) =>
      storesIntegers(operator.output) ||
      ((operator === add.descriptor || operator === sub.descriptor) &&
        args.every(arg => !isPredicateNode(arg) && comesToInteger(arg))),
    onNone: () =>
      Option.match(originTagged(node, 'Field'), {
        onSome: ({ field }) => storesIntegers(field.schema),
        // An input by its schema; what else an expression reads is refused before this is asked.
        onNone: () =>
          Node.$is('Lit')(node)
            ? node.value === null || Number.isInteger(node.value)
            : Node.$is('Path')(node) &&
              node.segments[0] === 'input' &&
              Option.exists(node.ast, holdsIntegers),
      }),
  })
}

/** Whether a node is a predicate: a boolean an operation or an exists gives, not a stored one. */
const isPredicateNode = (node: Node.Node): boolean =>
  kindOf(node) === 'boolean' && (Node.$is('Call')(node) || Node.$is('Rows')(node))

/** Whether a predicate is anywhere in `node`, which data carries only as a value. */
const holdsPredicate = (node: Node.Node): boolean =>
  isPredicateNode(expandedNode(node)) ||
  Option.exists(primitiveCall(node), ({ args }) => args.some(holdsPredicate))

/**
 * One computed field, checked: a field of the Entity written by nothing else,
 * computed from this Entity's row before the write and the input alone
 * (never `Next`, so assignments do not depend on each other), to a value of
 * the field's stored kind, with no predicate in it.
 */
const assignmentOf = (
  input: EntityInput<AnyEntity, any, any>,
  fieldKey: string,
  compute: () => AnyExpr,
  declared: {
    readonly expect: WriteSet | undefined
    readonly sets: ReadonlyArray<WriteSet>
    readonly increments: ReadonlyArray<WriteIncrement>
  },
): WriteAssignment => {
  const fields = input.entity.fields as Readonly<Record<string, AnyField>>
  const field = Object.hasOwn(fields, fieldKey) ? fields[fieldKey] : undefined
  if (field === undefined) return fail(input, `computes "${fieldKey}", which is not a field`)
  if (fieldKey === 'id') return fail(input, 'computes the id')
  if (declared.expect?.field.key === fieldKey) {
    return fail(input, `computes "${fieldKey}", the revision it expects`)
  }
  if (
    declared.sets.some(set => set.field.key === fieldKey) ||
    declared.increments.some(increment => increment.field.key === fieldKey)
  ) {
    return fail(input, `computes "${fieldKey}", which the write also sets`)
  }
  // A field on its own is the value it holds.
  const expr: AnyExpr = exprOf(toNode(compute()))
  if (holdsPredicate(expr.node)) {
    return fail(
      input,
      `computes "${fieldKey}" with a predicate, which an assignment carries only as a value`,
    )
  }
  const reads = dependenciesOf(expr)
  if (reads.next.length > 0) {
    return fail(
      input,
      `computes "${fieldKey}" from the row after the write, which an assignment never reads`,
    )
  }
  const context = contextTerms(reads)
  if (context.length > 0) {
    return fail(
      input,
      `computes "${fieldKey}" from the write's context (${context.map(term => `Expr.${term}`).join(', ')}), which an assignment does not read; a value the context gives is declared with Entity.sets`,
    )
  }
  if (reads.reaches.length > 0) {
    return fail(
      input,
      `computes "${fieldKey}" through a relation, from another row, which an assignment does not read`,
    )
  }
  const stranger = reads.fields.find(read => read.owner.name !== input.entity.name)
  if (stranger !== undefined) {
    return fail(
      input,
      `computes "${fieldKey}" from ${stranger.owner.name}.${stranger.key}, another Entity's field`,
    )
  }
  const stored = storedKinds(Schema.toEncoded(field.schema as unknown as Schema.Top).ast)
  const comes = [...kindsOf(expr.node)].filter(kind => kind !== 'null' && !stored.has(kind))
  if (comes.length > 0) {
    return fail(input, `computes "${fieldKey}" as ${comes.join(' or ')}, which it does not store`)
  }
  // Memory would show the null, and the database refuse it as NOT NULL.
  if (!stored.has('null') && mayBeNull(expr.node)) {
    return fail(input, `computes "${fieldKey}" as possibly null, which it does not store`)
  }
  // As with an increment's amount: Postgres rounds a fraction written to an integer
  // column, SQLite stores it, and memory keeps it. So it never reaches either.
  const integer = comesToInteger(expr.node)
  if (storesIntegers(field.schema as unknown as Schema.Top) && !integer) {
    return fail(
      input,
      `computes "${fieldKey}" as a number that may not be an integer, but "${fieldKey}" is one; compute it with an operator, input or literal that is (Schema.Int)`,
    )
  }
  return Object.freeze({ field, expr, integer })
}

/** An assignment's expression, bound to one input, as data. */
const computationOf = (
  write: AnyWrite,
  written: Node.Node,
  input: Readonly<Record<string, unknown>>,
): Computation => {
  const node = expandedNode(written)
  // What else an assignment reads (the context, another row) is refused where it is declared.
  const refused = (): never => {
    throw new Error(
      `[foldkit-entity] an assignment of ${write.input.entity.name} reads what is neither its row, its input nor a constant`,
    )
  }
  return Option.match(primitiveCall(node), {
    onSome: ({ operator, args: given, collation }) => {
      const args = given.map(arg => computationOf(write, arg, input))
      return Computation.Call({
        operator: operator.version === 1 ? operator.id : `${operator.id}@${operator.version}`,
        // The text a collation compares is folded here, as `callOperator` folds it.
        args: Option.match(collation, {
          onNone: () => args,
          onSome: each =>
            Match.valueTags(each, {
              Binary: () => args,
              AsciiFold: () =>
                args.map((arg, position) =>
                  foldsArgument(operator, position)
                    ? Computation.Call({ operator: lowerAsciiName, args: [arg] })
                    : arg,
                ),
              Locale: ({ locale }): never => {
                throw new Error(
                  `[foldkit-entity] an assignment of ${write.input.entity.name} compares text by the backend's "${locale}" collation, which only that backend has`,
                )
              },
            }),
        }),
      })
    },
    onNone: () =>
      Option.match(originTagged(node, 'Field'), {
        // `next` is refused where an assignment is declared.
        onSome: ({ field }) => Computation.Field({ key: field.key }),
        onNone: () => {
          if (Node.$is('Lit')(node)) return Computation.Value({ value: node.value })
          const key =
            Node.$is('Path')(node) && node.segments[0] === 'input' ? node.segments[1] : undefined
          if (key === undefined) return refused()
          return Computation.Value({
            value: Schema.encodeUnknownSync(
              write.input.schema.fields[key] as unknown as Schema.Codec<unknown, unknown>,
            )(input[key]),
          })
        },
      }),
  })
}

/** A field of the row before the write, as a node reads it. */
const rowField = (key: string): Node.Node =>
  Node.Path({ segments: ['row', key], ast: Option.none() })

/**
 * A computation as a metakit node over `row`, the row before the write: none
 * when the row lacks a field it reads, or `operators` lacks an operator it
 * names; one it names but does not implement is refused.
 */
const nodeOf = (
  computation: Computation,
  row: Readonly<Record<string, unknown>>,
  operators: MemoryOperators,
): Option.Option<Node.Node> =>
  Computation.$match(computation, {
    Field: ({ key }) => (Object.hasOwn(row, key) ? Option.some(rowField(key)) : Option.none()),
    Value: ({ value }) => Option.some(Node.Lit({ value: value === undefined ? null : value })),
    Call: ({ operator, args }) =>
      Option.flatMap(Option.all(args.map(arg => nodeOf(arg, row, operators))), nodes => {
        if (operator === lowerAsciiName) {
          return Option.some(Node.Call({ op: Str.lowerAsciiOp, args: nodes }))
        }
        return Option.map(operators.named(operator), descriptor => {
          if (Option.isSome(descriptor.definedAs) || !operators.has(descriptor)) {
            throw new OperatorMissingError(descriptor, operators)
          }
          return callOperator(descriptor, nodes, Option.none())
        })
      }),
  })

/** Whether a value's stored form is a plain number. */
const storedAsNumber = (schema: Schema.Top): boolean =>
  SchemaAST.isNumber(Schema.toEncoded(schema).ast)

/** Whether a value's stored form is checked to be an integer. */
const storedAsInteger = (schema: Schema.Top): boolean =>
  SchemaShape.holdsIntegers(Schema.toEncoded(schema).ast)

/**
 * One increment or decrement, checked: a field of the Entity stored as a
 * number, written by nothing else (an increment and a decrement of one field
 * included: say the one amount it moves by), moved by an unmapped input key
 * whose value is a number, and an integer when the field is one.
 */
const incrementOf = (
  input: EntityInput<AnyEntity, any, any>,
  fieldKey: string,
  key: string,
  direction: WriteIncrement['direction'],
  declared: {
    readonly expect: WriteSet | undefined
    readonly sets: ReadonlyArray<WriteSet>
    readonly increments: ReadonlyArray<WriteIncrement>
  },
): WriteIncrement => {
  const verb = `${direction}s`
  const fields = input.entity.fields as Readonly<Record<string, AnyField>>
  const field = Object.hasOwn(fields, fieldKey) ? fields[fieldKey] : undefined
  if (field === undefined) return fail(input, `${verb} "${fieldKey}", which is not a field`)
  if (fieldKey === 'id') return fail(input, `${verb} the id`)
  if (declared.expect?.field.key === fieldKey) {
    return fail(input, `${verb} "${fieldKey}", the revision it expects`)
  }
  if (declared.sets.some(set => set.field.key === fieldKey)) {
    return fail(input, `${verb} "${fieldKey}", which a key also sets`)
  }
  if (declared.increments.some(increment => increment.field.key === fieldKey)) {
    return fail(
      input,
      `${verb} "${fieldKey}", which it also increments; move a field by one amount`,
    )
  }
  if (!storedAsNumber(field.schema as unknown as Schema.Top)) {
    return fail(input, `${verb} "${fieldKey}", which is not stored as a number`)
  }
  const member = own(membersOf(input), key)
  if (member === undefined) return fail(input, `"${key}" is not a key of the input`)
  if (member._tag !== 'Unmapped') {
    return fail(input, `"${key}" is an amount, so it must be unmapped, not written as a member`)
  }
  const amount = input.schema.fields[key] as unknown as Schema.Top
  if (!storedAsNumber(amount)) return fail(input, `"${key}" is an amount, but not a number`)
  // The databases split over a fraction added to an integer: Postgres refuses the
  // statement, SQLite stores it in the integer column. So it never reaches either.
  const integer = storedAsInteger(amount)
  if (storedAsInteger(field.schema as unknown as Schema.Top) && !integer) {
    return fail(
      input,
      `"${key}" may not be an integer, but "${fieldKey}" is one; give the amount Schema.Int`,
    )
  }
  return Object.freeze({ key, field, integer, direction })
}

/**
 * A write declared to leave every row in a state, proved by enumerating the
 * rows it can start from: refused where it is declared when one is left
 * outside it. Where enumeration cannot decide, the claim is the write's
 * postcondition (`ensures`), which each writer holds where it commits.
 */
const becoming = <E extends AnyEntity, Fields extends Schema.Struct.Fields, Kind extends WriteKind>(
  write: Write<E, Fields, Kind>,
): Write<E, Fields, Kind> =>
  Option.match(write.becomes, {
    onNone: () => write,
    onSome: target => {
      const entity = write.input.entity.name
      const enforced = (): Write<E, Fields, Kind> =>
        Object.freeze({
          ...write,
          ensures: Option.some(
            Object.freeze({
              id: `becomes:${target.name}`,
              entity,
              predicate: target.after as Predicate,
              message: `The ${entity} would not be ${target.name} once written`,
              path: target.reads,
              before: Object.freeze([]),
              after: target.reads,
            }),
          ),
        })
      return Steps.$match(steps(write, target.reads), {
        Undecided: enforced,
        Steps: ({ steps: each }) => {
          const judged = each.map(step => ({ step, holds: inState(target, step.after) }))
          const broken = judged.find(({ holds }) => Option.contains(holds, false))
          if (broken !== undefined)
            fail(
              write.input,
              `becomes ${entity}.${target.name}, but from ${JSON.stringify(broken.step.before)} given ${JSON.stringify(broken.step.input)} it leaves ${JSON.stringify(broken.step.after)}`,
            )
          // A row after that lacks what the state reads is one enumeration did not decide.
          return judged.some(({ holds }) => Option.isNone(holds)) ? enforced() : write
        },
      })
    },
  })

/** An update or an insert that would write nothing is refused where it is declared. */
const settingSomething = <
  E extends AnyEntity,
  Fields extends Schema.Struct.Fields,
  Kind extends WriteKind,
>(
  write: Write<E, Fields, Kind>,
): Write<E, Fields, Kind> =>
  write.sets.length === 0 &&
  write.links.length === 0 &&
  write.increments.length === 0 &&
  write.assignments.length === 0 &&
  write.context.length === 0
    ? fail(write.input, 'it sets no field')
    : write

/** Every member a write may change, by key: `Write.writes`, and the revision it expects, which it moves on. */
export const writtenKeys = (write: AnyWrite): ReadonlyArray<string> => [
  ...Write.writes(write).map(member => member.key),
  ...(write.expect === undefined ? [] : [write.expect.field.key]),
]

export const Write = {
  /**
   * Sets, on the row whose id is the input's `id` key, every field the input
   * maps a key to. `expect` names the key holding the revision the row was
   * read at: an interpreter writes only a row still at that revision.
   *
   * ```ts
   * const EditPost = Write.update(EditPostInput, { id: 'id' })
   * ```
   *
   * A key mapped to a `one` relation (`Relation.input`) points the row at the
   * id it holds. Refused where it is written: an `id` that is not the Entity's
   * `id` field, a `many` relation or a nested key (not written by an update
   * yet), or nothing to set.
   *
   * `when` is what the row must hold for the update to land, checked where it
   * commits (`({ input }) => Expr.eq(Post.fields.status, 'draft')`); a row it
   * does not hold of is refused as unmet. `from: Draft` (an `Entity.refine`
   * state) joins that state's predicate to it.
   *
   * `becomes: Published` says every row it can start from is in that state
   * once it lands. It is proved where the write is declared, by enumerating
   * those rows over finite fields: one it leaves outside throws, naming it.
   * One enumeration cannot decide (`becomes: InStock` over an increment) is
   * the write's postcondition, `ensures`: each writer judges it where the
   * write commits and refuses a row it leaves outside as `Invalid`.
   *
   * `increment: { stock: 'quantity' }` adds an unmapped number input to a
   * field where it commits, and `decrement: { balance: 'amount' }` takes one
   * away; neither is idempotent, so a retry needs `expect` or a ledger. A field
   * moved by both, or also set or computed, is refused.
   *
   * `compute` sets a field to what an expression comes to over the row before
   * the write and the input, run where it commits
   * (`{ label: ({ row }) => concat(row.title, ' draft') }`). It is refused for
   * a field another key writes, an expression over the row after the write or
   * another Entity, or one of a kind the field does not store.
   */
  update,

  /**
   * Inserts the row whose id is the input's `id` key, an id the client chose,
   * with every field and `one` relation the input maps a key to. An insert
   * expects no revision: there is no row to have read. A row already there
   * under that id (a retry) is left as it is.
   *
   * What its Entity sets from the write's context (`Entity.sets`: who asks,
   * when) it writes too, never from the input: a server fills them, a client
   * predicts them. An update writes those set `on: 'write'`. `becomes`, as an
   * update's, is proved over what the insert sets, or else ensured.
   */
  insert: <E extends AnyEntity, Fields extends Schema.Struct.Fields>(
    input: EntityInput<E, Fields, any>,
    options: { readonly id: keyof Fields & string; readonly becomes?: RefinementOf<E> | undefined },
  ): Write<E, Fields, 'Insert'> =>
    becoming(
      settingSomething(
        Object.freeze({
          ...declared('Insert', input, options),
          context: contextOf(input.entity, 'create'),
        }),
      ),
    ),

  /**
   * Deletes the row whose id is the input's `id` key, only while it is still at
   * the revision `expect` names, when it names one. It sets nothing, so a key
   * mapped to a member is refused where it is written. A row already gone (a
   * retry) is gone. `when`, as an update's, is what the row must hold.
   */
  delete: remove,

  /**
   * The revision this input says the row was read at, encoded, with its field:
   * what an interpreter writes only a row still at. None for a write that
   * expects none.
   */
  expected: <Fields extends Schema.Struct.Fields>(
    write: Write<AnyEntity, Fields>,
    value: Schema.Struct.Type<Fields>,
  ): Option.Option<{ readonly field: string; readonly revision: unknown }> =>
    Option.map(Option.fromUndefinedOr(write.expect), ({ key, field }) => ({
      field: field.key,
      revision: encoded(field, (value as Readonly<Record<string, unknown>>)[key]),
    })),

  /**
   * The postcondition a write's `becomes` holds it to where it commits, as
   * the invariant a refusal names (`Refusal.isInvalidBy(refusal,
   * Write.ensured(Sell.write))`). Throws for a write with none: one with no
   * `becomes`, or one whose `becomes` was proved where it was declared.
   */
  ensured: (write: AnyWrite): Invariant =>
    Option.getOrElse(write.ensures, () => {
      throw new Error(
        `[foldkit-entity] Write.ensured: this write of ${write.input.entity.name} ensures nothing; only a becomes enumeration cannot decide is held where it commits`,
      )
    }),

  /** The members any invocation may write: what a query reading none of them cannot be changed by. */
  writes: (write: AnyWrite): ReadonlyArray<AnyField | OneRelation> => [
    ...write.sets.map(set => set.field),
    ...write.increments.map(increment => increment.field),
    ...write.assignments.map(assignment => assignment.field),
    ...write.links.map(link => link.relation),
    ...write.context.map(set => set.member),
  ],

  /**
   * What the context sets come to, encoded as the store holds them: each
   * field's value and each relation's link. A path from the viewer is read
   * through `read`, one row at a time. `unfilled` names each member there is
   * no value for: none to read (no reading of the time, a row or field
   * `read` does not hold), or a null where the member holds none (a visitor,
   * a viewer of another Entity, a path reaching no row). A server refuses such
   * a write; a client predicts nothing for the member.
   */
  contextValues: <E, R>(
    write: AnyWrite,
    by: ExprContext,
    read: ContextRead<E, R>,
  ): Effect.Effect<ContextValues, E, R> =>
    Effect.gen(function* () {
      const values: Record<string, unknown> = {}
      const links: Record<string, Option.Option<EntityRef>> = {}
      const unfilled: Array<string> = []
      for (const { member, value } of write.context) {
        const comes: Option.Option<unknown> = yield* matchContext(value, {
          viewerPath: path =>
            Effect.map(walked(path, by, read), held =>
              Held.match(held, {
                onHeld: some => Option.some<unknown>(some),
                onUnheld: () => Option.none<unknown>(),
              }),
            ),
          viewer: other => Effect.succeed<Option.Option<unknown>>(contextValue(other, by)),
          now: other => Effect.succeed<Option.Option<unknown>>(contextValue(other, by)),
        })
        if (Option.isNone(comes)) {
          unfilled.push(member.key)
        } else {
          const given = comes.value
          Match.valueTags(member, {
            // `Entity.sets` points a relation only at the viewer of its target.
            Relation: relation => {
              if (given !== null)
                put(
                  links,
                  relation.key,
                  Option.some({ entity: relation.target().name, id: String(given) }),
                )
              else if (relation.optional) put(links, relation.key, Option.none())
              else unfilled.push(relation.key)
            },
            Field: field => {
              if (given !== null || holdsNull(field)) put(values, field.key, given)
              else unfilled.push(field.key)
            },
          })
        }
      }
      return { values, links, unfilled }
    }),

  /** The Entities a write's paths from the viewer read, by name: what a server must have a source of. */
  contextReads: (write: AnyWrite): ReadonlyArray<string> => [
    ...new Set(
      write.context.flatMap(({ value }) => {
        if (value.term !== 'viewerPath') return []
        const { viewer, via } = viewerHopOf(value)
        return [viewer.name, ...via.map(relation => relation.target().name)]
      }),
    ),
  ],

  /**
   * What a write reads and writes of its row, by field key (`Write.reads`,
   * and `Write.writes` with the revision it expects, which it moves on): what
   * `Laws.check` judges it by.
   */
  footprint: (write: AnyWrite): Footprint =>
    Footprint.Derived({
      reads: Write.reads(write).map(field => field.key),
      writes: writtenKeys(write),
    }),

  /**
   * The fields a write reads from the row it writes: those its `when` reads,
   * each it increments, each its assignments read, and the revision it
   * expects. What an interpreter must read, and what a startup check judges
   * it could disclose.
   */
  reads: (write: AnyWrite): ReadonlyArray<AnyField> => {
    const fields = new Map<string, AnyField>()
    const add = (field: AnyField) => fields.set(field.key, field)
    Option.map(write.when, body =>
      queryDependencies(body).predicate.forEach(field => add(field as unknown as AnyField)),
    )
    write.increments.forEach(increment => add(increment.field))
    write.assignments.forEach(assignment =>
      dependenciesOf(assignment.expr).fields.forEach(field => add(field as unknown as AnyField)),
    )
    if (write.expect !== undefined) add(write.expect.field)
    return [...fields.values()]
  },

  /**
   * The row this input writes and its new values, encoded as the store holds
   * them: the patch a client shows before the server answers. `keys`, when
   * given, narrows it to those input keys (what an author changed); the rest of
   * the input is still the whole, validated value.
   */
  bind: <Fields extends Schema.Struct.Fields>(
    write: Write<AnyEntity, Fields>,
    value: Schema.Struct.Type<Fields>,
    keys?: ReadonlyArray<string>,
  ): BoundWrite => {
    const input = value as Readonly<Record<string, unknown>>
    const wanted = keys === undefined ? undefined : new Set(keys)
    const asked = (key: string) => wanted === undefined || wanted.has(key)
    const values: Record<string, unknown> = {}
    for (const { key, field } of write.sets) {
      if (!asked(key)) continue
      // A key the input leaves out, or an `Option` holding nothing, writes nothing.
      Option.map(given(own(input, key)), held => put(values, field.key, encoded(field, held)))
    }
    const links: Record<string, Option.Option<EntityRef>> = {}
    for (const { key, relation } of write.links) {
      if (!asked(key)) continue
      const target = relation.target()
      put(
        links,
        relation.key,
        Option.map(Option.flatMap(given(own(input, key)), Option.fromNullishOr), id => ({
          entity: target.name,
          id: String(encoded(target.fields.id as AnyField, id)),
        })),
      )
    }
    const increments: Record<string, number> = {}
    for (const { key, field, direction } of write.increments) {
      // `keys` names input keys, so an increment is asked for by its amount's key.
      if (!asked(key)) continue
      const schema = write.input.schema.fields[key] as unknown as Schema.Codec<unknown, number>
      Option.map(given(own(input, key)), held => {
        const amount = Schema.encodeUnknownSync(schema)(held)
        // A decrement is the amount taken away, `0 - amount` so a zero stays `0`, not `-0`.
        put(increments, field.key, direction === 'decrement' ? 0 - amount : amount)
      })
    }
    // Every assignment: it reads the row as well as the input, so no key alone asks for it.
    const assignments: Record<string, Computation> = {}
    for (const { field, expr } of write.assignments) {
      put(assignments, field.key, computationOf(write, expr.node, input))
    }
    return {
      entity: write.input.entity.name,
      id: String(encoded(write.id.field, input[write.id.key])),
      values,
      links,
      increments,
      assignments,
    }
  },

  /**
   * The fields of the row before it that a bound write's amounts and
   * assignments read: what to read to work out the row it leaves.
   */
  boundReads: (bound: Pick<BoundWrite, 'increments' | 'assignments'>): ReadonlyArray<string> => {
    const keys = new Set(Object.keys(bound.increments))
    const walk = (computation: Computation): void =>
      Computation.$match(computation, {
        Field: ({ key }) => void keys.add(key),
        Value: () => undefined,
        Call: ({ args }) => args.forEach(walk),
      })
    Object.values(bound.assignments).forEach(walk)
    return [...keys]
  },

  /**
   * The row a bound write leaves over `row`, the row before it: its values
   * set, each amount added (a null stays null, as in SQL), and each
   * assignment computed by `operators` over the row before, all by metakit's
   * evaluator. `unknown` names each field it could not work out: one `row`
   * lacks, or holds as no number for an amount, or an assignment calling an
   * operator the table lacks. That field keeps what `row` holds. The one
   * computation of this row: a guard judges it, a writer explains a miss with
   * it, a client predicts it.
   *
   * A value the evaluator refuses (a sum past the safe integer range, text
   * holding a NUL) is a failure, never a write: it throws a
   * `QueryEvaluateError` carrying the `Refusal`, as `evaluate` does.
   */
  apply: (
    row: Readonly<Record<string, unknown>>,
    bound: Pick<BoundWrite, 'values' | 'increments' | 'assignments'>,
    options: { readonly operators: MemoryOperators },
  ): {
    readonly row: Readonly<Record<string, unknown>>
    readonly unknown: ReadonlyArray<string>
  } => {
    const after: Record<string, unknown> = { ...row, ...bound.values }
    const unknown: Array<string> = []
    const valueOf = (node: Node.Node): unknown => {
      const value = evalNode(node, { row }, foreignOf(readingOf([exprOf(node)]), options.operators))
      if (Node.isRefusal(value)) throw refusedBy(value)
      return value
    }
    for (const [field, amount] of Object.entries(bound.increments)) {
      const held = Object.hasOwn(row, field) ? row[field] : undefined
      if (held === null || typeof held === 'number') {
        put(
          after,
          field,
          valueOf(
            Node.Call({ op: Num.addOp, args: [rowField(field), Node.Lit({ value: amount })] }),
          ),
        )
      } else unknown.push(field)
    }
    for (const [field, computation] of Object.entries(bound.assignments)) {
      Option.match(nodeOf(computation, row, options.operators), {
        onNone: () => unknown.push(field),
        onSome: node => put(after, field, valueOf(node)),
      })
    }
    return { row: after, unknown }
  },
}
