/**
 * The CHECK constraints an Entity's own declarations imply: each field's rules
 * that SQL can say exactly, and each state invariant. The Entity owns the rules;
 * the table, its columns and their storage stay the application's, and `bind`
 * checks those against the Entity (kind, nullability) as it always has.
 *
 * A rule compiles only where the database's answer is the Schema's for every
 * value of the field's kind: a CHECK never refuses a row the Schema accepts, and
 * never accepts one it refuses. Anything else is listed as held by the server
 * only (`checkConstraints(...).serverOnly`), neither dropped in silence nor
 * refused, since the server still holds it on every declared write.
 */
import {
  getColumnTable,
  getTableName,
  is,
  sql,
  type AnyColumn,
  type SQL,
  type Table,
} from 'drizzle-orm'
import {
  check as pgCheck,
  getTableConfig as pgTableConfig,
  PgDialect,
  PgTable,
  type CheckBuilder as PgCheckBuilder,
  type PgColumn,
} from 'drizzle-orm/pg-core'
import {
  check as sqliteCheck,
  getTableConfig as sqliteTableConfig,
  SQLiteDialect,
  SQLiteTable,
  type CheckBuilder as SQLiteCheckBuilder,
  type SQLiteColumn,
} from 'drizzle-orm/sqlite-core'
import { Match, Option, Schema, SchemaAST } from 'effect'
import * as Domain from 'foldkit-entity'
import { SchemaShape, type Invariant } from 'foldkit-entity'
import type { AnyEntityBinding } from './binding.js'
import { compilePredicates, QueryCompileError, type CompileTarget } from './compile.js'
import { operatorsFrom, type BindingOperators } from './operators.js'
import { quoted } from './quoted.js'

type Dialect = 'sqlite' | 'postgres'

/** One CHECK: its name, and its condition as its dialect writes it, every value inlined. */
interface DerivedCheck {
  readonly name: string
  readonly condition: string
}

interface Derived {
  readonly checks: ReadonlyArray<DerivedCheck>
  readonly serverOnly: ReadonlyArray<string>
}

const fail = (message: string): never => {
  throw new Error(`[foldkit-remote-drizzle] ${message}`)
}

const dialectOf = (table: Table): Dialect => (is(table, PgTable) ? 'postgres' : 'sqlite')

/**
 * SQL as its dialect writes it, with no parameter left: a constraint binds none.
 * Wrapped, so a table's own check is read without being marked to inline.
 */
const render = (table: Table, condition: SQL, what: string): string => {
  const query = (is(table, PgTable) ? new PgDialect() : new SQLiteDialect()).sqlToQuery(
    sql`${condition}`.inlineParams(),
  )
  if (query.params.length > 0)
    throw new QueryCompileError(`${what} compares a value a constraint cannot hold`)
  return query.sql
}

const number = (value: number): SQL => sql.raw(String(value))
const count = (column: AnyColumn): SQL => sql`length(${column})`
const atLeast = (column: AnyColumn, minimum: number): ReadonlyArray<SQL> =>
  minimum <= 0 ? [] : [sql`${count(column)} >= ${number(minimum)}`]
const atMost = (column: AnyColumn, maximum: number): ReadonlyArray<SQL> => [
  sql`${count(column)} <= ${number(maximum)}`,
]

/**
 * A pattern SQL can say exactly: one bracket of ASCII letters, digits, `_`, `.`,
 * space or `-`, repeated over the whole string, as `/^[a-z0-9_]{3,15}$/`. Every
 * string it accepts is ASCII, so a length in UTF-16 units is a length in the
 * characters SQL counts.
 */
interface AsciiClass {
  /** The bracket's contents, as both GLOB and a Postgres regex read them. */
  readonly body: string
  readonly minimum: number
  readonly maximum: Option.Option<number>
}

const CLASS = /^\^\[((?:\\[dw]|[\w. ](?:-\w)?)+)(-?)\](?:(\+)|(\*)|\{(\d+)(?:(,)(\d*))?\})\$$/
const ITEM = /\\([dw])|([\w. ])(?:-(\w))?/g
const kindOfChar = (char: string): Option.Option<string> =>
  /[0-9]/.test(char)
    ? Option.some('digit')
    : /[a-z]/.test(char)
      ? Option.some('lower')
      : /[A-Z]/.test(char)
        ? Option.some('upper')
        : Option.none()

