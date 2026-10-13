/**
 * A guard set's read rules as `foldkit-remote-server`'s seams: an
 * `EntitySource.filter` from each member's Read rule, and `RemoteServer.memory`'s
 * `readable` and `filter` from the row's, and a check at startup that a server
 * applies them. A subpath, so the shared declaration the browser imports never
 * brings the server along.
 */
import { Effect, Match, Option, Schema } from 'effect'
import { Query, type AnyEntity, type AnyQuery } from 'foldkit-entity'
import type { MutationDescriptor, RemoteForbidden } from 'foldkit-remote'
import {
  RemoteServer,
  RemoteServerError,
  type EntityRecord,
  type EntitySource,
  type EntityWriter,
  type MutationOutcome,
  type MutationRefused,
  type MutationSource,
  type MemoryReadable,
  type ReadPlan,
  type ServerDefinition,
} from 'foldkit-remote-server'
import { attached, readRowsRuled, readRuled, type Deny, type InteractionKey } from './attach.js'
import { Condition, type RowRule } from './condition.js'
import type { Policy } from './index.js'
import type { MayAnswer } from './may.js'
import { ME, type MeEntity } from './me.js'
import { memberRules, rowRules, writeRules } from './placed.js'

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
   * `Guards.me`'s Source: the one row, `me`, as the asker is, with `may`
   * answered by `policy`. `signedIn` is whether the server answered as
   * someone; `key` is their `key`. Any other id is no row.
   *
   * ```ts
   * RemoteServer.make({ entities: [GuardServer.me(Me, Policy), …] })
   * ```
   */
  me: <User, R>(
    entity: MeEntity,
    policy: Policy<User, R>,
  ): EntitySource<Option.Option<User>, R> => ({
    ...RemoteServer.entity<Option.Option<User>, R>(entity, {
      read: ({ ids, principal }) =>
        Effect.succeed(
          ids
            .filter(id => id === ME)
            .map(id => ({
              id,
              values: {
                signedIn: Option.isSome(principal),
                // Encoded, as a Source answers: `null` for a visitor.
                key: Option.match(principal, {
                  onNone: () => null,
                  onSome: policy.key,
                }),
              },
            })),
        ),
      filter: GuardServer.filter(entity, policy),
    }),
    // Its Read rule as this Source applies it: only the asker's own row,
    // which `Guards.me` lets anyone read. One per call: the registry is keyed
    // by it, and another call is for another Policy.
    visible: rowRules.add(Object.freeze({ reads: 'the asker’s own row' }), policy, [entity]),
  }),

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
        Effect.map(
          Effect.all([
            policy.readMembers(entity, principal, fields),
            // `may` is answered here, where the row is read as its principal sees it.
            asksMay(entity, fields)
              ? Effect.map(mayOf(entity, policy, principal), Option.some)
              : Effect.succeed(Option.none<MayPlan>()),
          ]),
          ([members, may]): ReadPlan => {
            if (members.length === 0 && Option.isNone(may)) return { fields, apply: noMembers }
            const input = policy.inputOf(principal)
            const decided = members.map(member => ({
              ...member,
              // A redacted value is a decoded one; the record holds what the store holds.
              redacted:
                member.deny._tag === 'Redact'
                  ? Option.some(
                      Schema.encodeSync(
                        (
                          entity.members as Readonly<
                            Record<string, { readonly schema: Schema.Top }>
                          >
                        )[member.member]!.schema as unknown as Schema.Codec<unknown, unknown>,
                      )(member.deny.value),
                    )
                  : Option.none(),
            }))
            return {
              fields: [
                ...new Set([
                  ...fields,
                  ...members.flatMap(({ condition }) => Condition.members(condition)),
                  ...Option.match(may, { onNone: () => [], onSome: ({ fields }) => fields }),
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
                Option.map(may, ({ answer }) => {
                  values.may = answer(record.values)
                })
                return { id: record.id, values }
              },
            }
          },
        ),
      policy,
      [entity],
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
      entities,
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
   * `presets` are fields a create takes from who is asking, never from the
   * client (`ownerId: user => user.id`): set before the rules are checked, so
   * a rule over them holds of the creator. A visitor has nothing to preset
   * from, and a create whose input sets a preset field is a mistake of the
   * server's, refused.
   *
   * ```ts
   * RemoteServer.write(EditTodo, GuardServer.writer(Todo, Policy, writer(Db.Todo)))
   * ```
   */
  writer: <E extends AnyEntity, User, R, RW>(
    entity: E,
    policy: Policy<User, R>,
    writer: EntityWriter<Option.Option<User>, RW>,
    options: {
      readonly presets?: {
        readonly [K in keyof E['fields']]?: (user: User) => E['fields'][K]['schema']['Type']
      }
    } = {},
  ): EntityWriter<Option.Option<User>, R | RW> => {
    const presets = Object.entries(options.presets ?? {}).map(([field, preset]) => {
      const declared = Object.hasOwn(entity.fields, field)
        ? (entity.fields as Readonly<Record<string, { readonly schema: Schema.Top }>>)[field]
        : undefined
      if (declared === undefined) {
        throw new Error(
          `[foldkit-guard] GuardServer.writer: ${entity.name} has no field "${field}" to preset`,
        )
      }
      const encode = Schema.encodeUnknownSync(
        declared.schema as unknown as Schema.Codec<unknown, unknown>,
      )
      return { field, value: (user: User) => encode((preset as (user: User) => unknown)(user)) }
    })
    if (writer.entity !== entity.name) {
      throw new Error(
        `[foldkit-guard] GuardServer.writer: ${entity.name}'s rules over a writer for ${writer.entity}`,
      )
    }
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
    /**
     * The rules a change from what each relation was linked to, to what it now
     * points at, must meet; none `before` is a create, which unlinks nothing.
     * Where `exact` is false, `links` are the row as its writer sees it, where
     * a link to a row hidden from them reads as none: a relation seen unlinked
     * may be linked after all, so changing it unlinks too.
     */
    const linking = (
      rules: ReadonlyArray<{
        readonly relation: string
        readonly now: string | null
        readonly unlink: Option.Option<RowRule>
        readonly link: Option.Option<RowRule>
      }>,
      before: Option.Option<{
        readonly links: Readonly<Record<string, unknown>>
        readonly exact: boolean
      }>,
    ): ReadonlyArray<RowRule> =>
      rules.flatMap(({ relation, now, unlink, link }) =>
        Option.match(before, {
          onNone: () => (now === null ? [] : Option.toArray(link)),
          onSome: ({ links, exact }) => {
            const was = links[relation] ?? null
            if (was === now && (exact || was !== null)) return []
            return [
              ...(was === null && exact ? [] : Option.toArray(unlink)),
              ...(now === null ? [] : Option.toArray(link)),
            ]
          },
        }),
      )
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
    // What an answer shows: the row as the writer may see it, members ruled.
    const memberRead = GuardServer.filter(entity, policy)
    const guarded: EntityWriter<Option.Option<User>, R | RW> = {
      entity: writer.entity,
      read: ({ id, fields, principal }) =>
        seenRow(
          { filter: memberRead },
          seen => read({ id, fields: seen, principal }),
          principal,
          fields,
          id,
        ),
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
          const linked = Object.keys(links)
          const stored =
            writer.linked === undefined || linked.length === 0
              ? Option.none()
              : yield* writer.linked({ id: context.id, relations: linked })
          const relations = linking(
            relating,
            Option.some(
              Option.match(stored, {
                onNone: () => ({ links: before, exact: false }),
                onSome: links => ({ links, exact: true }),
              }),
            ),
          )
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
      insert: given =>
        Effect.gen(function* () {
          const preset = presets.find(({ field }) => Object.hasOwn(given.values, field))
          if (preset !== undefined) {
            return yield* new RemoteServerError({
              message: `${entity.name}'s "${preset.field}" is preset by the server; the input may not set it`,
            })
          }
          if (presets.length > 0 && Option.isNone(given.principal)) {
            return yield* Effect.fail(RemoteServer.forbid())
          }
          const context = Option.match(given.principal, {
            onNone: () => given,
            onSome: user => ({
              ...given,
              values: {
                ...given.values,
                ...Object.fromEntries(presets.map(({ field, value }) => [field, value(user)])),
              },
            }),
          })
          const { principal, values, links } = context
          const row = yield* policy.writable(entity, principal, 'Create')
          const members = yield* policy.writeMembers(
            entity,
            principal,
            Object.keys(values),
            'Create',
          )
          const relations = linking(yield* linkRules(principal, links), Option.none())
          const proposed = {
            ...values,
            id: context.id,
            ...Object.fromEntries(
              Object.entries(links).map(([relation, link]) => [relation, linkKey(link)]),
            ),
          }
          const rules = [row, ...members, ...relations]
          const ruled = rules.flatMap(({ condition }) => Condition.members(condition))
          const unset = new Set(ruled.filter(field => !Object.hasOwn(proposed, field)))
          yield* require(rules.map(rule => ({
            ...rule,
            condition: Condition.unsetting(rule.condition, unset),
          })), proposed, principal)
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
    return writeRules.add(guarded, policy, [entity])
  },

  /**
   * A handler's Source (`RemoteServer.mutation`'s) with `entity`'s rule for
   * `interaction` checked before it runs. The row the input names (`id`) is
   * read through `source`, which must apply the Entity's Read rules, and the
   * rule must hold over it; a row its writer may not see is refused. With no
   * `id` (a create), the rule must hold of who is asking alone, a field it
   * reads matching no guard. `run` is given the row as read: its fields the
   * rule reads, its `id`, and `fields`. A refusal is `Forbidden`; `run` never
   * runs. What `run` writes is its own: check members it sets there. Each
   * row of `entity` its answer carries is read back through `source`, so the
   * answer shows its writer only what they may see, a row it hid from them
   * as deleted.
   *
   * ```ts
   * GuardServer.mutation(ArchiveTodo, {
   *   entity: Todo, policy: Policy, interaction: Archive.key,
   *   id: input => input.id, source: source(Db.Todo),
   * }, ({ input, row }) => …)
   * ```
   */
  mutation: <User, R, RS, RM, Name extends string, Input, Output, Refused>(
    mutation: MutationDescriptor<Name, Input, Output, Refused>,
    guard: {
      readonly entity: AnyEntity
      readonly policy: Policy<User, R>
      readonly interaction: 'Create' | 'Update' | 'Delete' | InteractionKey
      /**
       * The row the input acts on; none for a create. An input whose id may be
       * absent (`Option`, as one editor's for create and edit) creates when it
       * is, checked against `Create`.
       */
      readonly id?: ((input: Input) => string | Option.Option<string>) | undefined
      /** Reads the row as its writer may see it: the Entity's guarded Source. */
      readonly source: EntitySource<Option.Option<User>, RS>
      /** More of the row for `run`, beside what the rule reads. */
      readonly fields?: ReadonlyArray<string> | undefined
    },
    run: (context: {
      readonly input: Input
      readonly principal: Option.Option<User>
      readonly requestId: string
      readonly row: Option.Option<Readonly<Record<string, unknown>>>
    }) => Effect.Effect<
      MutationOutcome<Output>,
      RemoteServerError | MutationRefused | RemoteForbidden,
      RM
    >,
  ): MutationSource<Option.Option<User>, R | RS | RM> => {
    const { entity, policy, interaction, id, source } = guard
    if (!rowRules.has(source.visible, policy, entity)) {
      throw new Error(
        `[foldkit-guard] GuardServer.mutation: ${mutation.name}'s Source does not apply ${entity.name}'s Read rules`,
      )
    }
    /**
     * The answer as its writer may now see it: each row of `entity` it carries
     * read back through `source`, and one the handler hid from them deleted.
     */
    const shown = (outcome: MutationOutcome<Output>, principal: Option.Option<User>) =>
      Effect.map(
        Effect.forEach(outcome.entities ?? [], patch =>
          patch.entity !== entity.name
            ? Effect.succeed(Option.some(patch))
            : Effect.map(
                seenRow(
                  source,
                  fields =>
                    Effect.map(rowOf(source, principal, fields, patch.id), Option.fromUndefinedOr),
                  principal,
                  Object.keys(patch.values),
                  patch.id,
                ),
                Option.map(seen => ({ ...patch, values: seen })),
              ),
        ),
        read => ({
          ...outcome,
          entities: read.flatMap(Option.toArray),
          deleted: [
            ...(outcome.deleted ?? []),
            ...(outcome.entities ?? [])
              .filter((_, index) => Option.isNone(read[index]!))
              .map(({ entity, id }) => ({ entity, id })),
          ],
        }),
      )
    return RemoteServer.mutation<Option.Option<User>, R | RS | RM, Name, Input, Output, Refused>(
      mutation,
      context =>
        Effect.gen(function* () {
          const { principal } = context
          // `context.input` was decoded against the mutation's Input before this runs.
          const target = Option.flatMap(Option.fromUndefinedOr(id), of => {
            const named = of(context.input)
            return typeof named === 'string' ? Option.some(named) : named
          })
          const rule = yield* policy.writable(
            entity,
            principal,
            id !== undefined && Option.isNone(target) ? 'Create' : interaction,
          )
          const ruled = Condition.members(rule.condition)
          const input = policy.inputOf(principal)
          if (Option.isNone(target)) {
            const unset = Condition.unsetting(rule.condition, new Set(ruled))
            if (!Condition.holds(unset, {}, input, () => false)) {
              return yield* Effect.fail(refused(rule.deny))
            }
            return yield* shown(yield* run({ ...context, row: Option.none() }), principal)
          }
          const fields = [...new Set(['id', ...ruled, ...(guard.fields ?? [])])]
          const row = Option.fromUndefinedOr(yield* rowOf(source, principal, fields, target.value))
          if (
            Option.isNone(row) ||
            !Condition.holds(rule.condition, row.value, input, () => false)
          ) {
            return yield* Effect.fail(refused(rule.deny))
          }
          return yield* shown(yield* run({ ...context, row }), principal)
        }),
    )
  },

  /**
   * Checks, at startup, that `server` applies the guards of `entities`, the
   * Entities as `Guards.attach` returned them: each one's Source and each
   * query listing it apply its row's Read rules (`GuardDrizzle.visible`, or
   * `GuardServer.memory`), its Source applies its members' and relations'
   * (`GuardServer.filter`), and each declared write of it lands through
   * `GuardServer.writer`, all built from `policy`; and that no query's body
   * filters or orders by a member with a Read rule, which would answer for the
   * value it hides. A hand-written Source over a guarded Entity would serve
   * every row, and a bare writer would take every write; this throws instead,
   * naming each. A handler (`RemoteServer.mutation`) writes what its code
   * writes, which no check at startup can read.
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
        readonly registry: {
          readonly queries: ReadonlyMap<
            string,
            { readonly Result: unknown; readonly body?: AnyQuery | undefined }
          >
        }
      }
      readonly server: ServerDefinition<any, any>
    },
  ): void => {
    const byName = new Map(config.entities.map(entity => [entity.name, entity]))
    /** Whether who may read the rows of `entity` depends on who is asking. */
    const rowsRuled = (entity: AnyEntity | undefined) =>
      Option.exists(Option.flatMap(Option.fromUndefinedOr(entity), attached), attachment =>
        readRowsRuled(attachment),
      )
    // A query the domain does not declare lists an Entity no one can name.
    const undeclared = [...config.server.queries.keys()]
      .filter(query => !config.domain.registry.queries.has(query))
      .map(query => `query ${query} is served, but the domain does not declare it`)
    const entityProblems = config.entities.flatMap(entity =>
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
              ...(rowRules.has(visible, policy, entity)
                ? []
                : [`${name}'s Source does not apply its Read rules`]),
              ...(memberRules.has(filter, policy, entity)
                ? []
                : [`${name}'s Source does not apply its members' Read rules`]),
            ],
          })
          const queryProblems = [...config.domain.registry.queries].flatMap(
            ([queryName, query]) => {
              const listed = config.server.queries.get(queryName)
              return listed !== undefined &&
                lists(query.Result, name) &&
                !rowRules.has(listed.visible, policy, entity)
                ? [`query ${queryName} lists ${name} without its Read rules`]
                : []
            },
          )
          // A row the reader may see with a member it may not still answers a
          // filter or an order on that member: `cost < $max`, halved twenty
          // times, reads the cost the row came back without.
          const bodyProblems = [...config.domain.registry.queries].flatMap(
            ([queryName, { body }]) => {
              if (body === undefined || body.entity.name !== name) return []
              const { predicate, order } = Query.dependencies(body)
              const hidden = (fields: typeof predicate) => [
                ...new Set(
                  fields.map(field => field.key).filter(key => readRuled(attachment, key)),
                ),
              ]
              return [
                ...hidden(predicate).map(
                  member =>
                    `query ${queryName} filters ${name} by ${member}, which has a Read rule`,
                ),
                ...hidden(order).map(
                  member => `query ${queryName} orders ${name} by ${member}, which has a Read rule`,
                ),
              ]
            },
          )
          const writeProblems = [...config.server.mutations].flatMap(([mutation, source]) =>
            source.writes !== undefined &&
            source.writes.entity === name &&
            !writeRules.has(source.writes.writer, policy, entity)
              ? [`write ${mutation} writes ${name} without its write rules`]
              : [],
          )
          // A shared field goes to every live subscriber as written: no rule may tell them apart.
          const shared = Option.match(source, {
            onNone: () => [],
            onSome: source => [...(source.shared ?? [])],
          })
          const sharedProblems = [
            ...(shared.length > 0 && readRowsRuled(attachment)
              ? [`${name}'s Source shares ${shared.join(', ')}, but its rows have a Read rule`]
              : []),
            ...shared.flatMap(member => {
              const own = readRuled(attachment, member)
                ? [`${name}'s Source shares ${member}, which has a Read rule`]
                : []
              if (!Object.hasOwn(entity.relations, member)) return own
              const target = entity.relations[member]!.target().name
              if (!byName.has(target))
                return [
                  ...own,
                  `${name}'s Source shares ${member}, whose ${target} is not validated`,
                ]
              return rowsRuled(byName.get(target))
                ? [...own, `${name}'s Source shares ${member}, whose rows have a Read rule`]
                : own
            }),
          ]
          // A live Source of its own streams whatever it reads: nothing here can check it.
          const liveProblems = config.server.live.has(name)
            ? [`${name} has a live Source of its own; serve its changes through a live hub`]
            : []
          return [
            ...sourceProblems,
            ...queryProblems,
            ...bodyProblems,
            ...writeProblems,
            ...sharedProblems,
            ...liveProblems,
          ]
        },
      }),
    )
    const problems = [...undeclared, ...entityProblems]
    if (problems.length > 0) {
      throw new Error(`[foldkit-guard] GuardServer.validate: ${problems.join('; ')}`)
    }
  },
}

