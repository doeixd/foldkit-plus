import { Effect, Schema } from 'effect'
import type { KeyValueStore } from 'effect/persistence'
import { Mirror } from 'foldkit-mirror'
import type { Runtime } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import { Message } from './message.js'
import { CanvasMirror, initialModel } from './mirror.js'
import { Model } from './model.js'
import { subscriptions } from './subscription.js'
import { update } from './update.js'
import { view } from './view/index.js'

// FLAGS

export const Flags = Schema.Struct({
  canvas: Schema.Record(Schema.String, Schema.String),
})
export type Flags = typeof Flags.Type

/** The stored canvas, read before `init` as upstream's Flags read it, so the first frame shows it. */
export const flags: Effect.Effect<Flags, never, KeyValueStore.KeyValueStore> =
  CanvasMirror.restore.effect.pipe(Effect.map(({ keys }) => ({ canvas: keys })))

// INIT

/** The stored canvas over the defaults, sized by the stored grid. */
export const init: Runtime.ApplicationInit<Model, Message, Flags> = flags => {
  const restored = Mirror.bootstrap(initialModel, CanvasMirror.bootstrap(flags.canvas))
  return {
    model: modifyFields(restored, { gridSize: () => restored.history.present.length }),
  }
}

export { Message, Model, subscriptions, update, view }