const asciiClass = (source: string, flags: string): Option.Option<AsciiClass> => {
  const whole = flags === '' || flags === 'u' ? CLASS.exec(source) : null
  if (whole === null) return Option.none()
  const [, items = '', dash, plus, star, exactly, comma, upTo] = whole
  const parts: Array<string> = []
  for (const [, escape, from = '', to] of items.matchAll(ITEM)) {
    if (escape !== undefined) parts.push(escape === 'd' ? '0-9' : 'A-Za-z0-9_')
    else if (to === undefined) parts.push(from)
    else {
      // A range is read the same everywhere only within one run of letters or digits.
      const same = Option.all([kindOfChar(from), kindOfChar(to)]).pipe(
        Option.exists(([a, b]) => a === b && from <= to),
      )
      if (!same) return Option.none()
      parts.push(`${from}-${to}`)
    }
  }
  const body = `${parts.join('')}${dash}`
  if (plus !== undefined) return Option.some({ body, minimum: 1, maximum: Option.none() })
  if (star !== undefined) return Option.some({ body, minimum: 0, maximum: Option.none() })
  const least = Number(exactly)
  return Option.some({
    body,
    minimum: least,
    maximum:
      comma === undefined
        ? Option.some(least)
        : upTo === ''
          ? Option.none()
          : Option.some(Number(upTo)),
  })
}

const classSql = (column: AnyColumn, held: AsciiClass, dialect: Dialect): ReadonlyArray<SQL> => [
  dialect === 'sqlite'
    ? sql`${column} not glob ${sql.raw(`'*[^${held.body}]*'`)}`
    : sql`${column} !~ ${sql.raw(`'[^${held.body}]'`)}`,
  ...atLeast(column, held.minimum),
  ...Option.match(held.maximum, { onNone: () => [], onSome: maximum => atMost(column, maximum) }),
]

const Pattern = Schema.Struct({ source: Schema.String, flags: Schema.String })
const PATTERN = 'effect/schema/isPattern'
const classOf = (payload: Schema.Json): Option.Option<AsciiClass> =>
  Schema.decodeUnknownOption(Pattern)(payload).pipe(
    Option.flatMap(({ source, flags }) => asciiClass(source, flags)),
  )

const Bound = (key: string) => Schema.Struct({ [key]: Schema.Number })
const Between = Schema.Struct({
  minimum: Schema.Number,
  maximum: Schema.Number,
  exclusiveMinimum: Schema.optional(Schema.Boolean),
  exclusiveMaximum: Schema.optional(Schema.Boolean),
})

/** Lengths in UTF-16 units: exact in SQL only over ASCII. */
const UNIT_LENGTHS = new Set([
  'effect/schema/isMinLength',
  'effect/schema/isMaxLength',
  'effect/schema/isBetweenLength',
])

type Translate = (
  payload: Schema.Json,
  column: AnyColumn,
  context: { readonly dialect: Dialect; readonly ascii: boolean },
) => Option.Option<ReadonlyArray<SQL>>

const bound =
  (key: string, toSql: (column: AnyColumn, value: number) => SQL): Translate =>
  (payload, column) =>
    Schema.decodeUnknownOption(Bound(key))(payload).pipe(
      Option.map(read => read[key]!),
      Option.filter(Number.isFinite),
      Option.map(value => [toSql(column, value)]),
    )

const lengths =
  (
    read: (payload: Schema.Json) => Option.Option<readonly [number, Option.Option<number>]>,
    exact: (minimum: number, ascii: boolean) => boolean,
  ): Translate =>
  (payload, column, { ascii }) =>
    read(payload).pipe(
      Option.filter(([minimum]) => exact(minimum, ascii)),
      Option.map(([minimum, maximum]) => [
        ...atLeast(column, minimum),
        ...Option.match(maximum, { onNone: () => [], onSome: most => atMost(column, most) }),
      ]),
    )

