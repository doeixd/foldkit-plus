/**
 * The one lowering of expressions to SQL, shared by `metakit/sql` (text and
 * parameters) and `metakit/drizzle` (Drizzle `SQL`).
 *
 * It produces pieces (text, a value to bind, a column read) in the order they
 * are written, so a term written twice binds its values twice and a
 * placeholder can never part from its parameter. A reader renders the pieces
 * with its own column and bind strategy.
 */
import { Data, Option, Result } from 'effect'
import { isFraction, isIntegerLiteral, isIntegerTerm } from './integerTerm.js'
import * as Node from './node.js'
import { isShift } from './ops/mulScaled.js'
import * as Path from './path.js'
import { mulScaledChunks, LEFT } from './sqlMulScaled.js'

export type SqlDialect = 'postgres' | 'sqlite'

export class SqlUnsupportedError extends Data.TaggedError('SqlUnsupportedError')<{
  readonly reason: string
}> {}

/** One piece of lowered SQL. */
export type SqlPiece = Data.TaggedEnum<{
  Text: { readonly text: string }
  /** A value the reader binds as a parameter or inlines; never null. */
  Value: { readonly value: unknown }
  /** A column, by its path under the row. */
  Column: { readonly segments: ReadonlyArray<string> }
  /** A call of a foreign operation over its lowered arguments, which the renderer's own table writes. */
  Foreign: { readonly op: Node.ForeignOp; readonly args: ReadonlyArray<ReadonlyArray<SqlPiece>> }
  /** A column of the related row a `Rows` body reads, by its path under the row. */
  Each: { readonly segments: ReadonlyArray<string> }
  /**
   * A question asked of the rows pointing through `relation` at the row (at
   * `of` under it: none is the row itself), which the renderer writes as a
   * correlated subquery from its own table of relations.
   */
  Rows: {
    readonly fold: RelatedFold
    readonly relation: string
    readonly of: ReadonlyArray<string>
    readonly where: Option.Option<ReadonlyArray<SqlPiece>>
    readonly value: Option.Option<ReadonlyArray<SqlPiece>>
  }
}>

/** The folds SQL asks of related rows: the others answer in an order, or with a list. */
export type RelatedFold = Extract<Node.RowsFold, 'any' | 'every' | 'count' | 'sum' | 'min' | 'max'>

const relatedFolds: ReadonlySet<string> = new Set<RelatedFold>([
  'any',
  'every',
  'count',
  'sum',
  'min',
  'max',
])

const isRelatedFold = (fold: Node.RowsFold): fold is RelatedFold => relatedFolds.has(fold)

export const SqlPiece = Data.taggedEnum<SqlPiece>()

/** Lowered SQL: its pieces in the order they are written. */
export type Sql = ReadonlyArray<SqlPiece>

type Lowered = Result.Result<Sql, SqlUnsupportedError>

const unsupported = (reason: string): Result.Result<never, SqlUnsupportedError> =>
  Result.fail(new SqlUnsupportedError({ reason }))

/** Lowered SQL from a template whose holes are lowered SQL or plain text. */
const q = (strings: TemplateStringsArray, ...holes: ReadonlyArray<Sql | string>): Sql => {
  const out: Array<SqlPiece> = []
  strings.forEach((text, index) => {
    if (text !== '') out.push(SqlPiece.Text({ text }))
    const hole = holes[index]
    if (typeof hole === 'string') out.push(SqlPiece.Text({ text: hole }))
    else if (hole !== undefined) out.push(...hole)
  })
  return out
}

const joined = (parts: ReadonlyArray<Sql>, separator: string): Sql =>
  parts.flatMap((part, index) => (index === 0 ? part : [...q`${separator}`, ...part]))

/**
 * A constant. Postgres refuses a NUL in text, and neither dialect stores NaN
 * or an infinity as JavaScript compares them, nor a number past ±(2^53−1) as
 * a double holds it, so those are refused here, for a bound parameter as for
 * an inlined literal.
 */
