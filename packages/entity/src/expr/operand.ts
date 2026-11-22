/**
 * What an Entity expression is made of (the kernel convergence note, "Which
 * metakit node does each entity node become?"): an expression is a metakit
 * `Expr` over the slices `row` (the judged row, stored form), `next` (the row
 * a write leaves), `input`, `viewer` and `now`, and a field is a `Path` read
 * of its slice. Building one performs no work and names no database; every
 * reader (memory, SQL, the checker) reads the same nodes.
 *
 * What a node came from (a field's Entity, key and collation, the relations a
 * path follows, the operator a call means) is kept beside it in the origin
 * map, keyed by the node object: the checks made while an expression is
 * built read it, and so do `Expr.show` and `dependenciesOf`.
 */
import { Match, Option, Schema, SchemaAST } from 'effect'
import { Node, Str, type Expr as MetaKit } from 'metakit'
import { isExpr, wrap } from 'metakit/build'
import { Text } from 'metakit/domain'
import { Collation } from '../collation.js'
import type { AnyEntity, Cardinality, EntityField, EntityRelation, IdOf } from '../index.js'
import { SchemaShape } from '../shape.js'
import type { OperatorDescriptor } from './operator.js'

/**
 * The environment every Entity expression reads, by slice: the judged row
 * (`row`), the row a write leaves (`next`), the values a query or write is
 * given (`input`), per Entity name the row of whoever asks (`viewer`), and
 * the time of the write (`now`). Each holds stored values.
 */
export interface EntityEnv {
  readonly row: Readonly<Record<string, unknown>>
  readonly next: Readonly<Record<string, unknown>>
  readonly input: Readonly<Record<string, unknown>>
  readonly viewer: Readonly<Record<string, unknown>>
  readonly now: number
}

/** A typed expression over an Entity's environment, giving a `T`: a metakit `Expr`. */
export interface Expr<T> extends MetaKit.Expr<EntityEnv, T> {}

/** Any expression, for the places that hold one without caring what it gives. */
export type AnyExpr = Expr<unknown>

/** An expression giving a boolean, or null where SQL's answer is unknown. */
export type Predicate = Expr<boolean | null>

/**
 * A value the query is given when it runs (`input.<key>`). A definition's body
 * is built once, so inside it an input is this read and never the value: a
 * query that depends on what was passed says so with an operation over it.
 */
export interface InputExpr<T> extends Expr<T> {
  readonly term: 'input'
  readonly key: string
}

/** A constant the query was written with. */
export interface LiteralExpr<T> extends Expr<T> {
  readonly term: 'literal'
}

/** A `one` relation of any Entity: what a path follows and an exists points through. */
export type OneRelation = EntityRelation<string, string, AnyEntity, 'one', boolean>

/**
 * Type-only: the Entities an expression's fields belong to, by name, so
 * `Query.where` can refuse one over another Entity where it is written. Never
 * set at run time. An expression built without it (typed plain `Predicate`)
 * names nothing, so it adds no name to a combination and the run-time
 * ownership check is what proves it.
 */
export interface Reads<Names extends string> {
  readonly '~reads'?: Names
}

/** A plain value, which `Expr.eq` takes on the right only. */
export type PlainValue = string | number | boolean | bigint | null

/**
 * The Entity names an operand reads: a field's own, a marked expression's,
 * none for a value, a literal, an input or a context term. An expression
 * with no marker answers `never`, not `string`: an unknown read contributes
 * nothing, so `and(onAuthor, plain)` still reads `'Author'` and is refused
 * over another Entity. Ownership of what the type cannot see is checked at
 * run time.
 */
export type ReadsOf<X> =
  X extends EntityField<infer Name, string, Schema.Constraint>
    ? Name
    : X extends EntityRelation<infer Name, string, AnyEntity, 'one', boolean>
      ? Name
      : X extends
            | PlainValue
            | { readonly term: 'literal' | 'input' | 'viewer' | 'viewerPath' | 'now' }
        ? never
        : X extends { readonly '~reads'?: infer Names }
          ? unknown extends Names
            ? string
            : Names extends string
              ? Names
              : never
          : never

