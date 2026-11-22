/** Whether a law (`Law.commutative`, `Law.identity('')`, …) can be declared of an operator's shape. */
import { Option, Schema } from 'effect'
import type { Law, Side } from '../law.js'
import { Laws, lawKind } from '../lawCore.js'
import type { OperatorDescriptor } from './operator.js'

/**
 * Why `law` cannot be declared of an operator of this shape, if it cannot: an
 * equation over two arguments of a unary operator, a witness that does not
 * decode as the argument it stands in, or a collation law of an operator
 * whose text keeps none.
 */
export const lawProblem = (
  law: Law,
  input: ReadonlyArray<Schema.Top>,
  output: Schema.Top,
  collation: OperatorDescriptor['collation'],
): Option.Option<string> => {
  const name = lawKind(law)
  const binary = (): Option.Option<string> =>
    input.length === 2
      ? Option.none()
      : Option.some(
          `${name} is a law of an operator of two arguments, and this one takes ${input.length}`,
        )
  const decodes = (value: unknown, schema: Schema.Top, what: string): Option.Option<string> =>
    Schema.is(Schema.toEncoded(schema))(value)
      ? Option.none()
      : Option.some(`${name}'s ${what} ${JSON.stringify(value)} does not decode as its schema`)
  const sides = (value: unknown, side: Side): Option.Option<string> =>
    Option.orElse(binary(), () =>
      Option.orElse(
        side === 'right' ? Option.none() : decodes(value, input[0]!, 'left witness'),
        () => (side === 'left' ? Option.none() : decodes(value, input[1]!, 'right witness')),
      ),
    )
  return Laws.$match(law, {
    Associative: binary,
    Commutative: binary,
    Idempotent: binary,
    Identity: ({ value, side }) => sides(value, side),
    Absorbing: ({ value, side }) => sides(value, side),
    Inverse: ({ other, identity }) =>
      Option.orElse(binary(), () =>
        other.descriptor.input.length === 1
          ? decodes(identity, output, 'identity')
          : Option.some(`${name}'s other operator takes one argument`),
      ),
    Distributes: ({ over }) =>
      Option.orElse(binary(), () =>
        over.descriptor.input.length === 2
          ? Option.none()
          : Option.some(`${name} is over an operator of two arguments`),
      ),
    Monotonic: ({ position }) =>
      Number.isSafeInteger(position) && position >= 0 && position < input.length
        ? Option.none()
        : Option.some(`${name}'s position ${position} is not an argument's`),
    PreservesCollation: () =>
      collation === 'operands'
        ? Option.none()
        : Option.some(`${name} is a law of an operator declared \`collation: 'operands'\``),
  })
}