/** Whether a read asks for `may`, of an Entity that has it (`Guards.may`). */
const asksMay = (entity: AnyEntity, fields: ReadonlyArray<string>) =>
  fields.includes('may') && Object.hasOwn(entity.derived, 'may')

/** How one principal's `may` is answered: the fields its rules read, and the answer over a row. */
interface MayPlan {
  readonly fields: ReadonlyArray<string>
  readonly answer: (values: Readonly<Record<string, unknown>>) => MayAnswer
}

/** The interactions a row answers `may` for: `Update`, `Delete`, and each one the set named. */
const builtInRow = new Set(['Read', 'Create', 'Update', 'Delete'])

/**
 * `may` for `principal`: each row interaction's rule, each member's own
 * `Update`, each relation's `Link` and `Unlink`, decided once and held over
 * each row as a write's check would hold them over it as it is.
 */
const mayOf = <User, R>(
  entity: AnyEntity,
  policy: Policy<User, R>,
  principal: Option.Option<User>,
): Effect.Effect<MayPlan, never, R> => {
  const attachment = attached(entity)
  const named = Option.match(attachment, {
    onNone: () => [],
    onSome: ({ row }) => Object.keys(row).filter(interaction => !builtInRow.has(interaction)),
  })
  const ruledMembers = Option.match(attachment, {
    onNone: () => [],
    onSome: ({ members }) => Object.keys(members),
  })
  const ruledRelations = Option.match(attachment, {
    onNone: () => [],
    onSome: ({ relations }) => Object.keys(relations),
  })
  return Effect.map(
    Effect.all([
      Effect.forEach(['Update', 'Delete', ...named], interaction =>
        Effect.map(
          // A named one was attached as an `InteractionKey`; its key is the name.
          policy.writable(entity, principal, interaction as InteractionKey),
          rule => [interaction, rule] as const,
        ),
      ),
      policy.writeMembers(entity, principal, ruledMembers, 'Update'),
      Effect.forEach(ruledRelations, relation =>
        Effect.map(
          Effect.all([
            policy.linkable(entity, principal, relation, 'Link'),
            policy.linkable(entity, principal, relation, 'Unlink'),
          ]),
          ([link, unlink]) => ({ relation, link, unlink }),
        ),
      ),
    ]),
    ([rows, members, relations]): MayPlan => {
      const input = policy.inputOf(principal)
      const holds = (condition: Condition, values: Readonly<Record<string, unknown>>) =>
        Condition.holds(condition, values, input, () => false)
      // A relation without a rule for one direction leaves it to the row's Update.
      const allows = (rule: Option.Option<RowRule>, values: Readonly<Record<string, unknown>>) =>
        Option.match(rule, {
          onNone: () => true,
          onSome: ({ condition }) => holds(condition, values),
        })
      const conditions = [
        ...rows.map(([, { condition }]) => condition),
        ...members.map(({ condition }) => condition),
        ...relations.flatMap(({ link, unlink }) =>
          [...Option.toArray(link), ...Option.toArray(unlink)].map(({ condition }) => condition),
        ),
      ]
      return {
        // `id` too, so a row is read when its rules read none of it (an admin's).
        fields: ['id', ...new Set(conditions.flatMap(Condition.members))],
        answer: values => ({
          row: Object.fromEntries(
            rows.map(([interaction, { condition }]) => [interaction, holds(condition, values)]),
          ),
          // Only an `explain`'s sentence is for whoever asked.
          reasons: Object.fromEntries(
            rows.flatMap(([interaction, { condition, deny }]) =>
              holds(condition, values)
                ? []
                : Match.valueTags(deny, {
                    Explain: ({ reason }) => [[interaction, reason] as const],
                    Forbidden: () => [],
                    NotFound: () => [],
                    Omit: () => [],
                    Redact: () => [],
                  }),
            ),
          ),
          members: Object.fromEntries(
            members.map(({ member, condition }) => [member, holds(condition, values)]),
          ),
          relations: Object.fromEntries(
            relations.map(({ relation, link, unlink }) => [
              relation,
              { Link: allows(link, values), Unlink: allows(unlink, values) },
            ]),
          ),
        }),
      }
    },
  )
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

/** One row, by id, as `principal` may read it through `source`. */
const rowOf = <P, R>(
  source: EntitySource<P, R>,
  principal: P,
  fields: ReadonlyArray<string>,
  id: string,
) =>
  Effect.map(
    source.read({ ids: [id], fields: [...fields], principal }),
    records => records.find(record => record.id === id)?.values,
  )

/**
 * Row `id` of `fields` as `principal` may see it, through `see`'s `authorize`
 * and `filter` as a Source applies them, and no more than was asked: what an
 * answer shows its writer. None when the row is not there to them.
 */
const seenRow = <P, R, RS>(
  see: Pick<EntitySource<P, RS>, 'authorize' | 'filter'>,
  read: (
    fields: ReadonlyArray<string>,
  ) => Effect.Effect<Option.Option<Readonly<Record<string, unknown>>>, RemoteServerError, R>,
  principal: P,
  fields: ReadonlyArray<string>,
  id: string,
): Effect.Effect<Option.Option<Readonly<Record<string, unknown>>>, RemoteServerError, R | RS> =>
  Effect.gen(function* () {
    const allowed = see.authorize === undefined ? fields : see.authorize(principal, [...fields])
    const plan: ReadPlan =
      see.filter === undefined
        ? { fields: allowed, apply: noMembers }
        : yield* see.filter(principal, allowed)
    // The id too: a row asked for nothing else is still there or not.
    const row = yield* read([...new Set(['id', ...plan.fields])])
    return Option.map(row, values => {
      const shown = plan.apply({ id, values }).values
      return Object.fromEntries(
        allowed.filter(field => Object.hasOwn(shown, field)).map(field => [field, shown[field]]),
      )
    })
  })

/** A link's value as a row holds it: the ref's key, or `null` for none. */
const linkKey = (link: Option.Option<{ readonly entity: string; readonly id: string }>) =>
  Option.match(link, { onNone: () => null, onSome: ref => `${ref.entity}:${ref.id}` })

/** Whether a query's result is a connection over `entity`. */
const lists = (result: unknown, entity: string): boolean =>
  typeof result === 'object' && result !== null && 'entity' in result && result.entity === entity