/** A compile-time failure whose type is the sentence that says what to do. */
export interface Invalid<Message extends string> {
  readonly '~invalid': Message
}

/** What an operand is worth, so a comparison's other side is checked against it. */
export type ValueOf<E> =
  E extends EntityField<string, string, infer S>
    ? Schema.Schema.Type<S>
    : E extends EntityRelation<string, string, infer Target, 'one', infer Optional>
      ? IdOf<Target> | (Optional extends true ? null : never)
      : E extends Expr<infer T>
        ? T
        : never

/**
 * A field or expression whose value is text, or absent text. A constraint on
 * the type parameter rather than a check intersected onto it: inference falls
 * back to a constraint, never past it, so a number cannot pass as text.
 */
export type TextOperand =
  | EntityField<string, string, Schema.Constraint & Schema.Codec<string | null, any, any, any>>
  | Expr<string>
  | Expr<string | null>

/**
 * A field or expression whose value orders: a number, text, a date (which
 * orders by its encoded form), or one of those absent. A boolean does not
 * order here.
 */
export type OrderedOperand =
  | EntityField<
      string,
      string,
      Schema.Constraint & Schema.Codec<number | string | Date | null, any, any, any>
    >
  | Expr<number>
  | Expr<number | null>
  | Expr<string>
  | Expr<string | null>
  | Expr<Date>
  | Expr<Date | null>

/** A field, a `one` relation (the id it points at), an expression, or a plain value. */
export type Operand<T> = EntityField<string, string, Schema.Constraint> | OneRelation | Expr<T>

/**
 * One field of one Entity, as an origin holds it. `owner` is the Entity's
 * identity rather than its name, so two Entities defined with the same name
 * are not one column. `collation` is how it compares when ordered by: as the
 * field declares (`Collation.of`); an id is `binary` unless it says otherwise.
 */
export interface FieldOrigin {
  readonly owner: { readonly name: string; readonly token: symbol }
  readonly key: string
  readonly schema: Schema.Top
  readonly collation: Option.Option<Collation>
}

/** Which row a field is read on: the judged one, the one a write leaves, or a related one. */
export type Slice = 'row' | 'next' | 'each'

/**
 * What a node came from, where a reader needs more than its kind and
 * segments: a field (by slice), the viewer's id, a path through relations
 * from the row or from the viewer, an exists, the call of an operator, and
 * the three forms whose nodes differ from how they are written (a text
 * comparison folded under its collation, `contains`, `isNotNull`).
 */
export type Origin =
  | { readonly _tag: 'Field'; readonly slice: Slice; readonly field: FieldOrigin }
  | { readonly _tag: 'Viewer'; readonly entity: AnyEntity }
  | {
      readonly _tag: 'Hop'
      readonly via: readonly [OneRelation, ...Array<OneRelation>]
      readonly field: FieldOrigin
    }
  | {
      readonly _tag: 'ViewerHop'
      readonly viewer: AnyEntity
      readonly via: ReadonlyArray<OneRelation>
      readonly field: FieldOrigin
    }
  | {
      readonly _tag: 'Exists'
      readonly via: ReadonlyArray<OneRelation>
      readonly relation: OneRelation
      /** The filter as written, over the pointing row as `row`. */
      readonly where: Option.Option<Node.Node>
    }
  | {
      readonly _tag: 'Call'
      readonly operator: OperatorDescriptor
      /** The arguments as written, before a collation folded any. */
      readonly args: ReadonlyArray<Node.Node>
      readonly collation: Option.Option<Collation>
      /** A defined operator's body as built, which the call's node is a copy of. */
      readonly expansion: Option.Option<Node.Node>
    }
  | {
      readonly _tag: 'Compare'
      readonly operator: CompareOperator
      readonly left: Node.Node
      readonly right: Node.Node
    }
  | { readonly _tag: 'Contains'; readonly value: Node.Node; readonly search: Node.Node }
  | { readonly _tag: 'NotNull'; readonly operand: Node.Node }

