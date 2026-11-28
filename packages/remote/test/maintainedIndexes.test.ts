import { Option, Schema } from 'effect'
import { Eq, Path } from '@doeixd/metakit'
import { describe, expect, it } from 'vitest'
import { dependentQuery } from '../src/dependent.js'
import {
  INDEX_THRESHOLD,
  makeOrderIndex,
  makeReverseIndex,
  maybeOrderIndex,
  maybeReverseIndex,
} from '../src/maintained/index.js'

describe('foldkit-remote/maintained indexes (Bout 4.16)', () => {
  it('builds order and reverse indexes only above INDEX_THRESHOLD (400 rows)', () => {
    const smallOrder = Array.from({ length: INDEX_THRESHOLD }, (_, i) => ({
      key: `Item:${i}`,
      sortKey: i,
    }))
    const largeOrder = [...smallOrder, { key: `Item:${INDEX_THRESHOLD}`, sortKey: INDEX_THRESHOLD }]

    expect(Option.isNone(maybeOrderIndex(smallOrder, (a, b) => a - b))).toBe(true)
    const builtOrder = maybeOrderIndex(largeOrder, (a, b) => a - b)
    expect(Option.isSome(builtOrder)).toBe(true)

    const smallLinks = Array.from(
      { length: INDEX_THRESHOLD },
      (_, i) => [`parent:${i % 10}`, `Child:${i}`] as const,
    )
    const largeLinks = [...smallLinks, ['parent:0', `Child:${INDEX_THRESHOLD}`] as const]

    expect(Option.isNone(maybeReverseIndex(smallLinks))).toBe(true)
    const builtReverse = maybeReverseIndex(largeLinks)
    expect(Option.isSome(builtReverse)).toBe(true)
  })

  it('maintains sorted order in O(log n) via OrderIndex and O(1) join lookups via ReverseIndex', () => {
    const idx = makeOrderIndex(
      [
        { key: 'Item:c', sortKey: 30 },
        { key: 'Item:a', sortKey: 10 },
        { key: 'Item:b', sortKey: 20 },
      ],
      (a, b) => a - b,
    )
    expect(idx.keys()).toEqual(['Item:a', 'Item:b', 'Item:c'])

    const at = idx.insert('Item:mid', 15)
    expect(at).toBe(1)
    expect(idx.keys()).toEqual(['Item:a', 'Item:mid', 'Item:b', 'Item:c'])

    expect(idx.remove('Item:b', 20)).toBe(true)
    expect(idx.keys()).toEqual(['Item:a', 'Item:mid', 'Item:c'])

    const rev = makeReverseIndex([
      ['user:1', 'Order:a'],
      ['user:1', 'Order:b'],
      ['user:2', 'Order:c'],
    ])
    expect([...rev.pointingAt('user:1')]).toEqual(['Order:a', 'Order:b'])
    rev.remove('user:1', 'Order:a')
    expect([...rev.pointingAt('user:1')]).toEqual(['Order:b'])
    expect([...rev.pointingAt('user:missing')]).toEqual([])
  })
})

describe('foldkit-remote dependentQuery via queryReadiness (Bout 4.19)', () => {
  it('sends no query while cascading parameter is unbound, and resolves once bound', () => {
    const Env = Schema.Struct({
      row: Schema.Struct({ id: Schema.String, stateCode: Schema.String }),
      selectedState: Schema.String,
    })
    type Env = typeof Env.Type
    const $env = Path.from(Env)
    const filter = Eq.is($env.row.stateCode, $env.selectedState)

    interface AppModel {
      readonly selectedState: Option.Option<string>
    }

    const asked: Array<string> = []
    const cities = dependentQuery<AppModel, Env, { readonly state: string }>({
      filter,
      params: model =>
        Option.match(model.selectedState, {
          onNone: () => ({}),
          onSome: code => ({ selectedState: code }),
        }),
      query: model => {
        const state = Option.getOrThrow(model.selectedState)
        asked.push(state)
        return { state }
      },
    })

    // Before a state is chosen: parameter is unbound -> Option.none(), zero queries asked.
    const unboundModel: AppModel = { selectedState: Option.none() }
    expect(cities.readiness(unboundModel).ready).toBe(false)
    expect(Option.isNone(cities.resolve(unboundModel))).toBe(true)
    expect(asked).toEqual([])

    // Once state is chosen: parameter is bound -> query resolves.
    const boundModel: AppModel = { selectedState: Option.some('CA') }
    expect(cities.readiness(boundModel).ready).toBe(true)
    expect(Option.getOrUndefined(cities.resolve(boundModel))).toEqual({ state: 'CA' })
    expect(asked).toEqual(['CA'])
  })
})
