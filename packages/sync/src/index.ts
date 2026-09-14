/**
 * `foldkit-sync` — a local-first replica of a shared Foldkit projection.
 *
 * The application's Message union and update function stay authoritative: sync
 * wraps them rather than introducing a second reducer. The replica owns the
 * local outbox, optimistic projection, and reconciliation; a durable server
 * journal provides authoritative order.
 *
 * `Sync` is the namespace: `Sync.forApplication`, `Sync.mount`,
 * `Sync.transport.socket`. Ids are branded schemas, so they construct through
 * `DocumentId.make('todos')`. Every name is also exported on its own.
 */
import { indexedDb } from './indexedDb.js'
import { lwwRegister, openLwwClock } from './lww.js'
import { forApplication } from './make.js'
import { mount } from './mount.js'
import {
  createPresence,
  createPresenceHub,
  loopbackPresenceChannel,
  servePresence,
  socketPresenceChannel,
} from './presence.js'
import { defineSync, syncMetrics, type Sync as SyncContract } from './sync.js'
import {
  layerFromPromise,
  layerLoopback,
  layerSocket,
  nativeSocket,
  serveSocket,
  toPromise,
} from './transport.js'

/**
 * The contract `Sync.define` and `Sync.forApplication(App).make` produce: the
 * wire codecs, the server journal's contract, and `openReplica`.
 *
 * This is the type; `Sync` is also the value namespace below, the way
 * `Effect.Effect` is both.
 */
export type Sync<Message, Shared> = SyncContract<Message, Shared>

/** The package's public surface, grouped. Each entry is the exported function itself. */
export const Sync = {
  /** Derives a sync contract from a Foldkit application: `Sync.forApplication(App).make({…})`. */
  forApplication,
  /** The protocol primitive, for a client with no Foldkit application to derive from. */
  define: defineSync,
  /** Runs a Foldkit application over an open replica with one reducer. */
  mount,
  /** Counters and a histogram an application can scrape. */
  metrics: syncMetrics,
  /** The only storage adapter: one IndexedDB database per document/replica. */
  indexedDb,

  /** The `Transport` service's layers, and the bridges to and from a promise client. */
  transport: {
    /** A reconnecting WebSocket client layer. */
    socket: layerSocket,
    /** An in-process layer, for tests and single-process demos. */
    loopback: layerLoopback,
    /** Wraps the promise-based client the replica already speaks. */
    fromPromise: layerFromPromise,
    /** Bridges the service back to that promise client. */
    toPromise,
    /** The server side of one accepted socket connection. */
    serve: serveSocket,
    /** The default socket factory: the platform `WebSocket`. */
    nativeSocket,
  },

  /** An ephemeral, TTL'd peer registry, deliberately outside the durable log. */
  presence: {
    make: createPresence,
    /** Broadcasts presence updates among connected peers, on the server. */
    hub: createPresenceHub,
    /** Serves presence frames on an accepted socket, stamping the connection's identity. */
    serve: servePresence,
    socketChannel: socketPresenceChannel,
    loopbackChannel: loopbackPresenceChannel,
  },

  /** Last-writer-wins registers (experimental): a per-field merge on logical time. */
  lww: {
    register: lwwRegister,
    /** The durable counter a stamp is allocated from, before dispatch. */
    openClock: openLwwClock,
  },
}

export { indexedDb, type Storage } from './indexedDb.js'
export { mount, type MountOptions, type MountUrl, type Mounted } from './mount.js'
export {
  forApplication,
  type ApplicationSync,
  type AuthorizePolicy,
  type AuthorizeRequest,
  type DefinedSync,
  type FragmentMessages,
  type MakeOptions,
  type MsgOf,
  type PolicyJournalContract,
  type SyncFragment,
} from './make.js'
export {
  DocumentId,
  LocalSequence,
  OpId,
  ReplicaId,
  Sequence,
  documentId,
  localSequence,
  opId,
  replicaId,
  sequence,
} from './ids.js'
export {
  CheckpointRegressionError,
  CommittedOrderError,
  ForeignAcknowledgementError,
  ForeignRejectionError,
  InvalidExchangeError,
  InvalidOutboxError,
  InvalidReplicaHistoryError,
  ReplayError,
  ReplicaClosedError,
  StorageError,
  UnsupportedClockVersionError,
  UnsupportedReplicaVersionError,
  WrongReplicaStorageError,
  type ReplicaError,
} from './errors.js'
export { lwwRegister, openLwwClock, type LwwClock, type LwwClockState } from './lww.js'
export {
  createPresence,
  createPresenceHub,
  loopbackPresenceChannel,
  servePresence,
  socketPresenceChannel,
  type Presence,
  type PresenceChannel,
  type PresenceHub,
  type PresenceOptions,
  type PresencePeer,
  type PresenceUpdate,
} from './presence.js'
export {
  layerFromPromise,
  layerLoopback,
  layerSocket,
  nativeSocket,
  serveSocket,
  toPromise,
  Transport,
  TransportError,
  type ExchangeFrame,
  type ExchangeReply,
  type SocketLike,
  type SocketOptions,
  type TransportShape,
} from './transport.js'
export {
  defineSync,
  syncMetrics,
  type Checkpoint,
  type CommittedOperation,
  type Exchange,
  type JournalContract,
  type Operation,
  type Replica,
  type ReplicaSnapshot,
  type ReplicaState,
  type ReplicaStatus,
  type SyncDefinition,
  type TransportClient,
} from './sync.js'
