/**
 * What an expression reads and uses, read off its metakit nodes and the
 * origin map: the fields of the judged row, the fields of the row a write
 * leaves, the inputs, the operations a reader must run, the operators it
 * calls, and each place it reaches another row.
 */
import { Match, Option } from 'effect'
import { Node } from 'metakit'
import { isExpr } from 'metakit/build'
import type { AnyEntity } from '../index.js'
import type { OperatorDescriptor } from './operator.js'
import type { OperatorTable } from './table.js'
import {
  exprOf,
  maxQueryNodes,
  originOf,
  type AnyExpr,
  type FieldOrigin,
  type OneRelation,
  type Origin,
  type Predicate,
} from './operand.js'
import type { Ordering } from './order.js'

/**
 * Every operation the kernel has. An interpreter declares which of them it
 * runs, and a body needing one it does not is refused rather than answered
 * wrongly — see `Query.unsupported`.
 */
export type Operation =
  | 'eq'
  | 'isNull'
  | 'isNotNull'
  | 'contains'
  | 'in'
  | 'and'
  | 'or'
  | 'not'
  | 'compare'
  | 'next'
  | 'viewer'
  | 'now'
  | 'path'
  | 'exists'

/** One field an expression reads: its Entity's name and key, and the identity that owns it. */
export interface FieldDependency {
  /** The owning Entity's name, for display; two Entities may share one. */
  readonly entity: string
  readonly key: string
  /** Which Entity it is. Two defined with the same name are two entries. */
  readonly owner: { readonly name: string; readonly token: symbol }
}

/** A field of the row reached from the judged one through `one` relations (`Expr.path`). */
export interface PathReach {
  readonly _tag: 'Path'
  /** The relations followed, in order, the first one the judged row's own. */
  readonly via: readonly [OneRelation, ...Array<OneRelation>]
  /** What is read on the row reached: a field of the last relation's target. */
  readonly field: FieldOrigin
  readonly expr: AnyExpr
}

/** A field of the viewer's row, or of a row reached from it (`Expr.path(Expr.viewer(User), …)`). */
export interface ViewerPathReach {
  readonly _tag: 'ViewerPath'
  /** The Entity whose row the viewer is. */
  readonly viewer: AnyEntity
  /** The relations followed from the viewer's row, in order; empty for a field of it. */
  readonly via: ReadonlyArray<OneRelation>
  readonly field: FieldOrigin
  readonly expr: AnyExpr
}

/**
 * Some row points at the row asked about through `relation` and holds
 * `where` (`Expr.exists`). The row asked about is the one judged, or the one
 * `via` reaches from it.
 */
export interface ExistsReach {
  readonly _tag: 'Exists'
  /** The relations followed to the row asked about; empty for the row judged itself. */
  readonly via: ReadonlyArray<OneRelation>
  readonly relation: OneRelation
  /** What the pointing row must hold, over its own fields (as `row`) and the input. */
  readonly where: Option.Option<Predicate>
  readonly expr: AnyExpr
}

/** A place an expression reads another row: a path, a path from the viewer, an exists. */
export type Reach = PathReach | ViewerPathReach | ExistsReach

/** Which fields and inputs an expression reads, and which operations it uses. */
export interface Dependencies {
  /** One entry per distinct field of each Entity identity. */
  readonly fields: ReadonlyArray<FieldDependency>
  /** Each field read as the row a write would leave holds it (`Expr.next`), one entry each. */
  readonly next: ReadonlyArray<FieldDependency>
  /** One entry per distinct input key. */
  readonly inputs: ReadonlyArray<string>
  /** One entry per distinct operation, so an interpreter can refuse what it cannot run. */
  readonly operations: ReadonlyArray<Operation>
  /** Each operator it calls, once per descriptor, defined or not. */
  readonly operators: ReadonlyArray<OperatorDescriptor>
  /**
   * Each path, exists and path from the viewer, once each: what it reads lies
   * in other rows, so none of it is in `fields`. An exists' filter's inputs,
   * operations and operators are in the lists above.
   */
  readonly reaches: ReadonlyArray<Reach>
}

/**
 * What a query reads, with each field's role. A change to a `predicate` field
 * can move a row into or out of the result; a change to an `order` field can
 * move it within. A field in both is in both; `fields` is their union.
 */