/** Which way a comparison orders its two sides: `left < right` for `lt`. */
export type CompareOperator = 'lt' | 'lte' | 'gt' | 'gte'

const origins = new WeakMap<Node.Node, Origin>()

/** What `node` came from, when an Entity constructor built it. */
export const originOf = (node: Node.Node): Option.Option<Origin> =>
  Option.fromUndefinedOr(origins.get(node))

/** What `node` came from, when it is an origin of the kind `tag`. */
export const originTagged = <Tag extends Origin['_tag']>(
  node: Node.Node,
  tag: Tag,
): Option.Option<Extract<Origin, { readonly _tag: Tag }>> =>
  Option.filter(
    Option.fromUndefinedOr(origins.get(node)),
    (origin): origin is Extract<Origin, { readonly _tag: Tag }> => origin._tag === tag,
  )

/** Records what `node` came from; returns it. */
export const made = <N extends Node.Node>(node: N, origin: Origin): N => {
  origins.set(node, origin)
  return node
}

/** A node as an expression; frozen, so a query built from it stays what was checked. */
export const exprOf = <T>(node: Node.Node): Expr<T> => Object.freeze(wrap<EntityEnv, T>(node))

/**
 * The segment under `viewer.<Entity>` holding who asks: their id, known where
 * their row is hidden from the reader, whose fields (`id` among them) then
 * read null.
 */
export const ASKER = '#asker'

/** The check `Text.schema` makes, which readers know as text holding no NUL. */
const nulFree = Option.getOrThrow(Option.fromUndefinedOr(Text.schema.ast.checks))

/**
 * A stored form, its text as `Text.schema` describes it: an Entity's write
 * refuses text holding a NUL (`Entity.input`), so no stored text holds one,
 * and partial evaluation may drop or fold beside a field it cannot refuse.
 */
const stored = (ast: SchemaAST.AST): SchemaAST.AST => {
  if (SchemaAST.isUnion(ast)) {
    return new SchemaAST.Union(ast.types.map(stored), ast.options, ast.annotations, ast.checks)
  }
  if (!SchemaAST.isString(ast)) return ast
  return new SchemaAST.String(
    ast.annotations,
    ast.checks === undefined ? nulFree : [...ast.checks, ...nulFree],
  )
}

/** One AST per schema and per question, so two reads of one field are equal nodes. */
const memo = (make: (schema: Schema.Top) => SchemaAST.AST) => {
  const made = new WeakMap<Schema.Top, SchemaAST.AST>()
  return (schema: Schema.Top): SchemaAST.AST => {
    const known = made.get(schema)
    if (known !== undefined) return known
    const ast = make(schema)
    made.set(schema, ast)
    return ast
  }
}

/** A stored row's field type, its text known to hold no NUL. */
const storedAst = memo(schema => stored(Schema.toEncoded(schema).ast))
const nullableStored = memo(schema => Schema.NullOr(Schema.make(storedAst(schema))).ast)
const encoded = memo(schema => Schema.toEncoded(schema).ast)
const nullableEncoded = memo(schema => Schema.NullOr(Schema.toEncoded(schema)).ast)

/** A read of a stored row's field at `segments`; null where the row is reached through a link. */
export const readStored = (
  segments: ReadonlyArray<string>,
  schema: Schema.Top,
  nullable = false,
): Node.Node =>
  Node.Path({
    segments,
    ast: Option.some(nullable ? nullableStored(schema) : storedAst(schema)),
  })

/** A read of a value no row stores (an input, the viewer, the time), typed by its encoded form. */
export const read = (
  segments: ReadonlyArray<string>,
  schema: Schema.Top,
  nullable = false,
): Node.Node =>
  Node.Path({ segments, ast: Option.some(nullable ? nullableEncoded(schema) : encoded(schema)) })

