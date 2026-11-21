/**
 * The one lowering of expressions to SQL, shared by `metakit/sql` (text and
 * parameters) and `metakit/drizzle` (Drizzle `SQL`).
 *
 * It produces pieces (text, a value to bind, a column read) in the order they
 * are written, so a term written twice binds its values twice and a
 * placeholder can never part from its parameter. A reader renders the pieces
 * with its own column and bind strategy.
 */
import { Data, Option, Result, Schema, SchemaAST } from 'effect'
import * as Expr from './expr.js'
import { isIntCheck } from './intCheck.js'
import * as Node from './node.js'
import { residualizeNode } from './ops/residualize.js'
import * as Path from './path.js'
import { Refused, type Transition } from './transition.js'

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
}>

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
 * or an infinity as JavaScript compares them, so those are refused here, for
 * a bound parameter as for an inlined literal.
 */
const literal = (value: unknown): Lowered => {
  if (value === null || value === undefined) return Result.succeed(q`NULL`)
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return unsupported(`non-finite number literal: ${value}`)
  }
  if (typeof value === 'string' && value.includes('\u0000')) {
    return unsupported('text literal holds a NUL character')
  }
  return Result.succeed([SqlPiece.Value({ value: Object.is(value, -0) ? 0 : value })])
}

const isIntAst = (ast: SchemaAST.AST): boolean =>
  SchemaAST.isUnion(ast)
    ? ast.types.some(isIntAst) &&
      ast.types.every(t => isIntAst(t) || SchemaAST.isNull(t) || SchemaAST.isUndefined(t))
    : SchemaAST.isNumber(ast) && (ast.checks ?? []).some(isIntCheck)

const integerOps: ReadonlySet<string> = new Set<Node.CoreOpId>([
  'num.add',
  'num.sub',
  'num.mul',
  'num.neg',
  'null.coalesce',
])

/** Whether `node` is an integer whatever the row holds, and reads the row. */
const isIntegerTerm = (node: Node.Node): boolean =>
  Node.$match(node, {
    Lit: () => false,
    Path: ({ ast }) => Option.isSome(ast) && isIntAst(ast.value),
    Call: ({ op, args }) =>
      op.id === 'str.len' ||
      op.id === 'arr.count' ||
      (integerOps.has(op.id) &&
        args.some(isIntegerTerm) &&
        args.every(arg => isIntegerTerm(arg) || isIntegerLiteral(arg))),
    If: ({ then, otherwise }) => isIntegerTerm(then) && isIntegerTerm(otherwise),
    Match: ({ cases, otherwise }) =>
      cases.every(([, branch]) => isIntegerTerm(branch)) &&
      Option.match(otherwise, { onNone: () => true, onSome: isIntegerTerm }),
    Opaque: () => false,
  })

const isIntegerLiteral = (node: Node.Node): boolean =>
  Node.$is('Lit')(node) && typeof node.value === 'number' && Number.isInteger(node.value)

const isFraction = (value: unknown): boolean =>
  typeof value === 'number' && Number.isFinite(value) && !Number.isInteger(value)

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
      // SQL has no empty `IN ()`: null of a null value, false of any other.
      if (items.length === 0) return Result.succeed(q`((${needle} IS NULL) AND NULL)`)
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
  'num.add': numeric(() => '+'),
  'num.sub': numeric(() => '-'),
  'num.mul': numeric(() => '*'),
  'num.neg': (args, ctx) => one(args, ctx, inner => q`(- ${inner})`),
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
}

/**
 * Lower `node`, reading a path under `rowPrefix` as a column. An empty prefix
 * reads every path as a column.
 */