export interface QueryDependencies extends Dependencies {
  readonly predicate: ReadonlyArray<FieldDependency>
  readonly order: ReadonlyArray<FieldDependency>
}

/** What a reader walks: an expression, or an entry of an ordering. */
export type Walked = AnyExpr | Ordering

/** The operations metakit's own calls stand for, where no origin says more. */
const operationOf: { readonly [id: string]: Operation } = {
  'eq.equals': 'eq',
  'eq.among': 'in',
  'null.isNull': 'isNull',
  'bool.and': 'and',
  'bool.or': 'or',
  'bool.not': 'not',
  'str.contains': 'contains',
  'ord.lt': 'compare',
  'ord.lte': 'compare',
  'ord.gt': 'compare',
  'ord.gte': 'compare',
  'str.lt': 'compare',
  'str.lte': 'compare',
  'str.gt': 'compare',
  'str.gte': 'compare',
}

/** Each node a node is made of, by its structure. */
export const childrenOf = (node: Node.Node): ReadonlyArray<Node.Node> =>
  Node.$match(node, {
    Lit: () => [],
    Path: () => [],
    Call: ({ args }) => args,
    If: ({ cond, then, otherwise }) => [cond, then, otherwise],
    Match: ({ on, cases, otherwise }) => [
      on,
      ...cases.map(([, then]) => then),
      ...Option.toArray(otherwise),
    ],
    Opaque: () => [],
    Rows: rows => [Node.rowsSource(rows.over), ...Node.rowsBody(rows)],
  })

/** The nodes an entry of an ordering, or an expression, is read through. */
export const nodesOf = (walked: Walked): ReadonlyArray<Node.Node> =>
  isExpr(walked)
    ? [walked.node]
    : Match.valueTags(walked as Ordering, {
        Term: ({ expr }) => [expr.node],
        Chosen: ({ sort, choices }) => [
          sort.node,
          ...Object.values(choices).map(choice => choice.node),
        ],
      })

/** A reach as `dependenciesOf` reports it, from its node's origin. */
const reachOf = (node: Node.Node, origin: Origin): Option.Option<Reach> =>
  Match.value(origin).pipe(
    Match.tags({
      Hop: ({ via, field }) => Option.some<Reach>({ _tag: 'Path', via, field, expr: exprOf(node) }),
      ViewerHop: ({ viewer, via, field }) =>
        Option.some<Reach>({ _tag: 'ViewerPath', viewer, via, field, expr: exprOf(node) }),
      Exists: ({ via, relation, where }) =>
        Option.some<Reach>({
          _tag: 'Exists',
          via,
          relation,
          where: Option.map(where, each => exprOf<boolean | null>(each)),
          expr: exprOf(node),
        }),
    }),
    Match.orElse(() => Option.none<Reach>()),
  )

/** What a walk has found, and the nodes it has already been through. */
interface Found {
  readonly seen: Set<Node.Node>
  /** By owner identity, then key: two Entities sharing a name are two entries. */
  readonly fields: Map<symbol, Map<string, FieldDependency>>
  readonly order: Array<FieldDependency>
  readonly inputs: Set<string>
  readonly next: Map<symbol, Map<string, FieldDependency>>
  readonly nextOrder: Array<FieldDependency>
  readonly operations: Set<Operation>
  readonly operators: Set<OperatorDescriptor>
  readonly reaches: Array<Reach>
}

const addField = (
  byOwner: Map<symbol, Map<string, FieldDependency>>,
  order: Array<FieldDependency>,
  field: FieldOrigin,
) => {
  const byKey = byOwner.get(field.owner.token) ?? new Map<string, FieldDependency>()
  byOwner.set(field.owner.token, byKey)
  if (!byKey.has(field.key)) {
    const read = { entity: field.owner.name, key: field.key, owner: field.owner }
    byKey.set(field.key, read)
    order.push(read)
  }
}

/**
 * Visits each node once. A node can be shared by several paths (`eq(n, n)`),
 * and a walk that followed every path would take time exponential in the depth.
 */