const literal = (value: unknown): Lowered => {
  if (value === null || value === undefined) return Result.succeed(q`NULL`)
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return unsupported(`non-finite number literal: ${value}`)
  }
  if (typeof value === 'number' && Math.abs(value) > Number.MAX_SAFE_INTEGER) {
    return unsupported(`number literal past ±(2^53−1): ${value}`)
  }
  if (typeof value === 'string' && value.includes('\u0000')) {
    return unsupported('text literal holds a NUL character')
  }
  return Result.succeed([SqlPiece.Value({ value: Object.is(value, -0) ? 0 : value })])
}

/**
 * Refuse a fraction beside an integer term. Postgres types a parameter by the
 * column it meets, so `"n" + $1` with 0.5 is an error there and a number in
 * SQLite; a conversion would have to name a rounding, and none is declared.
 */
const fractionBesideInteger = (): Result.Result<never, SqlUnsupportedError> =>
  unsupported(
    'a fraction beside an integer column: declare the column a non-integer number, or scale the constant to an integer',
  )

const noFractionBesideInteger = (
  left: Node.Node,
  right: Node.Node,
): Result.Result<void, SqlUnsupportedError> => {
  const mixed = (term: Node.Node, other: Node.Node) =>
    isIntegerTerm(term) && Node.$is('Lit')(other) && isFraction(other.value)
  return mixed(left, right) || mixed(right, left)
    ? fractionBesideInteger()
    : Result.succeed(undefined)
}

export interface SqlContext {
  readonly dialect: SqlDialect
  readonly lower: (node: Node.Node) => Lowered
}

export type SqlLowerer = (args: ReadonlyArray<Node.Node>, ctx: SqlContext) => Lowered

const both = (
  args: ReadonlyArray<Node.Node>,
  ctx: SqlContext,
  write: (left: Sql, right: Sql) => Sql,
): Lowered =>
  Result.flatMap(ctx.lower(args[0]!), left =>
    Result.map(ctx.lower(args[1]!), right => write(left, right)),
  )

const one = (
  args: ReadonlyArray<Node.Node>,
  ctx: SqlContext,
  write: (inner: Sql) => Sql,
): Lowered => Result.map(ctx.lower(args[0]!), write)

const infix =
  (operator: string): SqlLowerer =>
  (args, ctx) =>
    both(args, ctx, (left, right) => q`(${left} ${operator} ${right})`)

/** An infix operator over numbers: a fraction may not meet an integer term. */
const numeric =
  (operator: (dialect: SqlDialect) => string): SqlLowerer =>
  (args, ctx) =>
    Result.flatMap(noFractionBesideInteger(args[0]!, args[1]!), () =>
      infix(operator(ctx.dialect))(args, ctx),
    )

/** The first integer past the safe range, which no safe integer reaches: the clamp's stop. */
const PAST_SAFE = String(Number.MAX_SAFE_INTEGER + 1)

/**
 * `+` or `-` over integers as evaluation gives it: NULL where the result leaves
 * ±(2^53−1), which SQL would return as a float (SQLite) or a bigint past the
 * range (Postgres, which raises on an overflow of its own integer sum, so the
 * sum is formed as `numeric`). The result is clamped to ±2^53 and that value
 * made NULL, so the sum is written once; a NULL sum clamps to -2^53 on
 * Postgres (`GREATEST` ignores NULL) and is NULL again. Only a sum with an
 * integer term the row decides is guarded: sums of request values are folded
 * and refused before SQL is written.
 */
const sum =
  (operator: '+' | '-'): SqlLowerer =>
  (args, ctx) => {
    const left = args[0]!
    const right = args[1]!
    const integers = [left, right].every(arg => isIntegerTerm(arg) || isIntegerLiteral(arg))
    if (!integers || !(isIntegerTerm(left) || isIntegerTerm(right))) {
      return numeric(() => operator)(args, ctx)
    }
    return both(args, ctx, (l, r) =>
      ctx.dialect === 'postgres'
        ? q`CAST(NULLIF(NULLIF(LEAST(GREATEST((CAST(${l} AS numeric) ${operator} ${r}), -${PAST_SAFE}), ${PAST_SAFE}), ${PAST_SAFE}), -${PAST_SAFE}) AS bigint)`
        : q`NULLIF(NULLIF(max(min((${l} ${operator} ${r}), ${PAST_SAFE}), -${PAST_SAFE}), ${PAST_SAFE}), -${PAST_SAFE})`,
    )
  }

