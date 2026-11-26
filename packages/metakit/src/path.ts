/**
 * Typed, serializable paths into an environment (`Path<Env, A>`).
 *
 * Every `Path<Env, A>` is also an `Expr<Env, A>` (they share the same carrier
 * brand and `node` field), so paths drop straight into expressions while
 * `Transition.set` requires a path from the transition's state accessor.
 */
import { Option, Predicate, SchemaAST } from 'effect'
import type { Schema } from 'effect'
import * as Node from './node.js'

export const ExprTypeId: unique symbol = Symbol.for('metakit/Expr')
export const PathTypeId: unique symbol = Symbol.for('metakit/Path')
declare const StatePathTypeId: unique symbol

/**
 * Pure, terminating expression reading paths from `Env` and producing `A`.
 * `Env` is contravariant (phantom) so an expression over `{ row }` widens into
 * `{ row, principal }` without adapters.
 */
export interface Expr<in Env, out A> {
  readonly [ExprTypeId]: {
    readonly env: (env: Env) => void
    readonly out: () => A
  }
  readonly node: Node.Node
}

/**
 * A typed lens into `Env` producing `A`. Subtype of `Expr<Env, A>`.
 */
export interface Path<Env, A> extends Expr<Env, A> {
  readonly [PathTypeId]: {
    readonly env: (env: Env) => void
    readonly out: () => A
  }
  readonly node: Node.PathNode
  readonly segments: ReadonlyArray<string>
  readonly ast: Option.Option<SchemaAST.AST>
}

export type AnyPath = Path<never, unknown>

/** A path rooted in the state slice of a transition. */
export type StatePath<Env, A> = Path<Env, A> & { readonly [StatePathTypeId]: true }

/** Construct a `Path` from raw segments and an optional Schema AST. */
export const make = <Env, A>(
  segments: ReadonlyArray<string>,
  ast: Option.Option<SchemaAST.AST> = Option.none(),
): Path<Env, A> => {
  const frozen = Object.freeze([...segments])
  const node = Node.Path({ segments: frozen, ast })
  return {
    [ExprTypeId]: undefined as never,
    [PathTypeId]: undefined as never,
    node,
    segments: frozen,
    ast,
  }
}

/** The identity path `Env -> Env`. */
export const root = <Env>(ast: Option.Option<SchemaAST.AST> = Option.none()): Path<Env, Env> =>
  make<Env, Env>([], ast)

/** Field path `Env -> Env[K]` for a direct property of `Env`. */
export const field = <Env extends object, K extends keyof Env & string>(
  key: K,
  ast: Option.Option<SchemaAST.AST> = Option.none(),
): Path<Env, Env[K]> => make<Env, Env[K]>([key], ast)

/** Compose `Outer -> Mid` with `Mid -> Inner`. */
export function compose<Outer, Mid, Inner>(
  outer: StatePath<Outer, Mid>,
  inner: Path<Mid, Inner>,
): StatePath<Outer, Inner>
export function compose<Outer, Mid, Inner>(
  outer: Path<Outer, Mid>,
  inner: Path<Mid, Inner>,
): Path<Outer, Inner>
export function compose<Outer, Mid, Inner>(
  outer: Path<Outer, Mid>,
  inner: Path<Mid, Inner>,
): Path<Outer, Inner> {
  return make<Outer, Inner>([...outer.segments, ...inner.segments], inner.ast)
}

/** True for a path whose Schema declares it an `Option` (`Schema.Option`, `Schema.OptionFromNullOr`). */
const optionPath = <Env, A>(path: Path<Env, A>): boolean =>
  Option.exists(path.ast, ast => Option.isSome(optionInner(ast)))

/**
 * Read the value at `path` from `env`, or `Option.none()` if any segment is
 * missing. A path built from a Schema reads the logical value: through an
 * `Option` to its value, or null for a none; a path made from raw segments
 * reads storage, an `Option` included.
 */
export const get = <Env, A>(path: Path<Env, A>, env: Env): Option.Option<A> => {
  const logical = Option.isSome(path.ast)
  let current: unknown = env
  for (const segment of path.segments) {
    if (logical && Option.isOption(current)) {
      if (Option.isNone(current)) return Option.some(null as A)
      current = current.value
    }
    if (current === null || typeof current !== 'object' || !Object.hasOwn(current, segment)) {
      return Option.none()
    }
    current = (current as Record<string, unknown>)[segment]
  }
  return Option.some((logical && Option.isOption(current) ? readable(current) : current) as A)
}

const ARRAY_INDEX = /^(0|[1-9]\d*)$/

/**
 * Pure structural update at `path` inside `env`. Returns a new object along
 * the updated spine; returns `env` untouched when the new value is `Object.is`
 * equal to the existing one.
 */
