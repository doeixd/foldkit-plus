/**
 * `may`: what a principal may do with a row, as a derived member the client
 * reads like any other. The server answers it for the row as it was read; a
 * client foresees it for a row it writes, from the same rules, where they
 * decide it whatever it does not know. Either way it is a hint for a
 * greyed-out button, never the check: the write is checked again when made.
 */
import { Effect, Match, Option, Record, Schema } from 'effect'
import { Derived, Entity, type AnyEntity, type Forbids, type Predict } from 'foldkit-entity'
import { Verdict } from 'metakit'
import { attached, type InteractionKey } from './attach.js'
import { Condition, deciding, type MemberRead, type RowRule } from './condition.js'

/**
 * The answer: per row interaction (`Update`, `Delete`, and each one the
 * application named), per member with its own `Update` rule, and per relation
 * with a `Link` or `Unlink` rule; and, for a row interaction refused with an
 * `explain`, its sentence.
 *
 * `row` says one of three things of an interaction: `true`, its rule let the
 * reader; `false`, it refused; and nothing, the key left out, where the rule
 * reads another row and one row cannot decide it. The write's statement
 * decides that one. Read the three with `May.answer`, which gives a `Verdict`;
 * this shape is the JSON on the wire and does not change.
 */
export const MaySchema = Schema.Struct({
  row: Schema.Record(Schema.String, Schema.Boolean),
  reasons: Schema.Record(Schema.String, Schema.String),
  members: Schema.Record(Schema.String, Schema.Boolean),
  relations: Schema.Record(
    Schema.String,
    Schema.Struct({ Link: Schema.Boolean, Unlink: Schema.Boolean }),
  ),
})
export type MayAnswer = typeof MaySchema.Type

type MemberKeys<E extends AnyEntity> = (keyof E['fields'] | keyof E['derived']) & string

/** What the answer says of a row interaction: `Unknown` where it does not name it. */
const answer = (may: MayAnswer, interaction: string): Verdict.Verdict<never> =>
  Option.match(Record.get(may.row, interaction), {
    onNone: () => Verdict.Unknown(`the answer does not say ${interaction}`),
    onSome: said => (said ? Verdict.True() : Verdict.False<never>()),
  })

const can = (may: MayAnswer, interaction: string): boolean =>
  Verdict.isTrue(answer(may, interaction))

/** Whether `answers` names `key`, and says no to it. */
const refuses = (answers: Readonly<Record<string, boolean>>, key: string): boolean =>
  Option.exists(Record.get(answers, key), said => !said)

/** Whether the relation has a rule of its own for the direction, and it said no. */
const refusesLink = (may: MayAnswer, relation: string, interaction: 'Link' | 'Unlink'): boolean =>
  Option.exists(Record.get(may.relations, relation), said => !said[interaction])

/** A yes to the row's `Update`, and no refusal from the member's own rule. */
const setting = (may: MayAnswer, member: string): boolean =>
  can(may, 'Update') && !refuses(may.members, member)

/** A yes to the row's `Update`, and no refusal from the relation's own rule for the direction. */
const linking = (may: MayAnswer, relation: string, interaction: 'Link' | 'Unlink'): boolean =>
  can(may, 'Update') && !refusesLink(may, relation, interaction)

const isMay = Schema.is(MaySchema)
const sameMay = Schema.toEquivalence(MaySchema)

/** The interactions a row answers `may` for: `Update`, `Delete`, and each one the set named. */
const builtInRow = new Set(['Read', 'Create', 'Update', 'Delete'])

/**
 * What `may` asks, for one principal: each row interaction's rule, each
 * member's own `Update`, each relation's `Link` and `Unlink`.
 */
export interface MayRules {
  readonly rows: ReadonlyArray<readonly [string, RowRule]>
  readonly members: ReadonlyArray<MemberRead>
  readonly relations: ReadonlyArray<{
    readonly relation: string
    readonly link: Option.Option<RowRule>
    readonly unlink: Option.Option<RowRule>
  }>
}

/** How one side decides a rule for its principal: a Policy's bodies, or a client's assumption. */
export interface MayAsk<R> {
  readonly row: (interaction: string) => Effect.Effect<RowRule, never, R>
  readonly members: (
    members: ReadonlyArray<string>,
  ) => Effect.Effect<ReadonlyArray<MemberRead>, never, R>
  readonly relation: (
    relation: string,
    interaction: 'Link' | 'Unlink',
  ) => Effect.Effect<Option.Option<RowRule>, never, R>
}

