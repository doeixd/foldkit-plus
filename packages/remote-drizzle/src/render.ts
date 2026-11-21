/**
 * A bound translation as Drizzle SQL: metakit's lowering, with what only a
 * binding knows rendered here. A column is the binding's, a hop of a path is a
 * subquery under each table's visibility, the rows pointing at a row are a
 * correlated subquery, a text comparison of a column names its collation for
 * the database to index, and a foreign operation is the SQL its binding's table
 * writes.
 */
import { sql, type AnyColumn, type SQL } from 'drizzle-orm'
import { Option, Result, Schema, SchemaAST } from 'effect'
import {
  SchemaShape,
  type Collation,
  type AnyEntity,
  type OneRelation,
  type OperatorDescriptor,
} from 'foldkit-entity'
import { type Lowered, type RelatedSlot } from 'foldkit-entity/lowering'
import { Node } from 'metakit'
import {
  lowerNode,
  relatedSubquery,
  SqlPiece,
  type Sql,
  type SqlUnsupportedError,
} from 'metakit/sql'
import { collatedColumn } from './cursor.js'
import { collated, collatedInfo, columnFirst, pastRow, typed, typedNumber } from './rewrites.js'
import { walk, rewrite } from './nodes.js'
import {
  QueryCompileError,
  atRow,
  bindable,
  columnFor,
  dialectOf,
  linkOf,
  onward,
  operatorsOf,
  reachedTable,
  viewerAt,
  visibleIn,
  type CompileTarget,
} from './target.js'

/** What a node read past its own columns, and where it is rendered. */
export interface Frame {
  readonly target: CompileTarget
  /** The Entity the row is: where a hop's relations are found. None where a node reads no hop. */
  readonly entity: AnyEntity | undefined
  readonly viewers: ReadonlyMap<string, AnyEntity>
  readonly related: ReadonlyMap<string, RelatedSlot>
  readonly foreign: ReadonlyMap<string, OperatorDescriptor>
  readonly query: string
  /** What messages say was refused: `query "Name"`, or the assignment it is. */
  readonly subject: string
  /** A computation has no column to type its parameters: a number is cast by its own value. */
  readonly castNumbers: boolean
}

const unwrap = <A>(result: Result.Result<A, SqlUnsupportedError>, subject: string): A => {
  if (Result.isFailure(result)) {
    throw new QueryCompileError(`${subject}: ${result.failure.reason}`)
  }
  return result.success
}

// --- rendering ---

const numberType = (value: number): string =>
  !Number.isInteger(value) ? 'double precision' : Math.abs(value) < 2 ** 31 ? 'integer' : 'bigint'

const valueSql = (value: unknown, frame: Frame): SQL => {
  const bound = bindable(value, frame.target)
  return frame.castNumbers && typeof value === 'number' && dialectOf(frame.target) === 'postgres'
    ? sql`cast(${bound} as ${sql.raw(numberType(value))})`
    : sql`${bound}`
}

/**
 * The SQL type a parameter is cast to on Postgres, which reads an untyped
 * parameter as text: `$1 + $2` is refused as "operator is not unique". An
 * integer is an `integer` while the value fits one, which every function
 * taking an integer resolves for (`left(text, int)` resolves no `bigint`), and
 * a `bigint` past 32 bits, which `Schema.Int` admits. Text needs none.
 */
const castFor = (schema: Schema.Top, value: unknown): Option.Option<SQL> => {
  const present = SchemaShape.present(Schema.toEncoded(schema).ast)
  if (present.length > 0 && present.every(isNumeric)) {
    if (!present.every(holdsIntegers)) return Option.some(sql.raw('double precision'))
    const fits = typeof value !== 'number' || (value >= -(2 ** 31) && value < 2 ** 31)
    return Option.some(fits ? sql.raw('integer') : sql.raw('bigint'))
  }
  if (present.length > 0 && present.every(SchemaAST.isBoolean))
    return Option.some(sql.raw('boolean'))
  return Option.none()
}

