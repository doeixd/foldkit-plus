/**
 * `verifyPredictions`' `Gap`: the fields a mutation's answer left out that the client
 * showed while it was pending. Releasing the layer leaves such a field to be
 * read again, so the row reads `Loading` for a frame, or nothing at all where
 * no Selection reads it. A check for development and tests, which changes
 * nothing it is given.
 */
import type { Option } from 'effect'
import { PredictionPart, predictionMismatch, type PredictionMismatch } from './diagnostics.js'
import type { OptimisticState } from './optimistic.js'
import type { Requirement } from './requirement.js'
import { entityKey, type EntityStore } from './store.js'

/**
 * Each row the request showed (its layer's patches, its insert overlays and
 * the ones its answer confirmed) with the fields shown on it: those the layer
 * patched and those `read` asks of it, minus what the store now holds.
 *
 * `before` is the optimistic state the answer settled, `after` the one it left;
 * `visible` is the store as reads see it after; `read` is what the active
 * Surfaces ask of it after, as planned.
 */
export const answerGaps = (
  requestId: string,
  mutation: Option.Option<string>,
  before: OptimisticState,
  after: OptimisticState,
  visible: EntityStore,
  read: ReadonlyArray<Requirement>,
): ReadonlyArray<PredictionMismatch> => {
  const shown = new Map<
    string,
    { readonly entity: string; readonly id: string; readonly fields: Set<string> }
  >()
  const show = (entity: string, id: string, fields: ReadonlyArray<string>) => {
    const key = entityKey(entity, id)
    const row = shown.get(key) ?? { entity, id, fields: new Set<string>() }
    for (const field of fields) row.fields.add(field)
    shown.set(key, row)
  }
  for (const layer of before.layers) {
    if (layer.id !== requestId) continue
    for (const patch of layer.patches)
      show(patch.entity, patch.id, [
        ...Object.keys(patch.values),
        ...Object.keys(patch.adds ?? {}),
        ...Object.keys(patch.computes ?? {}),
      ])
  }
  const confirmed = `confirmed:${requestId}`
  for (const overlay of [...before.overlays, ...after.overlays]) {
    if (overlay.position === 'remove') continue
    if (overlay.id !== requestId && overlay.id !== confirmed) continue
    for (const edge of overlay.edges) show(edge.ref.entity, edge.ref.id, [])
  }
  const asked = new Set<string>()
  for (const requirement of read) {
    const key = entityKey(requirement.entity, requirement.id)
    if (!shown.has(key)) continue
    asked.add(key)
    show(requirement.entity, requirement.id, requirement.fields)
  }
  const gaps: Array<PredictionMismatch> = []
  for (const [key, row] of shown) {
    const entry = visible[key]
    // A row nothing holds or reads any longer is not shown: a temporary id
    // the answer replaced with the server's.
    if (entry === undefined ? !asked.has(key) : entry.tombstone) continue
    const fields = [...row.fields].filter(
      field => entry === undefined || !(entry.present.has(field) || entry.unavailable.has(field)),
    )
    if (fields.length > 0)
      gaps.push(
        predictionMismatch(
          PredictionPart.Gap({ requestId, mutation, entity: row.entity, id: row.id, fields }),
        ),
      )
  }
  return gaps
}