const byDialect =
  <A>(postgres: A, sqlite: A) =>
  (dialect: SqlDialect): A =>
    dialect === 'postgres' ? postgres : sqlite

/** Text compared by code point: SQLite's default `BINARY`, Postgres's `C` collation. */
const textOrder =
  (operator: string): SqlLowerer =>
  (args, ctx) =>
    both(args, ctx, (left, right) =>
      ctx.dialect === 'postgres'
        ? q`(${left} ${operator} ${right} COLLATE "C")`
        : q`(${left} ${operator} ${right})`,
    )

/** A list a transition writes is held in the state, never in a column this phase writes. */
const listWrite = (id: Node.CoreOpId): Lowered =>
  unsupported(`${id}: a list held in a column is not written by SQL`)

/** An array is a Postgres array or SQLite JSON text; both give null for a null one. */
const arrayLength = byDialect('cardinality', 'json_array_length')

/** The lowering of every primitive: a new one fails to compile until it has a row here. */
export const sqlOps: Readonly<Record<Node.CoreOpId, SqlLowerer>> = {
  'bool.and': infix('AND'),
  'bool.or': infix('OR'),
  'bool.not': (args, ctx) => one(args, ctx, inner => q`(NOT ${inner})`),
  'eq.is': numeric(byDialect('IS NOT DISTINCT FROM', 'IS')),
  'eq.isNot': numeric(byDialect('IS DISTINCT FROM', 'IS NOT')),
  'eq.in': (args, ctx) => {
    const list = args[1]!
    if (!Node.$is('Lit')(list) || !Array.isArray(list.value)) {
      return unsupported('eq.in requires a literal array of candidates in SQL')
    }
    const candidates: ReadonlyArray<unknown> = list.value
    return Result.flatMap(ctx.lower(args[0]!), needle => {
      const present = candidates.filter(item => item !== null && item !== undefined)
      if (isIntegerTerm(args[0]!) && present.some(isFraction)) return fractionBesideInteger()
      const items: Array<Sql> = []
      for (const item of present) {
        const lowered = literal(item)
        if (Result.isFailure(lowered)) return lowered
        items.push(lowered.success)
      }
      if (candidates.length === 0) return Result.succeed(q`FALSE`)
      if (items.length === 0) return Result.succeed(q`(${needle} IS NULL)`)
      const among = q`(${needle} IN (${joined(items, ', ')}))`
      // `IN` is unknown of a null needle; membership answers false, so `NOT` of it holds.
      return Result.succeed(
        present.length < candidates.length
          ? q`(${among} OR (${needle} IS NULL))`
          : q`((${needle} IS NOT NULL) AND ${among})`,
      )
    })
  },
  'eq.equals': numeric(() => '='),
  'eq.among': (args, ctx) => {
    const list = args[1]!
    if (!Node.$is('Lit')(list) || !Array.isArray(list.value)) {
      return unsupported('eq.among requires a literal array of candidates in SQL')
    }
    const candidates: ReadonlyArray<unknown> = list.value
    return Result.flatMap(ctx.lower(args[0]!), needle => {
      if (isIntegerTerm(args[0]!) && candidates.some(isFraction)) return fractionBesideInteger()
      const items: Array<Sql> = []
      for (const item of candidates) {
        const lowered = literal(item)
        if (Result.isFailure(lowered)) return lowered
        items.push(lowered.success)
      }
      // No candidate is false whatever the value, as SQLite answers `x IN ()` and Drizzle writes an empty `inArray`.
      if (items.length === 0) return Result.succeed(q`FALSE`)
      return Result.succeed(q`(${needle} IN (${joined(items, ', ')}))`)
    })
  },
  'null.isNull': (args, ctx) => one(args, ctx, inner => q`(${inner} IS NULL)`),
  'null.coalesce': (args, ctx) =>
    Result.flatMap(noFractionBesideInteger(args[0]!, args[1]!), () =>
      both(args, ctx, (value, fallback) => q`COALESCE(${value}, ${fallback})`),
    ),
  // Postgres's `C` collation lowers A to Z alone, as SQLite's `lower` does.
  'str.lowerAscii': (args, ctx) =>
    one(args, ctx, s => (ctx.dialect === 'postgres' ? q`lower(${s} COLLATE "C")` : q`lower(${s})`)),
  'str.trim': (args, ctx) =>
    one(args, ctx, s =>
      ctx.dialect === 'postgres'
        ? q`btrim(${s}, chr(32) || chr(9) || chr(10) || chr(13))`
        : q`trim(${s}, char(32, 9, 10, 13))`,
    ),
  'str.lt': textOrder('<'),
  'str.lte': textOrder('<='),
  'str.gt': textOrder('>'),
  'str.gte': textOrder('>='),
  'ord.lt': numeric(() => '<'),
  'ord.lte': numeric(() => '<='),
  'ord.gt': numeric(() => '>'),
  'ord.gte': numeric(() => '>='),
  'num.add': sum('+'),
  'num.sub': sum('-'),
  'num.mul': numeric(() => '*'),
  'num.neg': (args, ctx) => one(args, ctx, inner => q`(- ${inner})`),
  'num.mulScaled': (args, ctx) => {
    const shift = args[2]
    if (!Node.$is('Lit')(shift) || !isShift(shift.value)) {
      return unsupported('num.mulScaled: the shift is not a literal number of places')
    }
    const places = shift.value
    if (![args[0]!, args[1]!].every(arg => isIntegerTerm(arg) || isIntegerLiteral(arg))) {
      return unsupported(
        'num.mulScaled needs operands that are integers whatever the row holds: a Schema.Int, Decimal or Money column, or an integer literal',
      )
    }
    return both(args, ctx, (left, right) =>
      mulScaledChunks(ctx.dialect, places).flatMap(chunk =>
        typeof chunk === 'string' ? q`${chunk}` : chunk === LEFT ? left : right,
      ),
    )
  },
  'str.len': (args, ctx) =>
    one(args, ctx, s => q`${byDialect('char_length', 'length')(ctx.dialect)}(${s})`),
  'str.startsWith': (args, ctx) =>
    both(args, ctx, (s, prefix) =>
      ctx.dialect === 'postgres'
        ? q`(LEFT(${s}, char_length(${prefix})) = ${prefix})`
        : q`(substr(${s}, 1, length(${prefix})) = ${prefix})`,
    ),
  'str.contains': (args, ctx) =>
    both(
      args,
      ctx,
      (s, sub) => q`(${byDialect('strpos', 'instr')(ctx.dialect)}(${s}, ${sub}) > 0)`,
    ),
  'arr.count': (args, ctx) => one(args, ctx, a => q`${arrayLength(ctx.dialect)}(${a})`),
  'arr.isEmpty': (args, ctx) => one(args, ctx, a => q`(${arrayLength(ctx.dialect)}(${a}) = 0)`),
  'arr.append': () => listWrite('arr.append'),
  'arr.include': () => listWrite('arr.include'),
  'arr.exclude': () => listWrite('arr.exclude'),
}