/** A number, or a literal naming one (`Schema.Literal(1)`): typed alike on Postgres. */
const isNumeric = (ast: SchemaAST.AST): boolean =>
  SchemaAST.isNumber(ast) || (SchemaAST.isLiteral(ast) && typeof ast.literal === 'number')

/** Whether every value `ast` admits is an integer: checked to be one, or a literal that is. */
const holdsIntegers = (ast: SchemaAST.AST): boolean =>
  SchemaAST.isLiteral(ast) ? Number.isInteger(ast.literal) : SchemaShape.holdsIntegers(ast)

/** A value an operator takes, as a parameter: cast by the input it fills on Postgres, as it binds on SQLite. */
const parameterSql = (value: unknown, schema: Schema.Top | undefined, frame: Frame): SQL => {
  if (dialectOf(frame.target) === 'sqlite' || schema === undefined) return valueSql(value, frame)
  return Option.match(castFor(schema, value), {
    onNone: () => sql`${value}`,
    onSome: type => sql`cast(${value} as ${type})`,
  })
}

const oneRelation = (entity: AnyEntity | undefined, key: string, query: string): OneRelation => {
  const member =
    entity !== undefined && Object.hasOwn(entity.relations, key) ? entity.relations[key] : undefined
  if (member?._tag !== 'Relation' || member.cardinality !== 'one') {
    throw new QueryCompileError(
      `query "${query}" goes through "${key}", which is no \`one\` relation of ${entity?.name ?? 'the row'}`,
    )
  }
  return member as OneRelation
}

/** The relations a path's hops (`@author`) name, from `entity`. */
const hopsFrom = (
  entity: AnyEntity | undefined,
  hops: ReadonlyArray<string>,
  query: string,
): ReadonlyArray<OneRelation> => {
  const via: Array<OneRelation> = []
  let at = entity
  for (const hop of hops) {
    const relation = oneRelation(at, hop.slice(1), query)
    via.push(relation)
    at = relation.target()
  }
  return via
}

const columnSql = (segments: ReadonlyArray<string>, frame: Frame): SQL => {
  const { target, query } = frame
  const [head, ...rest] = segments
  switch (head) {
    case '#next': {
      const key = rest[0]!
      return Object.hasOwn(target.next ?? {}, key)
        ? sql`${target.next![key]!}`
        : sql`${columnFor(target, key, query)}`
    }
    case '#viewer': {
      const [name, ...path] = rest as [string, ...Array<string>]
      const context = target.context
      if (context === undefined) {
        throw new QueryCompileError(
          `query "${query}" reads the viewer, but was compiled with no context to read it from`,
        )
      }
      const entity = frame.viewers.get(name)!
      const id = Option.getOrNull(
        Option.map(
          Option.filter(context.viewer, ref => ref.entity === name),
          ref => ref.id,
        ),
      )
      const field = path[path.length - 1]!
      return viewerAt(
        target,
        entity.identity,
        id,
        hopsFrom(entity, path.slice(0, -1), query),
        at => sql`${columnFor(at, field, query)}`,
        query,
      )
    }
    case '#now':
      throw new QueryCompileError(
        `query "${query}" reads the time, but ${target.context === undefined ? 'was compiled with no context to read it from' : 'was given no time'}`,
      )
    case '#input':
      throw new QueryCompileError(`query "${query}" reads an input no request bound`)
    default: {
      const field = segments[segments.length - 1]!
      const hops = segments.slice(0, -1)
      return hops.length === 0
        ? sql`${columnFor(target, field, query)}`
        : atRow(
            target,
            hopsFrom(frame.entity, hops, query),
            at => sql`${columnFor(at, field, query)}`,
            query,
          )
    }
  }
}

