/**
 * `Expr` — a query's scalar computations as typed values.
 *
 * An Entity says what a domain has; an `Expr` says something about one row of
 * it. A field reference, an input placeholder, a literal, and comparisons of
 * those are all immutable data: building one performs no work, reads nothing,
 * and names no database. An interpreter compiles it — `foldkit-remote-drizzle`
 * to SQL, an in-memory evaluator to a predicate over rows.
 *
 * This is deliberately not SQL and deliberately not arbitrary JavaScript. Every
 * operation here is one a real query in this repository needs; the set grows
 * from queries, not from what a database could express.
 */
import { Array as Arr, Match, Option, Pipeable, Schema, SchemaAST } from 'effect'
import { absurd } from 'effect/Function'
import { Collation } from './collation.js'
import { SchemaShape } from './shape.js'
import { Law, type Side } from './law.js'
import { now, viewer, type NowExpr, type ViewerExpr } from './context.js'
import type {
  AnyEntity,
  Cardinality,
  EntityField,
  EntityIdentity,
  EntityRelation,
} from './index.js'

/** A constant the query was written with. */
export interface LiteralExpr<T> {
  readonly _tag: 'Literal'
  readonly value: T
}

/**
 * One field of one Entity. `owner` is the Entity's identity rather than its
 * name, so two Entities defined with the same name are not one column.
 */
export interface FieldExpr<T> {
  readonly _tag: 'Field'
  readonly owner: EntityIdentity<string>
  readonly key: string
  readonly schema: Schema.Codec<T, unknown>
  /**
   * How it compares when ordered by, as the field declares (`Collation.of`).
   * An id is `binary` unless it says otherwise: its order need only be total
   * and agreed, and every order ends on it.
   */
  readonly collation: Option.Option<Collation>
}

/**
 * A value the query is given when it runs. A definition's body is built once,
 * so inside it an input is this placeholder and never the value: there is
 * nothing yet to branch on, and a query that wants to depend on what was passed
 * says so with an operation over the placeholder.
 */
export interface InputExpr<T> {
  readonly _tag: 'Input'
  readonly key: string
  readonly schema: Schema.Codec<T, unknown>
}

/**
 * A field as the row a write would leave holds it: what an invariant reads
 * (`after.status`, beside `before.status` over a change). An interpreter that judges stored
 * rows alone refuses it, as the operation `next`.
 */
export interface NextExpr<T> {
  readonly _tag: 'Next'
  readonly field: FieldExpr<T>
}

/**
 * What an operator is, as the nodes that call it hold it: its identity, the
 * stored form of what it takes and gives, and, for an operator defined by an
 * expression, how to build that expression. It computes nothing itself.
 * Identity is this object; `id` and `version` name it.
 */
export interface OperatorDescriptor {
  readonly _tag: 'Operator'
  readonly id: string
  readonly version: number
  readonly description: Option.Option<string>
  /** One schema per argument, read as the stored form. */
  readonly input: ReadonlyArray<Schema.Top>
  readonly output: Schema.Top
  /**
   * Builds the expression a call means, from its arguments: an operator defined
   * by an expression. None for a primitive operator, which each interpreter
   * implements (`Operators`).
   */
  readonly definedAs: Option.Option<(...args: ReadonlyArray<Operandish>) => Operandish>
  /**
   * A primitive operator's null rule. `strict`: a null argument gives null, or
   * unknown for a predicate, and the implementation never sees one. `handled`:
   * the implementation is given nulls and answers for them.
   */
  readonly nulls: 'strict' | 'handled'
  /**
   * How a call compares text. `operands`: it carries the collation its collated
   * text arguments share, so its text result compares under it. `required`: the
   * same, refused where none is declared (it compares text itself, as
   * `Text.startsWith` does). `none`: it carries none.
   */
  readonly collation: 'none' | 'operands' | 'required'
  /** The equations every implementation keeps (`Law`), checked where declared, tested by `Conformance.laws`. */
  readonly laws: ReadonlyArray<Law>
}

/** What an interpreter runs, as far as a check of a body needs to know. */
export interface OperatorTable {
  /** Whether this table implements the operator. */
  readonly has: (operator: OperatorDescriptor) => boolean
  /**
   * The versions of the operator `id` it implements: what a refusal of a call
   * to another version names, since a client and a server on different
   * deploys can disagree on one.
   */
  readonly versions: (id: string) => ReadonlyArray<number>
}

/** A table implementing nothing: every primitive operator is unsupported by it. */
export const noOperators: OperatorTable = Object.freeze({ has: () => false, versions: () => [] })

/**
 * An operator `operators` does not implement, by name, with the versions of it
 * the table does implement: `acme.slug@2 (this table has acme.slug)`.
 */
export const missingName = (operator: OperatorDescriptor, operators: OperatorTable): string => {
  const held = operators.versions(operator.id)
  // The same name and version from another `Expr.operator` call: a table holds
  // declarations, not names, so it is a different operator.
  if (held.includes(operator.version)) {
    return `${operatorName(operator)} (this table has another declaration of it; declare an operator once and import it)`
  }
  return held.length === 0
    ? operatorName(operator)
    : `${operatorName(operator)} (this table has ${held
        .map(version => operatorName({ ...operator, version }))
        .join(', ')})`
}

/**
 * A call of an operator whose result is a scalar. `expansion` is the
 * expression it means, built from its arguments when it was called: an
 * interpreter runs that, and needs nothing of its own for the operator.
 */
export interface CallExpr<T> {
  readonly _tag: 'Call'
  readonly operator: OperatorDescriptor
  readonly args: ReadonlyArray<Operandish>
  readonly expansion: Option.Option<Expr<T>>
  /** How its text result compares, from its operator's `collation` rule. */
  readonly collation: Option.Option<Collation>
}

/** A `one` relation of any Entity: what a path follows and an exists points through. */
export type OneRelation = EntityRelation<string, string, AnyEntity, 'one', boolean>

/**
 * A field of the row reached from the row judged by following `one`
 * relations (`Expr.path`). A null link, or a row the reader may not see,
 * reaches no row, and the path reads null.
 */
export interface PathExpr<T> {
  readonly _tag: 'Path'
  /** The relations followed, in order, the first one the judged row's own. */
  readonly via: Arr.NonEmptyReadonlyArray<OneRelation>
  /** What is read on the row reached: a field of the last relation's target. */
  readonly field: FieldExpr<T>
}

/** A typed scalar: what a comparison compares. */
export type Expr<T> =
  | LiteralExpr<T>
  | FieldExpr<T>
  | InputExpr<T>
  | NextExpr<T>
  | CallExpr<T>
  | ViewerExpr<T>
  | NowExpr<T>
  | PathExpr<T>

/** Any scalar, for the places that hold operands without caring what they are. */
export type AnyExpr = Expr<unknown>

/**
 * `Expr<boolean>`, in the shape the operations that exist can actually take.
 * The design's kernel is all boolean-valued (`eq`, `and`, `isNull`,
 * `contains`, …), so a predicate is its own type rather than a phantom
 * parameter on a general operation node: `Predicate` and `Expr<string>` cannot
 * then be confused, which a structural phantom would allow. A scalar-valued
 * operation, if one is ever needed, joins `Expr` instead.
 */
export type Predicate =
  | EqPredicate
  | NullPredicate
  | ContainsPredicate
  | InPredicate
  | AndPredicate
  | OrPredicate
  | NotPredicate
  | ComparePredicate
  | TestPredicate
  | ExistsPredicate

/**
 * Some row points at the row asked about through `relation`, a `one` relation
 * of another Entity, and holds `where` (`Expr.exists`). The row asked about is
 * the one judged, or the one `via` reaches from it; a path that reaches none
 * makes this unknown, as a path's field reads null. Only rows the reader may
 * see are sought.
 */
export interface ExistsPredicate {
  readonly _tag: 'Exists'
  /** The relations followed to the row asked about; empty for the row judged itself. */
  readonly via: ReadonlyArray<OneRelation>
  readonly relation: OneRelation
  /** What the pointing row must hold, over its own fields and the input. */
  readonly where: Option.Option<Predicate>
}

/** Two values are the same. */
export interface EqPredicate {
  readonly _tag: 'Eq'
  readonly left: Operandish
  readonly right: Operandish
}

/**
 * Whether a value is absent. `present` says which answer absence gives, so one
 * node covers `is null` and `is not null` rather than two that differ by a
 * negation nothing else can express.
 */
export interface NullPredicate {
  readonly _tag: 'Null'
  readonly operand: AnyExpr
  readonly present: boolean
}

/**
 * Whether a text value contains another. Containing the empty string is
 * everything, which is what lets a search box with nothing typed in it be the
 * same query as one with something — see `Expr.contains`.
 */
export interface ContainsPredicate {
  readonly _tag: 'Contains'
  readonly value: AnyExpr
  readonly search: Operandish
}

/**
 * Whether a value is one of a list. The list is a scalar whose value is an
 * array: a literal, or an input (a principal's `projectIds`, a picker's
 * chosen ids). Read as SQL's `in`: a null value is unknown, and so is no
 * match against a list holding a null; an empty list matches nothing.
 */
export interface InPredicate {
  readonly _tag: 'In'
  readonly value: AnyExpr
  readonly among: AnyExpr
}

/**
 * Every operand holds. `Query.where`'s list is already a conjunction; this is
 * one inside something else, `or(and(a, b), c)`. Never empty, and never holding
 * another `and`: `Expr.and` flattens one into its parent.
 */
export interface AndPredicate {
  readonly _tag: 'And'
  readonly operands: Arr.NonEmptyReadonlyArray<Predicate>
}

/** At least one operand holds. Never empty, and never holding another `or`. */
export interface OrPredicate {
  readonly _tag: 'Or'
  readonly operands: Arr.NonEmptyReadonlyArray<Predicate>
}

/**
 * The operand does not hold. As SQL's `not`, an unknown stays unknown, so a row
 * whose operand is unknown (a null compared) is matched by neither the operand
 * nor its `not`.
 */
export interface NotPredicate {
  readonly _tag: 'Not'
  readonly operand: Predicate
}

/** Which way a comparison orders its two sides: `left < right` for `lt`. */
export type CompareOperator = 'lt' | 'lte' | 'gt' | 'gte'

/**
 * One scalar orders before, or after, the other. A null on either side is
 * unknown. `collation` is how text compares, decided where the comparison is
 * written (see `Expr.lt`); none for values that order intrinsically, numbers.
 */
export interface ComparePredicate {
  readonly _tag: 'Compare'
  readonly operator: CompareOperator
  readonly left: AnyExpr
  readonly right: AnyExpr
  readonly collation: Option.Option<Collation>
}

/**
 * A call of an operator whose result is a boolean, so it stands where any
 * predicate does: in `and`, `or` and `not`, a guard, an invariant. `expansion`
 * is the predicate it means, built when it was called.
 */
export interface TestPredicate {
  readonly _tag: 'Test'
  readonly operator: OperatorDescriptor
  readonly args: ReadonlyArray<Operandish>
  readonly expansion: Option.Option<Predicate>
  /** The collation it compares text under, from its operator's `collation` rule. */
  readonly collation: Option.Option<Collation>
}

/**
 * Anything an operation can be given: a scalar, or a predicate where a boolean
 * is wanted. `Expr.eq(Expr.isNotNull(archivedAt), input.archived)` is the
 * second case, and it is how a query depends on an input without branching on
 * it.
 */
export type Operandish = AnyExpr | Predicate

/** A field, a scalar already built from one, or a predicate used as a boolean. */
type Operand<T> = EntityField<string, string, Schema.Constraint> | Expr<T> | Predicate

/**
 * Type-only: the Entities a predicate's fields belong to, by name, so
 * `Query.where` can refuse one over another Entity where it is written. Never
 * set at run time; a predicate built without it (typed plain `Predicate`)
 * reads as unknown and is checked at run time only.
 */
export interface Reads<Names extends string> {
  readonly '~reads'?: Names
}

/**
 * The Entity names an operand reads: a field's own, a marked node's, none for
 * a value or an input. A node with no marker (a `Predicate` typed plainly)
 * reads as `string`, unknown.
 */
export type ReadsOf<X> =
  X extends EntityField<infer Name, string, Schema.Constraint>
    ? Name
    : X extends PlainValue | { readonly _tag: 'Literal' | 'Input' | 'Viewer' | 'Now' }
      ? never
      : X extends { readonly '~reads'?: infer Names }
        ? unknown extends Names
          ? string
          : Names extends string
            ? Names
            : never
        : never

/**
 * Nothing when a query's predicates read its own Entity, none, or one unknown
 * to the type (checked at run time instead); else a failure naming both.
 */
type OverEntity<
  Names extends string,
  Name extends string,
  What extends string,
> = string extends Names
  ? unknown
  : [Names] extends [Name]
    ? unknown
    : Invalid<`foldkit-entity: ${What} reads ${Exclude<Names, Name>}, but the query is from ${Name}`>

/** A plain value, which `Expr.eq` takes on the right only. */
type PlainValue = string | number | boolean | bigint | null

