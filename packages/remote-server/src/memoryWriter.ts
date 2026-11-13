/**
 * `RemoteServer.memoryWriter`: a declared write landed over a memory backend's
 * rows, deciding what `foldkit-remote-drizzle`'s writer decides in its
 * statement, so a first run, a test or a Domain aggregate lands the same
 * writes with no database.
 */
import { Effect, Match, Option } from 'effect'
import {
  Entity,
  Expr,
  Operators,
  Query,
  Write,
  evaluate,
  supported,
  type AnyEntity,
  type EntityMember,
  type EntityRef,
  type MemoryOperators,
  type Operation,
  type Row,
} from 'foldkit-entity'
import { entityKey, refParts } from 'foldkit-remote'
import {
  DeleteOutcome,
  RemoteInvalid,
  RemoteServerError,
  RemoteTaken,
  RemoteUnmet,
  type EntityWriter,
  type MemoryStore,
  type WriteWhen,
} from './index.js'

/** What `RemoteServer.memoryWriter` is made with. */
export interface MemoryWriterOptions {
  /**
   * How the write's `when`, its computed fields and the Entity's invariants
   * run their primitive operators: the memory backend's own table, as a
   * Drizzle writer names its binding's. `Operators.kernel` when not given.
   */
  readonly operators?: MemoryOperators | undefined
}

/**
 * What a writer may run: a writer is given no viewer and no time, and one row,
 * so neither context term, and nothing that reaches another row.
 */
const writeOperations: ReadonlyArray<Operation> = supported.filter(
  operation => operation !== 'viewer' && operation !== 'now',
)

/** Two values as a store holds them, which are JSON: equal when they encode the same. */
const sameStored = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

/** `keys` of `row` it holds as its own: never `Object`'s of the same name. */
const picked = (
  row: Readonly<Record<string, unknown>>,
  keys: ReadonlyArray<string>,
): Readonly<Record<string, unknown>> =>
  Object.fromEntries(keys.filter(key => Object.hasOwn(row, key)).map(key => [key, row[key]]))

/** Each link as the store holds it: its ref key, or null for none. */
const linkRefs = (
  links: Readonly<Record<string, Option.Option<EntityRef>>>,
): Readonly<Record<string, string | null>> =>
  Object.fromEntries(
    Object.entries(links).map(([key, link]) => [
      key,
      Option.getOrNull(Option.map(link, ref => entityKey(ref.entity, ref.id))),
    ]),
  )

/** Each link as an invariant reads it: the id it points at, or null for none. */
const linkIds = (
  links: Readonly<Record<string, Option.Option<EntityRef>>>,
): Readonly<Record<string, string | null>> =>
  Object.fromEntries(
    Object.entries(links).map(([key, link]) => [
      key,
      Option.getOrNull(Option.map(link, ref => ref.id)),
    ]),
  )

/**
 * A writer of `entity`'s rows in `store` (a memory backend's), for
 * `RemoteServer.write`: an update lands while the row is at the revision it
 * `expect`s, holds its `when`, and the row it would leave keeps every
 * invariant, and moves the revision on by one; an insert lands while its id is
 * free and its row keeps the state invariants; a delete while the row is at
 * its revision and holds its `when`. Each refusal is the writer's own error,
 * which `RemoteServer.write` answers as the mutation's `Conflict`, `Unmet`,
 * `Invalid` or `Taken`. It holds no ledger, judges no rule that reads another
 * row, and removes, restricts or clears nothing a delete would take with it,
 * so `RemoteServer.write` and `GuardServer.writer` refuse, by name, a write or
 * a rule that needs one of those.
 *
 * ```ts
 * RemoteServer.memory({
 *   domain,
 *   rows,
 *   mutations: store => [RemoteServer.write(ReserveStock, RemoteServer.memoryWriter(store, Product))],
 * })
 * ```
 */
