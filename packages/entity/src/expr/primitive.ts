/**
 * How a call of a primitive operator is built (the kernel convergence note,
 * "How are a custom operator and its implementations carried?"): the kernel's
 * own three (`Expr.add`, `Expr.sub`, `Text.startsWith`) are metakit's
 * operations, registered by their declarations; any other is a foreign
 * operation, carried by id and version, whose implementation each reader
 * takes from its caller. A collation reaches no operation: it folds text
 * arguments where the call is built.
 */
import { Option, Schema, SchemaAST } from 'effect'
import { Node } from '@doeixd/metakit'
import type { Collation } from '../collation.js'
import { kindOfAst } from './kind.js'
import { folded } from './operand.js'
import type { OperatorDescriptor } from './operator.js'

/** What a schema stores, null aside: one kind an argument is checked by, or `other`. */
export const storedKindOf = (schema: Schema.Top) => kindOfAst(Schema.toEncoded(schema).ast)

/** How a call of one of the kernel's primitive operators is built: metakit's own operation. */
export type KernelBuild = (
  args: ReadonlyArray<Node.Node>,
  fold: (arg: Node.Node) => Node.Node,
) => Node.Node

const kernels = new WeakMap<OperatorDescriptor, KernelBuild>()

/** Records how a call of the kernel's `operator` is built. */
export const kernel = (operator: OperatorDescriptor, build: KernelBuild): void => {
  kernels.set(operator, build)
}

/** What a schema stores, as a foreign operation declares what it returns. */
const returnsOf = (operator: OperatorDescriptor): Node.ValueKind | 'other' => {
  const kind = storedKindOf(operator.output)
  return kind === 'null' ? 'other' : kind
}

const scalarArgument = (ast: SchemaAST.AST): boolean => {
  if (SchemaAST.isUnion(ast)) {
    return (
      ast.types.some(member => !SchemaAST.isNull(member)) &&
      ast.types.every(member => SchemaAST.isNull(member) || scalarArgument(member))
    )
  }
  const kind = kindOfAst(ast)
  return kind !== 'other' && kind !== 'null'
}

const scalarInput = (operator: OperatorDescriptor): boolean =>
  operator.input.every(schema => scalarArgument(Schema.toEncoded(schema).ast))

const foreignOps = new WeakMap<OperatorDescriptor, () => Node.ForeignOp>()
const declarations = new WeakMap<Node.ForeignOp, OperatorDescriptor>()

/** What a reader in memory refuses a value of a kind no foreign operation declares with. */
const unheldKind = (operator: OperatorDescriptor): string =>
  `${Node.foreignName(operator)} gives neither a number, a boolean nor text, which a foreign operation declares`

const unheldInputKind = (operator: OperatorDescriptor): string =>
  `${Node.foreignName(operator)} takes an argument that is neither a number, a boolean nor text, which a foreign operation declares`

/** Register the constructor on user-declared operations so reading core calls needs no constructor. */
export const registerForeign = (operator: OperatorDescriptor, make: () => Node.ForeignOp): void => {
  let cached: Node.ForeignOp | undefined
  foreignOps.set(operator, () => {
    if (cached === undefined) {
      cached = make()
      declarations.set(cached, operator)
    }
    return cached
  })
}

/** A primitive operator as a foreign operation, made once per declaration. */
export const foreignOpOf = (operator: OperatorDescriptor): Node.ForeignOp => {
  const make = foreignOps.get(operator)
  if (make === undefined)
    throw new Error(`[foldkit-entity] No foreign declaration for ${Node.foreignName(operator)}`)
  return make()
}

/** The declaration a foreign operation was made from, when entity made it. */
export const declarationOf = (op: Node.ForeignOp): Option.Option<OperatorDescriptor> =>
  Option.fromUndefinedOr(declarations.get(op))

/** Whether a call of `operator` is given its argument at `position` folded under the call's collation. */
export const foldsArgument = (operator: OperatorDescriptor, position: number): boolean =>
  operator.collation === 'required' && storedKindOf(operator.input[position]!) === 'text'

/**
 * A call of a primitive operator over built arguments. A collation reaches no
 * operation: an operator that compares text itself (`collation: 'required'`)
 * is given its text arguments folded as the call's collation folds them.
 */
export const callOperator = (
  operator: OperatorDescriptor,
  args: ReadonlyArray<Node.Node>,
  collation: Option.Option<Collation>,
): Node.Node => {
  const fold = (arg: Node.Node): Node.Node =>
    Option.match(collation, { onNone: () => arg, onSome: each => folded(each, arg) })
  const build = kernels.get(operator)
  if (build !== undefined) return build(args, fold)
  // No reader in memory holds such a value, so every evaluation of the call refuses it;
  // the call is still written, for a reader that runs it by name (a server's computation).
  if (returnsOf(operator) === 'other' || !scalarInput(operator)) {
    const refusal = new Node.Refusal({
      reason: 'unsupported',
      at: operator.id,
      detail: returnsOf(operator) === 'other' ? unheldKind(operator) : unheldInputKind(operator),
    })
    return Node.Opaque({
      name: Node.foreignName(operator),
      reads: Option.none(),
      run: () => refusal,
    })
  }
  return Node.Call({
    op: foreignOpOf(operator),
    args: args.map((arg, position) => (foldsArgument(operator, position) ? fold(arg) : arg)),
  })
}
