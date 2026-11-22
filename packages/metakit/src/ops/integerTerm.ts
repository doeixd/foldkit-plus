/**
 * Which terms are integers whatever the row holds, and where a fraction meets
 * one: what SQL lowering refuses (Postgres types a parameter by the column it
 * meets, so `"n" + $1` with 0.5 is an error there and a number in SQLite), and
 * what a reader that must refuse as SQL does asks first.
 */
import { Option, SchemaAST } from 'effect'
import * as Node from '../node.js'
import { declares } from './kind.js'

const INT: ReadonlySet<string> = new Set(['effect/schema/isInt'])

const isIntAst = (ast: SchemaAST.AST): boolean =>
  SchemaAST.isUnion(ast)
    ? ast.types.some(isIntAst) &&
      ast.types.every(t => isIntAst(t) || SchemaAST.isNull(t) || SchemaAST.isUndefined(t))
    : SchemaAST.isNumber(ast) && declares(ast.checks, INT)

const integerOps: ReadonlySet<string> = new Set<Node.CoreOpId>([
  'num.add',
  'num.sub',
  'num.mul',
  'num.neg',
  'num.mulScaled',
  'null.coalesce',
])

/** Whether `node` is an integer whatever the row holds, and reads the row. */
export const isIntegerTerm = (node: Node.Node): boolean =>
  Node.$match(node, {
    Lit: () => false,
    Path: ({ ast }) => Option.isSome(ast) && isIntAst(ast.value),
    Call: ({ op, args }) =>
      op.id === 'str.len' ||
      op.id === 'arr.count' ||
      ((op.id === 'num.div' || op.id === 'num.rem') &&
        args.slice(0, 2).some(isIntegerTerm) &&
        args.slice(0, 2).every(arg => isIntegerTerm(arg) || isIntegerLiteral(arg))) ||
      (integerOps.has(op.id) &&
        args.some(isIntegerTerm) &&
        args.every(arg => isIntegerTerm(arg) || isIntegerLiteral(arg))),
    If: ({ then, otherwise }) => isIntegerTerm(then) && isIntegerTerm(otherwise),
    Match: ({ cases, otherwise }) =>
      cases.every(([, branch]) => isIntegerTerm(branch)) &&
      Option.match(otherwise, { onNone: () => true, onSome: isIntegerTerm }),
    Opaque: () => false,
    Rows: ({ fold, value }) =>
      fold === 'count' ||
      ((fold === 'sum' || fold === 'min' || fold === 'max') &&
        Option.exists(value, each => isIntegerTerm(each) || isIntegerLiteral(each))),
  })

export const isIntegerLiteral = (node: Node.Node): boolean =>
  Node.$is('Lit')(node) && typeof node.value === 'number' && Number.isInteger(node.value)

export const isFraction = (value: unknown): boolean =>
  typeof value === 'number' && Number.isFinite(value) && !Number.isInteger(value)

const isFractionLit = (node: Node.Node): boolean => Node.$is('Lit')(node) && isFraction(node.value)

/** A list of candidates holding a fraction, beside a needle that is an integer term. */
const fractionCandidate = (node: Node.Call): boolean =>
  (node.op.id === 'eq.in' || node.op.id === 'eq.among') &&
  isIntegerTerm(node.args[0]!) &&
  Node.$is('Lit')(node.args[1]!) &&
  Array.isArray(node.args[1].value) &&
  node.args[1].value.some(isFraction)

/**
 * Whether a call in `node` has a fraction literal beside an integer term, as
 * an operand or among its candidates: the expression SQL lowering refuses.
 */
export const fractionBesideInteger = (node: Node.Node): boolean =>
  Node.$match(node, {
    Lit: () => false,
    Path: () => false,
    Opaque: () => false,
    Call: call =>
      (call.args.some(isIntegerTerm) && call.args.some(isFractionLit)) ||
      fractionCandidate(call) ||
      call.args.some(fractionBesideInteger),
    If: ({ cond, then, otherwise }) => [cond, then, otherwise].some(fractionBesideInteger),
    Match: ({ on, cases, otherwise }) =>
      [on, ...cases.map(([, branch]) => branch), ...Option.toArray(otherwise)].some(
        fractionBesideInteger,
      ),
    Rows: ({ where, value, set }) =>
      [...Option.toArray(where), ...Option.toArray(value), ...set.map(([, each]) => each)].some(
        fractionBesideInteger,
      ),
  })
