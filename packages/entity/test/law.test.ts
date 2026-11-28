/**
 * Entity operators built on `Operation.define` and `claims`: checked by
 * `@doeixd/metakit/conformance`'s `checkOperation`, with defined operators refusing
 * claims and legacy `Law`/`Evidence` removed.
 */
import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import * as Operation from '@doeixd/metakit/operation'
import { checkOperation } from '../src/conformance/index.js'
import { Expr, Operators } from '../src/index.js'

const Flags = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 0x7fff_ffff }))

describe('Entity operator claims on Operation.define', () => {
  it('declares claims on primitive operators and exposes them on OperatorDescription', () => {
    const flagsOr = Expr.operator('flags.or', {
      input: [Flags, Flags],
      output: Flags,
      claims: {
        commutative: true,
        associative: true,
        idempotent: true,
        identity: { value: 0, side: 'both' },
      },
    })
    const described = Operators.describe(flagsOr)
    expect(described.claims).toEqual({
      commutative: true,
      associative: true,
      idempotent: true,
      identity: { value: 0, side: 'both' },
    })
    expect(described.nulls).toBe('strict')
  })

  it('refuses claims on a defined operator with an actionable message', () => {
    expect(() =>
      Expr.operator('cms.published', {
        input: [Schema.String],
        output: Schema.Boolean,
        definedAs: at => Expr.isNotNull(at),
        claims: { idempotent: true } as unknown as undefined,
      }),
    ).toThrow(
      '[foldkit-entity] Expr.operator("cms.published"): a defined operator is its body, and readers read the body\'s operations; remove claims.',
    )
  })

  it('checks custom operations through metakit checkOperation', () => {
    const flagsOr = Operation.define({
      id: 'flags.or',
      version: 1,
      args: [Flags, Flags],
      returns: Flags,
      nulls: 'strict',
      claims: {
        commutative: true,
        associative: true,
        idempotent: true,
        identity: { value: 0, side: 'both' },
      },
    })
    const impls = Operation.implementations(
      'entity-test',
      Operation.implement(flagsOr, (a, b) => a | b),
    )
    expect(checkOperation(flagsOr, impls).ok).toBe(true)

    const bad = Operation.implementations(
      'entity-bad',
      Operation.implement(flagsOr, (a, b) => a ^ b),
    )
    expect(checkOperation(flagsOr, bad).ok).toBe(false)
  })

  it('H8: validates core prefixes upfront, handles non-scalar inputs without crashing, and adapts invertible.inverse', () => {
    expect(() =>
      Expr.operator('num.custom', {
        input: [Schema.Number],
        output: Schema.Number,
      }),
    ).toThrow(/reserved for core operations/)

    const arrSum = Expr.operator('custom.arrSum', {
      input: [Schema.Array(Schema.Number)],
      output: Schema.Number,
    })
    // Calling a non-scalar-input primitive operator builds an Opaque node without crashing.
    const expr = arrSum(Expr.literal([1, 2, 3]))
    expect(expr).toBeDefined()

    const invOp = Operation.define({
      id: 'custom.subInv',
      version: 1,
      args: [Schema.Number, Schema.Number],
      returns: Schema.Number,
      nulls: 'strict',
    })
    const fwdOp = Expr.operator('custom.addInv', {
      input: [Schema.Number, Schema.Number],
      output: Schema.Number,
      claims: { invertible: { inverse: invOp.descriptor } },
    })
    const callExpr = fwdOp(1, 2)
    expect(callExpr).toBeDefined()
  })
})
