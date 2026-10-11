/**
 * A guard set's read rules as `foldkit-remote-server`'s seams: an
 * `EntitySource.filter` from each member's Read rule, and `RemoteServer.memory`'s
 * `readable` and `filter` from the row's, and a check at startup that a server
 * applies them. A subpath, so the shared declaration the browser imports never
 * brings the server along.
 */
import { Effect, Match, Option, Schema } from 'effect'
import type { AnyEntity } from 'foldkit-entity'
import {
  RemoteServer,
  type EntityRecord,
  type EntityWriter,
  type MemoryReadable,
  type ReadPlan,
  type ServerDefinition,
} from 'foldkit-remote-server'
import { attached } from './attach.js'
import { Condition, type RowRule } from './condition.js'
import type { Deny } from './attach.js'
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
   * `writer` with `entity`'s write rules checked before each write lands, for
   * `RemoteServer.write`. An update or a delete reads the row first under
   * the writer's own `read` (its Source's read rule): a row the writer may not
   * see is refused as one that is not there, and a delete of it changes
   * nothing. Then the row's rule for the command must hold over the row (an
   * update's over the row as it would be after it too, so a write cannot move
   * a row out of its writer's reach), each member it sets must allow setting
   * it, and each relation it points elsewhere must allow the unlink and the
   * link. A create's rules hold over the values it proposes, where a field the
   * create leaves unset matches no guard, not even one for an empty value. A refusal is
   * `Forbidden`, with the sentence an `explain` gave; the write never runs.
   *
   * ```ts
   * RemoteServer.write(EditTodo, GuardServer.writer(Todo, Policy, writer(Db.Todo)))
   * ```
   */
  writer: <User, R, RW>(
    entity: AnyEntity,
    policy: Policy<User, R>,
    writer: EntityWriter<Option.Option<User>, RW>,
  ): EntityWriter<Option.Option<User>, R | RW> => {
    const read = writer.read
    if (read === undefined) {
      throw new Error(
        `[foldkit-guard] GuardServer.writer: ${entity.name}'s writer reads no row as its writer may see it; bind it with a visible rule (GuardDrizzle.visible)`,
      )
    }
    const holds = (
      rule: { readonly condition: Condition },
      values: Readonly<Record<string, unknown>>,
      principal: Option.Option<User>,
    ) => Condition.holds(rule.condition, values, policy.inputOf(principal), () => false)
    /** Fails with the first rule of `rules` that does not hold over `values`. */
    const require = (
      rules: ReadonlyArray<{ readonly condition: Condition; readonly deny: Deny }>,
      values: Readonly<Record<string, unknown>>,
      principal: Option.Option<User>,
    ) =>
      Option.match(Option.fromUndefinedOr(rules.find(rule => !holds(rule, values, principal))), {
        onNone: () => Effect.void,
        onSome: rule => Effect.fail(refused(rule.deny)),
      })
    type Links = Readonly<
      Record<string, Option.Option<{ readonly entity: string; readonly id: string }>>
    >
    /** Each relation `links` points: its rules for unlinking and for linking a row. */
    const linkRules = (principal: Option.Option<User>, links: Links) =>
      Effect.forEach(Object.entries(links), ([relation, target]) =>
        Effect.map(
          Effect.all([
            policy.linkable(entity, principal, relation, 'Unlink'),
            policy.linkable(entity, principal, relation, 'Link'),
          ]),
          ([unlink, link]) => ({ relation, now: linkKey(target), unlink, link }),
        ),
      )
    /** The rules a change from what `before` holds to what each relation now points at must meet. */
    const linking = (
      rules: ReadonlyArray<{
        readonly relation: string
        readonly now: string | null
        readonly unlink: Option.Option<RowRule>
        readonly link: Option.Option<RowRule>
      }>,
      before: Readonly<Record<string, unknown>>,
    ): ReadonlyArray<RowRule> =>
      rules.flatMap(({ relation, now, unlink, link }) => {
        const was = before[relation] ?? null
        if (was === now) return []
        return [
          ...(was === null ? [] : Option.toArray(unlink)),
          ...(now === null ? [] : Option.toArray(link)),
        ]
      })
    const ruleOf = (
      rules: ReadonlyArray<{
        readonly unlink: Option.Option<RowRule>
        readonly link: Option.Option<RowRule>
      }>,
    ) => rules.flatMap(({ unlink, link }) => [...Option.toArray(unlink), ...Option.toArray(link)])
    const fieldsOf = (
      rules: ReadonlyArray<{ readonly condition: Condition }>,
      more: Iterable<string>,
    ) => [
      ...new Set([
        'id',
        ...more,
        ...rules.flatMap(({ condition }) => Condition.members(condition)),
      ]),
    ]
    return {
      entity: writer.entity,
      read,
      update: context =>
        Effect.gen(function* () {
          const { principal, values, links } = context
          const row = yield* policy.writable(entity, principal, 'Update')
          const members = yield* policy.writeMembers(
            entity,
            principal,
            Object.keys(values),
            'Update',
          )
          const relating = yield* linkRules(principal, links)
          const fields = fieldsOf([row, ...members, ...ruleOf(relating)], Object.keys(links))
          const current = yield* read({ id: context.id, fields, principal })
          if (Option.isNone(current)) return yield* Effect.fail(refused(row.deny))
          const before = current.value
          const relations = linking(relating, before)
          const after = {
            ...before,
            ...values,
            ...Object.fromEntries(
              Object.entries(links).map(([relation, link]) => [relation, linkKey(link)]),
            ),
          }
          yield* require([row, ...members, ...relations], before, principal)
          yield* require([row], after, principal)
          return yield* writer.update(context)
        }),
      insert: context =>
        Effect.gen(function* () {
          const { principal, values, links } = context
          const row = yield* policy.writable(entity, principal, 'Create')
          const members = yield* policy.writeMembers(
            entity,
            principal,
            Object.keys(values),
            'Create',
          )
          const relations = linking(yield* linkRules(principal, links), {})
          const proposed = {
            ...values,
            id: context.id,
            ...Object.fromEntries(
              Object.entries(links).map(([relation, link]) => [relation, linkKey(link)]),
            ),
          }
          const rules = [row, ...members, ...relations]
          // A field the create leaves unset matches no guard, `isNull` included:
          // the create never said it is empty.
          const ruled = rules.flatMap(({ condition }) => Condition.members(condition))
          const unset = Object.fromEntries(
            ruled
              .filter(field => !Object.hasOwn(proposed, field))
              .map(field => [field, matchesNothing]),
          )
          yield* require(rules, { ...unset, ...proposed }, principal)
          return yield* writer.insert(context)
        }),
      delete: context =>
        Effect.gen(function* () {
          const row = yield* policy.writable(entity, context.principal, 'Delete')
          const current = yield* read({
            id: context.id,
            fields: fieldsOf([row], []),
            principal: context.principal,
          })
          // Hidden or gone, the writer sees no row: there is nothing of theirs to delete.
          if (Option.isNone(current)) return 'absent' as const
          yield* require([row], current.value, context.principal)
          return yield* writer.delete(context)
        }),
    }
  },

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

/** A refused write as the client receives it: the sentence an `explain` gave, or none. */
const refused = (deny: Deny) =>
  Match.valueTags(deny, {
    Explain: ({ reason }) => RemoteServer.forbid(reason),
    Forbidden: () => RemoteServer.forbid(),
    NotFound: () => RemoteServer.forbid(),
    Omit: () => RemoteServer.forbid(),
    Redact: () => RemoteServer.forbid(),
  })

/** A value no guard's operand equals, and that is not null: what an unset field reads as. */
const matchesNothing = Object.freeze({})

/** A link's value as a row holds it: the ref's key, or `null` for none. */
const linkKey = (link: Option.Option<{ readonly entity: string; readonly id: string }>) =>
  Option.match(link, { onNone: () => null, onSome: ref => `${ref.entity}:${ref.id}` })

/** Whether a query's result is a connection over `entity`. */
const lists = (result: unknown, entity: string): boolean =>
  typeof result === 'object' && result !== null && 'entity' in result && result.entity === entity