const least = (key: string) => (payload: Schema.Json) =>
  Schema.decodeUnknownOption(Bound(key))(payload).pipe(
    Option.map(read => [read[key]!, Option.none<number>()] as const),
  )
const most = (key: string) => (payload: Schema.Json) =>
  Schema.decodeUnknownOption(Bound(key))(payload).pipe(
    Option.map(read => [0, Option.some(read[key]!)] as const),
  )
const range = (payload: Schema.Json) =>
  Schema.decodeUnknownOption(Between)(payload).pipe(
    Option.map(read => [read.minimum, Option.some(read.maximum)] as const),
  )
const always = () => true
const overAscii = (_: number, ascii: boolean) => ascii

/** By `representation.id`, the field rules SQL holds exactly, and how. */
const TEXT: Readonly<Record<string, Translate>> = {
  'effect/schema/isMinCodePoints': lengths(least('minCodePoints'), always),
  'effect/schema/isMaxCodePoints': lengths(most('maxCodePoints'), always),
  'effect/schema/isBetweenCodePoints': lengths(range, always),
  // At least one unit is at least one character, so a non-empty rule is exact anywhere.
  'effect/schema/isMinLength': lengths(least('minLength'), (n, ascii) => ascii || n <= 1),
  'effect/schema/isMaxLength': lengths(most('maxLength'), overAscii),
  'effect/schema/isBetweenLength': lengths(range, overAscii),
  [PATTERN]: (payload, column, { dialect }) =>
    Option.map(classOf(payload), held => classSql(column, held, dialect)),
}

const NUMBER: Readonly<Record<string, Translate>> = {
  'effect/schema/isGreaterThan': bound('exclusiveMinimum', (c, v) => sql`${c} > ${number(v)}`),
  'effect/schema/isGreaterThanOrEqualTo': bound('minimum', (c, v) => sql`${c} >= ${number(v)}`),
  'effect/schema/isLessThan': bound('exclusiveMaximum', (c, v) => sql`${c} < ${number(v)}`),
  'effect/schema/isLessThanOrEqualTo': bound('maximum', (c, v) => sql`${c} <= ${number(v)}`),
  'effect/schema/isBetween': (payload, column) =>
    Schema.decodeUnknownOption(Between)(payload).pipe(
      Option.filter(({ minimum, maximum }) => Number.isFinite(minimum) && Number.isFinite(maximum)),
      Option.map(({ minimum, maximum, exclusiveMinimum, exclusiveMaximum }) => [
        exclusiveMinimum === true
          ? sql`${column} > ${number(minimum)}`
          : sql`${column} >= ${number(minimum)}`,
        exclusiveMaximum === true
          ? sql`${column} < ${number(maximum)}`
          : sql`${column} <= ${number(maximum)}`,
      ]),
    ),
}

/** Every filter of a check list, a group's members in its place. */
const filtersIn = (
  checks: ReadonlyArray<SchemaAST.Check<unknown>>,
): ReadonlyArray<SchemaAST.Filter<unknown>> =>
  checks.flatMap(check =>
    Match.value(check).pipe(
      Match.tagsExhaustive({
        Filter: filter => [filter],
        FilterGroup: group => filtersIn(group.checks),
      }),
    ),
  )

/** Every filter anywhere in a schema: what a field's rules are, compiled or not. */
const filtersOf = (ast: SchemaAST.AST): ReadonlyArray<SchemaAST.Filter<unknown>> => [
  ...filtersIn(ast.checks ?? []),
  ...(SchemaAST.isUnion(ast)
    ? ast.types.flatMap(filtersOf)
    : SchemaAST.isDeclaration(ast)
      ? ast.typeParameters.flatMap(filtersOf)
      : SchemaAST.isObjects(ast)
        ? ast.propertySignatures.flatMap(signature => filtersOf(signature.type))
        : SchemaAST.isArrays(ast)
          ? [...ast.elements, ...ast.rest].flatMap(filtersOf)
          : []),
]