const walk = (node: Node.Node, found: Found): void => {
  if (found.seen.has(node)) return
  found.seen.add(node)
  const origin = Option.getOrUndefined(originOf(node))
  if (origin !== undefined) {
    Option.map(reachOf(node, origin), reach => found.reaches.push(reach))
    switch (origin._tag) {
      case 'Field':
        if (origin.slice === 'row') addField(found.fields, found.order, origin.field)
        if (origin.slice === 'next') {
          found.operations.add('next')
          addField(found.next, found.nextOrder, origin.field)
        }
        return
      case 'Viewer':
        found.operations.add('viewer')
        return
      case 'Hop':
        found.operations.add('path')
        return
      // It needs whoever asks, and the subqueries a path is compiled to.
      case 'ViewerHop':
        found.operations.add('viewer')
        found.operations.add('path')
        return
      case 'Exists':
        found.operations.add('exists')
        // The filter's fields are the pointing row's, so they stay out of `fields`;
        // what else it needs is this expression's need too.
        Option.map(origin.where, where => {
          const inner = dependenciesOf(exprOf(where))
          inner.inputs.forEach(key => found.inputs.add(key))
          inner.operations.forEach(operation => found.operations.add(operation))
          inner.operators.forEach(operator => found.operators.add(operator))
        })
        return
      case 'Call':
        found.operators.add(origin.operator)
        // What a reader runs is the expansion: its operations, and the reads its
        // arguments hold. With none, the arguments are all there is to read.
        Option.match(origin.expansion, {
          onSome: expansion => walk(expansion, found),
          onNone: () => origin.args.forEach(arg => walk(arg, found)),
        })
        return
      case 'Compare':
        found.operations.add('compare')
        walk(origin.left, found)
        walk(origin.right, found)
        return
      case 'Contains':
        found.operations.add('contains')
        walk(origin.value, found)
        walk(origin.search, found)
        return
      case 'NotNull':
        found.operations.add('isNotNull')
        walk(origin.operand, found)
        return
    }
  }
  if (Node.$is('Path')(node)) {
    const [slice, key] = node.segments
    if (slice === 'input' && key !== undefined) found.inputs.add(key)
    if (slice === 'now') found.operations.add('now')
    return
  }
  if (Node.$is('Call')(node)) {
    const operation = operationOf[node.op.id]
    if (operation !== undefined) found.operations.add(operation)
  }
  for (const child of childrenOf(node)) walk(child, found)
}

/**
 * What expressions (and ordering entries) read and use, for the planner and
 * for a reader deciding whether it can run them at all. Distinct entries only,
 * in the order first seen, so the answer is stable enough to assert on.
 */
export const dependenciesOf = (...walked: ReadonlyArray<Walked>): Dependencies => {
  const found: Found = {
    seen: new Set(),
    fields: new Map(),
    order: [],
    inputs: new Set(),
    next: new Map(),
    nextOrder: [],
    operations: new Set(),
    operators: new Set(),
    reaches: [],
  }
  for (const each of walked) for (const node of nodesOf(each)) walk(node, found)
  return {
    fields: found.order,
    next: found.nextOrder,
    inputs: [...found.inputs],
    operations: [...found.operations],
    operators: [...found.operators],
    reaches: found.reaches,
  }
}

/** Every field, field after a write, and input these nodes read, as keys to compare. */
export const readKeys = (nodes: ReadonlyArray<Node.Node>): ReadonlySet<string> => {
  const read = dependenciesOf(...nodes.map(node => exprOf(node)))
  const named = (prefix: string, fields: ReadonlyArray<FieldDependency>) =>
    fields.map(field => `${prefix}${field.entity}.${field.key}`)
  return new Set([
    ...named('', read.fields),
    ...named('next ', read.next),
    ...read.inputs.map(key => `$${key}`),
  ])
}

/** A member of the judged row an expression reads: a field, or what a path or an exists starts from. */
interface RowMember {
  readonly owner: { readonly name: string; readonly token: symbol }
  readonly key: string
}

/**
 * Every member of the judged row these read, each node visited once: a field,
 * or the relation a path or an exists starts from.
 */
