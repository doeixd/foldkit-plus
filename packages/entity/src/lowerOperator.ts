/**
 * A call of an operator, translated (the kernel convergence note, "How are a
 * custom operator and its implementations carried?"): a defined operator is
 * what its body builds; the kernel's three are metakit's own operations; any
 * other primitive operator is a foreign operation, carried by id and version,
 * whose implementation each reader takes from its caller (`foreignOf`).
 */
import { Match, Option, Schema, SchemaAST } from 'effect'
import { Node, Num, Str, type OpProperties } from 'metakit'
import type { ForeignImplementations } from 'metakit/build'
import type { Collation } from './collation.js'
import {
  Expr,
  type CallExpr,
  type Operandish,
  type OperatorDescriptor,
  type TestPredicate,
} from './expr.js'
import type { Law } from './law.js'
import { Laws } from './lawCore.js'
import type { Lowered } from './lower.js'
import type { MemoryOperators } from './operators.js'
import { SchemaShape } from './shape.js'
import { Text } from './text.js'

/** Text as a collation compares it: as it is, or with ASCII letters folded. */
export const folded = (collation: Collation, node: Node.Node): Node.Node =>
  Match.valueTags(collation, {
    Binary: () => node,
    AsciiFold: () => Node.Call({ op: Str.lowerAsciiOp, args: [node] }),
    Locale: ({ locale }): Node.Node => {
      throw new Error(
        `[foldkit-entity] lower: the "${locale}" collation is the backend's, and no reader in memory has it`,
      )
    },
  })

/** What a schema stores, null aside: the kind a foreign operation declares it returns. */
const storedKind = (schema: Schema.Top): Node.ValueKind | 'other' => {
  const present = SchemaShape.present(Schema.toEncoded(schema).ast)
  if (present.length === 0) return 'other'
  if (present.every(SchemaAST.isNumber)) return 'number'
  if (present.every(SchemaShape.isText)) return 'text'
  if (present.every(SchemaAST.isBoolean)) return 'boolean'
  return 'other'
}

/** An operator by its id and version, as a foreign operation and a table key name it. */
const nameOf = (operator: OperatorDescriptor): string => `${operator.id}@${operator.version}`

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

/** A primitive operator as a foreign operation, made once per declaration. */
const foreignOpOf = (operator: OperatorDescriptor): Node.ForeignOp => {
  const known = foreignOps.get(operator)
  if (known !== undefined) return known
  const returns = storedKind(operator.output)
  if (returns === 'other') {
    throw new Error(
      `[foldkit-entity] lower: ${nameOf(operator)} gives neither a number, a boolean nor text, which a foreign operation declares`,
    )
  }
  const made = Node.foreign({
    id: operator.id,
    version: operator.version,
    returns,
    nulls: operator.nulls === 'strict' ? 'strict' : 'own',
    properties: propertiesOf(operator.laws),
  })
  foreignOps.set(operator, made)
  return made
}

/** The kernel's primitive operators, by declaration: metakit's own operations. */
const kernel: ReadonlyMap<
  OperatorDescriptor,
  (args: ReadonlyArray<Node.Node>, fold: (arg: Node.Node) => Node.Node) => Node.Node
> = new Map([
  [Expr.add.descriptor, args => Node.Call({ op: Num.addOp, args })],
  [Expr.sub.descriptor, args => Node.Call({ op: Num.subOp, args })],
  [
    Text.startsWith.descriptor,
    (args, fold) => Node.Call({ op: Str.startsWithOp, args: args.map(fold) }),
  ],
])

/**
 * A call, translated. A collation reaches no operation: an operator that
 * compares text itself (`collation: 'required'`) is given its text arguments
 * folded as the call's collation folds them.
 */
export const lowerCall = (
  call: CallExpr<unknown> | TestPredicate,
  lower: (node: Operandish) => Node.Node,
  foreign: Map<string, OperatorDescriptor>,
): Node.Node => {
  const expansion: Option.Option<Operandish> = call.expansion
  return Option.match(expansion, {
    onSome: lower,
    onNone: () => {
      const { operator } = call
      const fold = (arg: Node.Node): Node.Node =>
        Option.match(call.collation, { onNone: () => arg, onSome: each => folded(each, arg) })
      const args = call.args.map(lower)
      const built = kernel.get(operator)
      if (built !== undefined) return built(args, fold)
      const known = foreign.get(nameOf(operator))
      if (known !== undefined && known !== operator) {
        throw new Error(
          `[foldkit-entity] lower: two declarations of ${nameOf(operator)} are called; a foreign operation is one declaration`,
        )
      }
      foreign.set(nameOf(operator), operator)
      return Node.Call({
        op: foreignOpOf(operator),
        args:
          operator.collation === 'required'
            ? args.map((arg, position) =>
                storedKind(operator.input[position]!) === 'text' ? fold(arg) : arg,
              )
            : args,
      })
    },
  })
}

const NUL = String.fromCharCode(0)

/**
 * The implementations in `operators` of each foreign operation `lowered`
 * calls, as metakit's readers take them. Each runs as the memory interpreter
 * ran it: text holding a NUL refused, a throw refused, and an answer its
 * output schema does not admit refused in a checked table. It is told no
 * collation: an operator that compares text is given it folded.
 */
export const foreignOf = (lowered: Lowered, operators: MemoryOperators): ForeignImplementations => {
  const called = [...lowered.foreign.values()]
  const twice = called.find((operator, index) =>
    called.slice(0, index).some(other => other.id === operator.id),
  )
  if (twice !== undefined) {
    throw new Error(
      `[foldkit-entity] lower: two versions of ${twice.id} are called, and a reader's table holds one implementation per id`,
    )
  }
  return Object.fromEntries(
    called.flatMap(operator =>
      Option.match(operators.get(operator), {
        onNone: () => [],
        onSome: run => [
          [
            operator.id,
            {
              version: operator.version,
              run: (values: ReadonlyArray<unknown>): unknown => {
                const op = foreignOpOf(operator)
                if (values.some(value => typeof value === 'string' && value.includes(NUL))) {
                  return Node.unportable(operator.id)
                }
                let answer: unknown
                try {
                  answer = run(values, { collation: Option.none<Collation>() })
                } catch (error) {
                  return Node.unsupported(
                    op,
                    `failed: ${error instanceof Error ? error.message : String(error)}`,
                  )
                }
                const unknownTruth = op.returns === 'boolean' && answer === null
                return operators.checked &&
                  !unknownTruth &&
                  !Schema.is(Schema.toEncoded(operator.output))(answer)
                  ? Node.illTyped(operator.id, 'a value its output schema admits', answer)
                  : answer
              },
            },
          ] as const,
        ],
      }),
    ),
  )
}
