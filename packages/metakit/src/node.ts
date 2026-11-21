/**
 * The six kinds of node every MetaKit expression is made of, and the closed
 * set of 20 primitive operators (`CoreOpId`).
 *
 * Every tier's table (`sqlOps`, `abstractOps`, `smtOps`, `drizzleOps`) is
 * typed `Record<CoreOpId, ...>`, and `Conformance.coreOps` holds the operator
 * descriptors under the same type, so adding a primitive fails to compile
 * until every reader implements it. Derived helpers (`min`, `max`, `abs`,
 * `clamp`, `between`, `isNotNull`, `implies`) are plain TypeScript functions
 * over `If` and the primitives and need no table entry.
 */
import { Data, Option, type SchemaAST } from 'effect'

/** The closed set of 20 primitive operators. */
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
  | 'str.len'
  | 'str.startsWith'
  | 'str.contains'
  | 'arr.count'
  | 'arr.isEmpty'

export type OpId = CoreOpId

/**
 * Evaluation declined to answer: an integer result left the safe range
 * (`unsafe-integer`), a number was NaN or infinite (`non-finite`), an operand
 * was not of the operator's type (`ill-typed`), or a `Match` met a value none
 * of its cases names (`unmatched`). A refusal is not a value: every operator
 * passes it on, and a predicate that is refused does not hold.
 */
export class Refusal extends Data.TaggedError('Refusal')<{
  readonly reason: 'unsafe-integer' | 'non-finite' | 'ill-typed' | 'unmatched'
  /** The operator id, or `if` or `match`. */
  readonly at: string
  readonly detail: string
}> {
  override get message(): string {
    return `${this.at}: ${this.detail}`
  }
}

export const isRefusal = (value: unknown): value is Refusal => value instanceof Refusal

/** The refusal of an operand that is not of the operator's type. */
export const illTyped = (at: string, expected: string, value: unknown): Refusal =>
  new Refusal({
    reason: 'ill-typed',
    at,
    detail: `expected ${expected}, got ${Array.isArray(value) ? 'an array' : typeof value}`,
  })

/** What an operator's result is, which decides the properties that may return an operand of it. */
export type ValueKind = 'number' | 'boolean'

/**
 * An operator's descriptor: its id and its in-memory evaluator. A `Call`
 * holds the descriptor itself, so a page that uses one operator ships only
 * that operator's evaluator. What it keeps is in `opProperties`.
 */
export interface Op<Id extends CoreOpId = CoreOpId> {
  readonly id: Id
  /** What a result that is neither null nor a refusal is. */
  readonly returns: ValueKind
  /**
   * `strict`: a null operand gives null and a refused one the refusal, before
   * `evaluate` runs. `own`: `evaluate` decides (Kleene `and`/`or`, null-safe
   * equality, `isNull`).
   */
  readonly nulls: 'strict' | 'own'
  /** The operator on argument values. It never throws: it returns a `Refusal`. */
  readonly evaluate: (args: ReadonlyArray<unknown>) => unknown
  /** A size-reducing fold no property says (`eq.in` over one candidate). */
  readonly fold?: (args: ReadonlyArray<Node>) => Option.Option<Node>
}

/** `op` applied to argument values under its null rule; an absent value is null. */
export const apply = (op: Op, args: ReadonlyArray<unknown>): unknown => {
  const values = args.map(arg => (arg === undefined ? null : arg))
  if (op.nulls === 'strict') {
    const refused = values.find(isRefusal)
    if (refused !== undefined) return refused
    if (values.includes(null)) return null
  }
  return op.evaluate(values)
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

/** A two-way choice on a boolean; a null condition gives null. */
export interface If {
  readonly _tag: 'If'
  readonly cond: Node
  readonly then: Node
  readonly otherwise: Node
}

/**
 * A choice on a value among literal cases. With no `otherwise`, the cases
 * cover every value the Schema of `on` allows and a null `on` gives null;
 * with one, it takes null and every value no case names.
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

const identities = new WeakMap<object, number>()
const symbols = new Map<symbol, number>()
let nextIdentity = 0

const identityOf = (value: object): number => {
  let id = identities.get(value)
  if (id === undefined) {
    nextIdentity += 1
    id = nextIdentity
    identities.set(value, id)
  }
  return id
}

const isPlain = (value: object): boolean => {
  const proto: unknown = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/** A literal's key: by content for JSON-shaped values, by identity for everything else. */
const litKey = (value: unknown): string => {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'number') return `number:${value === 0 ? '0' : String(value)}`
  if (typeof value === 'bigint') return `bigint:${value}`
  if (typeof value === 'string' || typeof value === 'boolean') {
    return `${typeof value}:${JSON.stringify(value)}`
  }
  if (typeof value === 'symbol') {
    let id = symbols.get(value)
    if (id === undefined) {
      nextIdentity += 1
      id = nextIdentity
      symbols.set(value, id)
    }
    return `symbol#${id}`
  }
  if (Array.isArray(value)) return `[${value.map(litKey).join(',')}]`
  if (typeof value === 'object' && isPlain(value)) {
    return `{${Object.keys(value)
      .sort()
      .map(k => `${JSON.stringify(k)}:${litKey((value as Record<string, unknown>)[k])}`)
      .join(',')}}`
  }
  return `ref#${identityOf(value)}`
}

/**
 * A string equal for two nodes exactly when they are the same term: the key
 * by which partial evaluation removes duplicates and the checkers name terms.
 * Two opaque nodes are one term only when they share their function.
 */
export const key = (node: Node): string =>
  $match(node, {
    Lit: ({ value }) => litKey(value),
    Path: ({ segments }) => `$${JSON.stringify(segments)}`,
    Call: ({ op, args }) => `${op.id}(${args.map(key).join(',')})`,
    If: ({ cond, then, otherwise }) => `if(${key(cond)},${key(then)},${key(otherwise)})`,
    Match: ({ on, cases, otherwise }) =>
      `match(${key(on)},${cases.map(([value, then]) => `${JSON.stringify(value)}:${key(then)}`).join(',')}${Option.match(
        otherwise,
        { onNone: () => '', onSome: rest => `,_:${key(rest)}` },
      )})`,
    Opaque: ({ name, run }) => `opaque#${identityOf(run)}:${name}`,
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
