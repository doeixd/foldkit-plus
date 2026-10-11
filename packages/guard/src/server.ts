/**
 * A guard set's read rules as `foldkit-remote-server`'s seams: an
 * `EntitySource.filter` from each member's Read rule, and `RemoteServer.memory`'s
 * `readable` and `filter` from the row's. A subpath, so the shared declaration
 * the browser imports never brings the server along.
 */
import { Effect, Option, Schema } from 'effect'
import type { AnyEntity } from 'foldkit-entity'
import type { EntityRecord, MemoryReadable, ReadPlan } from 'foldkit-remote-server'
import { Condition } from './condition.js'
import type { Policy } from './index.js'

const noMembers = (record: EntityRecord) => record

/** A ref key's two halves, `Entity:id`; `none` for anything else. */
const refOf = (value: unknown): Option.Option<{ readonly entity: string; readonly id: string }> => {
  if (typeof value !== 'string') return Option.none()
  const split = value.indexOf(':')
  return split <= 0
    ? Option.none()
    : Option.some({ entity: value.slice(0, split), id: value.slice(split + 1) })
}

export const GuardServer = {
  /**
   * An `EntitySource.filter` for `entity`: each requested member with a Read
   * rule is decided per record, omitted or redacted where the rule refuses.
   * The fields a rule reads are read too, so it can be decided.
   *
   * ```ts
   * RemoteServer.entity(Todo, { read, filter: GuardServer.filter(Todo, Policy) })
   * ```
   */
  filter:
    <User, R>(entity: AnyEntity, policy: Policy<User, R>) =>
    (
      principal: Option.Option<User>,
      fields: readonly string[],
    ): Effect.Effect<ReadPlan, never, R> =>
      Effect.map(policy.readMembers(entity, principal, fields), (members): ReadPlan => {
        if (members.length === 0) return { fields, apply: noMembers }
        const input = policy.inputOf(principal)
        const decided = members.map(member => ({
          ...member,
          // A redacted value is a decoded one; the record holds what the store holds.
          redacted:
            member.deny._tag === 'Redact'
              ? Option.some(
                  Schema.encodeSync(
                    (entity.members as Readonly<Record<string, { readonly schema: Schema.Top }>>)[
                      member.member
                    ]!.schema as unknown as Schema.Codec<unknown, unknown>,
                  )(member.deny.value),
                )
              : Option.none(),
        }))
        return {
          fields: [
            ...new Set([
              ...fields,
              ...members.flatMap(({ condition }) => Condition.members(condition)),
            ]),
          ],
          apply: record => {
            const values: Record<string, unknown> = { ...record.values }
            for (const { member, condition, redacted } of decided) {
              // Member rules carry no inherited Read: only a row's Read may inherit.
              if (Condition.holds(condition, record.values, input, () => false)) continue
              Option.match(redacted, {
                onNone: () => {
                  delete values[member]
                },
                onSome: value => {
                  values[member] = value
                },
              })
            }
            return { id: record.id, values }
          },
        }
      }),

  /**
   * `RemoteServer.memory`'s `readable` and `filter` for `entities`, the
   * Entities as `Guards.attach` returned them. A row's Read is decided per
   * stored row, an inherited Read by looking the related row up; an Entity
   * not listed is read by everyone.
   */
  memory: <User>(policy: Policy<User>, entities: ReadonlyArray<AnyEntity>) => ({
    readable: (
      principal: Option.Option<User>,
      row: (entity: string, id: string) => Option.Option<Readonly<Record<string, unknown>>>,
    ): Effect.Effect<MemoryReadable> =>
      Effect.map(
        Effect.forEach(entities, entity =>
          Effect.map(
            policy.readable(entity, principal),
            condition => [entity.name, condition] as const,
          ),
        ),
        (decided): MemoryReadable => {
          const conditions = new Map(decided)
          const input = policy.inputOf(principal)
          // `seen` stops a cycle of inherited Reads, which would otherwise never end.
          const holds = (
            entity: string,
            values: Readonly<Record<string, unknown>>,
            seen: ReadonlySet<string>,
          ): boolean => {
            const condition = conditions.get(entity)
            if (condition === undefined) return true
            return Condition.holds(condition, values, input, relation =>
              Option.match(refOf(values[relation]), {
                onNone: () => false,
                onSome: ref => {
                  const key = `${ref.entity}:${ref.id}`
                  if (seen.has(key)) return false
                  return Option.match(row(ref.entity, ref.id), {
                    onNone: () => false,
                    onSome: target => holds(ref.entity, target, new Set([...seen, key])),
                  })
                },
              }),
            )
          }
          return (entity, values) => holds(entity, values, new Set())
        },
      ),
    filter: Object.fromEntries(
      entities.map(entity => [entity.name, GuardServer.filter(entity, policy)] as const),
    ),
  }),
}
