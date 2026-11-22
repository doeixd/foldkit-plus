/**
 * Entity operators built on `Operation.define` and `claims`: checked by
 * `metakit/conformance`'s `checkOperation`, with defined operators refusing
 * claims and legacy `Law`/`Evidence` removed.
 */
import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import * as Operation from 'metakit/operation'
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
})
