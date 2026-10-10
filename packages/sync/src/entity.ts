/**
 * `foldkit-sync/entity`: edits to rows a server owns, kept in a replicated
 * slice that the journal owns. `foldkit-sync/remote` shows them over the rows
 * Remote reads.
 *
 * The journal orders the edits and stamps each with the sequence it
 * committed at (`at`) and who committed it from where (`by`); the table is
 * the journal's read model, each row carrying the highest sequence it has
 * applied (`revision`). An edit the table holds is absorbed: the server says
 * so (`absorbed`), every replica drops it, and the journal compacts.
 *
 * Everything here is pure: it owns no state, does no I/O, and sends nothing.
 * The application keeps the edits in its Model and calls these from
 * `update`, the stamp, and `Sync.mount`'s `onReinstall`.
 */
import { Equal, Option, Schema } from 'effect'

/** Who committed an edit: the actor, shown in words, and the replica (a tab), which says whose it is. */
export const Author = Schema.Struct({ actor: Schema.String, replica: Schema.String })
export type Author = typeof Author.Type

/** What `make` reads of an Entity: each member's schema, `id` among them. */
export interface EntityFields {
  readonly fields: { readonly id: { readonly schema: Schema.Top } } & {
    readonly [member: string]: { readonly schema: Schema.Top }
  }
}

/** The members an edit can change: every field but `id`. */
export type Member<E extends EntityFields> = Exclude<keyof E['fields'] & string, 'id'>
type ValueOf<E extends EntityFields, K extends Member<E>> = E['fields'][K]['schema']['Type']
type IdOf<E extends EntityFields> = E['fields']['id']['schema']['Type']

/** One cell's new value: the member and a value of that member's type, together. */
export type Change<E extends EntityFields, Ms extends Member<E>> = {
  readonly [K in Ms]: { readonly id: IdOf<E>; readonly member: K; readonly value: ValueOf<E, K> }
}[Ms]

/** A cell's edit as the slice keeps it: committed `at` by `by`, or, with neither, pending. */
export type CellEdit<E extends EntityFields, Ms extends Member<E>> = {
  readonly [K in Ms]: {
    readonly id: IdOf<E>
    readonly member: K
    readonly value: ValueOf<E, K>
    readonly at: Option.Option<number>
    readonly by: Option.Option<Author>
  }
}[Ms]

/** A row as the table holds it: its id, the revision it has applied, and its members. */
export type RowOf<E extends EntityFields, Ms extends Member<E>> = {
  readonly id: IdOf<E>
  readonly revision: number
} & { readonly [K in Ms]: ValueOf<E, K> }

/** A cell this replica last wrote that a later edit replaced: its edit, and what the cell holds now. */
export interface Replaced<Edit> {
  readonly edit: Edit
  /** The later edit's author, when the slice still says; none once the journal absorbed it. */
  readonly by: Option.Option<Author>
}

