/**
 * What a device's page and the sandbox's host say to each other: the two
 * conversations a page opens with the host, and the status a device's frame
 * tells the card around it.
 */
import { Schema } from 'effect'
import { SharedHost } from 'foldkit-primitives/net'

/** A device's Sync socket. */
export const SyncOpening = Schema.TaggedStruct('SyncOpening', { device: Schema.String })
/** Remote's requests. */
export const RemoteOpening = Schema.TaggedStruct('RemoteOpening', {})
/** What opens a conversation, decoded by the host on arrival. */
export const Opening = Schema.Union([SyncOpening, RemoteOpening])
export type Opening = typeof Opening.Type

/** The sandbox's one server, shared by every tab and frame of it. */
export const RegistryHost = SharedHost.define({ name: 'foldkit-registry', opening: Opening })

/**
 * Where a device's edits stand, as its frame tells the page around it, for
 * the card's dot and badge. Decoded on arrival, like any message.
 */
export const DeviceStatus = Schema.TaggedStruct('DeviceStatus', {
  device: Schema.String,
  offline: Schema.Boolean,
  waiting: Schema.Number,
  unreachable: Schema.Boolean,
})
export type DeviceStatus = typeof DeviceStatus.Type
