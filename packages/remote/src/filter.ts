/**
 * `foldkit-remote/filter`: the rows of a loaded list a body matches, judged in
 * the page (#378). An entry of its own, so a page that never filters keeps
 * none of the relational evaluator it runs.
 */
import { QueryEvaluateError } from 'foldkit-entity'
import { Capability, visibleOf } from './capability.js'
import { hasNext, hasPrevious, isGapped } from './connection.js'
import type {
  ModelOfDomain,
  QueryInput,
  QueryProjection,
  Registered,
  RemoteDomain,
} from './index.js'
import { innerOf } from './inner.js'
import { matching, type Judged, type Matched } from './matching.js'
import type { QueryDescriptor } from './query.js'
import { stableStringify } from './query.js'
import { assertRegistered } from './registered.js'
import { readRow } from './rowRead.js'
import { relationOf } from './selection.js'
import { entityKey } from './store.js'

type AnyDomain = RemoteDomain<any, any, any, any, any>

/** The query names a domain registers. */
type QueryNames<Domain> =
  Domain extends RemoteDomain<any, any, any, infer Queries, any>
    ? Queries[number] extends QueryDescriptor<infer Name, any, any>
      ? Name
      : never
    : never

/**
 * The rows of a loaded list that a body matches, decoded as the list decodes
 * them — a filter that asks the server nothing.
 *
 * **It filters a list; it does not run a query.** That distinction is what
 * keeps it honest. "Which rows match" would need to know that the list holds
 * every row the body could match, which is predicate containment and is
 * deliberately not built. "Which rows *of this list* match" is decidable from
 * what is already here, and is what a search box over a loaded page actually
 * wants.
 *
 * `complete` says whether the answer is about the whole list: every edge
 * judged, and the connection terminal at both ends. An incomplete answer is
 * not wrong — it is about less than the caller may have meant, which is why
 * it is said rather than left for a view to assume.
 *
 * Creates no connection, so there is nothing new to retain and nothing new to
 * fetch. The server stays authoritative for which rows exist.
 */
export const filtered = <
  Domain extends AnyDomain,
  Value,
  Name extends string,
  Input,
  Q extends QueryDescriptor<any, any, any>,
>(
  domain: Domain,
  model: ModelOfDomain<Domain>,
  over: QueryProjection<ModelOfDomain<Domain>, Value, Name, Input>,
  by: Q & Registered<Q['name'], QueryNames<Domain>, 'Query'>,
  input: QueryInput<Q>,
): Matched<Value> => {
  assertRegistered(domain, 'Query', domain.registry.queries, by.name)
  // A filter over a different Entity can never match anything, and would
  // otherwise answer "I checked the whole list and found nothing" — a
  // confident wrong answer rather than a refusal.
  const filters = by.body?.entity.name
  if (filters !== undefined && filters !== over.selection.entity) {
    throw new Error(
      `Remote: query "${by.name}" is over "${filters}", but the list is of "${over.selection.entity}", so it cannot filter it`,
    )
  }
  const inner = innerOf<ModelOfDomain<Domain>>(domain)
  const { operators } = domain
  const remote = domain.store.get(model)
  const connection = remote.connections[over.ref.identity]
  const visible = visibleOf(domain[Capability], remote, operators)
  const edges = connection === undefined ? [] : inner.shown(remote, over.ref.identity, connection)
  const among = edges.map(edge => entityKey(edge.ref.entity, edge.ref.id))
  let judged: Judged
  try {
    judged = matching(visible, by, input, { among, operators, context: inner.context(model) })
  } catch (error) {
    // An input the reference interpreter refuses (a search holding NUL) is
    // one the server refuses too: nothing here can be said about the list.
    // Thrown on, it would end the `update` that asked.
    if (error instanceof QueryEvaluateError) return { items: [], complete: false }
    throw error
  }
  const relation = relationOf(over.selection)
  const relationKey = stableStringify(relation)

  const items: Array<Value> = []
  let assembledAll = true
  for (const key of judged.matched) {
    const row = readRow(visible, key, relation, relationKey, over.selection.schema)
    // A matching row whose selected fields are not all here cannot be shown.
    // It is not dropped from the truth, only from the list: `complete` says
    // the answer is about less than the whole.
    if (row === undefined || row._tag === 'Failed') {
      assembledAll = false
      continue
    }
    items.push(row.value)
  }

  return {
    items,
    // Whole only if every edge was judged, every match could be shown, and
    // the list itself is all there. `hasNext`/`hasPrevious` read the outer
    // boundaries alone, so `isGapped` is the third question: a connection
    // paged from both ends is `Terminal` at both and still missing its
    // middle.
    complete:
      judged.skipped.length === 0 &&
      assembledAll &&
      connection !== undefined &&
      !isGapped(connection) &&
      !hasNext(connection) &&
      !hasPrevious(connection),
  }
}
