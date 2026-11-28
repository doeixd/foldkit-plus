/**
 * The Phase 1 review gate's findings in foldkit-entity, as the reviewer's
 * probes: the transition of a write leaves the row `Write.apply` leaves for
 * an optional key of each encoding, and an amount past the safe integer range
 * is refused, never written.
 */
import { Option, Result, Schema } from 'effect'
import { Transition } from '@doeixd/metakit'
import { describe, expect, it } from 'vitest'
import { Operators, QueryEvaluateError, Write, type AnyEntity } from '../src/index.js'
import { transitionOf } from '../src/writeTransition.js'
import { ByNull, ByOption, ByOptionalKey, Moved } from './optionalKeysFixture.js'

const operators = Operators.memory()
const row = { id: 'a', note: 'kept', n: 1 }

/**
 * The note `Write.apply` leaves for `value`, and the one the transition leaves
 * over `encoded`, the input as stored.
 */
const notes = <E extends AnyEntity, Fields extends Schema.Struct.Fields>(
  write: Write<E, Fields>,
  value: Schema.Struct.Type<Fields>,
  encoded: Readonly<Record<string, unknown>>,
) => {
  const applied = Write.apply(row, Write.bind(write, value), { operators }).row
  const stepped = Result.getOrThrow(
    Transition.step(transitionOf(write), { present: true, row }, encoded, {}),
  ).state.row
  return [applied['note'], stepped['note']]
}

describe('the transition of a write leaves the row Write.apply leaves', () => {
  it('an Option holding nothing keeps the field; one holding text sets it', () => {
    expect(notes(ByOption, { id: 'a', note: Option.none() }, { id: 'a', note: null })).toEqual([
      'kept',
      'kept',
    ])
    expect(
      notes(ByOption, { id: 'a', note: Option.some('new') }, { id: 'a', note: 'new' }),
    ).toEqual(['new', 'new'])
  })

  it('an optional key left out keeps the field; given null it sets null', () => {
    expect(notes(ByOptionalKey, { id: 'a' }, { id: 'a' })).toEqual(['kept', 'kept'])
    expect(notes(ByOptionalKey, { id: 'a', note: null }, { id: 'a', note: null })).toEqual([
      null,
      null,
    ])
  })

  it('a plain null sets null', () => {
    expect(notes(ByNull, { id: 'a', note: null }, { id: 'a', note: null })).toEqual([null, null])
  })
})

describe('an amount past the safe integer range', () => {
  it('is refused by Write.apply, and by the transition', () => {
    const bound = Write.bind(Moved, { id: 'a', by: 2 ** 60 })
    expect(() => Write.apply(row, bound, { operators })).toThrow(QueryEvaluateError)
    const stepped = Transition.step(
      transitionOf(Moved),
      { present: true, row },
      { id: 'a', by: 2 ** 60 },
      {},
    )
    expect(Result.isFailure(stepped)).toBe(true)
    expect(Write.apply(row, Write.bind(Moved, { id: 'a', by: 2 }), { operators }).row['n']).toBe(3)
  })
})