const describe = (filter: SchemaAST.Filter<unknown>): string => {
  const id = filter.annotations?.representation?.id
  const said = filter.annotations?.expected ?? id ?? 'a check of its own'
  return id !== undefined && UNIT_LENGTHS.has(id)
    ? `${said} (counted in UTF-16 units; SQL counts code points, as Schema.isMaxCodePoints does)`
    : said
}

const literalList = (values: ReadonlyArray<unknown>): Option.Option<SQL> => {
  if (values.every(value => typeof value === 'number' && Number.isFinite(value)))
    return Option.some(sql.raw(values.map(String).join(', ')))
  if (values.every(value => typeof value === 'string' && !value.includes('\u0000')))
    return Option.some(
      sql.raw(values.map(value => `'${String(value).replaceAll("'", "''")}'`).join(', ')),
    )
  return Option.none()
}

/**
 * One field's rules as one condition over its column, and the rules SQL cannot
 * say. The column holds the encoded value, so that side is read; a rule only the
 * decoded side has (one made after a transformation) is the server's.
 */
const fieldRules = (
  ast: SchemaAST.AST,
  column: AnyColumn,
  dialect: Dialect,
): { readonly parts: ReadonlyArray<SQL>; readonly serverOnly: ReadonlyArray<string> } => {
  const encoded = SchemaAST.toEncoded(ast)
  const compiled = new Set<SchemaAST.Filter<unknown>>()
  const parts: Array<SQL> = []
  const shapes: Array<string> = []
  const present = SchemaShape.present(encoded)
  const literals = present.flatMap(member => (SchemaAST.isLiteral(member) ? [member.literal] : []))
  const [only] = present
  if (present.length > 0 && literals.length === present.length) {
    Option.match(literalList(literals), {
      onNone: () => shapes.push(`one of ${literals.map(value => String(value)).join(', ')}`),
      onSome: list =>
        parts.push(
          typeof literals[0] === 'string'
            ? dialect === 'sqlite'
              ? sql`${column} collate binary in (${list})`
              : sql`(${column} collate "C") in (${list})`
            : sql`${column} in (${list})`,
        ),
    })
  } else if (
    present.length === 1 &&
    only !== undefined &&
    (SchemaAST.isString(only) || SchemaAST.isNumber(only))
  ) {
    const table = SchemaAST.isString(only) ? TEXT : NUMBER
    const represented = filtersIn(only.checks ?? []).flatMap(filter => {
      const representation = filter.annotations?.representation
      return representation === undefined ? [] : [{ filter, ...representation }]
    })
    const ascii = represented.some(
      ({ id, payload }) => id === PATTERN && Option.isSome(classOf(payload)),
    )
    for (const { filter, id, payload } of represented) {
      if (!Object.hasOwn(table, id)) continue
      Option.match(table[id]!(payload, column, { dialect, ascii }), {
        onNone: () => {},
        onSome: held => {
          compiled.add(filter)
          parts.push(...held)
        },
      })
    }
  }
  for (const member of present) {
    if (SchemaAST.isEnum(member)) shapes.push('a value of an enum')
    if (SchemaAST.isTemplateLiteral(member)) shapes.push('a template literal')
  }
  const every = new Set([...filtersOf(SchemaAST.toType(ast)), ...filtersOf(encoded)])
  return {
    parts,
    serverOnly: [...shapes, ...[...every].filter(filter => !compiled.has(filter)).map(describe)],
  }
}

/**
 * Every CHECK an Entity implies for its table: one per column whose field has
 * rules SQL holds exactly, named `<table>_<column>_check`, and one per state
 * invariant, named `<table>_<id>`.
 */