/** A compile-time failure whose type is the sentence that says what to do. */
export interface Invalid<Message extends string> {
  readonly '~invalid': Message
}

/** What an operand is worth, so a comparison's other side is checked against it. */
export type ValueOf<E> =
  E extends EntityField<string, string, infer S>
    ? Schema.Schema.Type<S>
    : E extends Predicate
      ? boolean
      : E extends Expr<infer T>
        ? T
        : never

/**
 * A field or scalar whose value is text, or absent text.
 *
 * `Expr.contains` is a case-insensitive **text** search that compiles to
 * `lower(column) like lower(?)`. Over a number that is nonsense which reaches
 * the database — SQLite coerces and answers something, Postgres raises — so
 * the operand is constrained here rather than discovered there.
 *
 * Null belongs in the type, because a nullable text column is a real and
 * documented case: a null contains nothing, not even the empty string, so its
 * rows drop out of a search that would otherwise match everything.
 *
 * Written as a **constraint on the type parameter** rather than as a check
 * intersected onto the parameter (the `Invalid` idiom `foldkit-remote` uses for
 * an unregistered descriptor). That idiom compares an already-resolved indexed
 * access; here the check would be a conditional over the type being inferred,
 * and inference falls back to the constraint — whose `Expr<any>` branch makes
 * the check vacuously true, so every operand passes. A constraint cannot be
 * defeated that way.
 */
export type TextOperand =
  | EntityField<string, string, Schema.Constraint & Schema.Codec<string | null, any, any, any>>
  | Expr<string>
  | Expr<string | null>

const tagOf = (value: unknown): unknown =>
  typeof value === 'object' && value !== null && '_tag' in value ? value._tag : undefined

/**
 * An Entity's field and a `FieldExpr` are the same three members under the same
 * tag — the Entity's carries `metadata` besides — so this reads either and is
 * idempotent on its own output. Nothing needs to tell them apart, which is
 * better than telling them apart by which extra member happens to be present.
 */
/**
 * Every node is frozen as it is made, so a query built from it stays the value
 * it was when `Query.where` checked it: nothing can swap a field or a literal
 * in afterwards. It also means no node can come to contain itself. A literal's
 * own payload is the caller's; the kernel compares scalars.
 */
const node = <T extends object>(value: T): T => Object.freeze(value)

const literal = <T>(value: T): LiteralExpr<T> => node({ _tag: 'Literal', value })

const fieldExpr = (field: EntityField<string, string, Schema.Constraint>): FieldExpr<unknown> =>
  node({
    _tag: 'Field',
    owner: field.owner,
    key: field.key,
    schema: field.schema as unknown as Schema.Codec<unknown, unknown>,
    collation: Option.orElse(Collation.declared(field.metadata), () =>
      field.key === 'id' ? Option.some(Collation.binary) : Option.none(),
    ),
  })

const predicateTags = new Set([
  'Eq',
  'Null',
  'Contains',
  'In',
  'And',
  'Or',
  'Not',
  'Compare',
  'Test',
  'Exists',
])

/** Whether a value is a predicate, and so usable where a boolean is wanted. */
export const isPredicate = (value: unknown): value is Predicate =>
  predicateTags.has(tagOf(value) as string)

/**
 * A field of either kind becomes a `FieldExpr`, a scalar or a predicate is
 * itself, and anything else is the constant it is.
 */
const toOperand = <T>(value: Operand<T> | T): Operandish => {
  const tag = tagOf(value)
  // An `EntityField` and a `FieldExpr` share the tag. A `FieldExpr` is already
  // built, its collation with it, which its field's metadata no longer holds.
  if (tag === 'Field' && !Object.hasOwn(value as object, 'metadata')) {
    return value as FieldExpr<unknown>
  }
  if (tag === 'Field') {
    return fieldExpr(value as EntityField<string, string, Schema.Constraint>)
  }
  if (
    tag === 'Literal' ||
    tag === 'Input' ||
    tag === 'Next' ||
    tag === 'Call' ||
    tag === 'Viewer' ||
    tag === 'Now' ||
    tag === 'Path' ||
    predicateTags.has(tag as string)
  ) {
    return value as Operandish
  }
  return literal(value)
}

/** As `toOperand`, where only a scalar makes sense: `is null` of a predicate is not a question. */
const toExpr = <T>(value: Operand<T> | T, step: string): AnyExpr => {
  const operand = toOperand(value)
  if (isPredicate(operand)) {
    throw new Error(
      `[foldkit-entity] Expr.${step}: a predicate is already an answer, so asking this of one is not a question`,
    )
  }
  return operand
}

/**
 * Every operation the kernel has. An interpreter declares which of them it
 * runs, and a body needing one it does not is refused rather than answered
 * wrongly — see `Query.unsupported`.
 */
export type Operation =
  | 'eq'
  | 'isNull'
  | 'isNotNull'
  | 'contains'
  | 'in'
  | 'and'
  | 'or'
  | 'not'
  | 'compare'
  | 'next'
  | 'viewer'
  | 'now'
  | 'path'
  | 'exists'

/** One field an expression reads: its Entity's name and key, and the identity that owns it. */
export interface FieldDependency {
  /** The owning Entity's name, for display; two Entities may share one. */
  readonly entity: string
  readonly key: string
  /** Which Entity it is. Two defined with the same name are two entries. */
  readonly owner: EntityIdentity<string>
}

/** Which fields and inputs an expression reads, and which operations it uses. */
export interface Dependencies {
  /** One entry per distinct field of each Entity identity. */
  readonly fields: ReadonlyArray<FieldDependency>
  /** Each field read as the row a write would leave holds it (`Next`), one entry each. */
  readonly next: ReadonlyArray<FieldDependency>
  /** One entry per distinct input key. */
  readonly inputs: ReadonlyArray<string>
  /** One entry per distinct operation, so an interpreter can refuse what it cannot run. */
  readonly operations: ReadonlyArray<Operation>
  /** Each operator it calls, once per descriptor, defined or not. */
  readonly operators: ReadonlyArray<OperatorDescriptor>
  /**
   * Each path and exists, once each: what it reads lies in other rows, so none
   * of it is in `fields`. An exists' filter's inputs, operations and operators
   * are in the lists above.
   */
  readonly reaches: ReadonlyArray<PathExpr<unknown> | ExistsPredicate>
}

/**
 * What a query reads, with each field's role. A change to a `predicate` field
 * can move a row into or out of the result; a change to an `order` field can
 * move it within. A field in both is in both; `fields` is their union.
 */
export interface QueryDependencies extends Dependencies {
  readonly predicate: ReadonlyArray<FieldDependency>
  readonly order: ReadonlyArray<FieldDependency>
}

/**
 * A field or scalar whose value orders: a number, text, a date (which orders by
 * its encoded form), or one of those absent. A boolean does not order here.
 * A constraint on the type parameter, as `TextOperand` is, so inference cannot
 * fall back past it.
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

/** How values encoded by `ast` order: as numbers, as text, or not at all. */
const orderKindOf = (ast: SchemaAST.AST): 'number' | 'text' | 'none' => {
  if (SchemaAST.isNumber(ast)) return 'number'
  if (SchemaAST.isString(ast) || SchemaAST.isTemplateLiteral(ast)) return 'text'
  if (SchemaAST.isLiteral(ast)) {
    if (typeof ast.literal === 'number') return 'number'
    if (typeof ast.literal === 'string') return 'text'
    return 'none'
  }
  if (SchemaAST.isUnion(ast)) {
    // A null orders nowhere, as every comparison of it is unknown.
    const kinds = new Set(ast.types.filter(member => !SchemaAST.isNull(member)).map(orderKindOf))
    const [only] = kinds
    return kinds.size === 1 && only !== undefined ? only : 'none'
  }
  return 'none'
}

/** How a literal orders; a null orders as anything, since comparing it is unknown. */
const literalKind = (value: unknown): 'number' | 'text' | 'none' | 'null' => {
  if (value === null) return 'null'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'string') return 'text'
  return 'none'
}

/** How a side orders, read from its encoded form. */
const sideKind = (side: AnyExpr): 'number' | 'text' | 'none' | 'null' =>
  Match.value(side).pipe(
    Match.tagsExhaustive({
      Field: field => orderKindOf(Schema.toEncoded(field.schema).ast),
      Next: ({ field }) => orderKindOf(Schema.toEncoded(field.schema).ast),
      Input: input => orderKindOf(Schema.toEncoded(input.schema).ast),
      Literal: ({ value }) => literalKind(value),
      Call: ({ operator }) => orderKindOf(Schema.toEncoded(operator.output).ast),
      Viewer: ({ schema }) => orderKindOf(Schema.toEncoded(schema).ast),
      Now: ({ schema }) => orderKindOf(Schema.toEncoded(schema).ast),
      Path: ({ field }) => orderKindOf(Schema.toEncoded(field.schema).ast),
    }),
  )

/**
 * How a comparison's text compares: the collation given, else the field's
 * declared one. Text orders differently by backend (SQLite's `BINARY`, the
 * Postgres database's locale, JavaScript's UTF-16 units), so it is compared
 * only under `binary` or `asciiFold`, which every interpreter here agrees on,
 * and only against a field, whose collation it is. Values that order
 * intrinsically, numbers, need none.
 */
const collationFor = (
  step: CompareOperator,
  left: AnyExpr,
  right: AnyExpr,
  given: Option.Option<Collation>,
): Option.Option<Collation> => {
  const kinds = new Set([sideKind(left), sideKind(right)].filter(kind => kind !== 'null'))
  if (kinds.has('none') || kinds.size > 1) {
    throw new Error(
      `[foldkit-entity] Expr.${step}: only numbers with numbers, or text with text, order alike in every interpreter, as stored`,
    )
  }
  if (!kinds.has('text')) return Option.none()
  // The sides that can say how text orders: a field, as declared, or a call, as its
  // operator's rule carries one. A literal or an input says nothing.
  const fields = [left, right].flatMap(side =>
    Match.value(side).pipe(
      Match.tagsExhaustive({
        Field: field => [{ name: `${field.owner.name}.${field.key}`, collation: field.collation }],
        Next: ({ field }) => [
          { name: `${field.owner.name}.${field.key}`, collation: field.collation },
        ],
        Call: call => [{ name: showExpr(call), collation: call.collation }],
        Path: path => [{ name: showExpr(path), collation: path.field.collation }],
        Literal: () => [],
        Input: () => [],
        Viewer: () => [],
        Now: () => [],
      }),
    ),
  )
  const [first] = fields
  if (first === undefined) {
    throw new Error(
      `[foldkit-entity] Expr.${step}: text compared with no field, nor a call carrying a collation, to say how it orders`,
    )
  }
  const named = fields.map(field => field.name).join(' and ')
  const collations = Option.match(given, {
    onSome: collation => [collation],
    onNone: () =>
      fields.map(field =>
        Option.getOrElse(field.collation, () => {
          throw new Error(
            `[foldkit-entity] Expr.${step}: ${field.name} is text with no declared collation, so backends would order it differently; declare Collation.binary or Collation.asciiFold on it, or pass one`,
          )
        }),
      ),
  })
  const [collation] = collations
  if (collation === undefined || collations.some(each => each._tag !== collation._tag)) {
    throw new Error(
      `[foldkit-entity] Expr.${step}: ${named} declare different collations; pass one to compare them by`,
    )
  }
  return Match.value(collation).pipe(
    Match.tagsExhaustive({
      Binary: () => Option.some(collation),
      AsciiFold: () => Option.some(collation),
      Locale: ({ locale }) => {
        throw new Error(
          `[foldkit-entity] Expr.${step}: ${named} compares by the backend's "${locale}" collation, which only that backend has`,
        )
      },
    }),
  )
}

/** `Expr.lt` and its three siblings: the operator fixed, the sides typed alike. */
const comparison =
  (operator: CompareOperator) =>
  <L extends OrderedOperand, R extends ValueOf<L> | Expr<ValueOf<L>>>(
    left: L,
    right: R,
    options: { readonly collation?: Collation | undefined } = {},
  ): ComparePredicate & Reads<ReadsOf<L> | ReadsOf<R>> => {
    const leftSide = toExpr<unknown>(left, operator)
    const rightSide = toExpr<unknown>(right, operator)
    return node({
      _tag: 'Compare',
      operator,
      left: leftSide,
      right: rightSide,
      collation: collationFor(
        operator,
        leftSide,
        rightSide,
        Option.fromUndefinedOr(options.collation),
      ),
    })
  }

