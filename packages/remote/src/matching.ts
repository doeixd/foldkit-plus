/**
 * Running a query body against the rows the client already holds.
 *
 * local-execution-DESIGN phase 3. A connection's rows are edges the server
 * delivered, and until now nothing on the client ever evaluated a body — which
 * is why an optimistic insert has to guess between `prepend` and `append`, and
 * why `LivePolicy` exists to be told in advance what to do with a row nobody
 * could judge.
 *
 * This judges them. It is pure, it performs no I/O, and it reuses the reference
 * interpreter in `foldkit-entity` rather than reimplementing the semantics —
 * so a body means here exactly what it means on the server, checked by the same
 * conformance suite.
 *
 * **It answers "which of the rows I hold match", never "which rows match".**
 * Those are different questions and the difference is not recoverable from the
 * result, so it is in the shape: `matched` is what satisfied the body, and
 * `skipped` is what was held but could not be judged. A caller that knows it
 * holds the whole population — a connection terminal at both ends — is the one
 * that can turn this into a complete answer. Nothing here can.
 *
 * **It is not authorization.** On the server a compiled `where` is conjoined
 * with the binding's `visible` rule. There is no `visible` here, and this is
 * safe only because the client holds only rows the server already released to
 * it. A local filter is not an access decision.
 */
import { Schema } from 'effect'
import { Query as Relational } from 'foldkit-entity'
import { evaluate, type Row } from 'foldkit-entity'
import type { QueryDescriptor } from './query.js'
import type { EntityKey, EntityStore } from './store.js'

/**
 * What the rows the client holds had to say about a body.
 *
 * `skipped` is the honest half. A row missing a field the body reads cannot be
 * judged — it is neither a match nor a non-match — and dropping it silently
 * would turn "I could not tell" into "no". Naming it lets a caller decide:
 * fetch the field, ask the server, or say the answer is partial.
 */
export interface Judged {
  /** Keys of the rows that satisfy the body, in the order the body asks for. */
  readonly matched: ReadonlyArray<EntityKey>
  /** Keys of rows held but missing a field the body reads, so not judged either way. */
  readonly skipped: ReadonlyArray<EntityKey>
}

/**
 * The fields of the body's own Entity that a row must have for the body to be
 * decidable about it — its predicates and its ordering terms.
 *
 * `id` is never among them: it is the key, so it is known for every row in the
 * store whether or not anything fetched it as a field.
 */
const decidableOn = (body: Parameters<typeof Relational.dependencies>[0]): ReadonlyArray<string> =>
  Relational.dependencies(body)
    .fields.filter(field => field.entity === body.entity.name && field.key !== 'id')
    .map(field => field.key)

export interface MatchingOptions {
  /**
   * Judge only these keys. Without it every row of the body's Entity in the
   * store is a candidate, which is what a filter over a loaded list wants; with
   * it, a caller narrows to a connection's own edges.
   */
  readonly among?: ReadonlyArray<EntityKey> | undefined
}

/**
 * The rows of `descriptor`'s Entity that the store holds and the body matches.
 *
 * The input is given **decoded**, as an application writes it, and encoded here
 * through the descriptor's own `Input` codec. That is deliberate and is the
 * whole reason this takes a descriptor rather than a bare body: a store holds
 * wire values, so an input has to be in that space to be compared against them,
 * and handing an interpreter a decoded value is a mistake **no runtime error
 * catches** — the reference interpreter answers "no rows", which reads exactly
 * like a correct answer. Doing it here means a caller cannot get it wrong.
 *
 * Literals in the body are deliberately *not* encoded. A literal written in
 * domain terms is already broken against the server, which binds it to a column
 * the same way; accepting it here would make the client quietly more permissive
 * than the thing it has to agree with.
 */
export const matching = <Name extends string, Input>(
  store: EntityStore,
  descriptor: QueryDescriptor<Name, Input, unknown>,
  input: Input,
  options: MatchingOptions = {},
): Judged => {
  const body = descriptor.body
  if (body === undefined) {
    throw new Error(
      `[foldkit-remote] Remote.matching: query "${descriptor.name}" carries no body, so there is nothing to judge rows against. Declare it with Query.define.`,
    )
  }

  const entity = body.entity.name
  const prefix = `${entity}:`
  const needed = decidableOn(body)

  const candidates = options.among ?? Object.keys(store).filter(key => key.startsWith(prefix))

  const rows: Array<Row & { readonly __key: EntityKey }> = []
  const skipped: EntityKey[] = []

  for (const key of candidates) {
    const entry = store[key]
    // A row the store does not hold is not skipped — it was never a candidate.
    // A tombstone is not a row at all.
    if (entry === undefined || entry.tombstone) continue
    if (!key.startsWith(prefix)) continue
    if (needed.some(field => !entry.present.has(field))) {
      skipped.push(key)
      continue
    }
    rows.push({ ...entry.values, id: key.slice(prefix.length), __key: key })
  }

  const encoded = Schema.encodeSync(descriptor.Input)(input) as Readonly<Record<string, unknown>>
  const matched = evaluate(body, encoded, rows).map(
    row => (row as { readonly __key: EntityKey }).__key,
  )

  return { matched, skipped }
}
