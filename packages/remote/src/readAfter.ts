/**
 * Read-after tokens (#544), what a read-only domain does without (#378): only
 * a write's answer holds a row to a token, so a Mutation the domain registers
 * installs this. Without it a read carries no token and waits on no row, and
 * an answer writes all it names but the rows the server says it is behind on
 * (`readAfterIn`).
 */
import { Option, type Schema } from 'effect'
import type { Install, ReadAfterCapability } from './capability.js'
import { noRows, rowsOf, writeRead } from './model.js'
import { waitingOf, withTokens } from './plan.js'
import type { Requirement } from './requirement.js'
import {
  behindAgain,
  clearFloors,
  entityKey,
  pastFloor,
  setFloors,
  type EntityKey,
  type EntityStore,
} from './store.js'
import type { ReadBatchResult, RowToken } from './wire.js'

/**
 * What an answer to a read may say of the rows held to a read-after token
 * (`EntityEntry.floor`). A row the read carried its token for and the server
 * read at it (not named in `behind`), or one answered at a newer revision than
 * held (`pastFloor`), is `confirmed`: the answer writes it and its floor ends.
 * Every other floored row the answer names is `held`: it was asked without
 * the token, at another one, or the server's read model is behind it, so the
 * answer may be older than the write, and writes nothing.
 * A row named in `behind` is held whether it has a floor or not, and one asked
 * at its floor is `waiting`: asked again after a wait.
 */
const answeredAt = (
  store: EntityStore,
  requests: ReadonlyArray<Requirement>,
  result: Schema.Schema.Type<typeof ReadBatchResult>,
  sent: ReadonlyArray<Schema.Schema.Type<typeof RowToken>> | undefined,
) => {
  const tokens = new Map((sent ?? []).map(row => [entityKey(row.entity, row.id), row.token]))
  const behind = rowsOf(result.behind)
  // A row the server could not read at its token is no evidence it is gone, floored or not.
  const held = new Set<EntityKey>(behind)
  const confirmed = new Set<EntityKey>()
  const waiting = new Set<EntityKey>()
  const revisions = new Map(
    result.entities.map(row => [entityKey(row.entity, row.id), row.revision] as const),
  )
  for (const ref of [...requests, ...result.entities, ...result.settled]) {
    const key = entityKey(ref.entity, ref.id)
    const floor = store[key]?.floor
    if (floor === undefined) continue
    if (tokens.get(key) !== floor && !pastFloor(store[key], revisions.get(key))) held.add(key)
    else if (behind.has(key)) {
      held.add(key)
      waiting.add(key)
    } else confirmed.add(key)
  }
  return { held: held.size === 0 ? noRows : held, confirmed, waiting }
}

export const readAfter: ReadAfterCapability = {
  withTokens,
  waiting: waitingOf,
  read: (store, requests, result, now, after) => {
    const { held, confirmed, waiting } = answeredAt(store, requests, result, after)
    return {
      held,
      store: behindAgain(
        clearFloors(writeRead(store, requests, result, now, held), confirmed),
        waiting,
        now,
      ),
    }
  },
  hold: (store, after) =>
    setFloors(
      store,
      after.rows.map(row => ({ key: entityKey(row.entity, row.id), token: after.token })),
    ),
}

/** Installs the read-after capability; a Mutation's install does. */
export const installReadAfter: Install = capabilities => {
  capabilities.readAfter = Option.some(readAfter)
}