/** A connective's operands, each checked to be a predicate, with one of the same kind flattened in. */
const connected = (
  step: 'and' | 'or',
  kind: 'And' | 'Or',
  given: ReadonlyArray<unknown>,
): Arr.NonEmptyReadonlyArray<Predicate> => {
  const operands = given.flatMap((operand): ReadonlyArray<Predicate> => {
    if (!isPredicate(operand)) {
      throw new Error(
        `[foldkit-entity] Expr.${step}: every operand is a predicate; compare a value with Expr.eq first`,
      )
    }
    return Match.value(operand).pipe(
      Match.tags({
        And: and => (kind === 'And' ? and.operands : [and]),
        Or: or => (kind === 'Or' ? or.operands : [or]),
      }),
      Match.orElse(() => [operand]),
    )
  })
  // Flattening copies a shared operand's list, so `or(x, x)` built thirty deep
  // would be 2^30 operands before the budget ever counts them.
  if (operands.length > maxQueryNodes) {
    throw new Error(
      `[foldkit-entity] Expr.${step}: more than ${maxQueryNodes} operands, the most a query's predicates may hold`,
    )
  }
  if (!Arr.isReadonlyArrayNonEmpty(operands)) {
    throw new Error(
      `[foldkit-entity] Expr.${step}: no operands, which would match ${step === 'and' ? 'every row' : 'no row'}; check a list is non-empty before spreading it`,
    )
  }
  return operands
}

/** `Expr.and` and `Expr.or`: one operand is that operand, and two or more are one node. */
interface Connective<Node extends Predicate> {
  <P extends Predicate>(only: P): P
  <A extends Predicate, B extends Predicate, Rest extends ReadonlyArray<Predicate>>(
    first: A,
    second: B,
    ...rest: Rest
  ): Node & Reads<ReadsOf<A> | ReadsOf<B> | ReadsOf<Rest[number]>>
  (...operands: Arr.NonEmptyReadonlyArray<Predicate>): Predicate
}

const connective =
  <Node extends AndPredicate | OrPredicate>(step: 'and' | 'or', kind: Node['_tag']) =>
  (...given: ReadonlyArray<Predicate>): Predicate => {
    const operands = connected(step, kind, given)
    return operands.length === 1 ? operands[0] : node({ _tag: kind, operands } as Node)
  }

/** A schema's stored form, which is what an operator takes and gives. */
type StoredOf<S extends Schema.Top> = Schema.Codec.Encoded<S>

/**
 * One argument an operator may be called with: a field or scalar stored as the
 * input's stored type, a predicate where it takes a boolean, or a plain value.
 */
export type ArgumentOf<S extends Schema.Top> =
  | EntityField<string, string, Schema.Constraint & Schema.Codec<any, StoredOf<S>, any, any>>
  | Expr<StoredOf<S>>
  | (boolean extends StoredOf<S> ? Predicate : never)
  | StoredOf<S>

/** What `definedAs` is handed for one argument: the argument as a node. */
export type ParameterOf<S extends Schema.Top> =
  | Expr<StoredOf<S>>
  | (boolean extends StoredOf<S> ? Predicate : never)

/** A call's node: a predicate for a boolean result, a scalar for anything else. */
type CallOf<Out extends Schema.Top> = [StoredOf<Out>] extends [boolean]
  ? TestPredicate
  : CallExpr<StoredOf<Out>>

/** What `definedAs` builds: a predicate for a boolean result, a scalar otherwise. */
type BodyOf<Out extends Schema.Top> = [StoredOf<Out>] extends [boolean]
  ? Predicate
  : Expr<StoredOf<Out>>

/**
 * An operator: called like a function, it builds a node that holds `descriptor`
 * and its arguments. See `Expr.operator`.
 */
export interface Operator<In extends ReadonlyArray<Schema.Top>, Out extends Schema.Top> {
  <const A extends { readonly [K in keyof In]: ArgumentOf<In[K]> }>(
    ...args: A
  ): CallOf<Out> & Reads<ReadsOf<A[number]>>
  /**
   * A call comparing text under the collation given, rather than its text
   * arguments' declared one: for an operator whose `collation` is `operands`
   * or `required`, as `Expr.lt(field, value, { collation })` is.
   */
  <const A extends { readonly [K in keyof In]: ArgumentOf<In[K]> }>(
    ...args: [...A, CallOptions]
  ): CallOf<Out> & Reads<ReadsOf<A[number]>>
  readonly descriptor: OperatorDescriptor
}

/** What a call may say past its arguments. */
export interface CallOptions {
  /** The collation it compares text under, in place of its arguments' declared one. */
  readonly collation: Collation
}

const collationTags = new Set(['Binary', 'AsciiFold', 'Locale'])

/** A call's last value, when it is one past the arguments: its options, checked. */
const callOptionsOf = (id: string, value: unknown): Collation => {
  const collation =
    typeof value === 'object' && value !== null && Object.hasOwn(value, 'collation')
      ? (value as { readonly collation: unknown }).collation
      : undefined
  if (!collationTags.has(tagOf(collation) as string)) {
    throw new Error(
      `[foldkit-entity] ${id}: a value past its arguments is \`{ collation }\`, a Collation`,
    )
  }
  return collation as Collation
}

/** A collation a call was given: one its operator compares by, and portable where required. */
const givenCollation = (
  id: string,
  descriptor: OperatorDescriptor,
  collation: Collation,
): Option.Option<Collation> => {
  if (Option.isSome(descriptor.definedAs) || descriptor.collation === 'none') {
    throw new Error(`[foldkit-entity] ${id}: takes no collation; it compares no text of its own`)
  }
  // No call carries a locale: the client could not run it, and SQL compiles none.
  if (collation._tag === 'Locale') {
    throw new Error(
      `[foldkit-entity] ${id}: compares by the backend's "${collation.locale}" collation, which only that backend has`,
    )
  }
  return Option.some(collation)
}

/** Namespaced, lower camel case: `cms.published`, `text.startsWith`. */
const operatorId = /^[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9]*)+$/

/**
 * Why `law` cannot be declared of an operator of this shape, if it cannot: an
 * equation over two arguments of a unary operator, a witness that does not
 * decode as the argument it stands in, or a collation law of an operator
 * whose text keeps none.
 */
const lawProblem = (
  law: Law,
  input: ReadonlyArray<Schema.Top>,
  output: Schema.Top,
  collation: OperatorDescriptor['collation'],
): Option.Option<string> => {
  const name = Law.describe(law).kind
  const binary = (): Option.Option<string> =>
    input.length === 2
      ? Option.none()
      : Option.some(
          `${name} is a law of an operator of two arguments, and this one takes ${input.length}`,
        )
  const decodes = (value: unknown, schema: Schema.Top, what: string): Option.Option<string> =>
    Schema.is(Schema.toEncoded(schema))(value)
      ? Option.none()
      : Option.some(`${name}'s ${what} ${JSON.stringify(value)} does not decode as its schema`)
  const sides = (value: unknown, side: Side): Option.Option<string> =>
    Option.orElse(binary(), () =>
      Option.orElse(
        side === 'right' ? Option.none() : decodes(value, input[0]!, 'left witness'),
        () => (side === 'left' ? Option.none() : decodes(value, input[1]!, 'right witness')),
      ),
    )
  return Law.$match(law, {
    Associative: binary,
    Commutative: binary,
    Idempotent: binary,
    Identity: ({ value, side }) => sides(value, side),
    Absorbing: ({ value, side }) => sides(value, side),
    Inverse: ({ other, identity }) =>
      Option.orElse(binary(), () =>
        other.descriptor.input.length === 1
          ? decodes(identity, output, 'identity')
          : Option.some(`${name}'s other operator takes one argument`),
      ),
    Distributes: ({ over }) =>
      Option.orElse(binary(), () =>
        over.descriptor.input.length === 2
          ? Option.none()
          : Option.some(`${name} is over an operator of two arguments`),
      ),
    Monotonic: ({ position }) =>
      Number.isSafeInteger(position) && position >= 0 && position < input.length
        ? Option.none()
        : Option.some(`${name}'s position ${position} is not an argument's`),
    PreservesCollation: () =>
      collation === 'operands'
        ? Option.none()
        : Option.some(`${name} is a law of an operator declared \`collation: 'operands'\``),
  })
}

/** Whether a schema's stored form is a boolean, which makes its operator a predicate. */
const storedAsBoolean = (schema: Schema.Top): boolean =>
  SchemaAST.isBoolean(Schema.toEncoded(schema).ast)

/** What a schema stores, null aside: one kind an argument is checked by, or `other`. */
const storedKindOf = (schema: Schema.Top): 'number' | 'text' | 'boolean' | 'other' => {
  const present = SchemaShape.present(Schema.toEncoded(schema).ast)
  if (present.length === 0) return 'other'
  if (present.every(SchemaAST.isNumber)) return 'number'
  if (present.every(SchemaShape.isText)) return 'text'
  if (present.every(SchemaAST.isBoolean)) return 'boolean'
  return 'other'
}

/** The schema a scalar's values are stored by. */
const scalarSchema = (scalar: AnyExpr): Schema.Top =>
  Match.value(scalar).pipe(
    Match.tagsExhaustive({
      Field: field => field.schema,
      Next: ({ field }) => field.schema,
      Input: input => input.schema,
      Literal: () => Schema.Unknown,
      Call: ({ operator }) => operator.output,
      Viewer: ({ schema }) => schema,
      Now: ({ schema }) => schema,
      Path: ({ field }) => field.schema,
    }),
  )

/** Every field, field after a write, and input an expression reads, as keys to compare. */
const readKeys = (...nodes: ReadonlyArray<Operandish>): ReadonlySet<string> => {
  const read = dependenciesOf(...nodes)
  const named = (prefix: string, fields: ReadonlyArray<FieldDependency>) =>
    fields.map(field => `${prefix}${field.entity}.${field.key}`)
  return new Set([
    ...named('', read.fields),
    ...named('next ', read.next),
    ...read.inputs.map(key => `$${key}`),
  ])
}

/** One argument, checked against the schema it is passed for, as a node. */
const argumentFor = (
  id: string,
  position: number,
  schema: Schema.Top,
  value: unknown,
): Operandish => {
  const arg = toOperand(value)
  const fail = (what: string) => {
    throw new Error(`[foldkit-entity] ${id}: argument ${position + 1} ${what}`)
  }
  if (isPredicate(arg)) {
    if (!storedAsBoolean(schema)) fail('is a predicate, but the operator does not take a boolean')
    return arg
  }
  if (arg._tag === 'Literal') {
    if (!Schema.is(Schema.toEncoded(schema))(arg.value)) {
      fail(`is ${JSON.stringify(arg.value)}, which the operator's input schema does not admit`)
    }
    return arg
  }
  const wanted = storedKindOf(schema)
  const given = storedKindOf(scalarSchema(arg))
  if (wanted !== 'other' && given !== 'other' && given !== wanted) {
    fail(`is stored as ${given}, but the operator takes ${wanted}`)
  }
  return arg
}

/** A scalar's collation: a field's declared one, or a call's. */
const collationOf = (scalar: AnyExpr): Option.Option<Collation> =>
  Match.value(scalar).pipe(
    Match.tagsExhaustive({
      Field: field => field.collation,
      Next: ({ field }) => field.collation,
      Call: call => call.collation,
      Literal: () => Option.none<Collation>(),
      Input: () => Option.none<Collation>(),
      Viewer: () => Option.none<Collation>(),
      Now: () => Option.none<Collation>(),
      Path: ({ field }) => field.collation,
    }),
  )

/**
 * The collation a primitive call compares text under: the one its collated
 * text arguments share. A literal or an input carries none and does not vote.
 * `required` refuses a call with none, or with a backend's locale.
 */
const callCollation = (
  id: string,
  rule: OperatorDescriptor['collation'],
  args: ReadonlyArray<Operandish>,
): Option.Option<Collation> => {
  if (rule === 'none') return Option.none()
  const fail = (what: string): never => {
    throw new Error(`[foldkit-entity] ${id}: ${what}`)
  }
  // Named only in a refusal: rendering each voter on every call is exponential in a
  // nesting of calls that share their arguments.
  const voters = args.flatMap(arg =>
    isPredicate(arg) || arg._tag === 'Literal' || arg._tag === 'Input' || sideKind(arg) !== 'text'
      ? []
      : [{ arg, collation: collationOf(arg) }],
  )
  const collations = voters.flatMap(({ arg, collation }) =>
    Option.match(collation, {
      onSome: each => [each],
      onNone: (): ReadonlyArray<Collation> =>
        rule === 'required'
          ? fail(
              `${showExpr(arg)} is text with no declared collation, so backends would compare it differently; declare Collation.binary or Collation.asciiFold on it`,
            )
          : [],
    }),
  )
  const [shared] = collations
  if (shared === undefined) {
    return rule === 'required'
      ? fail('compares text with no field or call holding a collation')
      : Option.none()
  }
  if (collations.some(each => each._tag !== shared._tag)) {
    fail(`${voters.map(voter => showExpr(voter.arg)).join(' and ')} declare different collations`)
  }
  if (shared._tag === 'Locale') {
    fail(`compares by the backend's "${shared.locale}" collation, which a call cannot carry`)
  }
  return Option.some(shared)
}

