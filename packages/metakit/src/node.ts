/**
 * The six kinds of node every MetaKit expression is made of, and the closed
 * 15-operator v1 primitive set (`CoreOpId`).
 *
 * Every tier (`sqlOps`, `abstractOps`, `smtOps`) is typed
 * `Record<CoreOpId, ...>`, so adding a primitive fails to compile until every
 * tier implements it. Derived helpers (`min`, `max`, `abs`, `clamp`, `between`,
 * `isNotNull`, `implies`) are plain TypeScript functions over `If` + these 15
 * primitives and need zero tier boilerplate.
 */
import { Data, Option, type SchemaAST } from 'effect'

/** The closed 15-op v1 primitive set. */
export type CoreOpId =
  | 'bool.and'
  | 'bool.or'
  | 'bool.not'
  | 'eq.is'
  | 'eq.isNot'
  | 'eq.in'
  | 'null.isNull'
  | 'ord.lt'
  | 'ord.lte'
  | 'ord.gt'
  | 'ord.gte'
  | 'num.add'
  | 'num.sub'
  | 'num.mul'
  | 'num.neg'

export type OpId = CoreOpId

/**
 * Declarative, size-reducing algebraic laws consumed generically by Tier 2
 * `residualize` without per-op switch statements.
 */
export interface OpLaws {
  /** Identity element: `op(x, id) -> x` (and/or `op(id, x) -> x`). */
  readonly identity?: { readonly value: unknown; readonly side: 'left' | 'right' | 'both' }
  /** Absorbing element: `op(x, abs) -> result` (and/or `op(abs, x) -> result`). */
  readonly absorbing?: {
    readonly value: unknown
    readonly result: unknown
    readonly side: 'left' | 'right' | 'both'
  }
  /** Idempotence: `op(x, x) -> x`. */
  readonly idempotent?: boolean
  /** Reflexive constant: `op(x, x) -> value` (e.g. `sub(x, x) -> 0`, `lte(x, x) -> true`). */
  readonly reflexive?: { readonly value: unknown }
  /** Involution: `op(op(x)) -> x` (e.g. `not(not(x)) -> x`, `neg(neg(x)) -> x`). */
  readonly involution?: boolean
}

/**
 * An operator's descriptor: its id, its total in-memory evaluator, and its
 * declarative laws. A `Call` holds the descriptor itself, so a page that uses
 * one operator ships only that operator's evaluator.
 */
export interface Op<Id extends CoreOpId = CoreOpId> {
  readonly id: Id
  /** The operator on concrete argument values. Total: it never throws. */
  readonly evaluate: (args: ReadonlyArray<unknown>) => unknown
  /** Declarative size-reducing laws applied generically by `residualize`. */
  readonly laws?: OpLaws
  /** Optional specialized size-reducing fold (e.g. `eq.in` on 0- or 1-element sets). */
  readonly fold?: (args: ReadonlyArray<Node>) => Option.Option<Node>
}

/** A constant. */
export interface Lit {
  readonly _tag: 'Lit'
  readonly value: unknown
}

/** A read of the environment at `segments`, typed by the Schema it was built from. */
export interface PathNode {
  readonly _tag: 'Path'
  readonly segments: ReadonlyArray<string>
  readonly ast: Option.Option<SchemaAST.AST>
}

/** An operator applied to arguments. */
export interface Call {
  readonly _tag: 'Call'
  readonly op: Op
  readonly args: ReadonlyArray<Node>
}

/** A two-way choice on a boolean. */
export interface If {
  readonly _tag: 'If'
  readonly cond: Node
  readonly then: Node
  readonly otherwise: Node
}

/**
 * A choice on a value among literal cases. With no `otherwise`, the cases
 * cover every value the Schema of `on` allows.
 */
export interface Match {
  readonly _tag: 'Match'
  readonly on: Node
  readonly cases: ReadonlyArray<readonly [value: string, then: Node]>
  readonly otherwise: Option.Option<Node>
}

/**
 * Arbitrary code no reader can see into. It declares what it reads (none:
 * everything), runs in evaluation, and leaves every static reader undecided.
 */
