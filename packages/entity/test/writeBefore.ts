/**
 * `Write.apply` as it was before step 6 of the kernel convergence note, kept
 * as the reference the differential test runs the transition against
 * (`git show 59471e5da:packages/entity/src/write.ts`): an amount is added with
 * JavaScript's `+`, and an assignment is evaluated call by call with
 * `applyOperator`. Two things differ on purpose from that file: a computation
 * no longer carries a collation, so a fold arrives as a call of
 * `lowerAsciiName`, which is run here as ASCII lowercasing.
 */
import { Option } from 'effect'
import { applyOperator } from '../src/evaluate.js'
import type { MemoryOperators } from '../src/operators.js'
import { put } from '../src/record.js'
import { Computation, lowerAsciiName, type BoundWrite } from '../src/write.js'

const lowerAscii = (value: unknown): unknown =>
  typeof value === 'string' ? value.replace(/[A-Z]/g, letter => letter.toLowerCase()) : value

const computed = (
  computation: Computation,
  row: Readonly<Record<string, unknown>>,
  operators: MemoryOperators,
): Option.Option<unknown> =>
  Computation.$match(computation, {
    Field: ({ key }) => (Object.hasOwn(row, key) ? Option.some(row[key]) : Option.none()),
    Value: ({ value }) => Option.some(value),
    Call: ({ operator, args }) =>
      operator === lowerAsciiName
        ? Option.map(Option.all(args.map(arg => computed(arg, row, operators))), ([value]) =>
            lowerAscii(value),
          )
        : Option.flatMap(operators.named(operator), descriptor =>
            Option.map(Option.all(args.map(arg => computed(arg, row, operators))), values =>
              applyOperator(descriptor, values, { collation: Option.none(), operators }),
            ),
          ),
  })

export const applyBefore = (
  row: Readonly<Record<string, unknown>>,
  bound: Pick<BoundWrite, 'values' | 'increments' | 'assignments'>,
  options: { readonly operators: MemoryOperators },
): {
  readonly row: Readonly<Record<string, unknown>>
  readonly unknown: ReadonlyArray<string>
} => {
  const after: Record<string, unknown> = { ...row, ...bound.values }
  const unknown: Array<string> = []
  for (const [field, amount] of Object.entries(bound.increments)) {
    const held = Object.hasOwn(row, field) ? row[field] : undefined
    if (held === null) after[field] = null
    else if (typeof held === 'number') after[field] = held + amount
    else unknown.push(field)
  }
  for (const [field, computation] of Object.entries(bound.assignments)) {
    Option.match(computed(computation, row, options.operators), {
      onNone: () => unknown.push(field),
      onSome: value => put(after, field, value),
    })
  }
  return { row: after, unknown }
}