/** Builds an operator: checks what it is given once, then each call. */
const makeOperator = (
  id: string,
  options: {
    readonly input: ReadonlyArray<Schema.Top>
    readonly output: Schema.Top
    readonly version?: number | undefined
    readonly description?: string | undefined
    readonly definedAs?: ((...args: ReadonlyArray<Operandish>) => unknown) | undefined
    readonly nulls?: OperatorDescriptor['nulls'] | undefined
    readonly collation?: OperatorDescriptor['collation'] | undefined
    readonly laws?: ReadonlyArray<Law> | undefined
  },
): Operator<ReadonlyArray<Schema.Top>, Schema.Top> => {
  const fail = (what: string): never => {
    throw new Error(`[foldkit-entity] Expr.operator("${id}"): ${what}`)
  }
  if (!operatorId.test(id)) {
    fail('an id is namespaced lower camel case, as `cms.published`')
  }
  if (id.startsWith('foldkit.')) fail('ids under `foldkit.` are reserved')
  const version = options.version ?? 1
  if (!Number.isSafeInteger(version) || version < 1) fail('a version is a positive integer')
  if (!Array.isArray(options.input) || !options.input.every(Schema.isSchema)) {
    fail('`input` is one schema per argument')
  }
  if (!Schema.isSchema(options.output)) fail('`output` is a schema')
  const definedAs = Option.fromUndefinedOr(options.definedAs)
  if (Option.isSome(definedAs) && typeof definedAs.value !== 'function') {
    fail('`definedAs` builds what a call means')
  }
  // A defined operator means its body, null and text alike: it declares neither.
  if (
    Option.isSome(definedAs) &&
    (options.nulls !== undefined || options.collation !== undefined)
  ) {
    fail("a defined operator means its body, so `nulls` and `collation` are its body's")
  }
  const nulls = options.nulls ?? 'strict'
  const collation = options.collation ?? 'none'
  if (nulls !== 'strict' && nulls !== 'handled') fail("`nulls` is 'strict' or 'handled'")
  if (collation !== 'none' && collation !== 'operands' && collation !== 'required') {
    fail("`collation` is 'none', 'operands' or 'required'")
  }
  const input = Object.freeze([...options.input])
  const predicate = storedAsBoolean(options.output)
  if (collation === 'operands' && orderKindOf(Schema.toEncoded(options.output).ast) !== 'text') {
    fail("`collation: 'operands'` describes a text result, and this one is not text")
  }
  const laws = Object.freeze([...(options.laws ?? [])])
  for (const law of laws) {
    Option.match(lawProblem(law, input, options.output, collation), {
      onNone: () => undefined,
      onSome: fail,
    })
  }
  const descriptor: OperatorDescriptor = Object.freeze({
    _tag: 'Operator',
    id,
    version,
    description: Option.fromUndefinedOr(options.description),
    input,
    output: options.output,
    definedAs: definedAs as OperatorDescriptor['definedAs'],
    nulls,
    collation,
    laws,
  })
  /** A defined call's expansion, checked: of its output's kind, reading only its arguments. */
  const expand = (
    body: (...args: ReadonlyArray<Operandish>) => Operandish,
    args: ReadonlyArray<Operandish>,
  ): Operandish => {
    const expansion = toOperand(body(...args))
    if (predicate !== isPredicate(expansion)) {
      throw new Error(
        `[foldkit-entity] ${id}: its output is ${predicate ? 'a boolean, so `definedAs` returns a predicate' : 'not a boolean, so `definedAs` returns a scalar'}`,
      )
    }
    // An expansion reading what its arguments do not would hide a read from
    // anyone asking what the call depends on: Guard's checks, Remote's matching.
    const allowed = readKeys(...args)
    const hidden = [...readKeys(expansion)].filter(key => !allowed.has(key))
    if (hidden.length > 0) {
      throw new Error(
        `[foldkit-entity] ${id}: \`definedAs\` reads ${hidden.join(', ')}, which no argument holds; pass it as one`,
      )
    }
    return expansion
  }
  const call = (...written: ReadonlyArray<unknown>) => {
    // One value past the arguments is the call's options.
    const explicit =
      written.length === input.length + 1
        ? Option.some(callOptionsOf(id, written[written.length - 1]))
        : Option.none<Collation>()
    const given = Option.isSome(explicit) ? written.slice(0, -1) : written
    if (given.length !== input.length) {
      throw new Error(
        `[foldkit-entity] ${id}: takes ${input.length} argument${input.length === 1 ? '' : 's'}, given ${given.length}`,
      )
    }
    const args = Object.freeze(
      given.map((value, position) => argumentFor(id, position, input[position]!, value)),
    )
    const expansion = Option.map(descriptor.definedAs, body => expand(body, args))
    // A collation given wins; else a defined call's text compares as its body
    // does, and a primitive one's by its rule.
    const carried = Option.match(explicit, {
      onSome: each => givenCollation(id, descriptor, each),
      onNone: () =>
        Option.match(expansion, {
          onSome: body => (isPredicate(body) ? Option.none<Collation>() : collationOf(body)),
          onNone: () => callCollation(id, collation, args),
        }),
    })
    return predicate
      ? node<TestPredicate>({
          _tag: 'Test',
          operator: descriptor,
          args,
          expansion: expansion as Option.Option<Predicate>,
          collation: carried,
        })
      : node<CallExpr<unknown>>({
          _tag: 'Call',
          operator: descriptor,
          args,
          expansion: expansion as Option.Option<AnyExpr>,
          collation: carried,
        })
  }
  return Object.freeze(Object.assign(call, { descriptor })) as unknown as Operator<
    ReadonlyArray<Schema.Top>,
    Schema.Top
  >
}

/** Each defined call replaced by its expansion, deeply; built once per node. */
const expandedCache = new WeakMap<object, AnyExpr | Predicate>()

const expandedScalar = (scalar: AnyExpr): AnyExpr => {
  const known = expandedCache.get(scalar)
  if (known !== undefined) return known as AnyExpr
  const result =
    scalar._tag === 'Call'
      ? Option.match(scalar.expansion, {
          onSome: expandedScalar,
          // An operator with no definition stays, for an interpreter to run or refuse by
          // name; a defined one among its arguments is expanded all the same.
          onNone: () => node<AnyExpr>({ ...scalar, args: scalar.args.map(expandedSide) }),
        })
      : scalar
  expandedCache.set(scalar, result)
  return result
}

const expandedSide = (side: Operandish): Operandish =>
  isPredicate(side) ? expandedPredicate(side) : expandedScalar(side)

const expandedPredicate = (predicate: Predicate): Predicate => {
  const known = expandedCache.get(predicate)
  if (known !== undefined) return known as Predicate
  const result: Predicate = Match.value(predicate).pipe(
    Match.tagsExhaustive({
      Eq: eq =>
        node<Predicate>({ ...eq, left: expandedSide(eq.left), right: expandedSide(eq.right) }),
      Null: nul => node<Predicate>({ ...nul, operand: expandedScalar(nul.operand) }),
      Contains: contains =>
        node<Predicate>({
          ...contains,
          value: expandedScalar(contains.value),
          search: expandedSide(contains.search),
        }),
      In: inPredicate =>
        node<Predicate>({
          ...inPredicate,
          value: expandedScalar(inPredicate.value),
          among: expandedScalar(inPredicate.among),
        }),
      And: and => node<Predicate>({ ...and, operands: Arr.map(and.operands, expandedPredicate) }),
      Or: or => node<Predicate>({ ...or, operands: Arr.map(or.operands, expandedPredicate) }),
      Not: not => node<Predicate>({ ...not, operand: expandedPredicate(not.operand) }),
      Compare: compare =>
        node<Predicate>({
          ...compare,
          left: expandedScalar(compare.left),
          right: expandedScalar(compare.right),
        }),
      Test: test =>
        Option.match(test.expansion, {
          onSome: expandedPredicate,
          onNone: () => node<Predicate>({ ...test, args: test.args.map(expandedSide) }),
        }),
      Exists: exists =>
        node<Predicate>({ ...exists, where: Option.map(exists.where, expandedPredicate) }),
    }),
  )
  expandedCache.set(predicate, result)
  return result
}

/**
 * The most relations one path follows. Each is a subquery in SQL and a lookup
 * in memory; the deepest rule a real app here writes follows two.
 */
export const maxPathLength = 4

/** What a path may end at on a row of `Name`: a field, a further path, or an exists. */
export type PathEnd<Name extends string> =
  | EntityField<Name, string, Schema.Constraint>
  | (PathExpr<any> & Reads<Name>)
  | (ExistsPredicate & Reads<Name>)

/** A value checked to be a `one` relation, or refused with what to write instead. */
const oneRelation = (step: 'path' | 'exists', value: unknown): OneRelation => {
  if (tagOf(value) !== 'Relation') {
    throw new Error(
      `[foldkit-entity] Expr.${step}: the first argument is a relation (Post.relations.author)`,
    )
  }
  const relation = value as EntityRelation<string, string, AnyEntity, Cardinality, boolean>
  if (relation.cardinality !== 'one') {
    throw new Error(
      `[foldkit-entity] Expr.${step}: ${relation.owner.name}.${relation.key} is a many relation; name the one relation that points back${step === 'path' ? ', with Expr.exists' : ''}`,
    )
  }
  return relation as OneRelation
}

/** `Expr.path`: `relation` followed first, then whatever `end` reads, checked to be on its target. */
const pathOf = (relation: unknown, end: unknown): PathExpr<unknown> | ExistsPredicate => {
  const first = oneRelation('path', relation)
  const target = first.target().identity
  const onTarget = (owner: EntityIdentity<string>, what: string): void => {
    if (owner.token !== target.token) {
      throw new Error(
        `[foldkit-entity] Expr.path: ${first.owner.name}.${first.key} reaches a ${target.name}, but ${what} is read on a ${owner.name}`,
      )
    }
  }
  const capped = <P extends PathExpr<unknown> | ExistsPredicate>(path: P): P => {
    if (path.via.length > maxPathLength) {
      throw new Error(
        `[foldkit-entity] Expr.path: ${showExpr(path)} follows more than ${maxPathLength} relations`,
      )
    }
    return node(path)
  }
  return Match.value(toOperand(end)).pipe(
    Match.tag('Field', field => {
      onTarget(field.owner, `${field.owner.name}.${field.key}`)
      return capped<PathExpr<unknown>>({ _tag: 'Path', via: [first], field })
    }),
    Match.tag('Path', path => {
      onTarget(path.via[0].owner, showExpr(path))
      return capped<PathExpr<unknown>>({ ...path, via: [first, ...path.via] })
    }),
    Match.tag('Exists', exists => {
      onTarget(existsStart(exists).owner, showExpr(exists))
      return capped<ExistsPredicate>({ ...exists, via: [first, ...exists.via] })
    }),
    Match.orElse(other => {
      throw new Error(
        `[foldkit-entity] Expr.path: a path ends at a field, a path or an exists, not ${showExpr(other)}`,
      )
    }),
  )
}

/** `Expr.exists`: the filter checked to read only the pointing row and the input. */
const existsOf = (relation: unknown, where: unknown): ExistsPredicate => {
  const pointing = oneRelation('exists', relation)
  const filter = Option.fromUndefinedOr(where)
  Option.map(filter, given => {
    if (!isPredicate(given)) {
      throw new Error('[foldkit-entity] Expr.exists: the filter is a predicate')
    }
    const read = dependenciesOf(given)
    const foreign = read.fields.find(field => field.owner.token !== pointing.owner.token)
    // A filter reading the row asked about, or a further row, would be a
    // correlation each interpreter has to carry: say it with a path instead.
    if (foreign !== undefined || read.next.length > 0 || read.reaches.length > 0) {
      throw new Error(
        `[foldkit-entity] Expr.exists: the filter reads ${foreign === undefined ? 'past its row' : `${foreign.entity}.${foreign.key}`}; it reads the pointing ${pointing.owner.name}'s own fields and the input`,
      )
    }
  })
  return node({
    _tag: 'Exists',
    via: [],
    relation: pointing,
    where: filter as Option.Option<Predicate>,
  })
}

/** `Expr.field`: an Entity field, or an expression refused with what to write instead. */
interface FieldOf {
  <Name extends string, Key extends string, S extends Schema.Constraint>(
    field: EntityField<Name, Key, S>,
  ): FieldExpr<Schema.Schema.Type<S>> & Reads<Name>
  (
    expression: Expr<unknown> &
      Invalid<'foldkit-entity: Expr.field takes an Entity field (Post.fields.title); before.x and after.x are expressions already, so compare them as they are'>,
  ): never
}
// The second signature only refuses, at compile time: nothing but a field reaches here.
const fieldOf = ((field: EntityField<string, string, Schema.Constraint>) =>
  fieldExpr(field)) as FieldOf