export const lowerNode = (
  node: Node.Node,
  options: { readonly dialect: SqlDialect; readonly rowPrefix: ReadonlyArray<string> },
): Lowered => {
  const ctx: SqlContext = {
    dialect: options.dialect,
    lower: current =>
      Node.$match(current, {
        Lit: ({ value }) => literal(value),
        Path: ({ segments }) => {
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
      }),
  }
  return ctx.lower(node)
}

/**
 * Every rule of `schema` as one condition that holds only when each rule is
 * true: a rule that is unknown of a null fails the check, as the Schema
 * refuses the value.
 */
export const lowerCheck = (schema: Schema.Top, dialect: SqlDialect): Lowered => {
  const rules: Array<Sql> = []
  for (const rule of Expr.refinementsOf(schema)) {
    const lowered = lowerNode(rule.node, { dialect, rowPrefix: [] })
    if (Result.isFailure(lowered)) return lowered
    rules.push(lowered.success)
  }
  return Result.succeed(rules.length === 0 ? q`TRUE` : q`(${joined(rules, ' AND ')}) IS TRUE`)
}

export const lowerWhere = <Env>(
  expr: Expr.Expr<Env, unknown>,
  options: {
    readonly dialect: SqlDialect
    readonly rowPrefix: ReadonlyArray<string>
    readonly env?: Readonly<Record<string, unknown>> | undefined
  },
): Lowered =>
  lowerNode(
    options.env === undefined ? expr.node : residualizeNode(expr.node, options.env),
    options,
  )

/** A transition for one input: what each written column becomes, and the guard. */
export interface LoweredUpdate {
  readonly sets: ReadonlyArray<readonly [target: ReadonlyArray<string>, value: Sql]>
  readonly when: Sql
}

/**
 * Lower `transition` for `input`. The input is checked against the
 * transition's input Schema first: the guard and the proofs take its rules as
 * given, so an update built from an input that breaks them is refused.
 */
export const lowerUpdate = <State, Input, Emit>(
  transition: Transition<State, Input, Emit>,
  input: Input,
  dialect: SqlDialect,
): Result.Result<LoweredUpdate, SqlUnsupportedError | Refused> => {
  if (transition.writes.length === 0) {
    return unsupported('cannot lower a transition with no writes to a SQL UPDATE')
  }
  if (Option.isSome(transition.inputSchema) && !Schema.is(transition.inputSchema.value)(input)) {
    return Result.fail(new Refused({ reason: 'the input does not satisfy the input Schema' }))
  }
  const lower = (node: Node.Node) =>
    lowerNode(residualizeNode(node, { input }), { dialect, rowPrefix: ['state'] })
  const sets: Array<readonly [ReadonlyArray<string>, Sql]> = []
  for (const write of transition.writes) {
    const value = lower(write.value.node)
    if (Result.isFailure(value)) return Result.fail(value.failure)
    sets.push([write.target, value.success])
  }
  return Result.map(lower(transition.when.node), when => ({ sets, when }))
}

/** The SQL of a foreign operation for a dialect, from its lowered arguments, in some form of SQL. */
export interface ForeignSql<S> {
  readonly version: number
  readonly sql: (args: ReadonlyArray<S>, dialect: SqlDialect) => S
}

/** The entry of `table` for a foreign call, refused by name where it has none of the call's version. */
export const foreignSql = <S>(
  table: Readonly<Record<string, ForeignSql<S>>>,
  op: Node.ForeignOp,
): Result.Result<ForeignSql<S>, SqlUnsupportedError> => {
  const entry = Object.hasOwn(table, op.id) ? table[op.id] : undefined
  return entry !== undefined && entry.version === op.version
    ? Result.succeed(entry)
    : unsupported(`no SQL is given for the foreign operation ${op.id}@${op.version}`)
}

/** A literal written into SQL text, for DDL, which takes no parameters. */
export const inlineLiteral = (value: unknown): Result.Result<string, SqlUnsupportedError> => {
  if (typeof value === 'boolean') return Result.succeed(value ? 'TRUE' : 'FALSE')
  if (typeof value === 'number') return Result.succeed(String(value))
  if (typeof value === 'string') return Result.succeed(`'${value.replaceAll("'", "''")}'`)
  return unsupported(`cannot inline a literal of type ${typeof value}`)
}

/** The value a driver binds: SQLite has no boolean, and its drivers refuse one. */
export const bound = (value: unknown, dialect: SqlDialect): unknown =>
  dialect === 'sqlite' && typeof value === 'boolean' ? (value ? 1 : 0) : value

/**
 * Names each path's column once. Two paths that come to one name (`a_b` and
 * `a.b` under the default naming) would read one column for two fields.
 */
export const columnNames = (
  name: (segments: ReadonlyArray<string>) => string,
): ((segments: ReadonlyArray<string>) => Result.Result<string, SqlUnsupportedError>) => {
  const paths = new Map<string, string>()
  return segments => {
    const column = name(segments)
    const path = Path.format(segments)
    const prior = paths.get(column)
    if (prior !== undefined && prior !== path) {
      return unsupported(`paths "${prior}" and "${path}" both name the column ${column}`)
    }
    paths.set(column, path)
    return Result.succeed(column)
  }
}
