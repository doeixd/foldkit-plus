/**
 * An expression as readable text, in the language's own terms.
 *
 * This is for a human (an explanation, a diagnostic, a test that wants to
 * assert on a whole predicate at once) and deliberately **not** for a reader
 * that runs it. It is close enough to SQL to read at a glance and unlike it
 * everywhere that matters: an input is `$slug` rather than a bound parameter,
 * `contains` is named rather than rendered as somebody's `like`, and no
 * dialect's escaping or collation is implied.
 *
 * A predicate standing where a value is wanted is parenthesised, because
 * `x is not null = $archived` reads as three operands and is two. A predicate
 * that *is* the whole expression is not: nothing encloses it.
 */
import { Option } from 'effect'
import { Node } from 'metakit'
import { isExpr } from 'metakit/build'
import { kindOf } from './kind.js'
import { ASKER, originOf, type CompareOperator } from './operand.js'
import { operatorName } from './table.js'

const infixes: Readonly<Record<string, string>> = { 'num.add': '+', 'num.sub': '-' }

/** The names `Expr.show` prints a refinement's predicates by (`Product.Draft`), in place of their body. */
const names = new WeakMap<Node.Node, string>()

/** Prints `node` as `name`: what `Entity.refine` names its predicates. */
export const nameNode = (node: Node.Node, name: string): void => {
  names.set(node, name)
}

const symbols: Readonly<Record<CompareOperator, string>> = {
  lt: '<',
  lte: '<=',
  gt: '>',
  gte: '>=',
}

const orderOps: Readonly<Record<string, CompareOperator>> = {
  'ord.lt': 'lt',
  'ord.lte': 'lte',
  'ord.gt': 'gt',
  'ord.gte': 'gte',
  'str.lt': 'lt',
  'str.lte': 'lte',
  'str.gt': 'gt',
  'str.gte': 'gte',
}

/** Whether a node is a call of `bool.and` or `bool.or` that `Expr.and` or `Expr.or` built. */
const connective = (node: Node.Node): Option.Option<Node.Call> =>
  Node.$is('Call')(node) &&
  (node.op.id === 'bool.and' || node.op.id === 'bool.or') &&
  Option.isNone(originOf(node)) &&
  !names.has(node)
    ? Option.some(node)
    : Option.none()

/** Whether `node` is an `or` as written: `Query.show` parenthesises one among several. */
export const isOr = (node: Node.Node): boolean =>
  Option.exists(connective(node), call => call.op.id === 'bool.or')

/** A chain of one connective's operands, in order. */
const chain = (op: Node.AnyOp, node: Node.Node): ReadonlyArray<Node.Node> =>
  Option.match(connective(node), {
    onSome: call => (call.op === op ? call.args.flatMap(arg => chain(op, arg)) : [node]),
    onNone: () => [node],
  })

/** An operand of `and` or `or`: another connective is parenthesised, so its grouping shows. */
const showConnected = (node: Node.Node): string =>
  Option.isSome(connective(node)) ? `(${showNode(node)})` : showNode(node)

/** A value where a value is wanted: a predicate in parentheses. */
const showOperand = (node: Node.Node): string =>
  kindOf(node) === 'boolean' && (Node.$is('Call')(node) || Node.$is('Rows')(node))
    ? `(${showNode(node)})`
    : showNode(node)

const showOrigin = (node: Node.Node): Option.Option<string> =>
  Option.map(originOf(node), origin => {
    switch (origin._tag) {
      case 'Field':
        return `${origin.slice === 'next' ? 'next ' : ''}${origin.field.owner.name}.${origin.field.key}`
      case 'Viewer':
        return `viewer ${origin.entity.name}`
      // `Post.author.handle`: the judged row's relation, then each next one, then the field.
      case 'Hop':
        return [
          origin.via[0].owner.name,
          ...origin.via.map(step => step.key),
          origin.field.key,
        ].join('.')
      // `viewer Member.team.orgId`: the viewer's row, each relation from it, then the field.
      case 'ViewerHop':
        return `viewer ${[origin.viewer.name, ...origin.via.map(step => step.key), origin.field.key].join('.')}`
      case 'Exists': {
        const sought = `exists ${origin.relation.owner.name}.${origin.relation.key}${Option.match(
          origin.where,
          { onNone: () => '', onSome: where => ` where ${showNode(where)}` },
        )}`
        const [first] = origin.via
        return first === undefined
          ? sought
          : `${[first.owner.name, ...origin.via.map(step => step.key)].join('.')}: ${sought}`
      }
      case 'Call': {
        // The kernel's arithmetic prints infix.
        const infix =
          Option.isNone(origin.expansion) && Node.$is('Call')(node)
            ? infixes[node.op.id]
            : undefined
        return infix === undefined
          ? `${operatorName(origin.operator)}(${origin.args.map(showOperand).join(', ')})`
          : `(${origin.args.map(showOperand).join(` ${infix} `)})`
      }
      case 'Compare':
        return `${showOperand(origin.left)} ${symbols[origin.operator]} ${showOperand(origin.right)}`
      case 'Contains':
        return `contains(${showOperand(origin.value)}, ${showOperand(origin.search)})`
      case 'NotNull':
        return `${showOperand(origin.operand)} is not null`
    }
  })

const showStructure = (node: Node.Node): string =>
  Node.$match(node, {
    Lit: ({ value }) => JSON.stringify(value) ?? String(value),
    Path: ({ segments }) => {
      const [slice, ...rest] = segments
      if (slice === 'input') return `$${rest.join('.')}`
      if (slice === 'now') return 'now'
      if (slice === 'viewer' && rest[1] === ASKER) return `viewer ${rest[0]}`
      return segments.join('.')
    },
    Call: ({ op, args }) => {
      const order = orderOps[op.id]
      if (order !== undefined) {
        return `${showOperand(args[0]!)} ${symbols[order]} ${showOperand(args[1]!)}`
      }
      switch (op.id) {
        case 'eq.equals':
          return `${showOperand(args[0]!)} = ${showOperand(args[1]!)}`
        case 'eq.among':
          return `${showOperand(args[0]!)} in ${showOperand(args[1]!)}`
        case 'null.isNull':
          return `${showOperand(args[0]!)} is null`
        case 'bool.not':
          return `not (${showNode(args[0]!)})`
        case 'bool.and':
          return chain(op, node).map(showConnected).join(' and ')
        case 'bool.or':
          return chain(op, node).map(showConnected).join(' or ')
        default:
          return `${op.id}(${args.map(showOperand).join(', ')})`
      }
    },
    If: ({ cond, then, otherwise }) =>
      `if ${showNode(cond)} then ${showNode(then)} else ${showNode(otherwise)}`,
    Match: ({ on }) => `match ${showNode(on)}`,
    Opaque: ({ name }) => name,
    Rows: ({ fold }) => `rows.${fold}`,
  })

const showNode = (node: Node.Node): string =>
  names.get(node) ?? Option.getOrElse(showOrigin(node), () => showStructure(node))

/** An expression as readable text; see this module's comment for what it is and is not. */
export const show = (expr: { readonly node: Node.Node } | Node.Node): string =>
  showNode(isExpr(expr) ? expr.node : (expr as Node.Node))
