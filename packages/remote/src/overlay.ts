/**
 * `foldkit-remote/overlay`: operations shown over the store with no request
 * behind them, for a preview of a change nobody has made (#378). An entry of
 * its own, so a page that never previews keeps none of the code that shows one.
 */
import { Capability, type Capabilities } from './capability.js'
import { installLayers } from './layers.js'
import { overlaysOf, type RemoteMessage, type RemoteModel } from './model.js'
import type { OptimisticOperation } from './optimistic.js'

/** What `overlay`, `lift` and `overlays` use of a domain: `Remote.make`'s value is one. */
export interface OverlaidDomain<AppModel> {
  readonly [Capability]: Capabilities
  readonly store: { get(model: AppModel): RemoteModel }
  reduce(model: AppModel, message: RemoteMessage): AppModel
}

/**
 * Shows operations over the store with no request behind them, as a mutation's
 * `optimistic` ones show while it is in flight: every Selection and view draws
 * them. They stay until `lift`; showing an id again replaces what it showed.
 * Called from `update`. A read of an entity only overlays show, lacking a field
 * it selects, is `Failed` (`Overlaid`): nothing will fetch that field.
 */
export const overlay = <AppModel>(
  domain: OverlaidDomain<AppModel>,
  model: AppModel,
  id: string,
  optimistic: ReadonlyArray<OptimisticOperation>,
): AppModel => {
  installLayers(domain[Capability])
  return domain.reduce(model, { _tag: 'OverlayShown', id, optimistic })
}

/** Lifts what `overlay` showed under this id. Lifting nothing returns the same Model. */
export const lift = <AppModel>(
  domain: OverlaidDomain<AppModel>,
  model: AppModel,
  id: string,
): AppModel => {
  installLayers(domain[Capability])
  return domain.reduce(model, { _tag: 'OverlayLifted', id })
}

/**
 * The ids `overlay` shows now, in the order they are drawn, a later one over
 * an earlier: what a caller that overlays from its own state reconciles
 * against.
 */
export const overlays = <AppModel>(
  domain: OverlaidDomain<AppModel>,
  model: AppModel,
): ReadonlyArray<string> => overlaysOf(domain.store.get(model))