export const set = <Env, A>(path: Path<Env, A>, env: Env, value: A): Env => {
  if (path.segments.length === 0) {
    return Object.is(env, value) ? env : (value as unknown as Env)
  }
  const logical = Option.isSome(path.ast)
  const stored =
    logical && optionPath(path) ? (value === null ? Option.none() : Option.some(value)) : value
  if (logical && !optionPath(path)) {
    let current: unknown = env
    for (let index = 0; index < path.segments.length - 1; index++) {
      if (current === null || typeof current !== 'object') break
      const segment = path.segments[index]!
      current = Object.hasOwn(current, segment)
        ? (current as Record<string, unknown>)[segment]
        : undefined
      if (Option.isOption(current)) {
        throw new Error(
          `[metakit] Path: "${format(path.segments)}" is inside the Option at "${format(path.segments.slice(0, index + 1))}": write the whole value`,
        )
      }
    }
  }
  const existing = get(path, env)
  if (Option.isSome(existing) && Object.is(existing.value, value)) {
    return env
  }
  const updateAt = (current: unknown, index: number): unknown => {
    const key = path.segments[index]!
    const base =
      current !== null && typeof current === 'object' ? (current as Record<string, unknown>) : {}
    const existingChild = Object.hasOwn(base, key) ? base[key] : undefined
    const nextChild =
      index === path.segments.length - 1 ? stored : updateAt(existingChild, index + 1)
    // An array stays one: a spread would turn it into an object keyed by index.
    if (Array.isArray(current) && ARRAY_INDEX.test(key) && Number(key) <= current.length) {
      const next: Array<unknown> = [...current]
      next[Number(key)] = nextChild
      return next
    }
    return { ...base, [key]: nextChild }
  }
  return updateAt(env, 0) as Env
}

/** The segment of a footprint that stands for every element of a list: `todos.*.title`. */
export const EVERY = '*'

/** Whether two segments can name one place: equal, or either stands for every element. */
export const sameSegment = (a: string, b: string): boolean => a === b || a === EVERY || b === EVERY

/**
 * True when `prefix` is a segment prefix of `target` (useful for cache and
 * surface invalidation). A `*` segment on either side matches any one
 * segment, so `todos.*` is a prefix of `todos.3.title` and of `todos.*.title`.
 */
export const isPrefix = (prefix: ReadonlyArray<string>, target: ReadonlyArray<string>): boolean => {
  if (prefix.length > target.length) return false
  for (let i = 0; i < prefix.length; i++) {
    if (!sameSegment(prefix[i]!, target[i]!)) return false
  }
  return true
}