const derive = (
  owner: string,
  fields: ReadonlyArray<readonly [string, SchemaAST.AST]>,
  invariants: ReadonlyArray<Invariant>,
  target: CompileTarget,
): Derived => {
  const table = getTableName(target.table)
  const dialect = dialectOf(target.table)
  const checks: Array<DerivedCheck> = []
  const serverOnly: Array<string> = []
  for (const [field, ast] of fields) {
    const column = target.columns[field]!
    const rules = fieldRules(ast, column, dialect)
    serverOnly.push(...rules.serverOnly.map(rule => `${owner}.${field}: ${rule}`))
    if (rules.parts.length > 0)
      checks.push({
        name: `${table}_${column.name}_check`,
        condition: render(
          target.table,
          sql.join([...rules.parts], sql` and `),
          `${owner}.${field}`,
        ),
      })
  }
  for (const held of invariants) {
    // A constraint sees one row, so only a state invariant (reading no row before) is one.
    if (Domain.Entity.readsBefore(held)) {
      serverOnly.push(`${owner}'s invariant "${held.id}": reads the row before the write`)
      continue
    }
    const what = `${owner}'s invariant "${held.id}"`
    const condition = sql.join(
      [...compilePredicates([held.predicate], target, {}, what)],
      sql` and `,
    )
    // A plain check passes a row its condition calls unknown (a null); an invariant does not.
    checks.push({
      name: `${table}_${held.id}`,
      condition: render(target.table, sql`(${condition}) is true`, what),
    })
  }
  const names = new Set<string>()
  for (const { name } of checks) {
    if (names.has(name)) fail(`${owner} names two CHECKs "${name}"; rename the invariant`)
    names.add(name)
  }
  return { checks, serverOnly }
}

/** An Entity's fields beside the column each is stored in, failing for one with none. */
const fieldsOf = (
  entity: Domain.AnyEntity,
  columns: Readonly<Record<string, AnyColumn | undefined>>,
  overrides: Readonly<Record<string, AnyColumn | undefined>>,
): {
  readonly columns: Record<string, AnyColumn>
  readonly fields: Array<readonly [string, SchemaAST.AST]>
} => {
  const resolved = Object.create(null) as Record<string, AnyColumn>
  const fields: Array<readonly [string, SchemaAST.AST]> = []
  const members: Readonly<Record<string, Domain.EntityMember>> = entity.fields
  for (const [field, member] of Object.entries(members)) {
    if (member._tag !== 'Field') continue
    resolved[field] =
      overrides[field] ??
      (Object.hasOwn(columns, field) ? columns[field] : undefined) ??
      fail(`field "${field}" on entity "${entity.name}" has no column; name one under "fields"`)
    fields.push([field, member.schema.ast])
  }
  return { columns: resolved, fields }
}

/** Options for `entityChecks`, matching what `bind` is given for the same table. */
export interface EntityCheckOptions<E extends Domain.AnyEntity> {
  /** A column for a field whose name differs from the column's key; the rest match by key. */
  readonly fields?: { readonly [K in keyof E['fields']]?: AnyColumn } | undefined
  /** How an invariant's primitive operators run in SQL; each kernel's when not given. */
  readonly operators?: Partial<BindingOperators> | undefined
}

/**
 * The CHECKs an Entity implies, as Drizzle `check()`s for its table's own
 * definition, so `drizzle-kit` writes them into the migration that makes it:
 *
 * ```ts
 * const posts = sqliteTable('posts', { … }, t => entityChecks(Post, t))
 * ```
 *
 * It takes the Entity, not a binding: Drizzle reads the callback lazily, and the
 * binding is made from the table. `bind` refuses a table whose checks disagree.
 */
export function entityChecks<E extends Domain.AnyEntity>(
  entity: E,
  columns: Readonly<Record<string, PgColumn>>,
  options?: EntityCheckOptions<E>,
): Array<PgCheckBuilder>
export function entityChecks<E extends Domain.AnyEntity>(
  entity: E,
  columns: Readonly<Record<string, SQLiteColumn>>,
  options?: EntityCheckOptions<E>,
): Array<SQLiteCheckBuilder>
// The Postgres overload is first: its columns are SQLite's too, structurally, and not the
// other way round.
export function entityChecks(
  entity: Domain.AnyEntity,
  columns: Readonly<Record<string, AnyColumn>>,
  options: EntityCheckOptions<Domain.AnyEntity> = {},
): Array<SQLiteCheckBuilder> | Array<PgCheckBuilder> {
  const stored = fieldsOf(entity, columns, options.fields ?? {})
  const id = stored.columns.id ?? fail(`entity "${entity.name}" has no id field`)
  const table = getColumnTable(id)
  const { checks } = derive(entity.name, stored.fields, Domain.Entity.invariants(entity), {
    table,
    columns: stored.columns,
    operators: operatorsFrom(options.operators),
  })
  return is(table, PgTable)
    ? checks.map(({ name, condition }) => pgCheck(name, sql.raw(condition)))
    : checks.map(({ name, condition }) => sqliteCheck(name, sql.raw(condition)))
}

