/**
 * The body capability (#378): what a query's body does on the client. A read
 * of a list with a body also reads what the body places rows by, news of a
 * row it holds moves it or takes it out, and a write's answer is judged by it.
 * `Query.define`'s descriptor carries it, so a page whose lists have no body
 * keeps none of the relational evaluator it runs.
 */
import { Option } from 'effect'
import { Query as Relational } from 'foldkit-entity'
import type { BodyCapability, Install } from './capability.js'
import { edgesOf, visibleOf } from './capability.js'
import type { Connection } from './connection.js'
import { Impact, changesOf, impactOn, type HeldConnection } from './impact.js'
import { placedHeld } from './placing.js'
import { entityKey } from './store.js'

const placedFields: BodyCapability['placedFields'] = (body, encoded, operators) =>
  Relational.placement(body, encoded, { operators })._tag === 'Placeable'
    ? Relational.dependencies(body).fields.map(field => field.key)
    : []

/**
 * The loaded lists with what the server said of rows they hold placed: a read
 * or a live patch that changes a held row's ordering or filtered field moves
 * it, or takes it out, as a mutation's answer does. A list it cannot place
 * stands as it is, as a read is no write: its own refetch or live stream says
 * otherwise. Only a value the client held before counts, so a row's first read
 * judges nothing.
 */
const news: BodyCapability['news'] = (lists, remote, patches, before, context) => {
  const held = patches.map(patch => {
    const values = before[entityKey(patch.entity, patch.id)]?.values ?? {}
    return {
      ...patch,
      values: Object.fromEntries(
        Object.entries(patch.values).filter(([field]) => Object.hasOwn(values, field)),
      ),
    }
  })
  const changes = changesOf({ entities: held }, before)
  const placed: Record<string, Connection> = {}
  if (changes.length === 0) return placed
  for (const [identity, pages] of Object.entries(remote.connections)) {
    const after = placedHeld(lists, identity, pages, changes, remote.entities, context)
    if (after !== pages) placed[identity] = after
  }
  return placed
}

/**
 * The loaded connections as a write left them: each judged by its body
 * against the store as the write left it, a change it can place placed in its
 * pages, and one it cannot invalidated for its read entry to fetch.
 */
const answer: BodyCapability['answer'] = (
  capabilities,
  lists,
  remote,
  answered,
  before,
  context,
) => {
  const placed: Record<string, Connection> = {}
  const invalidated: Array<string> = []
  const changes = changesOf(answered, before)
  if (changes.length === 0) return { placed, invalidated }
  // A row the answer itself put in or took out of a list is where the server
  // says; every other change to that list's rows is judged as anywhere.
  const named = new Map<string, Set<string>>()
  for (const change of answered.connections ?? []) {
    const keys = named.get(change.connection) ?? new Set<string>()
    keys.add(change.edge.key)
    named.set(change.connection, keys)
  }
  const visible = visibleOf(capabilities, remote, lists.operators)
  for (const identity of Object.keys(remote.connections)) {
    const keys = named.get(identity)
    const judged =
      keys === undefined
        ? changes
        : changes.filter(change => !keys.has(entityKey(change.entity, change.id)))
    if (judged.length === 0) continue
    const query = lists.queryOf(identity)
    if (Option.isNone(query)) continue
    const original = remote.connections[identity]!
    // Each change is judged against the pages the one before it left. What the
    // list holds is read once: a change is of a row of its own, judged against
    // the store as the whole answer left it.
    const holds = new Set(
      edgesOf(capabilities, remote, identity, original).map(edge =>
        entityKey(edge.ref.entity, edge.ref.id),
      ),
    )
    let pages = original
    let invalid = false
    for (const change of judged) {
      const held: HeldConnection = { ...query.value, connection: pages, holds }
      const after = Impact.$match(impactOn(held, visible, change, lists.operators, context), {
        Kept: () => Option.some(pages),
        Placed: ({ connection }) => Option.some(connection),
        Invalidated: () => Option.none<Connection>(),
      })
      if (Option.isNone(after)) {
        invalid = true
        break
      }
      pages = after.value
    }
    if (invalid) invalidated.push(identity)
    else if (pages !== original) placed[identity] = pages
  }
  return { placed, invalidated }
}

export const bodies: BodyCapability = { placedFields, news, answer }

/** Installs what a query's body does on the client. */
export const installBodies: Install = capabilities => {
  capabilities.bodies = Option.some(bodies)
}