/**
 * Lower `node`, reading a path under `rowPrefix` as a column. An empty prefix
 * reads every path as a column.
 */
export const lowerNode = (
  node: Node.Node,
  options: { readonly dialect: SqlDialect; readonly rowPrefix: ReadonlyArray<string> },
  inBody = false,
): Lowered => {
  const ctx: SqlContext = {
    dialect: options.dialect,
    lower: current =>
      Node.$match(current, {
        Lit: ({ value }) => literal(value),
        Path: ({ segments }) => {
          if (inBody && Node.readsEach(segments)) {
            return segments.length === 1
              ? unsupported('cannot lower a whole related row to a single SQL column')
              : Result.succeed([SqlPiece.Each({ segments: segments.slice(1) })])
          }
          if (inBody && Path.isPrefix(options.rowPrefix, segments)) {
            return unsupported(
              `a body over related rows reads the row it is asked of ("${Path.format(segments)}")`,
            )
          }
          if (!Path.isPrefix(options.rowPrefix, segments)) {
            return unsupported(
              `unbound path "${Path.format(segments)}" outside row prefix "${Path.format(options.rowPrefix)}"`,
            )
          }
          const rel = segments.slice(options.rowPrefix.length)
          return rel.length === 0
            ? unsupported('cannot lower the whole row to a single SQL column')
            : Result.succeed([SqlPiece.Column({ segments: rel })])
        },
        Call: ({ op, args }) => {
          if (!Node.isForeign(op)) return sqlOps[op.id](args, ctx)
          const lowered: Array<Sql> = []
          for (const arg of args) {
            const each = ctx.lower(arg)
            if (Result.isFailure(each)) return each
            lowered.push(each.success)
          }
          return Result.succeed([SqlPiece.Foreign({ op, args: lowered })])
        },
        // A condition that is null chooses neither branch: `ELSE` would take the second.
        If: ({ cond, then, otherwise }) =>
          Result.flatMap(ctx.lower(cond), c =>
            Result.flatMap(ctx.lower(then), t =>
              Result.map(
                ctx.lower(otherwise),
                e => q`(CASE WHEN ${c} THEN ${t} WHEN NOT ${c} THEN ${e} END)`,
              ),
            ),
          ),
        Match: ({ on, cases, otherwise }) =>
          Result.flatMap(ctx.lower(on), target => {
            const arms: Array<Sql> = []
            for (const [value, branch] of cases) {
              const when = literal(value)
              if (Result.isFailure(when)) return when
              const then = ctx.lower(branch)
              if (Result.isFailure(then)) return then
              arms.push(q`WHEN ${when.success} THEN ${then.success}`)
            }
            const rest = Option.match(otherwise, {
              onNone: (): Lowered => Result.succeed([]),
              onSome: fallback => Result.map(ctx.lower(fallback), f => q` ELSE ${f}`),
            })
            return Result.map(rest, e => q`(CASE ${target} ${joined(arms, ' ')}${e} END)`)
          }),
        Opaque: ({ name }) => unsupported(`cannot lower opaque term "${name}" to SQL`),
        Rows: rows => lowerRows(rows, options),
      }),
  }
  return ctx.lower(node)
}