export const Expr = {
  /**
   * An operator, defined by what a call of it means: `definedAs` builds that
   * expression from the call's arguments, once per call, and every interpreter
   * runs it, so the operator needs no implementation anywhere. What it adds is
   * a name: a query, a guard and an invariant that mean the same thing say so,
   * and print it.
   *
   * ```ts
   * const published = Expr.operator('cms.published', {
   *   input: [Schema.Unknown],
   *   output: Schema.Boolean,
   *   definedAs: publishedAt => Expr.isNotNull(publishedAt),
   * })
   * Query.where(published(Post.fields.publishedAt))
   * ```
   *
   * Arguments are checked by their stored form: a field, scalar or plain value
   * of the input's stored type, or a predicate where it takes a boolean. A
   * boolean output makes a call a predicate. `definedAs` may read only what its
   * arguments hold: a field or input it closes over instead is refused when
   * called, since nothing asking what the call reads would see it. The id is
   * namespaced (`cms.published`); `foldkit.` is reserved; `version` (default 1)
   * changes when what it means does.
   *
   * **Without `definedAs` it is primitive**: each interpreter implements it
   * (`Operators.implement` in memory), and one without an implementation
   * refuses the body by the operator's id. `nulls` (default `strict`: a null
   * argument gives null, the implementation never sees one) and `collation`
   * (`operands`: a text result carries its text arguments' shared collation;
   * `required`: it compares text itself and needs one) are a primitive
   * operator's; a defined one means its body for both.
   */
  operator: <const In extends ReadonlyArray<Schema.Top>, Out extends Schema.Top>(
    id: string,
    options: {
      readonly input: In
      readonly output: Out
      readonly version?: number | undefined
      readonly description?: string | undefined
      /** Equations every implementation keeps (`Law.commutative`, `Law.identity('')`, …). */
      readonly laws?: ReadonlyArray<Law> | undefined
    } & (
      | {
          readonly definedAs: (
            ...args: { readonly [K in keyof In]: ParameterOf<In[K]> }
          ) => BodyOf<Out>
          readonly nulls?: undefined
          readonly collation?: undefined
        }
      | {
          readonly definedAs?: undefined
          readonly nulls?: OperatorDescriptor['nulls'] | undefined
          readonly collation?: OperatorDescriptor['collation'] | undefined
        }
    ),
  ): Operator<In, Out> =>
    makeOperator(id, options as Parameters<typeof makeOperator>[1]) as unknown as Operator<In, Out>,

  /**
   * The predicate or scalar (an order term's, say) with every call of a
   * defined operator replaced by what it means, deeply. An interpreter that
   * compiles a body expands it first, and compiles exactly what was written
   * out. A call with no definition stays, for the interpreter to run or refuse
   * by name.
   */
  /**
   * Whether a constant written in these expressions is one no two backends
   * agree on, text holding a NUL or NaN, or a list holding one: SQL refuses
   * such a parameter wherever it compiles, so an interpreter refuses the run,
   * not one row.
   */
  givesUnportable: (...nodes: ReadonlyArray<AnyExpr | Predicate>): boolean => {
    const seen = new Set<object>()
    const nul = (value: unknown) =>
      (typeof value === 'string' && value.includes(String.fromCharCode(0))) ||
      (typeof value === 'number' && Number.isNaN(value))
    const walk = (node: AnyExpr | Predicate): boolean => {
      if (seen.has(node)) return false
      seen.add(node)
      if (node._tag === 'Literal') {
        return Array.isArray(node.value) ? node.value.some(nul) : nul(node.value)
      }
      return childrenOf(node).some(walk)
    }
    return nodes.some(walk)
  },

  expanded: <N extends Predicate | AnyExpr>(node: N): N extends Predicate ? Predicate : AnyExpr =>
    (isPredicate(node) ? expandedPredicate(node) : expandedScalar(node)) as never,

  /**
   * What these expressions need that an interpreter lacks, as `Query.unsupported`
   * says it for a query: each kernel operation `supported` does not list, then
   * each primitive operator `operators` does not implement, by name (`id`, or
   * `id@version` past the first). For anything holding expressions that is not a
   * query: a guard's rule, an invariant, a write's `when`.
   */
  unsupported: (
    nodes: ReadonlyArray<AnyExpr | Predicate | Ordering>,
    interpreter: {
      readonly operations: ReadonlyArray<Operation>
      readonly operators: OperatorTable
    },
  ): ReadonlyArray<string> => unsupportedIn(nodes, interpreter.operations, interpreter.operators),

  /** A constant. Comparisons coerce a plain value, so this is rarely written. */
  literal,

  /**
   * A value the query is given when it runs. A definition builds these from its
   * `Input` schema; written by hand only when constructing a body directly.
   */
  input: <T>(key: string, schema: Schema.Codec<T, unknown>): InputExpr<T> =>
    node({ _tag: 'Input', key, schema }),

  /**
   * A field as the row a write would leave holds it: what `Entity.invariant`'s
   * builder hands out as `after`.
   */
  next: <Name extends string, Key extends string, S extends Schema.Constraint>(
    field: EntityField<Name, Key, S>,
  ): NextExpr<Schema.Schema.Type<S>> & Reads<Name> =>
    node({ _tag: 'Next', field: fieldExpr(field) }) as NextExpr<Schema.Schema.Type<S>>,

  /**
   * One field of one Entity, as a scalar. An expression is one already: an
   * invariant's `before.x` and `after.x` compare as they are, so wrapping one
   * is refused with that sentence.
   */
  field: fieldOf,

  /**
   * What the row reached through a `one` relation holds: a field of it, a
   * further path from it, or an exists asked of it. The first relation is the
   * judged row's own.
   *
   * ```ts
   * Expr.eq(Expr.path(Post.relations.author, User.fields.handle), input.handle)
   * Expr.path(Note.relations.project, Expr.path(Project.relations.org, Org.fields.plan))
   * ```
   *
   * A null link, or a row the reader may not see, reaches no row: the field
   * reads null, and an exists at the end is unknown, as SQL's scalar subquery
   * is. At most `maxPathLength` relations.
   */
  path: pathOf as <
    Owner extends string,
    Target extends AnyEntity,
    E extends PathEnd<Target['name']>,
  >(
    relation: EntityRelation<Owner, string, Target, 'one', boolean>,
    end: E,
  ) => (E extends ExistsPredicate ? ExistsPredicate : PathExpr<ValueOf<E> | null>) & Reads<Owner>,

  /**
   * Some row points at this one through `relation`, a `one` relation of
   * another Entity, and holds `where`, a predicate over that row's own fields
   * and the input:
   *
   * ```ts
   * // Posts whose author the reader follows.
   * Expr.path(Post.relations.author,
   *   Expr.exists(Follow.relations.followee, Expr.eq(Follow.fields.followerId, input.me)))
   * ```
   *
   * Only rows the reader may see are sought. Never unknown in SQL; in memory,
   * unknown when no held row holds and the holder may lack one that would.
   */
  exists: existsOf as <
    Owner extends string,
    Target extends AnyEntity,
    W extends Predicate & Reads<Owner> = never,
  >(
    relation: EntityRelation<Owner, string, Target, 'one', boolean>,
    where?: W,
  ) => ExistsPredicate & Reads<Target['name']>,

  /**
   * Whoever asks, as a row of `entity`: `Expr.eq(Like.fields.userId,
   * Expr.viewer(User))`. Shaped as a `one` relation to `entity`. Its value is
   * the row's id, and null for a visitor or a viewer of another Entity, so a
   * comparison with it holds of no row. A server reads it from
   * `RemoteServer.make`'s `viewer`, a client from `Remote.make`'s.
   */
  viewer,

  /**
   * The time of the write, in milliseconds since the epoch, as a number field
   * stores it. A server reads its clock. A client judging a list has no
   * reading of the time the server judged it at, so such a list is the
   * server's to say.
   */
  now,

  /**
   * Two scalars are the same value: a field (or an expression) on the left,
   * and the value on the right, typed from it. Fields and plain values are
   * coerced, so the common form reads as it means:
   *
   * ```ts
   * Expr.eq(Post.fields.slug, input.slug)
   * Expr.eq(Post.fields.status, 'active')
   * ```
   */
  eq: <
    L extends Operand<any> | PlainValue,
    R extends (L extends PlainValue
      ? Invalid<'foldkit-entity: Expr.eq takes the field on the left and the value on the right'>
      : ValueOf<L> | Expr<ValueOf<L>> | (boolean extends ValueOf<L> ? Predicate : never)),
  >(
    left: L,
    // The right side is typed from the left, so a plain value on the left has
    // nothing to type it by: say so, rather than that 3 is no `Operand`.
    right: R,
  ): EqPredicate & Reads<ReadsOf<L> | ReadsOf<R>> =>
    node({ _tag: 'Eq', left: toOperand(left), right: toOperand(right as never) }),

  /**
   * Whether a field holds no value. Its opposite is `isNotNull`; both are the
   * one node, since a query asks which of the two it means, and `is not null`
   * has no unknown for a `not` to keep.
   */
  isNull: <L extends Operand<any>>(operand: L): NullPredicate & Reads<ReadsOf<L>> =>
    node({ _tag: 'Null', operand: toExpr(operand, 'isNull'), present: false }),

  /** Whether a field holds a value. */
  isNotNull: <L extends Operand<any>>(operand: L): NullPredicate & Reads<ReadsOf<L>> =>
    node({ _tag: 'Null', operand: toExpr(operand, 'isNotNull'), present: true }),

  /**
   * Whether a text value contains `search`, anywhere in it. Containing the
   * empty string is everything, so a search box with nothing typed in it is the
   * same query as one with something — no branch, and no second query.
   *
   * **Case-insensitive**, which is what a search means, and which has to be
   * said rather than left to the interpreter: SQLite's `like` ignores case and
   * Postgres's does not, so a body that left it open would mean two things.
   * Folding is ASCII-only, because that is what `lower` does in SQLite without
   * ICU.
   *
   * **Over a column that can be null this is not the same as no filter.** A
   * null contains nothing, not even the empty string, so its rows drop out. A
   * nullable column that should match everything on an empty search says so:
   * `Expr.or(Expr.isNull(field), Expr.contains(field, input.search))`.
   */
  contains: <L extends TextOperand>(
    value: L,
    search: string | LiteralExpr<string> | InputExpr<string> | InputExpr<string | null>,
  ): ContainsPredicate & Reads<ReadsOf<L>> => {
    const operand = toOperand(search as never)
    // A search a row decides would have to be escaped as a pattern in SQL, which
    // no compiler here does: it is a value or an input.
    if (operand._tag !== 'Literal' && operand._tag !== 'Input') {
      throw new Error(
        `[foldkit-entity] Expr.contains: the search is ${showExpr(operand)}; search for a value or an input`,
      )
    }
    return node({ _tag: 'Contains', value: toExpr(value, 'contains'), search: operand })
  },

  /**
   * Whether a value is one of `among`: a list written out, or an input whose
   * value is one. Each element is compared as `eq` compares.
   *
   * ```ts
   * Expr.in(Todo.fields.projectId, input.projectIds)
   * Expr.in(Todo.fields.status, ['open', 'blocked'])
   * ```
   *
   * As SQL's `in`: a null value is unknown, as is no match against a list
   * holding a null, and an empty list matches no row. A list written out is
   * copied, so changing the array afterwards does not change the query.
   */
  in: <L extends Operand<any>>(
    value: L,
    among: ReadonlyArray<ValueOf<L>> | Expr<ReadonlyArray<ValueOf<L>>>,
  ): InPredicate & Reads<ReadsOf<L>> =>
    node({
      _tag: 'In',
      value: toExpr(value, 'in'),
      among: Array.isArray(among) ? literal(Object.freeze([...among])) : toExpr(among, 'in'),
    }),

  /**
   * `left` orders before `right`. Numbers compare as numbers; text compares
   * under a collation, the one given or the field's declared one, which must be
   * `binary` or `asciiFold` (so every backend agrees), and text needs a field on
   * one side. A date compares by its encoded form: as text when it is stored as
   * an ISO string, so its field declares `Collation.binary`. A null on either
   * side is unknown, so the row is matched by neither this nor its `not`.
   *
   * ```ts
   * Expr.lt(fields.cents, 1000)
   * Expr.and(Expr.gte(fields.at, input.from), Expr.lt(fields.at, input.until))
   * ```
   */
  lt: comparison('lt'),
  /** `left` orders before `right`, or with it; see `Expr.lt`. */
  lte: comparison('lte'),
  /** `left` orders after `right`; see `Expr.lt`. */
  gt: comparison('gt'),
  /** `left` orders after `right`, or with it; see `Expr.lt`. */
  gte: comparison('gte'),

  /**
   * Every operand holds, as one predicate to place inside another: `where`'s
   * list is already a conjunction, so this is for `or(and(a, b), c)`.
   * Unknown as SQL's `and` is: false wins over unknown, which wins over true.
   * Needs an operand; a list built at run time is checked non-empty first
   * (`Array.isReadonlyArrayNonEmpty`), since an empty `and` would match every row.
   */
  and: connective<AndPredicate>('and', 'And') as Connective<AndPredicate>,

  /**
   * At least one operand holds:
   *
   * ```ts
   * Expr.or(Expr.contains(fields.description, input.search), Expr.contains(fields.upc, input.search))
   * ```
   *
   * Unknown as SQL's `or` is: true wins over unknown, which wins over false.
   * Needs an operand, since an empty `or` would match no row.
   */
  or: connective<OrPredicate>('or', 'Or') as Connective<OrPredicate>,

  /**
   * The operand does not hold. **A null is matched by neither side**:
   * `not(eq(status, 'draft'))` leaves out a row whose `status` is null, since
   * `null = 'draft'` is unknown and so is its `not`, as in SQL. "Everything
   * but drafts" over a nullable column is
   * `Expr.or(Expr.isNull(status), Expr.not(Expr.eq(status, 'draft')))`.
   */
  not: <P extends Predicate>(operand: P): NotPredicate & Reads<ReadsOf<P>> => {
    if (!isPredicate(operand)) {
      throw new Error(
        '[foldkit-entity] Expr.not: the operand is a predicate; compare a value with Expr.eq first',
      )
    }
    return node({ _tag: 'Not', operand })
  },

  /**
   * A filter that applies only when its input is given: `or(isNull($x), …)`,
   * with the predicate built from the input as never null.
   *
   * ```ts
   * // Every product, or those of the chosen status.
   * Expr.whenGiven(input.status, status => Expr.eq(fields.status, status))
   * ```
   *
   * An interpreter that runs per request, as the Drizzle compiler does, decides
   * `isNull($x)` before writing SQL, so this compiles to `true`, which filters
   * nothing, or to the predicate alone.
   */
  whenGiven: <T, P extends Predicate>(
    input: InputExpr<T>,
    build: (given: InputExpr<NonNullable<T>>) => P,
  ): Predicate & Reads<ReadsOf<P>> =>
    // The predicate only decides a row when the input is not null: when it is,
    // `isNull` is true and so is the `or`. That is what the narrowed type says.
    Expr.or(Expr.isNull(input), build(input as unknown as InputExpr<NonNullable<T>>)),

  /** An expression as readable text; see `showExpr` for what it is and is not. */
  show: (node: Operandish): string => showExpr(node),

  /**
   * The predicate with each field after a write (`Next`) that `values` names,
   * by key, read as that value: how an invariant is judged where the
   * write's new values are known. A field it does not name stays `Next`, for
   * the interpreter to read as the row after holds it.
   */
  substituteNext: (predicate: Predicate, values: Readonly<Record<string, unknown>>): Predicate =>
    substituted(predicate, operand =>
      Match.value(operand).pipe(
        Match.tag('Next', ({ field }) =>
          Object.hasOwn(values, field.key) ? literal(values[field.key]) : operand,
        ),
        Match.orElse(() => operand),
      ),
    ),
}