/** Whether two paths meet: one is a prefix of the other, `*` matching any one segment. */
export const meets = (a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean =>
  isPrefix(a, b) || isPrefix(b, a)

/** Dot-joined display form of a path (e.g. `"row.balance"`, or `"$"` for root). */
export const format = (segments: ReadonlyArray<string>): string =>
  segments.length === 0 ? '$' : segments.join('.')

/** What a path reads where the value is an Effect `Option`: its value, or null for none. */
export type Read<A> = [A] extends [Option.Option<infer T>] ? T | null : A

/** `null` where a read of `A` may give null: a null, an absent key, or a none. */
type NullIn<A> = null extends A ? null : undefined extends A ? null : never

/**
 * Recursive typed accessor for an environment value `A`: every plain object
 * property (including TypeScript `interface`s) becomes a nested
 * `PathAccessor<Env, A[K]>`, and every level is itself a `Path<Env, A>`.
 * An `Option` reads as its value or null, and a field under a value that may
 * be null may be null too, as evaluation reads it.
 *
 * A field named as a member of `Path` itself (`node`, `segments`, `ast`) is
 * not reached by its name, which reads the member: compose it,
 * `Path.compose(parent, Path.field('segments'))`.
 */
export type PathAccessor<Env, A, Writable extends boolean = false> = (Writable extends true
  ? StatePath<Env, Read<A>>
  : Path<Env, Read<A>>) &
  Fields<Env, Read<A>, Writable>

type Fields<Env, A, Writable extends boolean> = [NonNullable<A>] extends [
  ((...args: never) => unknown) | ReadonlyArray<unknown> | Date,
]
  ? unknown
  : [NonNullable<A>] extends [object]
    ? {
        readonly [
          K in Exclude<keyof NonNullable<A> & string, keyof Path<unknown, unknown>>
        ]: PathAccessor<Env, NonNullable<A>[K] | NullIn<A>, Writable>
      }
    : unknown

/** The value's Schema, where `ast` declares an Effect `Option` (`Schema.Option`, `Schema.OptionFromNullOr`). */
export const optionInner = (ast: SchemaAST.AST): Option.Option<SchemaAST.AST> =>
  SchemaAST.isDeclaration(ast) &&
  Predicate.isObject(ast.annotations?.representation) &&
  ast.annotations.representation['id'] === 'effect/schema/Option' &&
  ast.typeParameters.length === 1
    ? Option.some(ast.typeParameters[0]!)
    : Option.none()

const admitsNull = (ast: SchemaAST.AST): boolean =>
  SchemaAST.isNull(ast) ||
  SchemaAST.isUndefined(ast) ||
  (SchemaAST.isUnion(ast) && ast.types.some(admitsNull))

/** The struct a path into `ast` reads fields of: through an `Option` and a null or absent alternative. */
const structOf = (ast: SchemaAST.AST): Option.Option<SchemaAST.Objects> => {
  const inner = optionInner(ast)
  if (Option.isSome(inner)) return structOf(inner.value)
  if (SchemaAST.isObjects(ast)) return Option.some(ast)
  if (!SchemaAST.isUnion(ast)) return Option.none()
  const present = ast.types.filter(member => !admitsNull(member))
  return present.length === 1 ? structOf(present[0]!) : Option.none()
}

const propertyAsts = (ast: Option.Option<SchemaAST.AST>): ReadonlyMap<string, SchemaAST.AST> => {
  const map = new Map<string, SchemaAST.AST>()
  const struct = Option.flatMap(ast, structOf)
  if (Option.isNone(struct)) return map
  for (const prop of struct.value.propertySignatures) {
    if (typeof prop.name === 'string') map.set(prop.name, prop.type)
  }
  return map
}

/** What evaluation reads of a held value: an `Option`'s value, or null for none. */
export const readable = (value: unknown): unknown =>
  Option.isOption(value) ? Option.getOrNull(value) : value

/**
 * Build a `PathAccessor<Env, A>` rooted at `segments` from an Effect `Schema`
 * AST so `({ row, principal }) => Num.lte(row.reserved, row.balance)` yields
 * typed `Path` values with their field ASTs attached.
 */
export const accessor = <Env, A>(
  segments: ReadonlyArray<string>,
  ast: Option.Option<SchemaAST.AST>,
): PathAccessor<Env, A> => {
  const base = make<Env, A>(segments, ast)
  const props = propertyAsts(ast)
  const children = new Map<string, PathAccessor<Env, unknown>>()
  const target: Record<PropertyKey, unknown> = {
    [ExprTypeId]: base[ExprTypeId],
    [PathTypeId]: base[PathTypeId],
    node: base.node,
    segments: base.segments,
    ast: base.ast,
  }
  return new Proxy(target, {
    get(obj, prop, receiver) {
      if (typeof prop === 'symbol' || Object.hasOwn(obj, prop)) {
        return Reflect.get(obj, prop, receiver)
      }
      let child = children.get(prop)
      if (child === undefined) {
        const childAst = Option.fromUndefinedOr(props.get(prop))
        // An `Option` of a nullable value: its none and its some of null would read alike.
        if (Option.exists(Option.flatMap(childAst, optionInner), admitsNull)) {
          throw new Error(
            `[metakit] Path: "${prop}" is an Option of a value that may be null, which a path cannot tell from none`,
          )
        }
        child = accessor<Env, unknown>([...segments, prop], childAst)
        children.set(prop, child)
      }
      return child
    },
  }) as PathAccessor<Env, A>
}

/** Build a `PathAccessor` for any TypeScript type `Env` (e.g. `Path.of<AppModel>().account`). */
export const of = <Env>(): PathAccessor<Env, Env> => accessor<Env, Env>([], Option.none())

/** Build a `PathAccessor` for a single Schema's `Type`. */
export const forSchema = <S extends Schema.Top>(schema: S): PathAccessor<S['Type'], S['Type']> =>
  accessor<S['Type'], S['Type']>([], Option.some(schema.ast))

/** Alias for `forSchema` matching `Path.from(Account).balance`. */
export { forSchema as from }

/** Map `{ k: Schema }` to `{ readonly [K]: Schema['Type'] }`. */
export type EnvOf<Shape extends Readonly<Record<string, Schema.Top>>> = {
  readonly [K in keyof Shape]: Shape[K]['Type']
}

/**
 * Constraint for a generic helper that both composes a Schema (`Schema.Struct`,
 * `Schema.Array`, `Expr.refine`) and decodes it synchronously
 * (`Schema.decodeUnknownSync`).
 */
export type SchemaOf = Schema.Top & Schema.ConstraintDecoder<unknown>

/** Build the proxy record `{ row, principal, ... }` for an `Env` shape. */
export const forEnv = <Shape extends Readonly<Record<string, Schema.Top>>>(
  shape: Shape,
): { readonly [K in keyof Shape & string]: PathAccessor<EnvOf<Shape>, Shape[K]['Type']> } => {
  const result: Record<string, unknown> = {}
  for (const [key, schema] of Object.entries(shape)) {
    result[key] = accessor([key], Option.some(schema.ast))
  }
  return result as {
    readonly [K in keyof Shape & string]: PathAccessor<EnvOf<Shape>, Shape[K]['Type']>
  }
}

export const isPath = (value: unknown): value is AnyPath =>
  typeof value === 'object' && value !== null && PathTypeId in value
