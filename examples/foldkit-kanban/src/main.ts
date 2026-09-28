import { Effect, Schema } from 'effect'
import type { KeyValueStore } from 'effect/unstable/persistence'
import type { Runtime } from 'foldkit'
import { Mirror } from 'foldkit-mirror'

import { Message } from './message.js'
import { BoardMirror, initialModel } from './mirror.js'
import { Model } from './model.js'
import { subscriptions } from './subscription.js'
import { update } from './update.js'
import { view } from './view/index.js'

// FLAGS

export const Flags = Schema.Struct({
  restored: Mirror.Message,
})
export type Flags = typeof Flags.Type

/** The stored board, read before `init` as upstream's Flags read it, so the first frame shows it. */
export const flags: Effect.Effect<Flags, never, KeyValueStore.KeyValueStore> =
  BoardMirror.restore.effect.pipe(Effect.map(restored => ({ restored })))

// INIT

export const init: Runtime.ApplicationInit<Model, Message, Flags> = flags => ({
  model: BoardMirror.reduce(initialModel, flags.restored),
})

export { Message, Model, subscriptions, update, view }