/** Rewrites one operand; the walk below applies it wherever a predicate holds one. */
type OperandRewrite = (operand: AnyExpr) => AnyExpr

const substitutedSide = (side: Operandish, rewrite: OperandRewrite): Operandish =>
  isPredicate(side) ? substituted(side, rewrite) : substitutedScalar(side, rewrite)

/**
 * A scalar rewritten: a call's arguments and expansion each, so a field read
 * under it is rewritten as one read directly is; anything else by `rewrite`.
 */
const substitutedScalar = (scalar: AnyExpr, rewrite: OperandRewrite): AnyExpr =>
  scalar._tag === 'Call'
    ? node({
        ...scalar,
        args: Object.freeze(scalar.args.map(arg => substitutedSide(arg, rewrite))),
        expansion: Option.map(scalar.expansion, expansion => substitutedScalar(expansion, rewrite)),
      })
    : rewrite(scalar)

const substituted = (predicate: Predicate, rewrite: OperandRewrite): Predicate => {
  switch (predicate._tag) {
    case 'Eq':
      return node({
        ...predicate,
        left: substitutedSide(predicate.left, rewrite),
        right: substitutedSide(predicate.right, rewrite),
      })
    case 'Null':
      return node({ ...predicate, operand: substitutedScalar(predicate.operand, rewrite) })
    case 'Contains':
      return node({
        ...predicate,
        value: substitutedScalar(predicate.value, rewrite),
        search: substitutedSide(predicate.search, rewrite),
      })
    case 'In':
      return node({
        ...predicate,
        value: substitutedScalar(predicate.value, rewrite),
        among: substitutedScalar(predicate.among, rewrite),
      })
    case 'And':
    case 'Or':
      return node({
        ...predicate,
        operands: Arr.map(predicate.operands, operand => substituted(operand, rewrite)),
      })
    case 'Not':
      return node({ ...predicate, operand: substituted(predicate.operand, rewrite) })
    case 'Compare':
      return node({
        ...predicate,
        left: substitutedScalar(predicate.left, rewrite),
        right: substitutedScalar(predicate.right, rewrite),
      })
    case 'Test':
      return node({
        ...predicate,
        args: Object.freeze(predicate.args.map(arg => substitutedSide(arg, rewrite))),
        expansion: Option.map(predicate.expansion, expansion => substituted(expansion, rewrite)),
      })
    // Its filter reads the pointing row, never the one a rewrite is about.
    case 'Exists':
      return predicate
  }
}

/** One term of an ordering: a scalar and the direction to read it in. */
export interface OrderTerm {
  readonly _tag: 'Term'
  readonly direction: 'asc' | 'desc'
  readonly expr: AnyExpr
  /**
   * Where rows without a value go, in the term's own direction. Databases
   * disagree when it is left unsaid (Postgres puts them last ascending, SQLite
   * first), so it is always said: last ascending and first descending unless
   * a term asks otherwise, which is Postgres's.
   */
  readonly nulls: 'first' | 'last'
  /**
   * How text compares, when the term orders text: the term's own, or its
   * field's. None leaves it to the backend, which a client cannot match.
   */
  readonly collation: Option.Option<Collation>
}

/** What a term may say besides its operand. */
export interface TermOptions {
  readonly nulls?: 'first' | 'last' | undefined
  /** Overrides the field's declared collation for this term. */
  readonly collation?: Collation | undefined
}

/** A term, its nulls placed by `options` or by the direction's default. */
const term = (direction: 'asc' | 'desc', expr: AnyExpr, options: TermOptions = {}): OrderTerm => {
  // The collation the operand itself carries.
  const carried = Match.value(expr).pipe(
    Match.tagsExhaustive({
      Field: field => field.collation,
      Call: call => call.collation,
      // A client could not place a row by a value another row holds, and a
      // cursor over one would page by what can change under it.
      Path: (path): Option.Option<Collation> => {
        throw new Error(
          `[foldkit-entity] Order: ${showExpr(path)} is a path; a list orders by its own row's fields`,
        )
      },
      Literal: () => Option.none<Collation>(),
      Input: () => Option.none<Collation>(),
      Next: () => Option.none<Collation>(),
      Viewer: () => Option.none<Collation>(),
      Now: () => Option.none<Collation>(),
    }),
  )
  // A number orders alike everywhere, and Postgres refuses a collation on one: a
  // collation it would inherit from a call's text arguments is dropped.
  const number = sideKind(expr) === 'number'
  if (number && options.collation !== undefined) {
    throw new Error(
      `[foldkit-entity] Order: ${showExpr(expr)} is a number, which needs no collation; a collation orders text`,
    )
  }
  const collation = number
    ? Option.none<Collation>()
    : Option.orElse(Option.fromUndefinedOr(options.collation), () => carried)
  if (expr._tag === 'Call') orderableCall(expr, collation)
  return node({
    _tag: 'Term',
    direction,
    expr,
    nulls: options.nulls ?? (direction === 'asc' ? 'last' : 'first'),
    collation,
  })
}

/**
 * Refuses a call no interpreter could order alike (expr-operations-DESIGN §8):
 * its result must be a number, or text under a collation every interpreter
 * shares. A field's text may be left to the backend; a call's has no backend
 * column to fall back on.
 */
const orderableCall = (call: CallExpr<unknown>, collation: Option.Option<Collation>): void => {
  const fail = (why: string): never => {
    throw new Error(`[foldkit-entity] Order: ${showExpr(call)} ${why}`)
  }
  const kind = sideKind(call)
  if (kind === 'number') return
  if (kind !== 'text') fail('is neither a number nor text, so it orders nowhere alike')
  Option.match(collation, {
    onNone: () =>
      fail(
        'is text with no collation, so backends would order it differently; give the term or its text Collation.binary or Collation.asciiFold',
      ),
    onSome: each => {
      if (each._tag === 'Locale') {
        fail(`is ordered by the backend's "${each.locale}" collation, which a call cannot carry`)
      }
    },
  })
}

/** How a list is sorted, as its input holds it: one of its named orders, which way, or none. */
export type ChosenSort<By extends string> = {
  readonly by: By
  readonly direction: 'asc' | 'desc'
} | null

/**
 * An ordering the input chooses: one of several named fields, which way, or
 * none. It is how a list sorts by what its reader picked, said in the body, so
 * the server and the client read one declaration of what each name means.
 */
export interface ChosenOrder {
  readonly _tag: 'Chosen'
  readonly sort: InputExpr<ChosenSort<string>>
  readonly choices: Readonly<Record<string, FieldExpr<unknown> | CallExpr<unknown>>>
}

/** One entry of a body's ordering: fixed, or chosen by the input. */
export type Ordering = OrderTerm | ChosenOrder

export const Order = {
  /** Smallest first; rows without a value last, unless `nulls` says first. */
  asc: <E extends Operand<any>>(expr: E, options?: TermOptions): OrderTerm & Reads<ReadsOf<E>> =>
    term('asc', toExpr(expr as never, 'asc'), options),
  /** Largest first; rows without a value first, unless `nulls` says last. */
  desc: <E extends Operand<any>>(expr: E, options?: TermOptions): OrderTerm & Reads<ReadsOf<E>> =>
    term('desc', toExpr(expr as never, 'desc'), options),

  /**
   * The order the input names, among `choices`: every name the sort can hold
   * maps to a field or a call that orders, so a name left out is a type error
   * here, not a query that silently orders by nothing. A `null` sort chooses none, and the terms after
   * it decide.
   *
   * ```ts
   * Query.orderBy(Order.chosen(input.sort, { title: Post.fields.title }))
   * ```
   */
  chosen: <By extends string, const Choices extends { readonly [K in By]: Operand<any> }>(
    sort: InputExpr<ChosenSort<By>>,
    choices: Choices,
  ): ChosenOrder & Reads<ReadsOf<Choices[keyof Choices]>> => {
    const fields: Record<string, FieldExpr<unknown> | CallExpr<unknown>> = Object.create(null)
    for (const [name, choice] of Object.entries<Operand<any>>(choices)) {
      const expr = toExpr(choice as never, 'chosen')
      if (expr._tag !== 'Field' && expr._tag !== 'Call') {
        throw new Error(`[foldkit-entity] Order.chosen: "${name}" is neither a field nor a call`)
      }
      // Checked as a term now, so an alternative no input has chosen yet is refused where written.
      if (expr._tag === 'Call') orderableCall(expr, expr.collation)
      fields[name] = expr
    }
    return node({
      _tag: 'Chosen',
      sort: sort as InputExpr<ChosenSort<string>>,
      choices: Object.freeze(fields),
    })
  },
}

/**
 * Whether a client can order rows the way the server does, for one input: the
 * answer `Query.placement` gives, and the reason when it cannot.
 */
export type Placement =
  | { readonly _tag: 'Placeable' }
  | { readonly _tag: 'NotPlaceable'; readonly reason: string }

const placeable: Placement = Object.freeze({ _tag: 'Placeable' })
const notPlaceable = (reason: string): Placement => Object.freeze({ _tag: 'NotPlaceable', reason })

/**
 * Whether values encoded by `ast` order the same everywhere: numbers and
 * booleans, never text. A null among them does too: where it goes is said on
 * every order term.
 */
const ordersIntrinsically = (ast: SchemaAST.AST): boolean =>
  SchemaAST.isNumber(ast) ||
  SchemaAST.isBoolean(ast) ||
  (SchemaAST.isLiteral(ast) && typeof ast.literal !== 'string') ||
  (SchemaAST.isUnion(ast) &&
    ast.types.every(member => SchemaAST.isNull(member) || ordersIntrinsically(member)))

/** Why a term cannot be placed by a client running `operators`, if it cannot. */
const unplaceable = (orderTerm: OrderTerm, operators: OperatorTable): Option.Option<string> =>
  Match.value(orderTerm.expr).pipe(
    // Checked when the term was made: a number, or text under a shared collation.
    // Left is whether the client runs every primitive operator it calls.
    Match.tag('Call', call => {
      const missing = missingFrom(dependenciesOf(call).operators, operators)
      return missing.length === 0
        ? Option.none<string>()
        : Option.some(
            `it orders by ${showExpr(call)}, and this client does not run ${missing.join(', ')}`,
          )
    }),
    Match.tag('Field', field =>
      Option.match(orderTerm.collation, {
        onNone: () =>
          ordersIntrinsically(Schema.toEncoded(field.schema).ast)
            ? Option.none()
            : Option.some(
                `it orders by ${field.owner.name}.${field.key}, text with no declared collation`,
              ),
        onSome: collation =>
          Match.value(collation).pipe(
            Match.tagsExhaustive({
              Binary: () => Option.none<string>(),
              AsciiFold: () => Option.none<string>(),
              Locale: ({ locale }) =>
                Option.some(
                  `it orders ${field.owner.name}.${field.key} by the backend's "${locale}" collation`,
                ),
            }),
          ),
      }),
    ),
    Match.tags({
      Literal: neither,
      Input: neither,
      Next: neither,
      Viewer: neither,
      Now: neither,
      // Refused where the term is made; said here too.
      Path: neither,
    }),
    Match.exhaustive,
  )