/** The rules `may` answers for `entity`, each decided by `ask`. */
export const mayRules = <R>(
  entity: AnyEntity,
  ask: MayAsk<R>,
): Effect.Effect<MayRules, never, R> => {
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
        Effect.map(ask.row(interaction), rule => [interaction, rule] as const),
      ),
      ask.members(ruledMembers),
      Effect.forEach(ruledRelations, relation =>
        Effect.map(
          Effect.all([ask.relation(relation, 'Link'), ask.relation(relation, 'Unlink')]),
          ([link, unlink]) => ({ relation, link, unlink }),
        ),
      ),
    ]),
    ([rows, members, relations]) => ({ rows, members, relations }),
  )
}

/** Every condition the rules hold a row to. */
export const mayConditions = (rules: MayRules): ReadonlyArray<Condition> => [
  ...rules.rows.map(([, { condition }]) => condition),
  ...rules.members.map(({ condition }) => condition),
  ...rules.relations.flatMap(({ link, unlink }) =>
    [...Option.toArray(link), ...Option.toArray(unlink)].map(({ condition }) => condition),
  ),
]

/**
 * The answer over one row, each condition decided by `decide`. A row
 * interaction it cannot decide over one row (a rule reading another row,
 * which the write's statement judges) is left out, and so refuses nothing.
 */