/** A text comparison written for a column's collation (`collated`). */
const collatedSql = (
  info: { readonly symbol: string; readonly collation: Collation },
  args: ReadonlyArray<Sql>,
  frame: Frame,
): SQL => {
  const [first, second] = args as readonly [Sql, Sql]
  const columnOfPiece = (pieces: Sql): AnyColumn | undefined => {
    const [piece] = pieces
    return piece !== undefined && SqlPiece.$is('Column')(piece)
      ? columnFor(frame.target, piece.segments[0]!, frame.query)
      : undefined
  }
  const column = columnOfPiece(first)!
  const under = collatedColumn(column, info.collation)
  const key = Option.match(under, { onNone: () => sql`${column}`, onSome: ({ key }) => key })
  const other = columnOfPiece(second)
  const value =
    other !== undefined
      ? Option.match(collatedColumn(other, info.collation), {
          onNone: () => sql`${other}`,
          onSome: ({ key }) => key,
        })
      : (() => {
          const [piece] = second
          const bound = valueSql(
            piece !== undefined && SqlPiece.$is('Value')(piece) ? piece.value : null,
            frame,
          )
          return Option.match(under, {
            onNone: () => bound,
            onSome: ({ value }) => sql`${value(bound)}`,
          })
        })()
  return sql`${key} ${sql.raw(info.symbol)} ${value}`
}

const unrun = (name: string, query: string): QueryCompileError =>
  new QueryCompileError(
    `query "${query}" calls the operator "${name.replace(/@1$/, '')}", which this binding's SQL operators do not run`,
  )

const foreignSql = (
  op: Node.ForeignOp,
  args: ReadonlyArray<Sql>,
  frame: Frame,
  each: CompileTarget | undefined,
): SQL => {
  const info = collatedInfo.get(op)
  if (info !== undefined) return collatedSql(info, args, frame)
  if (op === typedNumber) {
    const [piece] = args[0]!
    const value =
      piece !== undefined && SqlPiece.$is('Value')(piece) ? sql`${piece.value}` : sql`null`
    return sql`cast(${value} as double precision)`
  }
  const name = Node.foreignName(op)
  const descriptor = frame.foreign.get(name)
  const build =
    descriptor === undefined
      ? undefined
      : Option.getOrUndefined(operatorsOf(frame.target).sql.get(descriptor))
  if (descriptor === undefined || build === undefined) throw unrun(name, frame.query)
  return build({
    args: args.map((pieces, position) => {
      const [piece] = pieces
      return piece !== undefined && pieces.length === 1 && SqlPiece.$is('Value')(piece)
        ? parameterSql(piece.value, descriptor.input[position], frame)
        : render(pieces, frame, each)
    }),
    dialect: dialectOf(frame.target),
  })
}

/** The rows pointing at a row, as a correlated subquery over the reader's visible rows of their table. */
const rowsSql = (piece: Extract<SqlPiece, { readonly _tag: 'Rows' }>, frame: Frame): SQL => {
  const { target, query } = frame
  const slot = frame.related.get(Node.relatedSegment(piece.relation))
  if (slot === undefined) {
    throw new QueryCompileError(`query "${query}" asks of rows related through ${piece.relation}`)
  }
  const { relation } = slot
  const from = hopsFrom(frame.entity, piece.of, query)
  return atRow(
    target,
    from,
    anchor => {
      const pointing = onward(anchor, reachedTable(anchor, relation.owner, query))
      const own = sql`${linkOf(pointing, relation, query)} = ${columnFor(anchor, 'id', query)}`
      const matches = Option.match(visibleIn(anchor, relation.owner, query), {
        onNone: () => own,
        onSome: rule => sql`${own} and (${rule})`,
      })
      const body = (part: Option.Option<Sql>) =>
        Option.map(part, each => render(each, frame, pointing))
      return unwrap(
        relatedSubquery<SQL>(
          piece.fold,
          {
            from: sql`${pointing.table}`,
            matches,
            where: body(piece.where),
            value: body(piece.value),
          },
          text => sql.raw(text),
          parts => sql.join([...parts]),
        ),
        frame.subject,
      )
    },
    query,
  )
}

