/**
 * The seven kinds of node every MetaKit expression is made of, and the closed
 * set of 33 primitive operators (`CoreOpId`).
 *
 * Every reader's table (`sqlOps`, `abstractOps`, `smtOps`, `opProperties`) is
 * typed by `CoreOpId`, and `Conformance.coreOps` holds the operator
 * descriptors under the same type, so adding a primitive fails to compile
 * until every reader implements it. Derived helpers (`min`, `max`, `abs`,
 * `clamp`, `between`, `isNotNull`, `implies`) are plain TypeScript functions
 * over `If` and the primitives and need no table entry.
 */
import { Data, Option, type Schema, type SchemaAST } from 'effect'
import type { OpProperties } from './properties.js'

/** The closed set of 44 primitive operators. */
export type CoreOpId =
  | 'bool.and'
  | 'bool.or'
  | 'bool.not'
  | 'eq.is'
  | 'eq.isNot'
  | 'eq.in'
  | 'eq.equals'
  | 'eq.among'
  | 'null.isNull'
  | 'null.coalesce'
  | 'str.lowerAscii'
  | 'str.upperAscii'
  | 'str.trim'
  | 'str.concat'
  | 'str.lt'
  | 'str.lte'
  | 'str.gt'
  | 'str.gte'
  | 'ord.lt'
  | 'ord.lte'
  | 'ord.gt'
  | 'ord.gte'
  | 'num.add'
  | 'num.sub'
  | 'num.mul'
  | 'num.neg'
  | 'num.mulScaled'
  | 'num.div'
  | 'num.rem'
  | 'time.addDays'
  | 'time.addMonths'
  | 'time.daysBetween'
  | 'time.startOfMonth'
  | 'time.overlaps'
  | 'str.len'
  | 'str.startsWith'
  | 'str.endsWith'
  | 'str.contains'
  | 'arr.count'
  | 'arr.isEmpty'
  | 'arr.has'
  | 'arr.append'
  | 'arr.include'
  | 'arr.exclude'
  | 'arr.move'
  | 'set.union'
  | 'set.intersect'
  | 'set.difference'
  | 'set.subset'
  | 'set.disjoint'

export type OpId = CoreOpId

/**
 * Evaluation declined to answer: an integer result left the safe range
 * (`unsafe-integer`), a number was NaN or infinite (`non-finite`), an operand
 * was not of the operator's type (`ill-typed`), a `Match` met a value none
 * of its cases names (`unmatched`), a text or equality operation met text
 * holding a NUL character, which Postgres cannot store (`unportable`), a
 * foreign operation had no implementation (`unsupported`), or the one given
 * threw (`failed`). A refusal is not a value: it decides before null, and no
 * operator absorbs it, so an expression with a refused operand is refused, as
 * a database refuses a statement it cannot run before any operator answers.
 * A predicate that is refused does not hold.
 */