/**
 * The CHECKs a binding's Entity implies, as clauses for a migration written in
 * SQL, and the rules no CHECK holds, which only the server's writes do:
 *
 * ```ts
 * const { constraints, serverOnly } = checkConstraints(Db.Post)
 * sqlite.exec(`create table posts (…, ${constraints.map(c => c.constraint).join(', ')})`)
 * // Postgres adds them to a table: alter table posts add <constraint>
 * ```
 *
 * Each clause is `constraint "<name>" check (…)`. Refuses, by name, an invariant
 * the dialect cannot compile.
 */
export const checkConstraints = (
  binding: AnyEntityBinding,
): {
  readonly constraints: ReadonlyArray<{ readonly name: string; readonly constraint: string }>
  readonly serverOnly: ReadonlyArray<string>
} => {
  const fields: Readonly<Record<string, Schema.Top>> = binding.fields
  const { checks, serverOnly } = derive(
    binding.name,
    Object.keys(binding.columns).flatMap(field =>
      Object.hasOwn(fields, field) ? [[field, fields[field]!.ast] as const] : [],
    ),
    binding.invariants,
    { table: binding.table, columns: binding.columns, operators: binding.operators },
  )
  return {
    constraints: checks.map(({ name, condition }) => ({
      name,
      constraint: `constraint ${quoted(name)} check (${condition})`,
    })),
    serverOnly,
  }
}

/**
 * Refuses a table whose own Drizzle CHECKs say something other than the
 * Entity's rules: a derived check that differs, a column's check whose rules are
 * gone, or a derived check missing beside the others. A table holding none of
 * them is not checked: its database holds the rules some other way, or not at
 * all. Not exported from the package.
 */
export const holdsChecks = (
  entity: Domain.AnyEntity,
  table: Table,
  columns: Readonly<Record<string, AnyColumn>>,
  operators: BindingOperators,
): void => {
  const tableName = getTableName(table)
  const config = is(table, PgTable)
    ? pgTableConfig(table)
    : is(table, SQLiteTable)
      ? sqliteTableConfig(table)
      : fail(`table "${tableName}" is neither SQLite's nor Postgres'`)
  const declared = config.checks.map(({ name, value }) => ({
    name,
    condition: render(table, value, `table "${tableName}"'s check "${name}"`),
  }))
  if (!declared.some(({ name }) => name.startsWith(`${tableName}_`))) return
  const stored = fieldsOf(entity, columns, {})
  const { checks } = derive(entity.name, stored.fields, Domain.Entity.invariants(entity), {
    table,
    columns,
    operators,
  })
  const derived = new Map(checks.map(({ name, condition }) => [name, condition]))
  const columnChecks = new Set(
    Object.values(columns).map(column => `${tableName}_${column.name}_check`),
  )
  const held = declared.filter(({ name }) => derived.has(name) || columnChecks.has(name))
  for (const { name, condition } of held) {
    const wanted = derived.get(name)
    if (wanted === undefined)
      fail(
        `table "${tableName}" holds the CHECK "${name}", but ${entity.name} declares no rule a CHECK holds there; drop it, or write the table's checks with entityChecks(${entity.name}, t)`,
      )
    else if (wanted !== condition)
      fail(
        `table "${tableName}"'s CHECK "${name}" says ${condition}, but ${entity.name}'s rules say ${wanted}; write the table's checks with entityChecks(${entity.name}, t)`,
      )
  }
  if (held.length === 0) return
  for (const name of derived.keys())
    if (!held.some(check => check.name === name))
      fail(
        `table "${tableName}" lacks the CHECK "${name}" that ${entity.name}'s rules imply; write the table's checks with entityChecks(${entity.name}, t)`,
      )
}