const neither = (): Option.Option<string> =>
  Option.some('it orders by something that is neither a field nor a call')

/** Each Entity's id tie-break, made once, so a resolved order reuses one term. */
const idTerms = new WeakMap<AnyEntity, OrderTerm>()
const idTermOf = (entity: AnyEntity): OrderTerm => {
  const known = idTerms.get(entity)
  if (known !== undefined) return known
  const id = entity.fields.id
  if (id === undefined) {
    throw new Error(`[foldkit-entity] ${entity.name} has no id field to break an order's ties by`)
  }
  const tieBreak = term('asc', fieldExpr(id))
  idTerms.set(entity, tieBreak)
  return tieBreak
}

/** The fixed term a chosen order is for one input, or none for a `null` sort. */
const chosenTerms = (
  chosen: ChosenOrder,
  input: Readonly<Record<string, unknown>>,
): ReadonlyArray<OrderTerm> => {
  const sort = input[chosen.sort.key]
  if (sort === null || sort === undefined) return []
  const picked =
    typeof sort === 'object' && 'by' in sort && typeof sort.by === 'string' ? sort.by : undefined
  const direction = typeof sort === 'object' && 'direction' in sort ? sort.direction : undefined
  if (
    picked === undefined ||
    !Object.hasOwn(chosen.choices, picked) ||
    (direction !== 'asc' && direction !== 'desc')
  ) {
    throw new Error(
      `[foldkit-entity] Order.chosen: $${chosen.sort.key} names no order it offers (${Object.keys(chosen.choices).join(', ')})`,
    )
  }
  return [term(direction, chosen.choices[picked]!)]
}

/** What a walk has found, and the nodes it has already been through. */
interface Found {
  readonly seen: Set<object>
  /** By owner identity, then key: two Entities sharing a name are two entries. */
  readonly fields: Map<symbol, Map<string, FieldDependency>>
  readonly order: Array<FieldDependency>
  readonly inputs: Set<string>
  readonly next: Map<symbol, Map<string, FieldDependency>>
  readonly nextOrder: Array<FieldDependency>
  readonly operations: Set<Operation>
  readonly operators: Set<OperatorDescriptor>
  readonly reaches: Array<PathExpr<unknown> | ExistsPredicate>
}

/**
 * Visits each node once. A node can be shared by several paths (`eq(n, n)`),
 * and a walk that followed every path would take time exponential in the depth.
 */
const walk = (expr: AnyExpr | Predicate | Ordering, found: Found): void => {
  if (found.seen.has(expr)) return
  found.seen.add(expr)
  switch (expr._tag) {
    case 'Literal':
      return
    case 'Field': {
      const byKey = found.fields.get(expr.owner.token) ?? new Map<string, FieldDependency>()
      found.fields.set(expr.owner.token, byKey)
      if (!byKey.has(expr.key)) {
        const field = { entity: expr.owner.name, key: expr.key, owner: expr.owner }
        byKey.set(expr.key, field)
        found.order.push(field)
      }
      return
    }
    case 'Input':
      found.inputs.add(expr.key)
      return
    case 'Viewer':
      found.operations.add('viewer')
      return
    case 'Now':
      found.operations.add('now')
      return
    case 'Next': {
      found.operations.add('next')
      const { field } = expr
      const byKey = found.next.get(field.owner.token) ?? new Map<string, FieldDependency>()
      found.next.set(field.owner.token, byKey)
      if (!byKey.has(field.key)) {
        const read = { entity: field.owner.name, key: field.key, owner: field.owner }
        byKey.set(field.key, read)
        found.nextOrder.push(read)
      }
      return
    }
    case 'Eq':
      found.operations.add('eq')
      walk(expr.left, found)
      walk(expr.right, found)
      return
    case 'Null':
      found.operations.add(expr.present ? 'isNotNull' : 'isNull')
      walk(expr.operand, found)
      return
    case 'Contains':
      found.operations.add('contains')
      walk(expr.value, found)
      walk(expr.search, found)
      return
    case 'In':
      found.operations.add('in')
      walk(expr.value, found)
      walk(expr.among, found)
      return
    case 'And':
      found.operations.add('and')
      for (const operand of expr.operands) walk(operand, found)
      return
    case 'Or':
      found.operations.add('or')
      for (const operand of expr.operands) walk(operand, found)
      return
    case 'Not':
      found.operations.add('not')
      walk(expr.operand, found)
      return
    case 'Compare':
      found.operations.add('compare')
      walk(expr.left, found)
      walk(expr.right, found)
      return
    case 'Term':
      walk(expr.expr, found)
      return
    case 'Chosen':
      walk(expr.sort, found)
      for (const choice of Object.values(expr.choices)) walk(choice, found)
      return
    case 'Path':
      found.operations.add('path')
      found.reaches.push(expr)
      return
    case 'Exists': {
      found.operations.add('exists')
      found.reaches.push(expr)
      // The filter's fields are the pointing row's, so they stay out of `fields`;
      // what else it needs is this expression's need too.
      Option.map(expr.where, where => {
        const inner = dependenciesOf(where)
        inner.inputs.forEach(key => found.inputs.add(key))
        inner.operations.forEach(operation => found.operations.add(operation))
        inner.operators.forEach(operator => found.operators.add(operator))
      })
      return
    }
    case 'Call':
    case 'Test':
      found.operators.add(expr.operator)
      // What an interpreter runs is the expansion: its operations, and the reads its
      // arguments hold. With none, the arguments are all there is to read.
      Option.match(expansionOf(expr), {
        onSome: expansion => walk(expansion, found),
        onNone: () => expr.args.forEach(arg => walk(arg, found)),
      })
      return
    default:
      return absurd(expr)
  }
}

/**
 * What an expression reads and uses, for the planner and for an interpreter
 * deciding whether it can run this query at all. Distinct entries only, in the
 * order first seen, so the answer is stable enough to assert on.
 */
export const dependenciesOf = (
  ...nodes: ReadonlyArray<AnyExpr | Predicate | Ordering>
): Dependencies => {
  const found: Found = {
    seen: new Set(),
    fields: new Map(),
    order: [],
    inputs: new Set(),
    next: new Map(),
    nextOrder: [],
    operations: new Set(),
    operators: new Set(),
    reaches: [],
  }
  for (const term of nodes) walk(term, found)
  return {
    fields: found.order,
    next: found.nextOrder,
    inputs: [...found.inputs],
    operations: [...found.operations],
    operators: [...found.operators],
    reaches: found.reaches,
  }
}

/**
 * Which rows a query is about, as a value: an Entity to read, the predicates
 * every row must satisfy, and the order to read them in. It says nothing about
 * which fields to return — that is a Selection — and nothing about pagination,
 * liveness, or whether absence is an error, which belong to the consumer's read
 * rather than to the relation.
 *
 * Composing one performs no work. `Query.from(Post)` names no table and opens
 * no connection; an interpreter turns the value into a query when something
 * asks it to.
 */
export interface Query<E extends AnyEntity> extends Pipeable.Pipeable {
  readonly _tag: 'Query'
  readonly entity: E
  /**
   * Every predicate holds: the list *is* the conjunction. Keeping it a list
   * rather than folding it into one `and` is what makes each `where` a reusable
   * fragment, and it means no `Expr.and` exists until a query needs a
   * conjunction nested inside something else.
   */
  readonly where: ReadonlyArray<Predicate>
  /** In order of significance; a later `orderBy` appends less significant terms. */
  readonly orderBy: ReadonlyArray<Ordering>
}

/** A `Query` over any Entity, for the places that hold one without caring which. */
export type AnyQuery = Query<AnyEntity>

/**
 * Every member of the judged row an expression reads, each node visited once:
 * a field, or the relation a path or an exists starts from.
 */
const fieldsIn = function* (
  expr: AnyExpr | Predicate | Ordering,
  seen: Set<object>,
): Generator<{ readonly owner: EntityIdentity<string>; readonly key: string }> {
  if (seen.has(expr)) return
  seen.add(expr)
  switch (expr._tag) {
    case 'Field':
      yield expr
      return
    case 'Next':
      yield expr.field
      return
    case 'Literal':
    case 'Input':
    case 'Viewer':
    case 'Now':
      return
    case 'Eq':
      yield* fieldsIn(expr.left, seen)
      yield* fieldsIn(expr.right, seen)
      return
    case 'Null':
      yield* fieldsIn(expr.operand, seen)
      return
    case 'Contains':
      yield* fieldsIn(expr.value, seen)
      yield* fieldsIn(expr.search, seen)
      return
    case 'In':
      yield* fieldsIn(expr.value, seen)
      yield* fieldsIn(expr.among, seen)
      return
    case 'And':
    case 'Or':
      for (const operand of expr.operands) yield* fieldsIn(operand, seen)
      return
    case 'Not':
      yield* fieldsIn(expr.operand, seen)
      return
    case 'Compare':
      yield* fieldsIn(expr.left, seen)
      yield* fieldsIn(expr.right, seen)
      return
    case 'Term':
      yield* fieldsIn(expr.expr, seen)
      return
    case 'Chosen':
      for (const choice of Object.values(expr.choices)) yield* fieldsIn(choice, seen)
      return
    case 'Path':
      yield expr.via[0]
      return
    case 'Exists':
      yield existsStart(expr)
      return
    // An expansion reads only what its arguments do, which the call checked.
    case 'Call':
    case 'Test':
      for (const arg of expr.args) yield* fieldsIn(arg, seen)
      return
    default:
      return absurd(expr)
  }
}

/**
 * A query reads one Entity, so a predicate or ordering term naming a different
 * one cannot be answered — an interpreter would be asked for a column of a
 * table it was never told to read. Compared by identity, not by name, because
 * two Entities defined with the same name are two Entities.
 */
const checkOwnership = (
  step: string,
  what: string,
  entity: AnyEntity,
  nodes: ReadonlyArray<AnyExpr | Predicate | Ordering>,
): void => {
  const seen = new Set<object>()
  for (const term of nodes) {
    for (const field of fieldsIn(term, seen)) {
      if (field.owner.token !== entity.identity.token) {
        throw new Error(
          `[foldkit-entity] Query.${step}: ${what} reads ${field.owner.name}.${field.key}, but the query is from ${entity.name}`,
        )
      }
    }
  }
}

/**
 * The most nodes a query's predicates may hold once every shared node is
 * counted on each path that reaches it. Interpreters read a predicate as a
 * tree: `evaluate` once per row, and the SQL compiler into text that repeats a
 * shared operand wherever it appears. So `eq(n, n)` nested thirty deep is
 * thirty-one objects and a billion nodes of work. Real queries are tens.
 */
export const maxQueryNodes = 1_000

const childrenOf = (expr: AnyExpr | Predicate): ReadonlyArray<AnyExpr | Predicate> => {
  switch (expr._tag) {
    case 'Literal':
    case 'Field':
    case 'Input':
    case 'Next':
    case 'Viewer':
    case 'Now':
    case 'Path':
      return []
    case 'Exists':
      return Option.toArray(expr.where)
    case 'Eq':
      return [expr.left, expr.right]
    case 'Null':
      return [expr.operand]
    case 'Contains':
      return [expr.value, expr.search]
    case 'In':
      return [expr.value, expr.among]
    case 'And':
    case 'Or':
      return expr.operands
    case 'Not':
      return [expr.operand]
    case 'Compare':
      return [expr.left, expr.right]
    // What an interpreter runs is the expansion, so that is what the budget counts.
    case 'Call':
    case 'Test':
      return Option.match(expansionOf(expr), {
        onSome: expansion => [expansion],
        onNone: () => expr.args,
      })
  }
}

/** A node's size as a tree, each distinct node sized once. */
const expandedSize = (expr: AnyExpr | Predicate, sizes: Map<object, number>): number => {
  const known = sizes.get(expr)
  if (known !== undefined) return known
  // Capped, so a graph deep enough to overflow a number still compares as too big.
  const size = Math.min(
    maxQueryNodes + 1,
    childrenOf(expr).reduce((sum, child) => sum + expandedSize(child, sizes), 1),
  )
  sizes.set(expr, size)
  return size
}

const QueryProto = {
  _tag: 'Query' as const,
  pipe() {
    return Pipeable.pipeArguments(this, arguments)
  },
}

const query = <E extends AnyEntity>(
  entity: E,
  where: ReadonlyArray<Predicate>,
  orderBy: ReadonlyArray<Ordering>,
): Query<E> =>
  Object.freeze(
    Object.assign(Object.create(QueryProto), {
      entity,
      where: Object.freeze(where),
      orderBy: Object.freeze(orderBy),
    }),
  ) as Query<E>

