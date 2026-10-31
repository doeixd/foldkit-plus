// @vitest-environment jsdom
/** The URL store, against jsdom's location and history. */
import { Effect, Option, Schema, Stream } from 'effect'
import { fromString } from 'foldkit/url'
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

describe('urlChanged', () => {
  const here = () => `${window.location.pathname}${window.location.search}`

  it('takes the echo of a write that lands after newer edits as no change', async () => {
    at('/todos')
    Filters.reduce(initial, here())
    await write({ filter: 'all', q: 'j' })
    const firstEcho = here()
    await write({ filter: 'all', q: 'jo' })
    const secondEcho = here()
    // Both writes answered after a third edit: neither echo puts an older text back.
    const typed: Model = { filter: 'all', q: 'joh' }
    expect(Filters.urlChanged(typed, firstEcho)).toBe(typed)
    expect(Filters.urlChanged(typed, secondEcho)).toBe(typed)
  })

  it('reads a navigation, and a return to a URL whose echo already came', async () => {
    at('/todos')
    Filters.reduce(initial, here())
    await write({ filter: 'active', q: '' })
    const written = here()
    const shown: Model = { filter: 'active', q: '' }
    expect(Filters.urlChanged(shown, written)).toBe(shown)
    expect(Filters.urlChanged(shown, '/todos')).toEqual(initial)
    // Forward again to the entry the write made: its echo was answered once already.
    expect(Filters.urlChanged(initial, written)).toEqual(shown)
  })

  it('keeps an unwritten edit through a URL that leaves its keys as they were', async () => {
    at('/todos?filter=active')
    Filters.reduce(initial, here())
    const edited: Model = { filter: 'all', q: 'x' }
    // Another mirror's write, or a path change: these keys stand as last read.
    expect(Filters.urlChanged(edited, '/other?filter=active&page=2')).toBe(edited)
  })

  it('keeps an unwritten edit through another key’s echo after its own write', async () => {
    at('/todos')
    Filters.reduce(initial, here())
    await write({ filter: 'all', q: 'j' })
    const written: Model = { filter: 'all', q: 'j' }
    expect(Filters.urlChanged(written, here())).toBe(written)
    const typed: Model = { filter: 'all', q: 'jo' }
    expect(Filters.urlChanged(typed, `${here()}&page=2`)).toBe(typed)
  })

  it('is how the wiring and Mirror.routing read a URL Message', async () => {
    at('/todos')
    Filters.reduce(initial, here())
    await write({ filter: 'all', q: 'j' })
    const url = Option.getOrThrow(fromString(window.location.href))
    const typed: Model = { filter: 'all', q: 'jo' }
    const routed = Filters.wiring('UrlChanged').route!(typed, { _tag: 'UrlChanged', url })
    expect(Option.map(routed, step => step.model)).toEqual(Option.some(typed))
    await write({ filter: 'all', q: 'jo' })
    const echo = Option.getOrThrow(fromString(window.location.href))
    const routing = Mirror.routing({
      mirrors: [Filters],
      urlChanged: 'UrlChanged',
      init: () => ({ model: initial }),
      update: (model: Model) => ({ model }),
      routing: {
        // No link is followed here.
        onUrlRequest: () => ({ _tag: 'UrlChanged' as const, url: echo }),
        onUrlChange: changed => ({ _tag: 'UrlChanged' as const, url: changed }),
      },
    })
    const newer: Model = { filter: 'all', q: 'joh' }
    expect(routing.update(newer, { _tag: 'UrlChanged', url: echo }).model).toBe(newer)
  })

  it('awaits no echo across a starting URL', async () => {
    at('/todos')
    Filters.reduce(initial, here())
    await write({ filter: 'all', q: 'j' })
    const written = here()
    // A runtime started again: the write it would have heard back is not its own.
    at('/todos')
    Filters.reduce(initial, here())
    expect(Filters.urlChanged(initial, written)).toEqual({ filter: 'all', q: 'j' })
  })
})
