/**
 * Typed, serializable paths into an environment (`Path<Env, A>`).
 *
 * Every `Path<Env, A>` is also an `Expr<Env, A>` (they share the same carrier
 * brand and `node` field), so paths drop straight into expressions while
 * `Transition.set` requires a `Path` as its write target.
 */
import { Option, SchemaAST } from 'effect'
import type { Schema } from 'effect'
import * as Node from './node.js'

export const ExprTypeId: unique symbol = Symbol.for('metakit/Expr')
export const PathTypeId: unique symbol = Symbol.for('metakit/Path')

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
export const compose = <Outer, Mid, Inner>(
  outer: Path<Outer, Mid>,
  inner: Path<Mid, Inner>,
): Path<Outer, Inner> => make<Outer, Inner>([...outer.segments, ...inner.segments], inner.ast)

/** Read the value at `path` from `env`, or `Option.none()` if any segment is missing. */
export const get = <Env, A>(path: Path<Env, A>, env: Env): Option.Option<A> => {
  let current: unknown = env
  for (const segment of path.segments) {
    if (current === null || typeof current !== 'object' || !Object.hasOwn(current, segment)) {
      return Option.none()
    }
    current = (current as Record<string, unknown>)[segment]
  }
  return Option.some(current as A)
}

/**
 * Pure structural update at `path` inside `env`. Returns a new object along
 * the updated spine; returns `env` untouched when the new value is `Object.is`
 * equal to the existing one.
 */
export const set = <Env, A>(path: Path<Env, A>, env: Env, value: A): Env => {
  if (path.segments.length === 0) {
    return Object.is(env, value) ? env : (value as unknown as Env)
  }
  const existing = get(path, env)
  if (Option.isSome(existing) && Object.is(existing.value, value)) {
    return env
  }
  const updateAt = (current: unknown, index: number): unknown => {
    const key = path.segments[index]!
    const base =
      current !== null && typeof current === 'object' ? (current as Record<string, unknown>) : {}
    const nextChild = index === path.segments.length - 1 ? value : updateAt(base[key], index + 1)
    return { ...base, [key]: nextChild }
  }
  return updateAt(env, 0) as Env
}

/** True when `prefix` is a segment prefix of `target` (useful for cache/surface invalidation). */
export const isPrefix = (prefix: ReadonlyArray<string>, target: ReadonlyArray<string>): boolean => {
  if (prefix.length > target.length) return false
  for (let i = 0; i < prefix.length; i++) {
    if (prefix[i] !== target[i]) return false
  }
  return true
}

/** Dot-joined display form of a path (e.g. `"row.balance"`, or `"$"` for root). */
export const format = (segments: ReadonlyArray<string>): string =>
  segments.length === 0 ? '$' : segments.join('.')

/**
 * Recursive typed accessor for an environment value `A`: every plain object
 * property (including TypeScript `interface`s) becomes a nested
 * `PathAccessor<Env, A[K]>`, and every level is itself a `Path<Env, A>`.
 */
export type PathAccessor<Env, A> = Path<Env, A> &
  ([A] extends [((...args: never) => unknown) | ReadonlyArray<unknown> | Date]
    ? unknown
    : [A] extends [object]
      ? { readonly [K in keyof A & string]: PathAccessor<Env, A[K]> }
      : unknown)

const propertyAsts = (ast: Option.Option<SchemaAST.AST>): ReadonlyMap<string, SchemaAST.AST> => {
  const map = new Map<string, SchemaAST.AST>()
  if (Option.isNone(ast)) return map
  const current = ast.value
  if (SchemaAST.isObjects(current)) {
    for (const prop of current.propertySignatures) {
      if (typeof prop.name === 'string') {
        map.set(prop.name, prop.type)
      }
    }
  }
  return map
}

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
