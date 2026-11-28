/**
 * What the checker knows of a list's length: one more after `append`, the
 * same or one more after `insert` (an `If` on whether the key is there, whose
 * count `countBounds` relates to the list's), no more after `keep` (the count
 * of the elements that pass, which the whole list's count bounds, `count`
 * being monotone up), and the same after `patch`. `countOfWritten` writes
 * each count in those terms; nothing else of a list is decided.
 */
import { Option, SchemaAST } from 'effect'
import * as Node from '../node.js'
import { countOp } from '../ops/arr.js'
import { isFiniteNumber, present } from '../ops/kind.js'
import { addOp } from '../ops/num.js'

const countOf = (list: Node.Node): Node.Node => Node.Call({ op: countOp, args: [list] })

/**
 * Where a count lies against another the checker knows: `base + below <=
 * count <= base + above`. A count of the elements that pass a test is no more
 * than the whole list's, `count` being monotone up (`monotone` is what the
 * caller checks); an insert's list holds the list's elements, or one more.
 */
export interface CountBounds {
  readonly base: Node.Node
  readonly below: number
  readonly above: number
  /**
   * `passing`: the elements of a list that pass a test, which needs `count`
   * monotone. `inserted`: an insert's list, which has a value wherever the
   * list has one and the write was not refused, as a written value is not.
   */
  readonly kind: 'passing' | 'inserted'
}

/** The bounds `node` keeps against another count, where it is a count the checker relates. */
export const countBounds = (node: Node.Node): Option.Option<CountBounds> => {
  if (Node.$is('Rows')(node) && node.fold === 'count') {
    return Node.RowsOver.$match(node.over, {
      List: ({ list }) =>
        Option.some({ base: countOf(list), below: -Infinity, above: 0, kind: 'passing' as const }),
      Related: () => Option.none(),
    })
  }
  if (!Node.$is('Call')(node) || node.op.id !== 'arr.count') return Option.none()
  const list = node.args[0]!
  if (!Node.$is('If')(list)) return Option.none()
  const { then, otherwise } = list
  const appendsTo =
    Node.$is('Call')(otherwise) &&
    otherwise.op.id === 'arr.append' &&
    Node.key(otherwise.args[0]!) === Node.key(then)
  return appendsTo
    ? Option.some({ base: countOf(then), below: 0, above: 1, kind: 'inserted' as const })
    : Option.none()
}

/** The count of a list a transition's written value makes, in terms the checker relates. */
export const countOfWritten = (list: Node.Node): Node.Node => {
  if (Node.$is('Call')(list) && list.op.id === 'arr.append') {
    return Node.Call({ op: addOp, args: [countOf(list.args[0]!), Node.Lit({ value: 1 })] })
  }
  // An insert's count keeps its `If`, which `countBounds` relates to the list's count.
  if (Node.$is('Rows')(list) && Node.RowsOver.$is('List')(list.over)) {
    // A patch is written only where it is not refused, and changes no element's place.
    if (list.fold === 'patch') return countOf(list.over.list)
    if (list.fold === 'keep') {
      return Node.Rows({
        fold: 'count',
        over: list.over,
        where: list.where,
        value: Option.none(),
        set: [],
      })
    }
  }
  return countOf(list)
}

const isBool = (node: Node.Node): boolean => {
  if (Node.$is('Lit')(node)) return typeof node.value === 'boolean'
  if (Node.$is('Path')(node)) {
    return Option.exists(node.ast, ast => present(ast).every(SchemaAST.isBoolean))
  }
  return Node.$is('Call')(node) && node.op.returns === 'boolean' && refusesNothing(node)
}

const isFiniteOrBool = (node: Node.Node): boolean => {
  if (Node.$is('Lit')(node))
    return (
      typeof node.value === 'boolean' ||
      (typeof node.value === 'number' && Number.isFinite(node.value))
    )
  if (Node.$is('Path')(node)) {
    return Option.exists(node.ast, ast =>
      present(ast).every(member => SchemaAST.isBoolean(member) || isFiniteNumber(member)),
    )
  }
  return Node.$is('Call')(node) && node.op.returns === 'boolean' && refusesNothing(node)
}

/**
 * Whether evaluating `node` can be refused for no value its Schemas allow: a
 * literal, a read, and the logic and equality operations over booleans and
 * finite numbers. Anything else may be refused, as far as this says.
 */
export const refusesNothing = (node: Node.Node): boolean => {
  if (Node.$is('Lit')(node)) return !Node.isRefusal(node.value)
  if (Node.$is('Path')(node)) return true
  if (!Node.$is('Call')(node) || Node.isForeign(node.op)) return false
  switch (node.op.id) {
    case 'null.isNull':
      return node.args.every(refusesNothing)
    case 'bool.and':
    case 'bool.or':
    case 'bool.not':
      return node.args.every(isBool)
    case 'eq.is':
    case 'eq.isNot':
    case 'eq.equals':
      return node.args.every(isFiniteOrBool)
    default:
      return false
  }
}
