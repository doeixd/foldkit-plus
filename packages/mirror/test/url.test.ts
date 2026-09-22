// @vitest-environment jsdom
/** The URL store, against jsdom's location and history. */
import { Effect, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Projection, Surface } from 'foldkit-surface'
import { afterEach, describe, expect, it } from 'vitest'
import { Mirror, MirrorStore } from '../src/index.js'

const Model = Schema.Struct({ filter: Schema.Literals(['all', 'active']), q: Schema.String })
type Model = typeof Model.Type
const initial: Model = { filter: 'all', q: '' }
const App = Surface.application({
  Model,
  Message: defineMessageUnion({ Ping: {} }),
  initial,
  update: model => ({ model }),
})
const Filters = Mirror.url(App, {
  name: 'filters',
  fields: Projection.pick(App.model.filter, App.model.q),
  keys: { q: { history: 'replace' } },
  throttle: 0,
})
const entry = Filters.subscriptions['filters.mirror']!
const write = (model: Model) =>
  Effect.runPromise(Stream.runDrain(entry.dependenciesToStream(entry.modelToDependencies(model))))
const at = (href: string) => window.history.replaceState({}, '', href)

afterEach(() => at('/'))

describe('MirrorStore.url', () => {
  it('reads only its keys from the location', async () => {
    at('/todos?filter=active&sort=asc')
    const store = MirrorStore.url(['filter', 'q'], 'search')
    expect(await Effect.runPromise(store.read)).toEqual({ filter: 'active' })
    at('/todos#q=x')
    expect(await Effect.runPromise(MirrorStore.url(['q'], 'hash').read)).toEqual({ q: 'x' })
  })

  it('writes push or replace through history and fires Foldkit’s url change', async () => {
    at('/todos?sort=asc')
    const changes: string[] = []
    window.addEventListener('foldkit:urlchange', () => changes.push(window.location.href))
    const before = window.history.length
    await write({ filter: 'active', q: '' })
    expect(window.location.search).toBe('?sort=asc&filter=active')
    expect(window.history.length).toBe(before + 1)
    await write({ filter: 'active', q: 'apollo' })
    expect(window.location.search).toBe('?sort=asc&filter=active&q=apollo')
    expect(window.history.length).toBe(before + 1) // q replaces
    await write(initial)
    expect(window.location.search).toBe('?sort=asc')
    expect(window.history.length).toBe(before + 1) // removals replace
    expect(changes).toHaveLength(3)
  })

  it('writes nothing when the location already holds the keys', async () => {
    at('/todos?filter=active')
    const before = window.history.length
    const changes: string[] = []
    window.addEventListener('foldkit:urlchange', () => changes.push(window.location.href))
    await write({ filter: 'active', q: '' })
    expect(window.history.length).toBe(before)
    expect(changes).toEqual([])
  })

  it('a direct write of keys the location already holds touches nothing', async () => {
    at('/todos?filter=active')
    const before = window.history.length
    const changes: string[] = []
    window.addEventListener('foldkit:urlchange', () => changes.push(window.location.href))
    const store = MirrorStore.url(['filter', 'q'], 'search')
    await Effect.runPromise(
      store.write({ set: { filter: 'active' }, remove: ['q'], intent: 'push' }),
    )
    expect(window.history.length).toBe(before)
    expect(changes).toEqual([])
  })

  it('href defaults to the current location as its base', () => {
    at('/todos?sort=asc#top')
    expect(Filters.href(initial, { filter: 'active' })).toBe('/todos?sort=asc&filter=active#top')
  })

  it('reduce from the current URL round-trips a write', async () => {
    at('/todos')
    await write({ filter: 'active', q: 'a b' })
    expect(Filters.reduce(initial, `${window.location.pathname}${window.location.search}`)).toEqual(
      {
        filter: 'active',
        q: 'a b',
      },
    )
  })
})
