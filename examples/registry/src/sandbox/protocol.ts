/**
 * What a pane and the sandbox's host say to each other. A pane sends the host
 * a port for each conversation: one that carries the Sync socket's frames for
 * a device, and one that carries Remote's JSON requests, each answered with
 * its id.
 */
import { Schema } from 'effect'

/** A device's Sync socket. */
export const SyncOpening = Schema.TaggedStruct('SyncOpening', { device: Schema.String })
/** Remote's requests. */
export const RemoteOpening = Schema.TaggedStruct('RemoteOpening', {})
/** What a pane posts to the host, with the port it hands over. Decoded on arrival. */
export const Opening = Schema.Union([SyncOpening, RemoteOpening])
export type Opening = typeof Opening.Type

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

export interface RemoteRequest {
  readonly id: number
  readonly request: string
}

export interface RemoteAnswer {
  readonly id: number
  readonly body: unknown
}