export const memoryWriter = <P>(
  store: MemoryStore,
  entity: AnyEntity,
  options: MemoryWriterOptions = {},
): EntityWriter<P> => {
  const operators = options.operators ?? Operators.kernel
  const invariants = Entity.invariants(entity)
  // An invariant reads the row after the write (`next`), which a query does not.
  const unrun = Expr.unsupported(
    invariants.map(held => held.predicate),
    { operations: [...writeOperations, 'next'], operators },
  )
  if (unrun.length > 0) {
    throw new Error(
      `[foldkit-remote-server] RemoteServer.memoryWriter: ${entity.name}'s invariants need ${unrun.join(', ')}, which this writer does not run`,
    )
  }
  // The rows keep a link as its ref key; a body and an invariant read the id it points at.
  const relations: Readonly<Record<string, EntityMember>> = entity.relations
  const links = Object.entries(relations).flatMap(([key, member]) =>
    member._tag === 'Relation' && member.cardinality === 'one' ? [key] : [],
  )
  const judged = (row: Readonly<Record<string, unknown>>): Row => {
    const read: Record<string, unknown> = { ...row }
    for (const key of links) {
      const ref = Object.hasOwn(row, key) ? row[key] : undefined
      if (typeof ref === 'string') read[key] = refParts(ref).id
    }
    return read
  }
  const clocked = new Set(
    Object.entries(entity.sets)
      .filter(([, set]) => set.value._tag === 'Now')
      .map(([field]) => field),
  )

  const stored = (id: string): Option.Option<Readonly<Record<string, unknown>>> =>
    Option.fromUndefinedOr(store.rows(entity.name).find(row => String(row['id']) === id))

  /** The first invariant the change breaks, as the writer refuses it; none when it keeps them. */
  const broken = (change: { readonly after: Row; readonly before?: Row }, id: string) =>
    Match.value(Entity.judgeAgainst(invariants, change, operators)).pipe(
      Match.tagsExhaustive({
        Valid: () => Effect.succeed(Option.none<RemoteInvalid>()),
        Invalid: ({ failures }) =>
          Effect.succeed(
            Option.map(
              Option.fromUndefinedOr(failures[0]),
              held =>
                new RemoteInvalid({
                  message: held.message,
                  rule: Option.some(held.id),
                  path: held.path,
                }),
            ),
          ),
        Undecided: ({ fields }) =>
          Effect.fail(
            new RemoteServerError({
              message: `${entity.name} ${id}: an invariant reads ${fields.join(', ')}, which the row does not hold`,
            }),
          ),
      }),
    )

  /** Whether the row holds the write's `when`, judged over it as it is. */
  const holds = (row: Readonly<Record<string, unknown>>, when: Option.Option<WriteWhen>) =>
    Option.match(when, {
      onNone: () => Effect.succeed(true),
      onSome: ({ body, input }) =>
        Effect.try({
          try: () => evaluate(body, input, [judged(row)], { operators }).length > 0,
          catch: error =>
            new RemoteServerError({
              message: `${entity.name}'s write precondition could not be judged: ${String(error)}`,
            }),
        }),
    })

  /** Whether `row` holds what a write set; a field set from its clock is stamped anew by a retry. */
  const holdsWritten = (
    row: Readonly<Record<string, unknown>>,
    written: Readonly<Record<string, unknown>>,
  ): boolean =>
    Object.entries(written).every(([key, value]) => clocked.has(key) || sameStored(row[key], value))

  const unmet = (id: string) =>
    new RemoteUnmet({ message: `${entity.name} ${id} does not hold what the write asks of it` })

  return {
    entity: entity.name,
    preconditions: true,
    increments: true,
    assignments: true,
    invariants: true,
    // One synchronous step reads and writes the row: no other write lands between.
    pins: true,
    operators,
    refuses: write => [
      ...Option.match(write.when, {
        onNone: () => [],
        onSome: body => {
          const missing = Query.unsupported(body, writeOperations, operators)
          return missing.length === 0
            ? []
            : [`its precondition needs ${missing.join(', ')}, which a memory writer does not run`]
        },
      }),
      ...write.assignments.flatMap(({ field, expr }) => {
        const missing = Expr.unsupported([expr], { operations: writeOperations, operators })
        return missing.length === 0
          ? []
          : [`its assignment to "${field.key}" needs ${missing.join(', ')}`]
      }),
    ],
    // Every row is the writer's to read; the answer names its id, as a source's read does.
    read: ({ id, fields }) =>
      Effect.succeed(Option.map(stored(id), row => picked(row, ['id', ...fields]))),
    update: ({ id, values, increments, assignments, links, expect, when }) =>
      Effect.gen(function* () {
        const found = stored(id)
        if (Option.isNone(found)) return Option.none()
        const row = found.value
        const written = { ...values, ...linkRefs(links) }
        const answer = (from: Readonly<Record<string, unknown>>) =>
          Option.some(
            picked(from, [
              ...Object.keys(values),
              ...Object.keys(increments),
              ...Object.keys(assignments),
              ...Object.keys(links),
              ...Option.match(expect, { onNone: () => [], onSome: ({ field }) => [field] }),
            ]),
          )
        // A row a revision on could be another's increment or computation: only the
        // write itself says it landed, since neither repeats without effect.
        const incrementing = Object.keys(increments).length + Object.keys(assignments).length > 0
        if (Option.isSome(expect) && !sameStored(row[expect.value.field], expect.value.revision)) {
          // One revision past the expected one and holding these values, this
          // write landed already and its answer was lost: a retry answers the
          // row rather than conflicting with itself.
          const { field, revision } = expect.value
          return !incrementing &&
            typeof revision === 'number' &&
            row[field] === revision + 1 &&
            holdsWritten(row, written)
            ? answer(row)
            : Option.none()
        }
        // A row already holding what this write sets is taken for a retry of one
        // that landed, and judged as a row, not as a change: writing it again
        // changes nothing. The Drizzle writer guesses the same.
        const retried =
          Object.keys(written).length > 0 && !incrementing && holdsWritten(row, written)
        if (!(yield* holds(row, when))) {
          if (retried) return answer(row)
          return yield* unmet(id)
        }
        const before = judged(row)
        // Amounts and computations read the row before the write, as a statement's do.
        const applied = Write.apply(
          before,
          { values: { ...values, ...linkIds(links) }, increments, assignments },
          { operators },
        )
        if (applied.unknown.length > 0) {
          return yield* new RemoteServerError({
            message: `${entity.name} ${id}: the write could not work out ${applied.unknown.join(', ')}`,
          })
        }
        const after = applied.row
        const breaks = yield* broken({ before, after }, id)
        if (Option.isSome(breaks)) {
          if (!retried) return yield* breaks.value
          const asRow = yield* broken({ after }, id)
          if (Option.isSome(asRow)) return yield* asRow.value
          return answer(row)
        }
        const moved = [...Object.keys(increments), ...Object.keys(assignments)]
        const next = {
          ...written,
          ...picked(after, moved),
          ...Option.match(expect, {
            onNone: () => ({}),
            onSome: ({ field }) => {
              const revision = row[field]
              return { [field]: typeof revision === 'number' ? revision + 1 : revision }
            },
          }),
        }
        store.write(entity.name, id, next)
        return answer({ ...row, ...next })
      }),
    insert: ({ id, values, links }) =>
      Effect.gen(function* () {
        // There is no row yet: the row it would make is its values, judged before it is written.
        const breaks = yield* broken({ after: { ...values, ...linkIds(links), id } }, id)
        if (Option.isSome(breaks)) return yield* breaks.value
        if (Option.isSome(stored(id))) {
          return yield* new RemoteTaken({ message: `${entity.name} ${id} is already taken` })
        }
        const row = { ...values, ...linkRefs(links) }
        store.write(entity.name, id, row)
        return row
      }),
    delete: ({ id, expect, when }) =>
      Effect.gen(function* () {
        const found = stored(id)
        if (Option.isNone(found)) return DeleteOutcome.Absent()
        const row = found.value
        if (Option.isSome(expect) && !sameStored(row[expect.value.field], expect.value.revision))
          return DeleteOutcome.Moved()
        if (!(yield* holds(row, when))) return yield* unmet(id)
        store.remove(entity.name, id)
        return DeleteOutcome.Deleted({ cascaded: [], cleared: [] })
      }),
  }
}