export interface Opaque {
  readonly _tag: 'Opaque'
  readonly name: string
  readonly reads: Option.Option<ReadonlyArray<ReadonlyArray<string>>>
  readonly run: (env: unknown) => unknown
}

export type Node = Lit | PathNode | Call | If | Match | Opaque

export const { Lit, Path, Call, If, Match, Opaque, $match, $is } = Data.taggedEnum<Node>()

const opaqueIds = new WeakMap<(env: unknown) => unknown, number>()
let nextOpaqueId = 0

/**
 * A string equal for two nodes exactly when they are the same term: the key
 * by which partial evaluation removes duplicates and the checkers name terms.
 * Two opaque nodes are one term only when they share their function.
 */
export const key = (node: Node): string =>
  $match(node, {
    Lit: ({ value }) =>
      `${typeof value}:${typeof value === 'bigint' ? String(value) : JSON.stringify(value)}`,
    Path: ({ segments }) => `$${JSON.stringify(segments)}`,
    Call: ({ op, args }) => `${op.id}(${args.map(key).join(',')})`,
    If: ({ cond, then, otherwise }) => `if(${key(cond)},${key(then)},${key(otherwise)})`,
    Match: ({ on, cases, otherwise }) =>
      `match(${key(on)},${cases.map(([value, then]) => `${JSON.stringify(value)}:${key(then)}`).join(',')}${Option.match(
        otherwise,
        { onNone: () => '', onSome: rest => `,_:${key(rest)}` },
      )})`,
    Opaque: ({ name, run }) => {
      let id = opaqueIds.get(run)
      if (id === undefined) {
        nextOpaqueId += 1
        id = nextOpaqueId
        opaqueIds.set(run, id)
      }
      return `opaque#${id}:${name}`
    },
  })

/** Prefix every `Path` (and `Opaque` read/env) inside `node` with `segments`. */
export const prefix = (node: Node, segments: ReadonlyArray<string>): Node => {
  if (segments.length === 0) return node
  return $match(node, {
    Lit: lit => lit,
    Path: ({ segments: inner, ast }) => Path({ segments: [...segments, ...inner], ast }),
    Call: ({ op, args }) => Call({ op, args: args.map(a => prefix(a, segments)) }),
    If: ({ cond, then, otherwise }) =>
      If({
        cond: prefix(cond, segments),
        then: prefix(then, segments),
        otherwise: prefix(otherwise, segments),
      }),
    Match: ({ on, cases, otherwise }) =>
      Match({
        on: prefix(on, segments),
        cases: cases.map(([v, b]) => [v, prefix(b, segments)] as const),
        otherwise: Option.map(otherwise, b => prefix(b, segments)),
      }),
    Opaque: ({ name, reads, run }) =>
      Opaque({
        name,
        reads: Option.map(reads, list => list.map(s => [...segments, ...s])),
        run: env => {
          let sub: unknown = env
          for (const seg of segments) {
            if (
              sub === null ||
              sub === undefined ||
              typeof sub !== 'object' ||
              !Object.hasOwn(sub, seg)
            ) {
              return undefined
            }
            sub = (sub as Record<string, unknown>)[seg]
          }
          return run(sub)
        },
      }),
  })
}

/** Substitute matching `Path` nodes using `replace`. */
export const substitutePaths = (
  node: Node,
  replace: (segments: ReadonlyArray<string>) => Option.Option<Node>,
): Node =>
  $match(node, {
    Lit: lit => lit,
    Path: path => Option.getOrElse(replace(path.segments), () => path),
    Call: ({ op, args }) => Call({ op, args: args.map(a => substitutePaths(a, replace)) }),
    If: ({ cond, then, otherwise }) =>
      If({
        cond: substitutePaths(cond, replace),
        then: substitutePaths(then, replace),
        otherwise: substitutePaths(otherwise, replace),
      }),
    Match: ({ on, cases, otherwise }) =>
      Match({
        on: substitutePaths(on, replace),
        cases: cases.map(([v, b]) => [v, substitutePaths(b, replace)] as const),
        otherwise: Option.map(otherwise, b => substitutePaths(b, replace)),
      }),
    Opaque: o => o,
  })
