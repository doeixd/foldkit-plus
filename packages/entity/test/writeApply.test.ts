/**
 * `Write.apply` computes through metakit's evaluator: an amount past the safe
 * range and text holding NUL are refused, never written, and a collation
 * reaches the wire as the fold it is.
 */
import { Option, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  Collation,
  Computation,
  Entity,
  Expr,
  Operators,
  QueryEvaluateError,
  Write,
  lowerAsciiName,
} from '../src/index.js'

const Item = Entity.define(
  'Item',
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    label: Schema.String,
    stock: Schema.NullOr(Schema.Number),
    kind: Schema.String,
  }),
).pipe(Entity.annotateMembers({ name: Collation.of(Collation.asciiFold) }))

/** Text after text, compared (so carried) folded. */
const joined = Expr.operator('acme.joined', {
  input: [Schema.String, Schema.String],
  output: Schema.String,
  collation: 'required',
})
const operators = Operators.memory(Operators.implement(joined, (left, right) => `${left}${right}`))

const refused = (apply: () => unknown): QueryEvaluateError => {
  try {
    apply()
  } catch (error) {
    if (error instanceof QueryEvaluateError) return error
    throw error
  }
  throw new Error('expected a refusal')
}

describe('Write.apply', () => {
  const bound = (increments: Record<string, number>) => ({
    values: {},
    increments,
    assignments: {},
  })

  it('adds an amount, keeps a null null, and leaves what is no number unknown', () => {
    expect(Write.apply({ stock: 4 }, bound({ stock: 3 }), { operators })).toEqual({
      row: { stock: 7 },
      unknown: [],
    })
    expect(Write.apply({ stock: null }, bound({ stock: 3 }), { operators })).toEqual({
      row: { stock: null },
      unknown: [],
    })
    expect(Write.apply({ stock: 'many' }, bound({ stock: 3, other: 1 }), { operators })).toEqual({
      row: { stock: 'many' },
      unknown: ['stock', 'other'],
    })
  })

  it('refuses a sum past the safe integer range, carrying metakit’s refusal', () => {
    const error = refused(() =>
      Write.apply({ stock: Number.MAX_SAFE_INTEGER }, bound({ stock: 1 }), { operators }),
    )
    expect(Option.isSome(error.refusal)).toBe(true)
  })

  it('refuses a computed value metakit refuses, such as text holding NUL', () => {
    const assignments = {
      label: Computation.Call({
        operator: 'acme.joined',
        args: [Computation.Field({ key: 'name' }), Computation.Value({ value: 'a\u0000b' })],
      }),
    }
    refused(() =>
      Write.apply({ name: 'x' }, { values: {}, increments: {}, assignments }, { operators }),
    )
  })

  it('computes a fold named on the wire', () => {
    const assignments = {
      label: Computation.Call({
        operator: lowerAsciiName,
        args: [Computation.Field({ key: 'name' })],
      }),
    }
    expect(
      Write.apply({ name: 'AbC' }, { values: {}, increments: {}, assignments }, { operators }).row,
    ).toEqual({ name: 'AbC', label: 'abc' })
  })
})

describe('a computed assignment under a collation', () => {
  const Label = Entity.input(Item, Schema.Struct({ id: Schema.String, suffix: Schema.String }), {
    suffix: Entity.unmapped,
  })
  const relabel = Write.update(Label, {
    id: 'id',
    compute: { label: ({ row, input }) => joined(row.name, input.suffix) },
  })

  it('binds the text its collation compares as a call of the fold, with no collation', () => {
    const [call] = Object.values(Write.bind(relabel, { id: 'i', suffix: 'CD' }).assignments)
    expect(call).toEqual(
      Computation.Call({
        operator: 'acme.joined',
        args: [
          Computation.Call({
            operator: lowerAsciiName,
            args: [Computation.Field({ key: 'name' })],
          }),
          Computation.Call({
            operator: lowerAsciiName,
            args: [Computation.Value({ value: 'CD' })],
          }),
        ],
      }),
    )
    expect(call).not.toHaveProperty('collation')
  })

  it('applies to the folded text', () => {
    expect(
      Write.apply({ name: 'AB' }, Write.bind(relabel, { id: 'i', suffix: 'CD' }), { operators })
        .row,
    ).toEqual({ name: 'AB', label: 'abcd' })
  })
})
