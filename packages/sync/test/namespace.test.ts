/**
 * The `Sync` namespace groups the package's own exports; it is not a second
 * implementation. Every entry must be the exported function itself, and every
 * bare spelling must keep working.
 */
import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  DocumentId,
  LocalSequence,
  OpId,
  ReplicaId,
  Sequence,
  Sync,
  createPresence,
  createPresenceHub,
  defineSync,
  documentId,
  forApplication,
  indexedDb,
  layerFromPromise,
  layerLoopback,
  layerSocket,
  localSequence,
  loopbackPresenceChannel,
  lwwRegister,
  mount,
  nativeSocket,
  opId,
  openLwwClock,
  replicaId,
  sequence,
  servePresence,
  serveSocket,
  socketPresenceChannel,
  syncMetrics,
  toPromise,
} from '../src/index.js'

const delegations = [
  ['forApplication', Sync.forApplication, forApplication],
  ['define', Sync.define, defineSync],
  ['mount', Sync.mount, mount],
  ['metrics', Sync.metrics, syncMetrics],
  ['indexedDb', Sync.indexedDb, indexedDb],
  ['transport.socket', Sync.transport.socket, layerSocket],
  ['transport.loopback', Sync.transport.loopback, layerLoopback],
  ['transport.fromPromise', Sync.transport.fromPromise, layerFromPromise],
  ['transport.toPromise', Sync.transport.toPromise, toPromise],
  ['transport.serve', Sync.transport.serve, serveSocket],
  ['transport.nativeSocket', Sync.transport.nativeSocket, nativeSocket],
  ['presence.make', Sync.presence.make, createPresence],
  ['presence.hub', Sync.presence.hub, createPresenceHub],
  ['presence.serve', Sync.presence.serve, servePresence],
  ['presence.socketChannel', Sync.presence.socketChannel, socketPresenceChannel],
  ['presence.loopbackChannel', Sync.presence.loopbackChannel, loopbackPresenceChannel],
  ['lww.register', Sync.lww.register, lwwRegister],
  ['lww.openClock', Sync.lww.openClock, openLwwClock],
] as const satisfies ReadonlyArray<readonly [string, unknown, unknown]>

it.each(delegations)('Sync.%s is the bare export itself', (_path, namespaced, bare) => {
  expect(namespaced).toBe(bare)
})

const brands = [
  ['DocumentId', DocumentId, documentId, 'todos', ''],
  ['ReplicaId', ReplicaId, replicaId, 'tab-a', ''],
  ['OpId', OpId, opId, 'tab-a:1', ''],
  ['Sequence', Sequence, sequence, 0, -1],
  ['LocalSequence', LocalSequence, localSequence, 1, 0],
] as const satisfies ReadonlyArray<
  readonly [
    string,
    { make: (value: never) => unknown },
    (value: never) => unknown,
    unknown,
    unknown,
  ]
>

describe('a branded id', () => {
  it.each(brands)(
    '%s.make and its decoder accept and reject the same values',
    (_name, schema, decode, valid, invalid) => {
      const make = schema.make as (value: unknown) => unknown
      const decoder = decode as (value: unknown) => unknown
      expect(make(valid)).toBe(decoder(valid))
      expect(() => make(invalid)).toThrow()
      expect(() => decoder(invalid)).toThrow()
    },
  )
})

it('the bare spellings still build a contract', () => {
  const contract = defineSync({
    documentId: documentId('todos'),
    message: Schema.Struct({ _tag: Schema.Literal('Renamed'), title: Schema.String }),
    shared: Schema.Struct({ titles: Schema.Array(Schema.String) }),
    empty: { titles: [] },
    durable: () => true,
    replay: shared => shared,
  })
  expect(contract.documentId).toBe('todos')
  expect(contract.journalContract().empty()).toEqual({ titles: [] })
})
