/**
 * `foldkit-guard/sync`: a guard set's rules on `foldkit-sync`'s edits to a
 * server-owned Entity. A cell edit is a write to a member of a row, through
 * the journal instead of a Remote mutation, so it answers to the same rules.
 *
 * Writes are checked in two halves, by where each can run. What needs only
 * the principal (`always`, the row's and each member's `Update` principal
 * guards) is the journal's `authorize`, under its lock. What reads the row is
 * the exchange's `admit`, before the journal sees the edit, reading the row
 * through the Entity's guarded Source.
 *
 * Reads are one audience: every replica that opens a document receives every
 * edit committed to it. So a document names its `readers`, who alone may open
 * it, and is refused where it is declared when an edit could carry a value to
 * someone the Entity's Read rules would not show it to.
 */
import { Effect, Match, Option, Schema } from 'effect'
import type { AnyEntity } from 'foldkit-entity'
import type { EntitySource } from 'foldkit-remote-server'
import type { AuthorizeDecision, Operation } from 'foldkit-sync'
import { attached, isAnyone, restricts, surfaceOf, type Deny } from './attach.js'
import { Condition } from './condition.js'
import type { Policy, PrincipalGuard } from './index.js'

/** One cell's change, as `foldkit-sync/entity`'s `Change` carries it. */
export interface CellChange {
  readonly id: unknown
  readonly member: string
  readonly value: unknown
}

/** A document of edits to an Entity's members, and who may open it. */
export interface GuardedDocument<User> {
  readonly entity: AnyEntity
  readonly members: ReadonlyArray<string>
  readonly readers: ReadonlyArray<PrincipalGuard<User>>
}

const refusal = (deny: Deny): AuthorizeDecision =>
  Match.valueTags(deny, {
    Explain: ({ reason }): AuthorizeDecision => ({ allowed: false, reason }),
    Forbidden: () => false,
    NotFound: () => false,
    Omit: () => false,
    Redact: () => false,
  })

/** The first rule of `rules` that does not hold over `values`, as the decision it makes. */
const first = (
  rules: ReadonlyArray<{ readonly condition: Condition; readonly deny: Deny }>,
  holds: (condition: Condition) => boolean,
): AuthorizeDecision =>
  Option.match(Option.fromUndefinedOr(rules.find(({ condition }) => !holds(condition))), {
    onNone: () => true,
    onSome: ({ deny }) => refusal(deny),
  })

const isNever = (condition: Condition) => condition === Condition.never

/** The schema of `member` when the document edits it: none for a name it does not own. */
const memberOf = <User>(
  entity: AnyEntity,
  document: GuardedDocument<User>,
  member: string,
): Option.Option<Schema.Codec<unknown, unknown>> => {
  const fields = entity.fields as Readonly<Record<string, { readonly schema: Schema.Top }>>
  // `document` refused a member that is not a field, so one it names is one.
  return document.members.includes(member)
    ? Option.some(fields[member]!.schema as unknown as Schema.Codec<unknown, unknown>)
    : Option.none()
}