const tagOf = (value: unknown): unknown =>
  typeof value === 'object' && value !== null && '_tag' in value ? value._tag : undefined

/** A field's origin: its declared collation, or `binary` for an id that declares none. */
export const fieldOrigin = (
  field: EntityField<string, string, Schema.Constraint>,
): FieldOrigin => ({
  owner: field.owner,
  key: field.key,
  schema: field.schema as unknown as Schema.Top,
  collation: Option.orElse(Collation.declared(field.metadata), () =>
    field.key === 'id' ? Option.some(Collation.binary) : Option.none(),
  ),
})

/** A field read on `slice`. */
export const fieldNode = (field: FieldOrigin, slice: Slice): Node.Node =>
  made(readStored([slice, field.key], field.schema), { _tag: 'Field', slice, field })

const OptionalLink = Schema.NullOr(Schema.String)

/**
 * A `one` relation read as a value: the id of the row it points at, null for
 * none. It is the member the row holds under the relation's key, so it is a
 * field of the owner to every reader.
 */
export const linkOrigin = (relation: OneRelation): FieldOrigin => ({
  owner: relation.owner,
  key: relation.key,
  // A ref's id travels as text, as `Expr.viewer`'s does, so the two compare.
  schema: relation.optional ? OptionalLink : Schema.String,
  // Nothing orders by one: a list refuses it, and a comparison takes an ordered operand.
  collation: Option.none(),
})

/** The name a relation's pointing rows are held under, as the note writes it (`Follow.followee`). */
export const relationName = (relation: OneRelation): string =>
  `${relation.owner.name}.${relation.key}`

/** A value checked to be a `one` relation, or refused with what to write instead. */
export const asOne = (step: string, value: unknown, instead: string): OneRelation => {
  const relation = value as EntityRelation<string, string, AnyEntity, Cardinality, boolean>
  if (relation.cardinality !== 'one') {
    throw new Error(
      `[foldkit-entity] ${step}: ${relation.owner.name}.${relation.key} is a many relation${instead}`,
    )
  }
  return relation as OneRelation
}

/**
 * The node of an operand: an expression's own, a field read on the row, a
 * `one` relation as the id it points at, and anything else the constant it is.
 */
export const toNode = (value: unknown): Node.Node => {
  if (isExpr(value)) return value.node
  const tag = tagOf(value)
  // tag-check: open, an operand is any value a caller passed
  if (tag === 'Field') {
    return fieldNode(fieldOrigin(value as EntityField<string, string, Schema.Constraint>), 'row')
  }
  // tag-check: open, an operand is any value a caller passed
  if (tag === 'Relation') {
    const relation = asOne(
      'an operand',
      value,
      ', which holds no one value; ask Expr.exists of the relation that points back',
    )
    return fieldNode(linkOrigin(relation), 'row')
  }
  return Node.Lit({ value })
}

/** What a value comes to, read from its stored form; `null` for a null literal. */
export type Kind = 'number' | 'text' | 'boolean' | 'null' | 'other'

/** What values encoded by `ast` are, null aside: one kind, or `other`. */
export const kindOfAst = (ast: SchemaAST.AST): Kind => {
  const present = SchemaShape.present(ast)
  if (present.length === 0)
    return SchemaAST.isUnion(ast) || SchemaAST.isNull(ast) ? 'null' : 'other'
  if (present.every(member => SchemaAST.isNumber(member) || isNumberLiteral(member))) {
    return 'number'
  }
  if (present.every(SchemaShape.isText)) return 'text'
  if (present.every(member => SchemaAST.isBoolean(member) || isBooleanLiteral(member))) {
    return 'boolean'
  }
  return 'other'
}

const isNumberLiteral = (ast: SchemaAST.AST): boolean =>
  SchemaAST.isLiteral(ast) && typeof ast.literal === 'number'

