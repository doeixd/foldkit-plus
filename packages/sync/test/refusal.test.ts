/**
 * A Sync refusal and a Remote one of the same case are one value on the
 * wire: Remote's guards and codecs read what Sync sends, and back.
 */
import { Option, Schema } from 'effect'
import { Refusal } from 'foldkit-remote'
import { describe, expect, it } from 'vitest'
import { SyncRefusal } from '../src/index.js'

const invalid = SyncRefusal.Invalid({
  entity: Option.some('Todo'),
  rule: Option.some('titled'),
  message: 'A todo needs a title',
  path: ['title'],
})

describe('SyncRefusal', () => {
  it('encodes Invalid as Remote does, so each side decodes the other', () => {
    const encoded = Schema.encodeSync(SyncRefusal)(invalid)
    expect(Schema.decodeUnknownSync(Refusal.invalid)(encoded)).toEqual(invalid)
    expect(Refusal.isInvalid(invalid)).toBe(true)
    const remote = Schema.encodeSync(Refusal.invalid)(invalid)
    expect(remote).toEqual(encoded)
    expect(Schema.decodeUnknownSync(SyncRefusal)(remote)).toEqual(invalid)
  })

  it('reads an absent reason, entity and rule as none', () => {
    expect(
      Schema.decodeUnknownSync(SyncRefusal)({
        _tag: 'Invalid',
        rule: null,
        message: 'm',
        path: [],
      }),
    ).toEqual(
      SyncRefusal.Invalid({ entity: Option.none(), rule: Option.none(), message: 'm', path: [] }),
    )
    expect(Schema.decodeUnknownSync(SyncRefusal)({ _tag: 'Forbidden' })).toEqual(
      SyncRefusal.Forbidden({ reason: Option.none() }),
    )
  })
})
