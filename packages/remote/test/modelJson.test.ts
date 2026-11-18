import { Cause, Exit, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Model, initial } from '../src/remote.js'
import { entityKey, writeEntity } from '../src/store.js'

/**
 * Foldkit encodes the whole Model as JSON to keep it across a dev reload (and for devtools), at
 * the moment Vite reloads: a Model that cannot be encoded threw "Expected JSON value" at
 * `remote.entities`, because every entity entry holds Sets.
 */
const codec = Schema.toCodecJson(Model)
const withPost = {
  ...initial,
  entities: writeEntity(initial.entities, entityKey('Post', 'p1'), {
    title: 'Notes on bread',
    // What a read that settled without a value leaves, and a number JSON cannot hold.
    note: undefined,
    ratio: Number.NaN,
  }),
}

describe('a Remote Model as JSON', () => {
  it('encodes with an entity in the store, and writes only JSON', () => {
    const encoded = Schema.encodeUnknownSync(codec)(withPost)
    expect(() => JSON.stringify(encoded)).not.toThrow()
    expect(JSON.parse(JSON.stringify(encoded))).toEqual(encoded)
  })

  it('decodes to the Model it was written from, Sets and undefined included', () => {
    const encoded = JSON.parse(JSON.stringify(Schema.encodeUnknownSync(codec)(withPost)))
    const decoded = Schema.decodeUnknownSync(codec)(encoded)
    expect(decoded).toEqual(withPost)
    const entry = decoded.entities[entityKey('Post', 'p1')]!
    expect(entry.present).toBeInstanceOf(Set)
    expect(Object.hasOwn(entry.values, 'note')).toBe(true)
    expect(entry.values['note']).toBeUndefined()
    expect(entry.values['ratio']).toBeNaN()
  })

  it('refuses a value with no JSON form, naming where it is', () => {
    const odd = { ...withPost, entities: { x: { values: { fn: () => 1 } } } }
    const exit = Schema.encodeUnknownExit(codec)(odd)
    expect(Exit.isFailure(exit) && Cause.pretty(exit.cause)).toMatch(/function at x\.values\.fn/)
  })

  it('keeps a plain object that happens to carry the tag key', () => {
    const tricky = { ...withPost, entities: { '~remote': 'looks tagged', other: 1 } }
    const back = Schema.decodeUnknownSync(codec)(
      JSON.parse(JSON.stringify(Schema.encodeUnknownSync(codec)(tricky))),
    )
    expect(back.entities).toEqual(tricky.entities)
  })
})