/** Lowered pieces as Drizzle SQL; `each` is the table of the related row a `Rows` body reads. */
const render = (pieces: Sql, frame: Frame, each?: CompileTarget): SQL =>
  sql.join(
    pieces.map(piece =>
      SqlPiece.$match(piece, {
        Text: ({ text }) => sql.raw(text),
        Value: ({ value }) => valueSql(value, frame),
        Column: ({ segments }) => columnSql(segments, frame),
        Each: ({ segments }) => {
          if (each === undefined || segments.length !== 1) {
            throw new QueryCompileError(
              `query "${frame.query}" reads a related row outside the rows asked of it`,
            )
          }
          return sql`${columnFor(each, segments[0]!, frame.query)}`
        },
        Foreign: ({ op, args }) => foreignSql(op, args, frame, each),
        Rows: rows => rowsSql(rows, frame),
      }),
    ),
  )

/** An `and`, `or` or `not`: what is written beside another condition keeps its own parentheses. */
const isConnective = (node: Node.Node): boolean =>
  Node.$is('Call')(node) && !Node.isForeign(node.op) && /^bool\.(and|or|not)$/.test(node.op.id)

/** `pieces` without the parentheses that enclose all of them: `(a = $1)` is `a = $1` where it stands alone. */
const unparenthesized = (pieces: Sql): Sql => {
  const first = pieces[0]
  const last = pieces[pieces.length - 1]
  if (
    first === undefined ||
    last === undefined ||
    !SqlPiece.$is('Text')(first) ||
    !SqlPiece.$is('Text')(last) ||
    !first.text.startsWith('(') ||
    !last.text.endsWith(')')
  ) {
    return pieces
  }
  let depth = 0
  for (const [index, piece] of pieces.entries()) {
    if (!SqlPiece.$is('Text')(piece)) continue
    for (const [at, character] of [...piece.text].entries()) {
      depth += character === '(' ? 1 : character === ')' ? -1 : 0
      // The first parenthesis closes before the end: it encloses only part.
      const end = index === pieces.length - 1 && at === piece.text.length - 1
      if (depth === 0 && !end) return pieces
    }
  }
  const inner = [...pieces]
  inner[0] = SqlPiece.Text({ text: first.text.slice(1) })
  const tail = inner.length - 1
  const closing = SqlPiece.Text({ text: last.text.slice(0, -1) })
  if (tail === 0) inner[0] = SqlPiece.Text({ text: first.text.slice(1, -1) })
  else inner[tail] = closing
  return inner
}

/**
 * `node`, already bound to this request, as SQL. What metakit refuses it
 * refuses first, as the node reads; the rewrites that write SQL for the
 * database (a collated column, a typed parameter) come after.
 */
export const toSql = (node: Node.Node, frame: Frame): SQL => {
  const options = { dialect: dialectOf(frame.target), rowPrefix: ['row'] }
  const read = rewrite(rewrite(pastRow(node), columnFirst), collated)
  let wrote = read
  if (options.dialect === 'postgres') {
    wrote = rewrite(read, typed)
    // A fraction beside an integer column is metakit's refusal to make, before it is typed away.
    if (walk(wrote).some(each => Node.$is('Call')(each) && each.op === typedNumber)) {
      unwrap(lowerNode(read, options), frame.subject)
    }
  }
  const pieces = unwrap(lowerNode(wrote, options), frame.subject)
  return render(isConnective(wrote) ? pieces : unparenthesized(pieces), frame)
}

/** A frame for what `lowered` read. */
export const frameOf = (
  lowered: Pick<Lowered, 'viewers' | 'related' | 'foreign'>,
  target: CompileTarget,
  entity: AnyEntity | undefined,
  query: string,
  castNumbers = false,
  subject = `query "${query}"`,
): Frame => ({
  target,
  entity,
  viewers: lowered.viewers,
  related: lowered.related,
  foreign: lowered.foreign,
  query,
  subject,
  castNumbers,
})
