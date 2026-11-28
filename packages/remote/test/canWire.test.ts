/**
 * `Can` crosses the wire as JSON and is held in memory as a `Verdict`: the
 * JSON is the bytes it was when `Can` was the wire union itself, and
 * `Can.fromWire` and `Can.toWire` are the conversion between the two.
 */
import { Option, Schema } from 'effect'
import { Verdict } from '@doeixd/metakit'
import { describe, expect, it } from 'vitest'
import { Can, CanWire, type CanRefusal } from '../src/index.js'

const invalid: CanRefusal = {
  _tag: 'Invalid',
  entity: 'Doc',
  rule: 'small',
  message: 'It stays small',
  path: ['size'],
}

/** Each answer, with the bytes the wire union encoded it to before `Can` was a `Verdict`. */
const cases: ReadonlyArray<readonly [string, Can, string]> = [
  ['Yes', Verdict.True(), '{"_tag":"Yes"}'],
  [
    'No(Unmet)',
    Verdict.False(Option.some<CanRefusal>({ _tag: 'Unmet' })),
    '{"_tag":"No","refusal":{"_tag":"Unmet"}}',
  ],
  [
    'No(Forbidden) with words',
    Verdict.False(
      Option.some<CanRefusal>({ _tag: 'Forbidden', reason: Option.some('It is locked.') }),
    ),
    '{"_tag":"No","refusal":{"_tag":"Forbidden","reason":{"_id":"Option","_tag":"Some","value":"It is locked."}}}',
  ],
  [
    'No(Forbidden) without',
    Verdict.False(Option.some<CanRefusal>({ _tag: 'Forbidden', reason: Option.none() })),
    '{"_tag":"No","refusal":{"_tag":"Forbidden","reason":{"_id":"Option","_tag":"None"}}}',
  ],
  [
    'No(Invalid)',
    Verdict.False(Option.some(invalid)),
    '{"_tag":"No","refusal":{"_tag":"Invalid","entity":"Doc","rule":"small","message":"It stays small","path":["size"]}}',
  ],
  [
    'Undecided',
    Can.undecided(['Doc nobody is not held']),
    '{"_tag":"Undecided","reasons":["Doc nobody is not held"]}',
  ],
  [
    'Undecided with several reasons',
    Can.undecided(['a b', 'c, d']),
    '{"_tag":"Undecided","reasons":["a b","c, d"]}',
  ],
]

describe('Can on the wire', () => {
  it.each(cases)('%s: the JSON is what it was, from either side', (_, can, bytes) => {
    const encoded = Schema.encodeSync(CanWire)(Can.toWire(can))
    expect(JSON.stringify(encoded)).toBe(bytes)
    // `Schema.Option` decodes an `Option`, not its JSON, so the decode starts from the encoded value.
    expect(Can.fromWire(Schema.decodeUnknownSync(CanWire)(encoded))).toEqual(can)
  })

  it('has no wire value for a refusal naming no CanRefusal', () => {
    expect(() => Can.toWire(Verdict.False())).toThrow('no wire value')
  })
})
