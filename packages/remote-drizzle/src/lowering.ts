/**
 * Expressions as SQL, through metakit's one lowering. Entity translates an
 * expression to metakit nodes (`foldkit-entity/lowering`); this binds the
 * request's input, viewer and time into the translation, lets metakit decide
 * what reads no column, and renders what is left: columns, the hops of a
 * path (subqueries under each table's visibility), the rows pointing at a
 * row, and the SQL a binding's operators write.
 */
import { sql, type AnyColumn, type SQL } from 'drizzle-orm'
import { Option, Result, Schema, SchemaAST } from 'effect'
import {
  Collation,
  SchemaShape,
  type AnyEntity,
  type OneRelation,
  type Operandish,
  type OperatorDescriptor,
} from 'foldkit-entity'
import { ASKER, foreignOf, lower, type Lowered, type RelatedSlot } from 'foldkit-entity/lowering'
import { Node, Ord } from 'metakit'
import { residualizeNode } from 'metakit/build'
import {
  lowerNode,
  relatedSubquery,
  SqlPiece,
  type Sql,
  type SqlUnsupportedError,
} from 'metakit/sql'
import { collatedColumn } from './cursor.js'
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

/** The translation of `node`, once: an expression is translated for every request that compiles it. */
const translations = new WeakMap<object, Lowered>()

export const translated = (node: Operandish): Lowered => {
  const known = translations.get(node)
  if (known !== undefined) return known
  const made = lower([node])
  translations.set(node, made)
  return made
}

const unwrap = <A>(result: Result.Result<A, SqlUnsupportedError>, subject: string): A => {
  if (Result.isFailure(result)) {
    throw new QueryCompileError(`${subject}: ${result.failure.reason}`)
  }
  return result.success
}

// --- binding the request into the translation ---

/** The value of `segments` in `env`; a null on the way reads null, a missing key is not known. */
const readEnv = (env: unknown, segments: ReadonlyArray<string>): Option.Option<unknown> => {
  let at = env
  for (const segment of segments) {
    if (at === null) return Option.some(null)
    if (typeof at !== 'object' || at === undefined || !Object.hasOwn(at, segment)) {
      return Option.none()
    }
    at = (at as Record<string, unknown>)[segment]
  }
  return at === undefined ? Option.none() : Option.some(at)
}

/**
 * What the request knows of what `node` reads: each input it reads (null where
 * none was given, as SQL binds it), the time, and who asks. Their fields, and
 * what a column holds, stay unknown: they are read from the database.
 */
