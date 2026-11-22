/**
 * How a call of a primitive operator is built (the kernel convergence note,
 * "How are a custom operator and its implementations carried?"): the kernel's
 * own three (`Expr.add`, `Expr.sub`, `Text.startsWith`) are metakit's
 * operations, registered by their declarations; any other is a foreign
 * operation, carried by id and version, whose implementation each reader
 * takes from its caller. A collation reaches no operation: it folds text
 * arguments where the call is built.
 */
import { Option, Schema } from 'effect'
import { Node, type OpProperties } from 'metakit'
import type { Collation } from '../collation.js'
import type { Law } from '../law.js'
import { Laws } from '../lawCore.js'
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

/**
 * The properties a law declares, where metakit's set says the same thing:
 * only a law over the operator's whole input, since a property holds for
 * every value. No reader acts on a foreign operation's properties yet.
 */
const propertiesOf = (laws: ReadonlyArray<Law>): OpProperties =>
  laws
    .filter(law => Option.isNone(law.domain))
    .reduce<OpProperties>(
      (properties, law) =>
        Laws.$match(law, {
          Commutative: (): OpProperties => ({ ...properties, commutative: true }),
          Idempotent: (): OpProperties => ({ ...properties, idempotent: true }),
          Identity: ({ value, side }): OpProperties => ({
            ...properties,
            identity: { value, side },
          }),
          Absorbing: ({ value, side }): OpProperties => ({
            ...properties,
            absorbing: { value, result: value, side },
          }),
          // Each of these says less, or other, than metakit's property of the name.
          Associative: () => properties,
          Inverse: () => properties,
          Distributes: () => properties,
          Monotonic: () => properties,
          PreservesCollation: () => properties,
        }),
      {},
    )

const foreignOps = new WeakMap<OperatorDescriptor, Node.ForeignOp>()
const declarations = new WeakMap<Node.ForeignOp, OperatorDescriptor>()

/** What a reader in memory refuses a value of a kind no foreign operation declares with. */
const unheldKind = (operator: OperatorDescriptor): string =>
  `${Node.foreignName(operator)} gives neither a number, a boolean nor text, which a foreign operation declares`

/** A primitive operator as a foreign operation, made once per declaration. */
export const foreignOpOf = (operator: OperatorDescriptor): Node.ForeignOp => {
  const known = foreignOps.get(operator)
  if (known !== undefined) return known
  const returns = returnsOf(operator)
  if (returns === 'other') throw new Error(`[foldkit-entity] ${unheldKind(operator)}`)
  const made = Node.foreign({
    id: operator.id,
    version: operator.version,
    returns,
    nulls: operator.nulls === 'strict' ? 'strict' : 'own',
    properties: propertiesOf(operator.laws),
  })
  foreignOps.set(operator, made)
  declarations.set(made, operator)
  return made
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
  if (returnsOf(operator) === 'other') {
    const refusal = new Node.Refusal({
      reason: 'unsupported',
      at: operator.id,
      detail: unheldKind(operator),
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