export const membersRead = function* (walked: ReadonlyArray<Walked>): Generator<RowMember> {
  const seen = new Set<Node.Node>()
  const visit = function* (node: Node.Node): Generator<RowMember> {
    if (seen.has(node)) return
    seen.add(node)
    const origin = Option.getOrUndefined(originOf(node))
    if (origin !== undefined) {
      switch (origin._tag) {
        case 'Field':
          if (origin.slice !== 'each') yield origin.field
          return
        case 'Hop':
          yield origin.via[0]
          return
        // It starts at the viewer's row, not the judged one, so any query may read it.
        case 'Viewer':
        case 'ViewerHop':
          return
        case 'Exists':
          yield origin.via[0] ?? { owner: origin.relation.target().identity, key: 'id' }
          return
        // An expansion reads only what its arguments do, which the call checked.
        case 'Call':
          for (const arg of origin.args) yield* visit(arg)
          return
        case 'Compare':
          yield* visit(origin.left)
          yield* visit(origin.right)
          return
        case 'Contains':
          yield* visit(origin.value)
          yield* visit(origin.search)
          return
        case 'NotNull':
          yield* visit(origin.operand)
          return
      }
    }
    for (const child of childrenOf(node)) yield* visit(child)
  }
  for (const each of walked) for (const node of nodesOf(each)) yield* visit(node)
}

/** The nodes a node counts as, as written: a chain of one connective is one node of many operands. */
const writtenChildren = (node: Node.Node): ReadonlyArray<Node.Node> => {
  const origin = Option.getOrUndefined(originOf(node))
  if (origin !== undefined) {
    return Match.value(origin).pipe(
      Match.tags({
        Exists: ({ where }) => Option.toArray(where),
        Call: ({ expansion, args }) =>
          Option.match(expansion, { onSome: body => [body], onNone: () => args }),
        Compare: ({ left, right }) => [left, right],
        Contains: ({ value, search }) => [value, search],
        NotNull: ({ operand }) => [operand],
      }),
      Match.orElse((): ReadonlyArray<Node.Node> => []),
    )
  }
  if (Node.$is('Call')(node) && (node.op.id === 'bool.and' || node.op.id === 'bool.or')) {
    const chain = (each: Node.Node): ReadonlyArray<Node.Node> =>
      Node.$is('Call')(each) && each.op === node.op && Option.isNone(originOf(each))
        ? each.args.flatMap(chain)
        : [each]
    return node.args.flatMap(chain)
  }
  if (Node.$is('Rows')(node)) return []
  return childrenOf(node)
}

/** A node's size as a tree, as written, each distinct node sized once and capped past the most. */
export const writtenSize = (node: Node.Node, sizes: Map<Node.Node, number>): number => {
  const known = sizes.get(node)
  if (known !== undefined) return known
  // Capped, so a graph deep enough to overflow a number still compares as too big.
  const size = Math.min(
    maxQueryNodes + 1,
    writtenChildren(node).reduce((sum, child) => sum + writtenSize(child, sizes), 1),
  )
  sizes.set(node, size)
  return size
}

/**
 * The primitive operators among `read` that `operators` does not implement, by
 * name. A defined one needs nothing: what it means was walked into `read`.
 */
export const missingFrom = (
  read: ReadonlyArray<OperatorDescriptor>,
  operators: OperatorTable,
  name: (operator: OperatorDescriptor) => string,
): ReadonlyArray<string> =>
  read.filter(operator => Option.isNone(operator.definedAs) && !operators.has(operator)).map(name)

/**
 * Whether a constant written in these expressions is one no two backends
 * agree on, text holding a NUL or NaN, or a list holding one: SQL refuses
 * such a parameter wherever it compiles, so a reader refuses the run, not one
 * row.
 */
export const givesUnportable = (...walked: ReadonlyArray<Walked>): boolean => {
  const seen = new Set<Node.Node>()
  const nul = (value: unknown) =>
    (typeof value === 'string' && value.includes(String.fromCharCode(0))) ||
    (typeof value === 'number' && Number.isNaN(value))
  const visit = (node: Node.Node): boolean => {
    if (seen.has(node)) return false
    seen.add(node)
    if (Node.$is('Lit')(node)) {
      return Array.isArray(node.value) ? node.value.some(nul) : nul(node.value)
    }
    return childrenOf(node).some(visit)
  }
  return walked.some(each => nodesOf(each).some(visit))
}