const isBooleanLiteral = (ast: SchemaAST.AST): boolean =>
  SchemaAST.isLiteral(ast) && typeof ast.literal === 'boolean'

/** What a constant is. */
const kindOfValue = (value: unknown): Kind => {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'string') return 'text'
  if (typeof value === 'boolean') return 'boolean'
  return 'other'
}

/** What a node comes to: a constant's own kind, a read's stored form, an operation's result. */
export const kindOf = (node: Node.Node): Kind =>
  Node.$match(node, {
    Lit: ({ value }) => kindOfValue(value),
    Path: ({ ast }) => Option.match(ast, { onNone: (): Kind => 'other', onSome: kindOfAst }),
    Call: ({ op, args }): Kind =>
      Option.match(originTagged(node, 'Call'), {
        onSome: ({ operator }) => kindOfAst(Schema.toEncoded(operator.output).ast),
        onNone: () => {
          if (op.returns !== 'operand') return op.returns
          const [first] = args.map(kindOf).filter(kind => kind !== 'null')
          return first ?? 'null'
        },
      }),
    Rows: ({ fold }): Kind =>
      fold === 'any' || fold === 'every'
        ? 'boolean'
        : fold === 'count' || fold === 'sum'
          ? 'number'
          : 'other',
    If: (): Kind => 'other',
    Match: (): Kind => 'other',
    Opaque: (): Kind => 'other',
  })

/** The schema a node's values are stored by, where it reads one; `Unknown` otherwise. */
export const schemaOf = (node: Node.Node): Schema.Top =>
  Option.match(originOf(node), {
    onNone: (): Schema.Top => Schema.Unknown,
    onSome: origin =>
      Match.value(origin).pipe(
        Match.tags({
          Field: ({ field }): Schema.Top => field.schema,
          Hop: ({ field }): Schema.Top => field.schema,
          ViewerHop: ({ field }): Schema.Top => field.schema,
          Call: ({ operator }): Schema.Top => operator.output,
        }),
        Match.orElse((): Schema.Top => Schema.Unknown),
      ),
  })

/** A node's collation: a field's declared one (through a path too), or a call's. */
export const collationOf = (node: Node.Node): Option.Option<Collation> =>
  Option.flatMap(originOf(node), origin =>
    Match.value(origin).pipe(
      Match.tags({
        Field: ({ field }) => field.collation,
        Hop: ({ field }) => field.collation,
        ViewerHop: ({ field }) => field.collation,
        Call: call => call.collation,
      }),
      Match.orElse(() => Option.none<Collation>()),
    ),
  )

/** Whether a node reads a value the query is given, and its key. */
export const inputKeyOf = (node: Node.Node): Option.Option<string> =>
  Node.$is('Path')(node) && node.segments.length === 2 && node.segments[0] === 'input'
    ? Option.some(node.segments[1]!)
    : Option.none()

/** The field of the judged row (or the row a write leaves, or a related one) a node reads, if it reads one. */
export const fieldRead = (
  node: Node.Node,
): Option.Option<{ readonly slice: Slice; readonly field: FieldOrigin }> =>
  originTagged(node, 'Field')

/**
 * The most nodes a query's predicates may hold once every shared node is
 * counted on each path that reaches it. Readers read a predicate as a tree:
 * evaluation once per row, and SQL into text that repeats a shared operand
 * wherever it appears. So `eq(n, n)` nested thirty deep is thirty-one objects
 * and a billion nodes of work. Real queries are tens.
 */
export const maxQueryNodes = 1_000

/** The text a collation compares: as it is, or with ASCII letters folded. */
export const folded = (collation: Collation, node: Node.Node): Node.Node => {
  switch (collation._tag) {
    case 'Binary':
      return node
    case 'AsciiFold':
      return Node.Call({ op: Str.lowerAsciiOp, args: [node] })
    case 'Locale':
      throw new Error(
        `[foldkit-entity] the "${collation.locale}" collation is the backend's, and no reader in memory has it`,
      )
  }
}