export const envFor = (
  node: Node.Node,
  lowered: Pick<Lowered, 'viewers'>,
  target: CompileTarget,
  input: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> => {
  const given: Record<string, unknown> = {}
  for (const each of walk(node)) {
    if (Node.$is('Path')(each) && each.segments[0] === 'input' && each.segments.length === 2) {
      const key = each.segments[1]!
      given[key] = Object.hasOwn(input, key) ? input[key] : null
    }
  }
  const env: Record<string, unknown> = { input: given }
  const { context } = target
  if (context === undefined) return env
  if (Option.isSome(context.now)) env.now = context.now.value
  const viewers: Record<string, unknown> = {}
  for (const name of lowered.viewers.keys()) {
    viewers[name] = Option.match(
      Option.filter(context.viewer, ref => ref.entity === name),
      // A visitor, or a viewer of another Entity, reads null.
      { onNone: () => null, onSome: ({ id }) => ({ [ASKER]: id }) },
    )
  }
  env.viewer = viewers
  return env
}

/** `node` with the paths `env` holds as constants, and nothing else simplified. */
export const bindNode = (node: Node.Node, env: unknown): Node.Node =>
  Node.substitutePaths(node, segments =>
    Option.map(readEnv(env, segments), value => Node.Lit({ value })),
  )

const refusalIn = (node: Node.Node): Node.Refusal | undefined => {
  for (const each of walk(node)) {
    if (Node.$is('Lit')(each) && Node.isRefusal(each.value)) return each.value
  }
  return undefined
}

/** A strict call with a null argument is null, as SQL gives it: what `eq.among` of a null list needs to lower. */
const nullIn = (node: Node.Node): Node.Node => {
  if (!Node.$is('Call')(node)) return node
  const isNull = (arg: Node.Node | undefined): boolean =>
    arg !== undefined && Node.$is('Lit')(arg) && arg.value === null
  // `eq.among` answers its own nulls, but a list the request left out is null.
  return (node.op.nulls === 'strict' && node.args.some(isNull)) ||
    (node.op.id === 'eq.among' && isNull(node.args[1]))
    ? Node.Lit({ value: null })
    : node
}

// --- what only the SQL compiler knows: where a path is read, and text under a collation ---

/** The segment under `row` a path not of the judged row is read at, so it lowers as a column of its own. */
const PAST = { next: '#next', viewer: '#viewer', now: '#now', input: '#input' } as const

const pastSlice = (head: string | undefined): string | undefined =>
  head !== undefined && Object.hasOwn(PAST, head) ? PAST[head as keyof typeof PAST] : undefined

const TEXT_ORDERS = {
  'str.lt': { symbol: '<', across: 'str.gt' },
  'str.lte': { symbol: '<=', across: 'str.gte' },
  'str.gt': { symbol: '>', across: 'str.lt' },
  'str.gte': { symbol: '>=', across: 'str.lte' },
} as const

type TextOrder = keyof typeof TEXT_ORDERS

const isTextOrder = (id: string): id is TextOrder => Object.hasOwn(TEXT_ORDERS, id)

type Fold = 'binary' | 'asciiFold'

/** A comparison of a column under a collation, which the database may index: `name collate nocase < ?`. */
const collatedOps = new Map<string, Node.ForeignOp>()
const collatedInfo = new WeakMap<
  Node.ForeignOp,
  { readonly symbol: string; readonly collation: Collation }
>()

const collatedOp = (id: TextOrder, fold: Fold): Node.ForeignOp => {
  const name = `foldkit-remote-drizzle.${id}.${fold}`
  const known = collatedOps.get(name)
  if (known !== undefined) return known
  const made = Node.foreign({ id: name, version: 1, returns: 'boolean', nulls: 'strict' })
  collatedOps.set(name, made)
  collatedInfo.set(made, {
    symbol: TEXT_ORDERS[id].symbol,
    collation: fold === 'binary' ? Collation.binary : Collation.asciiFold,
  })
  return made
}

const isRowColumn = (node: Node.Node): node is Node.PathNode =>
  Node.$is('Path')(node) && node.segments.length === 2 && node.segments[0] === 'row'

/** A node that is a column, or a column with its ASCII letters lowered, and which. */
const columnOf = (
  node: Node.Node,
): { readonly path: Node.PathNode; readonly fold: Fold } | undefined => {
  if (isRowColumn(node)) return { path: node, fold: 'binary' }
  if (Node.$is('Call')(node) && node.op.id === 'str.lowerAscii' && isRowColumn(node.args[0]!)) {
    return { path: node.args[0]! as Node.PathNode, fold: 'asciiFold' }
  }
  return undefined
}

/**
 * A text comparison of a column and a value (or another column) written for
 * the database to use the column's collation, so an index on it serves: the
 * metakit lowering would lower both sides instead, which no index serves.
 */
const collated = (node: Node.Node): Node.Node => {
  if (!Node.$is('Call')(node) || Node.isForeign(node.op) || !isTextOrder(node.op.id)) return node
  const [left, right] = node.args as readonly [Node.Node, Node.Node]
  const first = columnOf(left)
  const column = first ?? columnOf(right)
  if (column === undefined) return node
  const other = first === undefined ? left : right
  const against = Node.$is('Lit')(other)
    ? other
    : (() => {
        const side = columnOf(other)
        return side?.fold === column.fold ? side.path : undefined
      })()
  if (against === undefined) return node
  const id = first === undefined ? TEXT_ORDERS[node.op.id].across : node.op.id
  return Node.Call({ op: collatedOp(id, column.fold), args: [column.path, against] })
}

/** The arithmetic whose operands a Postgres parameter must be typed in: it reads an untyped one as the column beside it. */
const ARITHMETIC: ReadonlySet<string> = new Set(['num.add', 'num.sub', 'num.mul', 'num.neg'])

/**
 * A fraction, or a null, given to arithmetic: Postgres types a parameter by
 * the column it meets, so `rank + $1` with 0.5 is refused where `rank` is an
 * `integer` column of a number field, and `$1 + $2` of two nulls resolves no
 * operator. Both are cast to `double precision`, as the operator's own number
 * input always cast them.
 */
const typedNumber = Node.foreign({
  id: 'foldkit-remote-drizzle.number',
  version: 1,
  returns: 'number',
  nulls: 'own',
})

const needsType = (arg: Node.Node): boolean =>
  Node.$is('Lit')(arg) &&
  (arg.value === null || (typeof arg.value === 'number' && !Number.isInteger(arg.value)))

const typed = (node: Node.Node): Node.Node =>
  Node.$is('Call')(node) &&
  !Node.isForeign(node.op) &&
  ARITHMETIC.has(node.op.id) &&
  node.args.some(needsType)
    ? Node.Call({
        op: node.op,
        args: node.args.map(arg =>
          needsType(arg) ? Node.Call({ op: typedNumber, args: [arg] }) : arg,
        ),
      })
    : node

const comparisons: ReadonlyMap<string, Node.Op> = new Map<string, Node.Op>([
  ['ord.lt', Ord.ltOp],
  ['ord.lte', Ord.lteOp],
  ['ord.gt', Ord.gtOp],
  ['ord.gte', Ord.gteOp],
])

const ACROSS: Readonly<Record<string, string>> = {
  'ord.lt': 'ord.gt',
  'ord.lte': 'ord.gte',
  'ord.gt': 'ord.lt',
  'ord.gte': 'ord.lte',
}

/** A comparison with its value on the left, written column first as a binding writes one: `3 > rank` is `rank < 3`. */
const columnFirst = (node: Node.Node): Node.Node => {
  if (!Node.$is('Call')(node) || Node.isForeign(node.op) || node.args.length !== 2) return node
  const [left, right] = node.args as readonly [Node.Node, Node.Node]
  if (!Node.$is('Lit')(left) || Node.$is('Lit')(right)) return node
  if (node.op.id === 'eq.equals') return Node.Call({ op: node.op, args: [right, left] })
  const across = Object.hasOwn(ACROSS, node.op.id) ? ACROSS[node.op.id] : undefined
  const flipped = across === undefined ? undefined : comparisons.get(across)
  return flipped === undefined ? node : Node.Call({ op: flipped, args: [right, left] })
}

/** The paths a request reads past the judged row, as the renderer reads them. */
const pastRow = (node: Node.Node): Node.Node =>
  Node.mapPaths(node, path => {
    const slice = pastSlice(path.segments[0])
    return slice === undefined
      ? path
      : Node.Path({ segments: ['row', slice, ...path.segments.slice(1)], ast: path.ast })
  })

/**
 * Whether `node` reads a stored value: a column, a field of the row a write
 * leaves, a field of the viewer's row. What it reads of the request alone (an
 * input, the time, who asks) is known before the database is asked.
 */
const readsStored = (node: Node.Node): boolean =>
  walk(node).some(
    each =>
      Node.$is('Path')(each) &&
      each.segments[0] !== 'input' &&
      each.segments[0] !== 'now' &&
      each.segments[0] !== 'each' &&
      !(each.segments[0] === 'viewer' && each.segments[2] === ASKER),
  )

/**
 * `node` over this request as SQL's own reader sees it: what reads no column
 * decided, a refusal reported where the evaluator would refuse. A primitive
 * operator is run in memory only where the whole of `node` reads no column,
 * so one that reads a column is left to the SQL its table writes.
 */
export const decided = (
  node: Node.Node,
  lowered: Lowered,
  target: CompileTarget,
  input: Readonly<Record<string, unknown>>,
  query: string,
): Node.Node => {
  const residual = residualizeNode(
    node,
    envFor(node, lowered, target, input),
    readsStored(node) ? {} : foreignOf(lowered, operatorsOf(target).memory),
  )
  const refused = refusalIn(residual)
  if (refused !== undefined) throw new QueryCompileError(`query "${query}": ${refused.message}`)
  return rewrite(residual, nullIn)
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
