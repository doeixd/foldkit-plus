/**
 * What a cache declaration says (#428): a freshness Cache-Control can say,
 * on an Entity (the shorter of two) or a Query.
 */
import { Duration, Option, Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { describe, expect, it } from 'vitest'
import { EdgeCache, Query } from '../src/index.js'

const Row = Entity.define('Row', Schema.Struct({ id: Schema.String }))

describe('a cache declaration', () => {
  it.each<Duration.Input>(['0 seconds', '500 millis', 'Infinity'])('refuses %s', maxAge => {
    expect(() => EdgeCache.of({ maxAge })).toThrow(/at least one second/)
    expect(() => Query.make('Q', { Input: {}, Result: Row, cache: { maxAge } })).toThrow(
      /at least one second/,
    )
  })

  it('keeps the shorter of two on one Entity', () => {
    const twice = Row.pipe(
      Entity.annotate(EdgeCache.of({ maxAge: '1 minute' })),
      Entity.annotate(EdgeCache.of({ maxAge: '10 seconds' })),
    )
    expect(
      Option.map(EdgeCache.policyOf(twice), policy => Duration.toMillis(policy.maxAge)),
    ).toEqual(Option.some(10_000))
  })

  it('is none where nothing is declared', () => {
    expect(EdgeCache.policyOf(Row)).toEqual(Option.none())
    expect(Query.make('Q', { Input: {}, Result: Row }).cache).toBeUndefined()
  })

  it('rides a defined Query', () => {
    const defined = Query.define('Rows', {}, () => Query.from(Row), {
      cache: { maxAge: '5 seconds' },
    })
    expect(
      Option.map(Option.fromUndefinedOr(defined.cache), policy => Duration.toMillis(policy.maxAge)),
    ).toEqual(Option.some(5000))
  })
})
