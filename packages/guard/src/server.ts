/**
 * A guard set's read rules as `foldkit-remote-server`'s seams: an
 * `EntitySource.filter` from each member's Read rule, and `RemoteServer.memory`'s
 * `readable` and `filter` from the row's, and a check at startup that a server
 * applies them. A subpath, so the shared declaration the browser imports never
 * brings the server along.
 */
import { Effect, Option, Schema } from 'effect'
import type { AnyEntity } from 'foldkit-entity'
import type {
  EntityRecord,
  MemoryReadable,
  ReadPlan,
  ServerDefinition,
} from 'foldkit-remote-server'
import { attached } from './attach.js'
import { Condition } from './condition.js'
import type { Policy } from './index.js'
import { memberRules, rowRules } from './placed.js'

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
  filter: <User, R>(entity: AnyEntity, policy: Policy<User, R>) =>
    memberRules.add(
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
      policy,
      [entity.name],
    ),

  /**
   * `RemoteServer.memory`'s `readable` and `filter` for `entities`, the
   * Entities as `Guards.attach` returned them. A row's Read is decided per
   * stored row, an inherited Read by looking the related row up; an Entity
   * not listed is read by everyone.
   */
  memory: <User>(policy: Policy<User>, entities: ReadonlyArray<AnyEntity>) => ({
    readable: rowRules.add(
      (
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
      policy,
      entities.map(entity => entity.name),
    ),
    filter: Object.fromEntries(
      entities.map(entity => [entity.name, GuardServer.filter(entity, policy)] as const),
    ),
  }),

  /**
   * Checks, at startup, that `server` applies the guards of `entities`, the
   * Entities as `Guards.attach` returned them: each one's Source and each
   * query listing it apply its row's Read rules (`GuardDrizzle.visible`, or
   * `GuardServer.memory`), its Source applies its members' and relations'
   * (`GuardServer.filter`), all built from `policy`. A hand-written Source over
   * a guarded Entity would serve every row; this throws instead, naming each.
   *
   * ```ts
   * GuardServer.validate(Policy, { entities: [Todo, Project], domain: Data, server: Server })
   * ```
   */
  validate: <User, R>(
    policy: Policy<User, R>,
    config: {
      readonly entities: ReadonlyArray<AnyEntity>
      /** The Remote domain the server answers, for which Entity each query lists. */
      readonly domain: {
        readonly registry: { readonly queries: ReadonlyMap<string, { readonly Result: unknown }> }
      }
      readonly server: ServerDefinition<any, any>
    },
  ): void => {
    const problems = config.entities.flatMap(entity =>
      Option.match(attached(entity), {
        onNone: () => [],
        onSome: attachment => {
          const name = entity.name
          if (attachment.set !== policy.set) {
            return [`${name} carries the guards of ${attachment.set}, not ${policy.set}`]
          }
          // Every guarded Entity's, whether or not it has rules there yet: a rule
          // attached later is then applied, not served past.
          const source = Option.fromUndefinedOr(config.server.entities.get(name))
          const sourceProblems = Option.match(source, {
            onNone: () => [],
            onSome: ({ visible, filter }) => [
              ...(rowRules.has(visible, policy, name)
                ? []
                : [`${name}'s Source does not apply its Read rules`]),
              ...(memberRules.has(filter, policy, name)
                ? []
                : [`${name}'s Source does not apply its members' Read rules`]),
            ],
          })
          const queryProblems = [...config.domain.registry.queries].flatMap(
            ([queryName, query]) => {
              const listed = config.server.queries.get(queryName)
              return listed !== undefined &&
                lists(query.Result, name) &&
                !rowRules.has(listed.visible, policy, name)
                ? [`query ${queryName} lists ${name} without its Read rules`]
                : []
            },
          )
          return [...sourceProblems, ...queryProblems]
        },
      }),
    )
    if (problems.length > 0) {
      throw new Error(`[foldkit-guard] GuardServer.validate: ${problems.join('; ')}`)
    }
  },
}

/** Whether a query's result is a connection over `entity`. */
const lists = (result: unknown, entity: string): boolean =>
  typeof result === 'object' && result !== null && 'entity' in result && result.entity === entity
