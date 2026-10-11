/**
 * `may`: what the server says a principal may do with a row, as a derived
 * member the client reads like any other. The client never runs a rule; this
 * is the server's answer for the row as it was read, a hint for a greyed-out
 * button, never the check (the write is checked again when it is made).
 */
import { Option, Record, Schema } from 'effect'
import { Derived, Entity, type AnyEntity } from 'foldkit-entity'
import type { InteractionKey } from './attach.js'

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

export const May = {
  /**
   * Adds the `may` member to an Entity, after its guards are attached:
   * `TodoFields.pipe(Guards.attach(G, { … }), Guards.may)`. Select it as any
   * member (`may: true`); `GuardServer.filter` answers it.
   */
  member: Entity.derived({ may: Derived.make(MaySchema) }),

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