export const answerOf = (
  rules: MayRules,
  decide: (condition: Condition) => Option.Option<boolean>,
): MayAnswer => {
  // Member and relation rules never read another row (`Guards.attach` refuses one).
  const holds = (condition: Condition) => Option.getOrElse(decide(condition), () => false)
  // A relation without a rule for one direction leaves it to the row's Update.
  const allows = (rule: Option.Option<RowRule>) =>
    Option.match(rule, { onNone: () => true, onSome: ({ condition }) => holds(condition) })
  const decided = rules.rows.flatMap(([interaction, rule]) =>
    Option.match(decide(rule.condition), {
      onNone: () => [],
      onSome: answer => [{ interaction, rule, answer }],
    }),
  )
  return {
    row: Object.fromEntries(decided.map(({ interaction, answer }) => [interaction, answer])),
    // Only an `explain`'s sentence is for whoever asked.
    reasons: Object.fromEntries(
      decided.flatMap(({ interaction, rule: { deny }, answer }) =>
        answer
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
      rules.members.map(({ member, condition }) => [member, holds(condition)]),
    ),
    relations: Object.fromEntries(
      rules.relations.map(({ relation, link, unlink }) => [
        relation,
        { Link: allows(link), Unlink: allows(unlink) },
      ]),
    ),
  }
}

/**
 * `may` foreseen for a row the client writes, foreseen only when the whole
 * of it is. What the client cannot know (the principal's fields, a rule over
 * a row or field the store lacks, a refusal the server would meet) leaves a
 * rule `Unknown` in metakit's judgement (`Condition.judge`). A principal
 * guard's body is the server's: it is decided both ways, and the answer
 * stands only where both agree, which settles it, since no part of a
 * condition is negated.
 */
const predict: Predict = ({ entity, row, rows, context }) => {
  // Never a visitor here: a client without a viewer may be one that was not told it.
  const answerAssuming = (assumed: boolean): Option.Option<MayAnswer> => {
    const decide = (interaction: string) =>
      deciding(() => Effect.succeed(assumed), false, interaction, context)
    const rules = Effect.runSync(
      mayRules(entity, {
        row: interaction => decide(interaction).row(entity),
        members: members => decide('Update').members(entity, members),
        relation: (relation, interaction) => decide(interaction).relation(entity, relation),
      }),
    )
    const decided = new Map(
      mayConditions(rules).map(condition => [
        condition,
        Verdict.match(Condition.judge(condition, row, rows), {
          True: () => Option.some(true),
          False: () => Option.some(false),
          Unknown: () => Option.none<boolean>(),
        }),
      ]),
    )
    return [...decided.values()].every(Option.isSome)
      ? Option.some(answerOf(rules, condition => decided.get(condition) ?? Option.none()))
      : Option.none()
  }
  return Option.flatMap(answerAssuming(true), held =>
    Option.filter(answerAssuming(false), other => sameMay(held, other)).pipe(Option.as(held)),
  )
}

/**
 * The write a held `may` refuses, as the server would: the row's `Update` or
 * `Delete`, a written member's own `Update`, a relation's `Link` or `Unlink`,
 * each judged over the row as read, where the answer says `false`. What it
 * does not name refuses nothing, and neither does a value that is no answer.
 */
const forbids: Forbids = (value, surface) => {
  if (!isMay(value)) return Option.none()
  // Only a row interaction's refusal carries the `explain` the server would give.
  if (refuses(value.row, surface.kind)) {
    return Option.some({
      reason: Option.fromUndefinedOr(
        Object.hasOwn(value.reasons, surface.kind) ? value.reasons[surface.kind] : undefined,
      ),
    })
  }
  const member = surface.members.some(key => refuses(value.members, key))
  const relation = surface.relations.some(({ relation, interaction }) =>
    refusesLink(value, relation, interaction),
  )
  return member || relation ? Option.some({ reason: Option.none() }) : Option.none()
}

export const May = {
  /**
   * Adds the `may` member to an Entity, after its guards are attached:
   * `TodoFields.pipe(Guards.attach(G, { … }), Guards.may)`. Select it as any
   * member (`may: true`); `GuardServer.filter` answers it. A client holding it
   * refuses, where it is made, a write it says no to (`Forbidden`).
   */
  member: Entity.derived({ may: Derived.make(MaySchema, { predict, forbids }) }),

  /**
   * What the answer says of the row's rule for `interaction`, as a metakit
   * `Verdict`: `True`, it let the reader when the row was read; `False`, it
   * refused; `Unknown`, the answer does not say, since the rule reads another
   * row and one row cannot decide it. The server decides that one when the
   * write reaches it.
   *
   * ```ts
   * Verdict.match(May.answer(todo.may, 'Update'), {
   *   True: () => 'yes',
   *   False: () => 'no',
   *   Unknown: () => 'the server will say',
   * })
   * ```
   */
  answer: (
    may: MayAnswer,
    interaction: 'Update' | 'Delete' | InteractionKey,
  ): Verdict.Verdict<never> => answer(may, interaction),

  /**
   * Whether the answer says yes to `interaction`: `false` both where the rule
   * refused and where the answer does not say. For what is drawn only on a
   * certain yes; to hide or disable only what was refused, read `refused`.
   */
  can: (may: MayAnswer, interaction: 'Update' | 'Delete' | InteractionKey): boolean =>
    can(may, interaction),

  /**
   * Whether the answer says no to `interaction`: `false` both where the rule
   * let the reader and where the answer does not say. What a hint hides,
   * disables or refuses on: what was not said is left for the server.
   */
  refused: (may: MayAnswer, interaction: 'Update' | 'Delete' | InteractionKey): boolean =>
    refuses(may.row, interaction),

  /**
   * Why the row's rule for `interaction` refused, when it was refused with an
   * `explain`: words for whoever asked. None where it was allowed (the server
   * gives none then), or refused without one.
   */
  reason: (
    may: MayAnswer,
    interaction: 'Update' | 'Delete' | InteractionKey,
  ): Option.Option<string> => Record.get(may.reasons, interaction),

  /**
   * Whether the answer says the principal may set `member` on this row: a
   * yes to the row's `Update`, and no refusal from the member's own rule.
   * `false` where the row's `Update` was not said: to lock only what was
   * refused, read `locks`.
   */
  canSet: <E extends AnyEntity>(may: MayAnswer, _entity: E, member: MemberKeys<E>): boolean =>
    setting(may, member),

  /**
   * Whether the answer says the principal may point `relation` at a row, or
   * away from one: a yes to the row's `Update`, and no refusal from the
   * relation's own rule. `false` where the row's `Update` was not said.
   */
  canLink: <E extends AnyEntity>(
    may: MayAnswer,
    _entity: E,
    relation: keyof E['relations'] & string,
    interaction: 'Link' | 'Unlink',
  ): boolean => linking(may, relation, interaction),

  /**
   * `foldkit-crud`'s `locks` for `entity`: an editor loads `may` beside the
   * form's members and locks each the answer refuses: the row's `Update`, or
   * the member's own rule, said no. A relation is locked where its `Unlink`
   * or its `Link` said no. Nothing is locked on what was not said: a row's
   * `Update` whose rule reads another row, or a `may` not answered at all (a
   * Source without the filter). The write is checked anyway, and its refusal
   * is the server's to give.
   *
   * ```ts
   * Crud.editor('todo', { form, mutation: EditTodo, locks: May.locks(Todo) })
   * ```
   */
  locks: (entity: AnyEntity) => ({
    select: { may: true } as const,
    locked: (row: Readonly<Record<string, unknown>>, member: string): boolean => {
      const may = row.may
      if (!isMay(may)) return false
      if (refuses(may.row, 'Update')) return true
      return Object.hasOwn(entity.relations, member)
        ? refusesLink(may, member, 'Unlink') || refusesLink(may, member, 'Link')
        : refuses(may.members, member)
    },
  }),
}