const make = <E extends EntityFields, const Ms extends ReadonlyArray<Member<E>>>(
  entity: E,
  options: { readonly members: Ms },
) => {
  type M = Ms[number]
  type Edit = CellEdit<E, M>
  type Row = RowOf<E, M>
  const { members } = options
  const id = entity.fields.id.schema
  if (members.length === 0) throw new Error('EditableEntity.make: name at least one member')
  for (const member of members) {
    if ((member as string) === 'id' || !Object.hasOwn(entity.fields, member)) {
      throw new Error(`EditableEntity.make: ${member} is not a member of the entity`)
    }
  }
  const schemaOf = (member: M) => entity.fields[member]!.schema
  // One struct per member, so a value is decoded by its own member's schema:
  // the union is exactly `Change`, member and value paired.
  const Change = Schema.Union(
    members.map(member =>
      Schema.Struct({ id, member: Schema.Literal(member), value: schemaOf(member) }),
    ),
  ) as unknown as Schema.Codec<Change<E, M>, unknown>
  const Edit = Schema.Union(
    members.map(member =>
      Schema.Struct({
        id,
        member: Schema.Literal(member),
        value: schemaOf(member),
        at: Schema.OptionFromNullOr(Schema.Number),
        by: Schema.OptionFromNullOr(Author),
      }),
    ),
  ) as unknown as Schema.Codec<Edit, unknown>

  /** The edits by row, then member: no key is a string built from an id. */
  const indexOf = (edits: ReadonlyArray<Edit>) => {
    const index = new Map<IdOf<E>, Map<M, Edit>>()
    for (const edit of edits) {
      const row = index.get(edit.id) ?? new Map<M, Edit>()
      row.set(edit.member, edit)
      index.set(edit.id, row)
    }
    return index
  }
  const sameCell = (a: { readonly id: IdOf<E>; readonly member: M }, b: typeof a) =>
    Equal.equals(a.id, b.id) && a.member === b.member

  /** Whether a row read at `revision` has the edit: the table applies in the journal's order. */
  const reached = (edit: Edit, revision: number) => Option.exists(edit.at, at => at <= revision)

  /** Whether `replica` wrote the edit: pending here, or committed from it. */
  const mine = (edit: Edit, replica: string): boolean =>
    Option.match(edit.at, {
      onNone: () => true,
      onSome: () => Option.exists(edit.by, by => by.replica === replica),
    })

  return {
    /** Carried so `foldkit-sync/remote` can name the rows it overlays by the Entity's own name. */
    entity,
    members,
    /** The members, as a schema: what names a cell. */
    Member: Schema.Literals(members),
    /** One cell's change, on the wire: its member's value, by that member's schema. */
    Change,
    /** One cell's edit as the slice keeps it; `null` on the wire where it has no `at` or `by`. */
    Edit,
    /** The durable Message that edits cells: its fields, for the application's own tag. */
    edited: {
      changes: Schema.Array(Change),
      /** The journal's: absent on what a replica sends, stamped at commit. */
      at: Schema.optionalKey(Schema.Number),
      by: Schema.optionalKey(Author),
    },
    /** The server's durable Message: the table holds every edit committed through `through`. */
    absorbed: { through: Schema.Number },
    /** What the stamp writes into an edit: the sequence and the author. */
    stamped: (commit: {
      readonly sequence: number
      readonly actorId: string
      readonly replicaId: string
    }) => ({ at: commit.sequence, by: { actor: commit.actorId, replica: commit.replicaId } }),

    /** The edits with `changes` laid over them, each cell's latest kept. */
    merge: (
      edits: ReadonlyArray<Edit>,
      changes: ReadonlyArray<Change<E, M>>,
      at: Option.Option<number>,
      by: Option.Option<Author>,
    ): ReadonlyArray<Edit> => {
      if (changes.length === 0) return edits
      const added = changes.map(change => ({ ...change, at, by }) as Edit)
      return [...edits.filter(edit => !added.some(next => sameCell(edit, next))), ...added]
    },

    /** The edits less those committed through `through`; the same array when none was. */
    absorb: (edits: ReadonlyArray<Edit>, through: number): ReadonlyArray<Edit> =>
      edits.some(edit => reached(edit, through))
        ? edits.filter(edit => !reached(edit, through))
        : edits,

    /** Whether any edit is committed through `through`: whether an absorb would drop one. */
    holdsThrough: (edits: ReadonlyArray<Edit>, through: number): boolean =>
      edits.some(edit => reached(edit, through)),

    /**
     * What the slice replaced that `replica` had written: each cell whose
     * edit was its own, and now holds another replica's commit with another
     * value, though it be the same person's in another tab.
     */
    replaced: (
      previous: ReadonlyArray<Edit>,
      next: ReadonlyArray<Edit>,
      replica: string,
    ): ReadonlyArray<Replaced<Edit>> => {
      const before = indexOf(previous)
      return next.flatMap(edit => {
        const prior = before.get(edit.id)?.get(edit.member)
        if (prior === undefined || !mine(prior, replica)) return []
        return Option.match(edit.by, {
          onNone: () => [],
          onSome: by =>
            by.replica !== replica && !Equal.equals(edit.value, prior.value)
              ? [{ edit: prior, by: Option.some(by) }]
              : [],
        })
      })
    },

    /** The cells a set of changes names: what a refusal of them undid. */
    cellsOf: (
      changes: ReadonlyArray<Change<E, M>>,
    ): ReadonlyArray<{ readonly id: IdOf<E>; readonly member: M }> =>
      changes.map(({ id: row, member }) => ({ id: row, member })),

    /**
     * What a row holds in one member, as the change that would set it: the
     * value an undo puts back.
     */
    changeAt: (row: Row, member: M): Change<E, M> =>
      // The member and its value are read together, so they pair as `Change` does.
      ({ id: row.id, member, value: row[member] }) as Change<E, M>,

    /** The edit of one cell, if the edits hold one. */
    editOf: (edits: ReadonlyArray<Edit>, row: IdOf<E>, member: M): Option.Option<Edit> =>
      Option.fromUndefinedOr(
        edits.find(edit => Equal.equals(edit.id, row) && edit.member === member),
      ),

    mine,
  }
}

/** Edits to an Entity's members, kept per cell in a replicated slice and laid over its rows. */
export const EditableEntity = { make }
export type EditableEntity<
  E extends EntityFields,
  Ms extends ReadonlyArray<Member<E>>,
> = ReturnType<typeof make<E, Ms>>
