/**
 * The live ledger is bounded (#273): `live`, `streams` and `gaps` are keyed by
 * stream, and a long session that opens many streams kept every one of them.
 * Which streams the active Surfaces hold is not in the Model (retention roots
 * merge every Surface's requirements, so the per-entry stream keys are gone),
 * so the ledger keeps the streams most recently heard from, as `failed` does.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity as DomainEntity } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Remote, isTombstone, type RemoteMessage } from '../src/index.js'

const Post = DomainEntity.define('Post', Schema.Struct({ id: Schema.String, body: Schema.String }))
const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({ model: App.model.remote, entities: [Post] })

const down = { _tag: 'RemoteLiveError', message: 'down' } as const
const broken = (stream: string): RemoteMessage => ({
  _tag: 'ReadFailed',
  requests: [],
  error: down,
  stream,
})
const patched = (stream: string, cursor: number): RemoteMessage => ({
  _tag: 'LiveReceived',
  stream,
  event: {
    _tag: 'EntityPatched',
    ref: { entity: 'Post', id: 'p1' },
    values: { body: 'live' },
    changed: ['body'],
    cursor,
  },
  now: 1,
})

const counts = (model: Model) => ({
  live: Object.keys(model.remote.live).length,
  streams: Object.keys(model.remote.streams).length,
  gaps: model.remote.gaps.size,
})

const keys = Array.from({ length: 500 }, (_, i) => `Post:p${i}:body`)

describe('The live ledger', () => {
  it('keeps a bounded number of streams, however many were opened', () => {
    const model = keys
      .flatMap(stream => [broken(stream), patched(stream, 1)])
      .reduce(Data.reduce, { remote: Remote.initial })
    const kept = counts(model)

    expect(kept.live).toBeLessThanOrEqual(256)
    expect(kept.streams).toBeLessThanOrEqual(256)
    expect(model.remote.live[keys.at(-1)!]?.cursor).toBe(1)
    expect(model.remote.live[keys[0]!]).toBeUndefined()
  })

  it('keeps a stream heard from again, and drops the one heard from longest ago', () => {
    const opened = keys
      .slice(0, 256)
      .map(stream => patched(stream, 1))
      .reduce(Data.reduce, { remote: Remote.initial })
    const heard = [patched(keys[0]!, 2), patched(keys[256]!, 1)].reduce(Data.reduce, opened)

    expect(heard.remote.live[keys[0]!]?.cursor).toBe(2)
    expect(heard.remote.live[keys[1]!]).toBeUndefined()
  })

  // A dropped stream has no cursor, which once read as a stream with no
  // baseline yet, so its next event was applied whatever it skipped (#289).
  it('meets the next event of a stream it dropped as a gap, which restarts it', () => {
    const opened = keys
      .slice(0, 257)
      .map(stream => patched(stream, 1))
      .reduce(Data.reduce, { remote: Remote.initial })
    expect(opened.remote.live[keys[0]!]).toBeUndefined()

    const next = Data.reduce(opened, {
      _tag: 'LiveReceived',
      stream: keys[0]!,
      event: { _tag: 'EntityDeleted', ref: { entity: 'Post', id: 'p1' }, cursor: 3 },
      now: 2,
    })

    expect(next.remote.gaps.has(keys[0]!)).toBe(true)
    expect(next.remote.streams[keys[0]!]?.restarts).toBe(1)
    expect(isTombstone(next.remote.entities, 'Post:p1')).toBe(false)
  })

  it('applies the first event of a stream opened from the start', () => {
    const model = Data.reduce({ remote: Remote.initial }, patched(keys[0]!, 1))
    expect(model.remote.live[keys[0]!]?.cursor).toBe(1)
    expect(model.remote.gaps.size).toBe(0)
  })

  it('keeps no gap for a stream whose health it dropped', () => {
    const model = keys.map(broken).reduce(Data.reduce, { remote: Remote.initial })
    expect(counts(model).gaps).toBeLessThanOrEqual(256)
    for (const stream of model.remote.gaps) expect(model.remote.streams[stream]).toBeDefined()
  })
})
