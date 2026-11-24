/**
 * What only the SQL compiler knows, written into a bound translation before
 * metakit lowers it: where a path past the judged row is read, a comparison
 * with its value first written column first, a text comparison of a column
 * named under its collation (which the database may index: metakit would
 * lower both sides, which no index serves), and the numbers Postgres cannot
 * type for itself.
 */
import { Schema } from 'effect'
import { Collation } from 'foldkit-entity'
import { Node, Ord } from 'metakit'
import { define } from 'metakit/operation'

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
export const collatedInfo = new WeakMap<
  Node.ForeignOp,
  { readonly symbol: string; readonly collation: Collation }
>()

const collatedOp = (id: TextOrder, fold: Fold): Node.ForeignOp => {
  const name = `foldkit-remote-drizzle.${id}.${fold}`
  const known = collatedOps.get(name)
  if (known !== undefined) return known
  const made = define({
    id: name,
    version: 1,
    args: [Schema.String, Schema.String],
    returns: Schema.Boolean,
    nulls: 'strict',
  }).descriptor
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
export const collated = (node: Node.Node): Node.Node => {
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
export const typedNumber = define({
  id: 'foldkit-remote-drizzle.number',
  version: 1,
  args: [Schema.NullOr(Schema.Finite)],
  returns: Schema.NullOr(Schema.Finite),
  nulls: 'own',
}).descriptor

const needsType = (arg: Node.Node): boolean =>
  Node.$is('Lit')(arg) &&
  (arg.value === null || (typeof arg.value === 'number' && !Number.isInteger(arg.value)))

export const typed = (node: Node.Node): Node.Node =>
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
export const columnFirst = (node: Node.Node): Node.Node => {
  if (!Node.$is('Call')(node) || Node.isForeign(node.op) || node.args.length !== 2) return node
  const [left, right] = node.args as readonly [Node.Node, Node.Node]
  if (!Node.$is('Lit')(left) || Node.$is('Lit')(right)) return node
  if (node.op.id === 'eq.equals') return Node.Call({ op: node.op, args: [right, left] })
  const across = Object.hasOwn(ACROSS, node.op.id) ? ACROSS[node.op.id] : undefined
  const flipped = across === undefined ? undefined : comparisons.get(across)
  return flipped === undefined ? node : Node.Call({ op: flipped, args: [right, left] })
}

/** The paths a request reads past the judged row, as the renderer reads them. */
export const pastRow = (node: Node.Node): Node.Node =>
  Node.mapPaths(node, path => {
    const slice = pastSlice(path.segments[0])
    return slice === undefined
      ? path
      : Node.Path({ segments: ['row', slice, ...path.segments.slice(1)], ast: path.ast })
  })
