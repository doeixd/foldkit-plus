/**
 * The adapter writes a command id and a lowered aggregate reads it back: one
 * format, so a retry is told from a reused operation.
 */
import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import { commandIdOf, decidedOf } from '../src/commandId.js'

const digest = '0123456789abcdef0123456789abcdef'

describe('a command id', () => {
  it.each(['op-1', 'tab:3:op-1'])('reads back the operation %s and its digest', operation => {
    expect(decidedOf('Rename', commandIdOf('Rename', { operation, digest }))).toEqual(
      Option.some({ operation, digest }),
    )
  })

  it.each([
    { what: "another mutation's", id: commandIdOf('Retitle', { operation: 'op', digest }) },
    { what: 'one with no operation', id: `Rename::${digest}` },
    { what: 'one whose digest is not the adapter’s', id: 'Rename:op:not-a-digest' },
    { what: "Domain's own", id: 'c7b1f0e2-4a6d-4f7e-9c1b-2d3e4f5a6b7c' },
  ])('reads none from $what', ({ id }) => {
    expect(decidedOf('Rename', id)).toEqual(Option.none())
  })
})