/**
 * A `Rows` node over related rows as a piece the renderer writes as a
 * subquery, its body lowered with the related row's columns as `Each`. A
 * list held in a column, and a fold whose answer is ordered or a list, are
 * refused by name.
 */
const lowerRows = (
  rows: Node.Rows,
  options: { readonly dialect: SqlDialect; readonly rowPrefix: ReadonlyArray<string> },
): Lowered =>
  Node.RowsOver.$match(rows.over, {
    List: () =>
      unsupported(`rows.${rows.fold} over a list: a list held in a column is not lowered to SQL`),
    Related: ({ of, relation }) => {
      const fold = rows.fold
      if (!isRelatedFold(fold)) {
        return unsupported(
          `rows.${fold} over related rows: SQL has no order or list for its answer`,
        )
      }
      if (!Node.$is('Path')(of) || !Path.isPrefix(options.rowPrefix, of.segments)) {
        return unsupported(`rows.${fold} over related rows of a row that is not the one asked of`)
      }
      const body = (part: Option.Option<Node.Node>) =>
        Option.match(part, {
          onNone: (): Result.Result<Option.Option<Sql>, SqlUnsupportedError> =>
            Result.succeed(Option.none()),
          onSome: each => Result.map(lowerNode(each, options, true), Option.some),
        })
      return Result.flatMap(body(rows.where), where =>
        Result.map(body(rows.value), value => [
          SqlPiece.Rows({
            fold,
            relation,
            of: of.segments.slice(options.rowPrefix.length),
            where,
            value,
          }),
        ]),
      )
    },
  })