export class Refusal extends Data.TaggedError('Refusal')<{
  readonly reason:
    | 'unsafe-integer'
    | 'non-finite'
    | 'ill-typed'
    | 'unmatched'
    | 'unportable'
    | 'unsupported'
    | 'failed'
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

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g
const REPLACEMENT = String.fromCharCode(0xfffd)

/** `text` as SQLite's and Postgres's drivers hold it: each lone surrogate as U+FFFD. */
export const wellFormed = (text: string): string => text.replace(LONE_SURROGATE, REPLACEMENT)

/**
 * A value as every reader compares it: text as a database holds it
 * (`wellFormed`), so `'\uD800'` and `'�'` are one text to equality, a
 * `Match`, the checker and the solver alike; any other value as it is.
 */
export const textIdentity = (value: unknown): unknown =>
  typeof value === 'string' ? wellFormed(value) : value

/** Whether one of `values` (or a nested array candidate) is text holding a NUL character. */
export const holdsNul = (values: ReadonlyArray<unknown>): boolean =>
  values.some(value =>
    Array.isArray(value) ? holdsNul(value) : typeof value === 'string' && value.includes('\u0000'),
  )

/** The refusal of text holding a NUL character, which every text and equality operation gives. */
export const unportable = (at: string): Refusal =>
  new Refusal({
    reason: 'unportable',
    at,
    detail: 'text holding a NUL character, which Postgres cannot store',
  })

/** The refusal of NaN by an operation that orders or compares numbers, as the databases part over it. */
export const unordered = (at: string): Refusal =>
  new Refusal({ reason: 'non-finite', at, detail: 'NaN has no order and no equal' })

/**
 * The refusal of an operand an equality refuses whatever the others hold:
 * text holding a NUL, or NaN; candidates are looked into.
 */
export const refusedForEquality = (at: string, value: unknown): Refusal | undefined => {
  if (Array.isArray(value)) {
    for (const item of value) {
      const refused = refusedForEquality(at, item)
      if (refused !== undefined) return refused
    }
    return undefined
  }
  if (typeof value === 'string') return value.includes('\u0000') ? unportable(at) : undefined
  return Number.isNaN(value) ? unordered(at) : undefined
}
/** What an operator's result is, which decides the properties that may return an operand of it. */
export type ValueKind = 'number' | 'boolean' | 'text'

/**
 * An operator's descriptor: its id and its in-memory evaluator. A `Call`
 * holds the descriptor itself, so a page that uses one operator ships only
 * that operator's evaluator. What it keeps is in `opProperties`.
 */
export interface Op<Id extends CoreOpId = CoreOpId> {
  /** Absent: what tells a core operator from a `ForeignOp`. */
  readonly _tag?: undefined
  readonly id: Id
  /** What a result that is neither null nor a refusal is; `operand`: one of its operands (`null.coalesce`). */
  readonly returns: ValueKind | 'operand'
  /**
   * `strict`: a refused operand gives the refusal, then an operand `refuses`
   * names its refusal, then a null operand gives null, all before `evaluate`
   * runs. `own`: `evaluate` decides (Kleene `and`/`or`, null-safe equality,
   * `isNull`, SQL's `in`).
   */
  readonly nulls: 'strict' | 'own'
  /**
   * The refusal of one operand the operator refuses whatever the others hold
   * (text holding a NUL, NaN), which a strict operator gives before null.
   */
  readonly refuses?: (value: unknown) => Refusal | undefined
  /** The operator on argument values. It never throws: it returns a `Refusal`. */
  readonly evaluate: (args: ReadonlyArray<unknown>) => unknown
}

/** Side an identity or absorbing element applies on. */
export type ClaimSide = 'left' | 'right' | 'both'

/** Monotonicity direction for one argument of a custom operation. */
export type MonotoneDirection = 'up' | 'down' | 'none'

/** Algebraic claims carried on a `ForeignOp` descriptor. */
export interface ForeignClaims {
  readonly identity?: { readonly value: unknown; readonly side: ClaimSide }
  readonly absorbing?: {
    readonly value: unknown
    readonly result: unknown
    readonly side: ClaimSide
  }
  readonly idempotent?: true
  readonly commutative?: true
  readonly associative?: true | { readonly unlessRefused: true }
  readonly invertible?: { readonly inverse: ForeignOp | 'self' }
  readonly monotone?: ReadonlyArray<MonotoneDirection>
  /** Never throws or returns a `Refusal` when given non-refused arguments matching its Schemas. */
  readonly total?: true
}

/** A precompiled Schema guard carried on a `ForeignOp` for runtime domain enforcement. */
export interface ForeignSchemaCheck {
  readonly is: (value: unknown) => boolean
  readonly describe: string
}

/**
 * An operation an application defines, outside the closed set: carried by
 * its `id` and `version`, with no evaluator, since a page and a server may
 * hold different implementations of it or none. Each reader takes the
 * implementations from its caller, and refuses a call it holds none for.
 */
export interface ForeignOp {
  readonly _tag: 'Foreign'
  readonly id: string
  readonly version: number
  /** What a result that is neither null nor a refusal is. */
  readonly returns: ValueKind
  /** `strict`: a null argument gives null, and a refused one the refusal, before an implementation runs. */
  readonly nulls: 'strict' | 'own'
  /** Argument Schemas when declared through `Operation.define`. */
  readonly args?: ReadonlyArray<Schema.Top>
  /** Result Schema when declared through `Operation.define`. */
  readonly result?: Schema.Top
  /** Precompiled argument guards built once at `Operation.define`. */
  readonly checkArgs?: ReadonlyArray<ForeignSchemaCheck>
  /** Precompiled result guard built once at `Operation.define`. */
  readonly checkResult?: ForeignSchemaCheck
  /** What the operation declares it keeps. */
  readonly claims: ForeignClaims
}

/** An operator a `Call` may name: a core one, which carries its evaluator, or a foreign one. */
export type AnyOp = Op | ForeignOp

/** Whether `op` is a foreign operation, which carries no evaluator. */
export const isForeign = (op: AnyOp): op is ForeignOp => op._tag === 'Foreign'

/** The prefixes of the core operators' ids, which a foreign operation may not take. */
export const RESERVED_PREFIXES = [
  'bool.',
  'eq.',
  'null.',
  'ord.',
  'num.',
  'time.',
  'str.',
  'arr.',
  'rows.',
] as const

/**
 * A foreign operation's name in every reader's table of implementations:
 * `id@version`, so two versions of one operation are two entries.
 */
export const foreignName = (op: Pick<ForeignOp, 'id' | 'version'>): string =>
  `${op.id}@${op.version}`

/** The refusal of a call of an operation the reader holds no implementation of. */
export const unsupported = (op: ForeignOp, detail = 'no implementation was given'): Refusal =>
  new Refusal({ reason: 'unsupported', at: op.id, detail: `${foreignName(op)}: ${detail}` })

/** The refusal of a call whose implementation threw, with what it threw. */
export const failed = (op: ForeignOp, error: unknown): Refusal =>
  new Refusal({
    reason: 'failed',
    at: op.id,
    detail: `${foreignName(op)}: ${error instanceof Error ? error.message : String(error)}`,
  })

/** `op` applied to argument values under its null rule; an absent value is null. */
export const apply = (op: Op, args: ReadonlyArray<unknown>): unknown =>
  applying(op, args, values => op.evaluate(values))

/** `run` over argument values under `op`'s null rule; an absent value is null. */
export const applying = (
  op: AnyOp,
  args: ReadonlyArray<unknown>,
  run: (values: ReadonlyArray<unknown>) => unknown,
): unknown => {
  const values = args.map(arg => (arg === undefined ? null : arg))
  if (op.nulls === 'strict') {
    const refused = values.find(isRefusal)
    if (refused !== undefined) return refused
    const refuses = isForeign(op) ? undefined : op.refuses
    if (refuses !== undefined) {
      for (const value of values) {
        const screened = value === null ? undefined : refuses(value)
        if (screened !== undefined) return screened
      }
    }
    if (values.includes(null)) return null
  }
  return run(values)
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
  readonly op: AnyOp
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

/** The question a `Rows` node asks of each element. */
export type RowsFold =
  | 'any'
  | 'every'
  | 'count'
  | 'sum'
  | 'min'
  | 'max'
  | 'reduce'
  | 'find'
  | 'keep'
  | 'patch'

/**
 * What a `Rows` node asks its question of: the elements of a list the
 * environment holds (`List`), or the rows of another kind pointing at the row
 * `of` reads through `relation` (`Related`), held under that row at the
 * segment `<relation>` as `{ rows, whole }`, where `whole` says whether these
 * are all of them.
 */
export type RowsOver = Data.TaggedEnum<{
  List: { readonly list: Node }
  Related: { readonly of: Node; readonly relation: string }
}>

export const RowsOver = Data.taggedEnum<RowsOver>()

/** The segment under a row at which the rows pointing at it through `relation` are held. */
export const relatedSegment = (relation: string): string => `<${relation}`

/** The slice a `Rows` body reads its element under. */
export const EACH = 'each'

/**
 * One question asked of each element of a list, or each related row: whether
 * any or every one passes `where`, how many do, the sum, least or greatest of
 * `value` over those that do, the first that does (`find`), the ones that do
 * (`keep`), or each that does changed by `set` (`patch`). `where`, `value`
 * and `set` read the element under the slice `each`; an element passes only
 * where `where` is true.
 */
export interface Rows {
  readonly _tag: 'Rows'
  readonly fold: RowsFold
  readonly over: RowsOver
  readonly where: Option.Option<Node>
  readonly value: Option.Option<Node>
  readonly set: ReadonlyArray<readonly [field: string, value: Node]>
  /** The custom operation a `reduce` fold combines its elements' values with. */
  readonly op?: ForeignOp | undefined
  /** The slice this fold binds its element under (defaults to `EACH`). */
  readonly each?: string | undefined
}

export type Node = Lit | PathNode | Call | If | Match | Opaque | Rows

export const { Lit, Path, Call, If, Match, Opaque, Rows, $match, $is } = Data.taggedEnum<Node>()

/** The node a `Rows` node asks its question of: the list, or the row the related rows point at. */
export const rowsSource = (over: RowsOver): Node =>
  RowsOver.$match(over, { List: ({ list }) => list, Related: ({ of }) => of })

/** `rows` with its source passed through `source` and each node of its body through `body`. */
export const mapRows = (
  rows: Rows,
  source: (node: Node) => Node,
  body: (node: Node) => Node,
): Rows =>
  Rows({
    fold: rows.fold,
    over: RowsOver.$match(rows.over, {
      List: ({ list }) => RowsOver.List({ list: source(list) }),
      Related: ({ of, relation }) => RowsOver.Related({ of: source(of), relation }),
    }),
    where: Option.map(rows.where, body),
    value: Option.map(rows.value, body),
    set: rows.set.map(([field, value]) => [field, body(value)] as const),
    ...(rows.op === undefined ? {} : { op: rows.op }),
    ...(rows.each === undefined ? {} : { each: rows.each }),
  })

/** The nodes of a `Rows` body: its test, its value and what `set` writes. */
export const rowsBody = (rows: Rows): ReadonlyArray<Node> => [
  ...Option.toArray(rows.where),
  ...Option.toArray(rows.value),
  ...rows.set.map(([, value]) => value),
]

/** The slice `rows` binds its element under (`rows.each ?? EACH`). */
export const rowsEach = (rows: Rows): string => rows.each ?? EACH

/** Whether `segments` reads the element bound under `each` (default `EACH`). */
export const readsEach = (segments: ReadonlyArray<string>, each: string = EACH): boolean =>
  segments[0] === each

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

/** An operator's name in a key: a foreign one's with its version, so two versions are two terms. */
const opKey = (op: AnyOp): string => (isForeign(op) ? foreignName(op) : op.id)

/**
 * A string equal for two nodes exactly when they are the same term: the key
 * by which partial evaluation removes duplicates and the checkers name terms.
 * Two opaque nodes are one term only when they share their function.
 */
export const key = (node: Node): string =>
  $match(node, {
    Lit: ({ value }) => litKey(value),
    Path: ({ segments }) => `$${JSON.stringify(segments)}`,
    Call: ({ op, args }) => `${opKey(op)}(${args.map(key).join(',')})`,
    If: ({ cond, then, otherwise }) => `if(${key(cond)},${key(then)},${key(otherwise)})`,
    Match: ({ on, cases, otherwise }) =>
      `match(${key(on)},${cases.map(([value, then]) => `${JSON.stringify(value)}:${key(then)}`).join(',')}${Option.match(
        otherwise,
        { onNone: () => '', onSome: rest => `,_:${key(rest)}` },
      )})`,
    Opaque: ({ name, run }) => `opaque#${identityOf(run)}:${name}`,
    Rows: rows =>
      `rows.${rows.fold}(${RowsOver.$match(rows.over, {
        List: ({ list }) => key(list),
        Related: ({ of, relation }) => `${key(of)}${JSON.stringify(relatedSegment(relation))}`,
      })};${Option.match(rows.where, { onNone: () => '', onSome: key })};${Option.match(
        rows.value,
        { onNone: () => '', onSome: key },
      )};${rows.set.map(([field, value]) => `${JSON.stringify(field)}:${key(value)}`).join(',')}${rows.op === undefined ? '' : `;${foreignName(rows.op)}`}${rows.each === undefined ? '' : `;@${rows.each}`})`,
  })

/** Prefix every unbound `Path` (and `Opaque` read/env) inside `node` with `segments`. */
export const prefix = (node: Node, segments: ReadonlyArray<string>): Node => {
  if (segments.length === 0) return node
  const visit = (current: Node, bound: ReadonlySet<string>): Node =>
    $match(current, {
      Lit: lit => lit,
      Rows: rows => {
        const innerBound = new Set(bound)
        innerBound.add(rowsEach(rows))
        return mapRows(
          rows,
          source => visit(source, bound),
          body => visit(body, innerBound),
        )
      },
      Path: path =>
        path.segments.length > 0 && bound.has(path.segments[0]!)
          ? path
          : Path({ segments: [...segments, ...path.segments], ast: path.ast }),
      Call: ({ op, args }) => Call({ op, args: args.map(a => visit(a, bound)) }),
      If: ({ cond, then, otherwise }) =>
        If({
          cond: visit(cond, bound),
          then: visit(then, bound),
          otherwise: visit(otherwise, bound),
        }),
      Match: ({ on, cases, otherwise }) =>
        Match({
          on: visit(on, bound),
          cases: cases.map(([v, b]) => [v, visit(b, bound)] as const),
          otherwise: Option.map(otherwise, b => visit(b, bound)),
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
  return visit(node, new Set())
}

/**
 * Every `Path` node in `node` passed through `path`. Inside a `Rows` body a
 * path that reads a bound element slice is left as it is.
 */
export const mapPaths = (node: Node, path: (node: PathNode) => Node): Node => {
  const visit = (current: Node, bound: ReadonlySet<string>): Node =>
    $match(current, {
      Lit: lit => lit,
      Path: p => (p.segments.length > 0 && bound.has(p.segments[0]!) ? p : path(p)),
      Call: ({ op, args }) => Call({ op, args: args.map(a => visit(a, bound)) }),
      If: ({ cond, then, otherwise }) =>
        If({
          cond: visit(cond, bound),
          then: visit(then, bound),
          otherwise: visit(otherwise, bound),
        }),
      Match: ({ on, cases, otherwise }) =>
        Match({
          on: visit(on, bound),
          cases: cases.map(([v, b]) => [v, visit(b, bound)] as const),
          otherwise: Option.map(otherwise, b => visit(b, bound)),
        }),
      Opaque: o => o,
      Rows: rows => {
        const innerBound = new Set(bound)
        innerBound.add(rowsEach(rows))
        return mapRows(
          rows,
          source => visit(source, bound),
          body => visit(body, innerBound),
        )
      },
    })
  return visit(node, new Set())
}

/** Substitute matching `Path` nodes using `replace`. */
export const substitutePaths = (
  node: Node,
  replace: (segments: ReadonlyArray<string>) => Option.Option<Node>,
): Node => mapPaths(node, path => Option.getOrElse(replace(path.segments), () => path))
