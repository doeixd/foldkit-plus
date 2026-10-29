/**
 * `may`: what a principal may do with a row, as a derived member the client
 * reads like any other. The server answers it for the row as it was read; a
 * client foresees it for a row it writes, from the same rules, where they
 * decide it whatever it does not know. Either way it is a hint for a
 * greyed-out button, never the check: the write is checked again when made.
 */
import { Effect, Match, Option, Record, Schema } from 'effect'
import { Derived, Entity, type AnyEntity, type Predict } from 'foldkit-entity'
import { attached, type InteractionKey } from './attach.js'
import { Condition, deciding, type MemberRead, type RowRule } from './condition.js'

/**
 * The answer: per row interaction (`Update`, `Delete`, and each one the
 * application named), per member with its own `Update` rule, and per relation
 * with a `Link` or `Unlink` rule; and, for a row interaction refused with an
 * `explain`, its sentence.
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

const can = (may: MayAnswer, interaction: string): boolean => may.row[interaction] === true

/** The row's `Update`, and the member's own rule when it has one. */
const setting = (may: MayAnswer, member: string): boolean =>
  can(may, 'Update') && (!Object.hasOwn(may.members, member) || may.members[member] === true)

/** The row's `Update`, and the relation's own rule for the direction when it has one. */
const linking = (may: MayAnswer, relation: string, interaction: 'Link' | 'Unlink'): boolean =>
  can(may, 'Update') &&
  (!Object.hasOwn(may.relations, relation) || may.relations[relation]![interaction])

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

/** The answer over one row, each condition judged by `holds`. */
export const answerOf = (rules: MayRules, holds: (condition: Condition) => boolean): MayAnswer => {
  // A relation without a rule for one direction leaves it to the row's Update.
  const allows = (rule: Option.Option<RowRule>) =>
    Option.match(rule, { onNone: () => true, onSome: ({ condition }) => holds(condition) })
  return {
    row: Object.fromEntries(
      rules.rows.map(([interaction, { condition }]) => [interaction, holds(condition)]),
    ),
    // Only an `explain`'s sentence is for whoever asked.
    reasons: Object.fromEntries(
      rules.rows.flatMap(([interaction, { condition, deny }]) =>
        holds(condition)
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
 * `may` foreseen for a row the client writes. A principal guard's body is
 * the server's, and the principal's fields are not the client's to know, so
 * each is unknown, as is a rule over a row or field the store lacks. Every
 * rule is a conjunction and disjunction of its parts, so it is decided when
 * it comes out the same with every unknown part taken to hold and taken not
 * to: the answer is foreseen only when the whole of it is.
 */
const predict: Predict = ({ entity, row, rows, context }) => {
  // Never a visitor here: a client without a viewer may be one that was not told it.
  const answerAssuming = (assumed: boolean): MayAnswer => {
    const decide = (interaction: string) =>
      deciding(() => Effect.succeed(assumed), false, interaction, context)
    const rules = Effect.runSync(
      mayRules(entity, {
        row: interaction => decide(interaction).row(entity),
        members: members => decide('Update').members(entity, members),
        relation: (relation, interaction) => decide(interaction).relation(entity, relation),
      }),
    )
    return answerOf(rules, condition => Condition.judge(condition, row, rows, assumed))
  }
  const held = answerAssuming(true)
  return sameMay(held, answerAssuming(false)) ? Option.some(held) : Option.none()
}

export const May = {
  /**
   * Adds the `may` member to an Entity, after its guards are attached:
   * `TodoFields.pipe(Guards.attach(G, { … }), Guards.may)`. Select it as any
   * member (`may: true`); `GuardServer.filter` answers it.
   */
  member: Entity.derived({ may: Derived.make(MaySchema, { predict }) }),

  /**
   * Whether the row's rule for `interaction` let the principal, when it was
   * read. An interaction the answer does not name was not ruled where the row
   * was read, and reads `false`: a hint errs on the side of asking.
   */
  can: (may: MayAnswer, interaction: 'Update' | 'Delete' | InteractionKey): boolean =>
    can(may, interaction),

  /**
   * Why the row's rule for `interaction` refused, when it was refused with an
   * `explain`: words for whoever asked. None where it was allowed (the server
   * gives none then), or refused without one.
   */
  reason: (
    may: MayAnswer,
    interaction: 'Update' | 'Delete' | InteractionKey,
  ): Option.Option<string> => Record.get(may.reasons, interaction),

  /** Whether the principal may set `member` on this row: the row's `Update`, and the member's own rule. */
  canSet: <E extends AnyEntity>(may: MayAnswer, _entity: E, member: MemberKeys<E>): boolean =>
    setting(may, member),

  /** Whether the principal may point `relation` at a row, or away from one. */
  canLink: <E extends AnyEntity>(
    may: MayAnswer,
    _entity: E,
    relation: keyof E['relations'] & string,
    interaction: 'Link' | 'Unlink',
  ): boolean => linking(may, relation, interaction),

  /**
   * `foldkit-crud`'s `locks` for `entity`: an editor loads `may` beside the
   * form's members and locks each the reader may not set. A relation is locked
   * unless it may be both unlinked and linked. Nothing is locked while `may`
   * is not answered (a Source without the filter): the write is checked anyway.
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
      return Object.hasOwn(entity.relations, member)
        ? !(linking(may, member, 'Unlink') && linking(may, member, 'Link'))
        : !setting(may, member)
    },
  }),
}