export const GuardSync = {
  /**
   * A document of edits to `edits.entity`'s `edits.members`, opened by any of
   * `readers`. Refused here, not discovered later: a member that is not a
   * field of the Entity, a member with a Read rule
   * of its own (its value would reach a reader the rule hides it from), a
   * reader the row's Read rule does not name (it would receive edits to rows
   * it cannot read), a guarded row with no readers, and `always` rules that
   * read the row (no reader could be shown to pass them).
   *
   * ```ts
   * const Edits = GuardSync.document(ProductEdits, { readers: [G.isStaff] })
   * ```
   */
  document: <User>(
    edits: { readonly entity: AnyEntity; readonly members: ReadonlyArray<string> },
    options: { readonly readers: ReadonlyArray<PrincipalGuard<User>> },
  ): GuardedDocument<User> => {
    const { entity, members } = edits
    const fail = (why: string): never => {
      throw new Error(`[foldkit-guard] GuardSync.document of ${entity.name}: ${why}`)
    }
    for (const member of members) {
      if (!Object.hasOwn(entity.fields, member)) fail(`${member} is not a field of it`)
    }
    Option.map(attached(entity), attachment => {
      for (const member of members) {
        if (restricts(surfaceOf(attachment, { _tag: 'Member', member, interaction: 'Read' })))
          fail(`${member} has a Read rule of its own, and every reader receives every edit`)
      }
      const read = surfaceOf(attachment, { _tag: 'Row', interaction: 'Read' })
      if (Option.isSome(read) && restricts(read)) {
        if (options.readers.length === 0)
          fail('its rows have a Read rule, so the document names its readers')
        for (const reader of options.readers) {
          const named = read.value.rules.some(
            rule =>
              rule._tag === 'PrincipalGuard' &&
              rule.name === reader.name &&
              rule.set === reader.set,
          )
          if (!named) fail(`${reader.name} is not in its rows' Read rule, so may not read them`)
        }
      }
      if (attachment.always.some(rule => rule._tag !== 'PrincipalGuard' && !isAnyone(rule)))
        fail('its `always` rules read the row, which no reader can be shown to pass')
    })
    return Object.freeze({ entity, members, readers: options.readers })
  },

  /**
   * Whether `principal` may open the document: any of its readers (anyone,
   * when it names none), and every `always` rule of the Entity. For
   * `journalExchange`'s `opens`.
   */
  opens: <User>(
    policy: Policy<User>,
    document: GuardedDocument<User>,
    principal: Option.Option<User>,
  ): Effect.Effect<boolean> => {
    const always = Option.match(attached(document.entity), {
      onNone: () => [],
      onSome: ({ always }) => always.filter(rule => rule._tag === 'PrincipalGuard'),
    }) as ReadonlyArray<PrincipalGuard<User>>
    const decided = (guards: ReadonlyArray<PrincipalGuard<User>>) =>
      Effect.forEach(guards, guard =>
        Effect.map(policy.decide(guard, { principal, interaction: 'Read' }), d => d === true),
      )
    return Effect.map(
      Effect.all([decided(document.readers), decided(always)]),
      // No readers named: its rows have no Read rule, so it is everyone's.
      ([readers, rules]) =>
        (document.readers.length === 0 || readers.some(Boolean)) && rules.every(Boolean),
    )
  },

  /**
   * The journal's `authorize` for a Message of cell edits: refuses one whose
   * row's `Update` or a changed member's `Update` the principal guards settle
   * as refused, with an `explain`'s sentence. It runs under the journal's
   * lock, so it reads no row (`admit` does), and its bodies must not suspend.
   *
   * ```ts
   * authorize: { EditedProducts: GuardSync.authorize(Policy, Edits) }
   * ```
   */
  authorize:
    <User>(policy: Policy<User>, document: GuardedDocument<User>) =>
    (request: {
      readonly principal: Option.Option<User>
      readonly message: { readonly changes: ReadonlyArray<CellChange> }
    }): AuthorizeDecision => {
      const { principal, message } = request
      const row = Effect.runSync(policy.writable(document.entity, principal, 'Update'))
      if (isNever(row.condition)) return refusal(row.deny)
      const members = Effect.runSync(
        policy.writeMembers(
          document.entity,
          principal,
          [...new Set(message.changes.map(change => change.member))],
          'Update',
        ),
      )
      return first(members, condition => !isNever(condition))
    },

  /**
   * The exchange's `admit` for `principal`: each row an operation's edits
   * name is read through `source` (the Entity's guarded Source) and must let
   * the principal update it, as it is and as it would be after all of the
   * operation's edits to it, and each changed member must too. A row the
   * principal cannot see is refused, as is an edit to a member outside the
   * document or a value its member cannot encode. `changesOf` reads the edits
   * from an operation; one with none is admitted.
   *
   * The row is read from the table, which takes an edit only once its exchange
   * settles: an edit that changes what a rule reads lets another, admitted
   * before it lands, be judged against the row as it was.
   */
  admit:
    <User, R>(
      policy: Policy<User>,
      document: GuardedDocument<User>,
      options: {
        readonly principal: Option.Option<User>
        readonly source: EntitySource<Option.Option<User>, R>
        readonly changesOf: (operation: Operation) => ReadonlyArray<CellChange>
      },
    ) =>
    (operation: Operation): Effect.Effect<AuthorizeDecision, unknown, R> =>
      Effect.gen(function* () {
        const { principal, source } = options
        const changes = options.changesOf(operation)
        if (changes.length === 0) return true
        const { entity } = document
        // A member is a client's word: only the document's own, by own key.
        const encoded = Option.all(
          changes.map(change =>
            Option.flatMap(memberOf(entity, document, change.member), schema =>
              Option.map(Schema.encodeUnknownOption(schema)(change.value), value => ({
                id: String(change.id),
                member: change.member,
                value,
              })),
            ),
          ),
        )
        if (Option.isNone(encoded)) return false
        const row = yield* policy.writable(entity, principal, 'Update')
        const members = yield* policy.writeMembers(
          entity,
          principal,
          [...new Set(changes.map(change => change.member))],
          'Update',
        )
        const input = policy.inputOf(principal)
        const fields = [
          ...new Set([
            'id',
            ...[row, ...members].flatMap(({ condition }) => Condition.members(condition)),
          ]),
        ]
        const holdsOver = (values: Readonly<Record<string, unknown>>) => (condition: Condition) =>
          Condition.holds(condition, values, input, () => false, policy.operators)
        // Every edit to one row is judged together: two may each keep it in reach, and both not.
        const byRow = new Map<string, Record<string, unknown>>()
        for (const { id, member, value } of encoded.value) {
          byRow.set(id, { ...byRow.get(id), [member]: value })
        }
        for (const [id, edits] of byRow) {
          const records = yield* source.read({ ids: [id], fields, principal })
          const current = Option.fromUndefinedOr(records.find(record => record.id === id)?.values)
          if (Option.isNone(current)) return refusal(row.deny)
          const changed = new Set(Object.keys(edits))
          const before = first(
            [row, ...members.filter(({ member }) => changed.has(member))],
            holdsOver(current.value),
          )
          if (before !== true) return before
          const moved = first([row], holdsOver({ ...current.value, ...edits }))
          if (moved !== true) return moved
        }
        return true
      }),
}