/**
 * Refuses a query whose predicates and order terms (every chosen alternative
 * among them) expand past `maxQueryNodes`, counting a shared node on every
 * path that reaches it: what an interpreter walks, and SQL writes out.
 */
const checkSize = (
  step: 'where' | 'orderBy',
  where: ReadonlyArray<Predicate>,
  orderBy: ReadonlyArray<Ordering>,
): void => {
  const sizes = new Map<object, number>()
  const terms = orderBy.flatMap(ordering =>
    Match.valueTags(ordering, {
      Term: ({ expr }) => [expr],
      Chosen: ({ choices }) => Object.values(choices),
    }),
  )
  const size = [...where, ...terms].reduce((sum, each) => sum + expandedSize(each, sizes), 0)
  if (size > maxQueryNodes) {
    throw new Error(
      `[foldkit-entity] Query.${step}: the query expands to more than ${maxQueryNodes} nodes, counting a shared node on every path that reaches it`,
    )
  }
}

export const Query = {
  /** Every row of an Entity: the query each transformation narrows. */
  from: <E extends AnyEntity>(entity: E): Query<E> => query(entity, [], []),

  /**
   * Narrows to the rows the predicate holds for. Two `where`s conjoin — the
   * second never replaces the first — so a fragment can be written once and
   * piped into any query over the same Entity:
   *
   * ```ts
   * const published = Query.where(Expr.eq(Post.fields.published, true))
   * Query.from(Post).pipe(published, Query.where(byTitle))
   * ```
   */
  where:
    <const P extends ReadonlyArray<Predicate>>(...predicates: P) =>
    <E extends AnyEntity>(
      self: Query<E> & OverEntity<ReadsOf<P[number]>, E['name'], 'a predicate'>,
    ): Query<E> => {
      if (predicates.length === 0) return self
      checkOwnership('where', 'a predicate', self.entity, predicates)
      const where = [...self.where, ...predicates]
      checkSize('where', where, self.orderBy)
      return query(self.entity, where, self.orderBy)
    },

  /**
   * Reads the rows in this order. Two `orderBy`s append, so an earlier term
   * stays the more significant one and a later call adds a tie-breaker rather
   * than silently winning.
   */
  orderBy:
    <const T extends ReadonlyArray<Ordering>>(...terms: T) =>
    <E extends AnyEntity>(
      self: Query<E> & OverEntity<ReadsOf<T[number]>, E['name'], 'an ordering term'>,
    ): Query<E> => {
      if (terms.length === 0) return self
      checkOwnership('orderBy', 'a term', self.entity, terms)
      const orderBy = [...self.orderBy, ...terms]
      checkSize('orderBy', self.where, orderBy)
      return query(self.entity, self.where, orderBy)
    },

  /**
   * The fixed terms this query orders by for one input: each chosen order
   * resolved to the field its input names, or to nothing for a `null` sort,
   * and the Entity's id last, ascending, unless the terms already read it. So
   * the order is total, and every interpreter breaks ties the same way: one
   * that broke them its own way would place rows a step apart from another.
   */
  orderFor: (
    self: AnyQuery,
    input: Readonly<Record<string, unknown>>,
  ): ReadonlyArray<OrderTerm> => {
    const terms = self.orderBy.flatMap(entry =>
      Match.value(entry).pipe(
        Match.tagsExhaustive({
          Term: term => [term],
          Chosen: chosen => chosenTerms(chosen, input),
        }),
      ),
    )
    const id = idTermOf(self.entity)
    // Every field an order reads is this Entity's: `orderBy` refuses another's.
    const endsOnId = terms.some(term => term.expr._tag === 'Field' && term.expr.key === 'id')
    return endsOnId ? terms : [...terms, id]
  },

  /**
   * Whether a client can order this query's rows exactly as the server does,
   * for one input: every term over a number or a boolean (a row may lack it), or over text with a
   * portable collation (`binary`, `asciiFold`), or a call whose primitive
   * operators the client's table (`operators`; none when not given) runs. A
   * body that names no order leaves it to the server, and is never placeable.
   */
  placement: (
    self: AnyQuery,
    input: Readonly<Record<string, unknown>>,
    options: { readonly operators?: OperatorTable | undefined } = {},
  ): Placement => {
    if (self.orderBy.length === 0) {
      return notPlaceable("its order is the server's: the body names none")
    }
    const operators = options.operators ?? noOperators
    for (const orderTerm of Query.orderFor(self, input)) {
      const reason = unplaceable(orderTerm, operators)
      if (Option.isSome(reason)) return notPlaceable(reason.value)
    }
    return placeable
  },

  /**
   * Each operator the body calls, by name (`id`, or `id@version` past the
   * first), in the order it first calls them: a defined one, and each
   * primitive one its expansion calls.
   */
  operators: (self: AnyQuery): ReadonlyArray<string> =>
    Query.dependencies(self).operators.map(operatorName),

  /**
   * What the whole query reads: the fields and inputs of every predicate and
   * every ordering term, and the operations it uses, with the fields also
   * split by role.
   */
  dependencies: (self: AnyQuery): QueryDependencies => ({
    ...dependenciesOf(...self.where, ...self.orderBy),
    predicate: dependenciesOf(...self.where).fields,
    order: dependenciesOf(...self.orderBy).fields,
  }),

  /**
   * The operations this query needs that `supported` does not list, in the
   * order the query uses them, then each primitive operator `operators` does
   * not implement, by name. Without `operators`, every primitive operator is
   * named: a list of operations implements none. Empty means an interpreter
   * declaring both can answer it.
   *
   * An interpreter declares what it runs and refuses the rest, rather than
   * ignoring an operation it does not implement — which would answer a
   * different question and say nothing. The refusal is the interpreter's to
   * raise: this only says what is missing, because what to do about it differs
   * between one that compiles at registration and one that runs a body
   * directly.
   *
   * ```ts
   * const missing = Query.unsupported(body, ['eq', 'isNull', 'isNotNull'])
   * if (missing.length > 0) throw new Error(`cannot run ${missing.join(', ')}`)
   * ```
   */
  unsupported: (
    self: AnyQuery,
    supported: ReadonlyArray<Operation>,
    operators: OperatorTable = noOperators,
  ): ReadonlyArray<string> => unsupportedIn([...self.where, ...self.orderBy], supported, operators),

  /**
   * The whole query as readable text, one clause per line:
   *
   * ```text
   * FROM Post
   * WHERE Post.slug = $slug
   *   AND Post.published = true
   * ORDER BY Post.updatedAt DESC
   * ```
   *
   * For an explanation or a diagnostic, never for an interpreter — see
   * `Expr.show`. A query with no `where` or no `orderBy` omits that line rather
   * than printing an empty one, so what is shown is what was written.
   */
  show: (self: AnyQuery): string =>
    [
      `FROM ${self.entity.name}`,
      // Among several, an `or` is parenthesised: `WHERE a or b` over `AND c`
      // would read as `a or (b and c)`.
      ...self.where.map(
        (predicate, index) =>
          `${index === 0 ? 'WHERE' : '  AND'} ${Match.value(predicate).pipe(
            Match.tag('Or', or => (self.where.length > 1 ? `(${Expr.show(or)})` : Expr.show(or))),
            Match.orElse(each => Expr.show(each)),
          )}`,
      ),
      ...(self.orderBy.length === 0
        ? []
        : [
            `ORDER BY ${self.orderBy
              .map(entry =>
                Match.value(entry).pipe(
                  Match.tagsExhaustive({
                    Term: term => `${Expr.show(term.expr)} ${term.direction.toUpperCase()}`,
                    Chosen: chosen =>
                      `$${chosen.sort.key} among (${Object.entries(chosen.choices)
                        .map(([name, field]) => `${name}: ${Expr.show(field)}`)
                        .join(', ')})`,
                  }),
                ),
              )
              .join(', ')}`,
          ]),
    ].join('\n'),
}

/**
 * An expression as readable text, in the IR's own terms.
 *
 * This is for a human — an explanation, a diagnostic, a test that wants to
 * assert on a whole predicate at once — and deliberately **not** for an
 * interpreter. It is close enough to SQL to read at a glance and unlike it
 * everywhere that matters: an input is `$slug` rather than a bound parameter,
 * `contains` is named rather than rendered as somebody's `like`, and no
 * dialect's escaping or collation is implied. What actually ran is whatever
 * that backend compiled, which is not this.
 *
 * A predicate standing where a value is wanted is parenthesised, because
 * `x is not null = $archived` reads as three operands and is two. A predicate
 * that *is* the whole expression is not: nothing encloses it.
 */
const showExpr = (node: AnyExpr | Predicate): string => {
  switch (node._tag) {
    case 'Literal':
      return JSON.stringify(node.value) ?? String(node.value)
    case 'Field':
      return `${node.owner.name}.${node.key}`
    case 'Input':
      return `$${node.key}`
    case 'Next':
      return `next ${node.field.owner.name}.${node.field.key}`
    case 'Viewer':
      return `viewer ${node.entity.name}`
    case 'Now':
      return 'now'
    case 'Eq':
      return `${showOperand(node.left)} = ${showOperand(node.right)}`
    case 'Null':
      return `${showOperand(node.operand)} is ${node.present ? 'not null' : 'null'}`
    case 'Contains':
      return `contains(${showOperand(node.value)}, ${showOperand(node.search)})`
    case 'In':
      return `${showOperand(node.value)} in ${showOperand(node.among)}`
    case 'And':
      return node.operands.map(showConnected).join(' and ')
    case 'Or':
      return node.operands.map(showConnected).join(' or ')
    case 'Not':
      return `not (${showExpr(node.operand)})`
    case 'Compare':
      return `${showOperand(node.left)} ${symbols[node.operator]} ${showOperand(node.right)}`
    case 'Call':
    case 'Test':
      return `${operatorName(node.operator)}(${node.args.map(showOperand).join(', ')})`
    // `Post.author.handle`: the judged row's relation, then each next one, then the field.
    case 'Path':
      return [`${node.via[0].owner.name}`, ...node.via.map(step => step.key), node.field.key].join(
        '.',
      )
    case 'Exists': {
      const sought = `exists ${node.relation.owner.name}.${node.relation.key}${Option.match(
        node.where,
        { onNone: () => '', onSome: where => ` where ${showExpr(where)}` },
      )}`
      const [first] = node.via
      return first === undefined
        ? sought
        : `${[first.owner.name, ...node.via.map(step => step.key)].join('.')}: ${sought}`
    }
  }
}

/**
 * Where an exists starts on the judged row: the relation its path follows
 * first, or, asked of the row itself, its id, which the pointing rows hold.
 */
const existsStart = (
  exists: ExistsPredicate,
): { readonly owner: EntityIdentity<string>; readonly key: string } =>
  exists.via[0] ?? { owner: exists.relation.target().identity, key: 'id' }

/** A call's expansion, scalar or predicate alike. */
const expansionOf = (call: CallExpr<unknown> | TestPredicate): Option.Option<AnyExpr | Predicate> =>
  call.expansion

/**
 * What `nodes` need that an interpreter lacks: each kernel operation it does
 * not list, then each primitive operator its table does not implement, by
 * name. A defined operator needs nothing: what it means is walked instead.
 */
const unsupportedIn = (
  nodes: ReadonlyArray<AnyExpr | Predicate | Ordering>,
  supported: ReadonlyArray<Operation>,
  operators: OperatorTable,
): ReadonlyArray<string> => {
  const read = dependenciesOf(...nodes)
  const runs = new Set(supported)
  return [
    ...read.operations.filter(operation => !runs.has(operation)),
    ...missingFrom(read.operators, operators),
  ]
}

/**
 * The primitive operators among `read` that `operators` does not implement, by
 * name. A defined one needs nothing: what it means was walked into `read`.
 */
const missingFrom = (
  read: ReadonlyArray<OperatorDescriptor>,
  operators: OperatorTable,
): ReadonlyArray<string> =>
  read
    .filter(operator => Option.isNone(operator.definedAs) && !operators.has(operator))
    .map(operator => missingName(operator, operators))

/** An operator by its id, and its version when that is not the first. */
const operatorName = (operator: OperatorDescriptor): string =>
  operator.version === 1 ? operator.id : `${operator.id}@${operator.version}`

const symbols: Readonly<Record<CompareOperator, string>> = {
  lt: '<',
  lte: '<=',
  gt: '>',
  gte: '>=',
}

/** An operand of `and` or `or`: another connective is parenthesised, so its grouping shows. */
const showConnected = (node: Predicate): string =>
  Match.value(node).pipe(
    Match.tags({ And: () => `(${showExpr(node)})`, Or: () => `(${showExpr(node)})` }),
    Match.orElse(() => showExpr(node)),
  )

const showOperand = (node: Operandish): string =>
  isPredicate(node) ? `(${showExpr(node)})` : showExpr(node)
