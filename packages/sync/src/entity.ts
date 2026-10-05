/**
 * `foldkit-sync/entity`: edits to rows a server owns, kept in a replicated
 * slice that the journal owns, and laid over the rows Remote reads.
 *
 * ```text
 * cell shown = the row's value, unless an edit of that cell is pending,
 *              or committed after the row's revision (at > row.revision)
 * ```
 *
 * The journal orders the edits and stamps each with the sequence it
 * committed at (`at`) and who committed it from where (`by`); the table is
 * the journal's read model, each row carrying the highest sequence it has
 * applied (`revision`). An edit the table holds is absorbed: the server says
 * so (`absorbed`), every replica drops it, and the journal compacts. A page
 * keeps a dropped edit (`held`) while a row it has cached is below it, so the
 * row never shows the stale read, and lets it go once a read of the row is at
 * or past it (`settled`), noting when the row then holds another value, a
 * later edit's.
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

/** A row an overlay draws on: its id, the revision the table read it at, and its members. */
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

    /** Whether the row, read at `revision`, does not hold the edit yet: shown over it. */
    shows: (edit: Edit, revision: number): boolean => !reached(edit, revision),

    /**
     * The rows as shown: each with the edits it has not absorbed laid over it.
     * Built once per `edits`, for `RowModel.map`, which caches by its identity.
     */
    overlay: <R extends Row>(edits: ReadonlyArray<Edit>): ((row: R) => R) => {
      const index = indexOf(edits)
      return (row: R): R => {
        const cells = index.get(row.id)
        if (cells === undefined) return row
        let shown = row
        for (const edit of cells.values()) {
          if (!reached(edit, row.revision)) shown = { ...shown, [edit.member]: edit.value }
        }
        return shown
      }
    },

    /**
     * Of `edits`, the committed ones that `next` no longer holds, whose row is
     * cached below them: what the row would otherwise show stale. A row not
     * cached keeps nothing; its next read has the table's value.
     */
    held: (
      edits: ReadonlyArray<Edit>,
      next: ReadonlyArray<Edit>,
      revisionOf: (id: IdOf<E>) => Option.Option<number>,
    ): ReadonlyArray<Edit> => {
      const current = indexOf(next)
      return edits.filter(
        edit =>
          Option.isSome(edit.at) &&
          !current.get(edit.id)?.has(edit.member) &&
          Option.exists(revisionOf(edit.id), revision => !reached(edit, revision)),
      )
    },

    /** Whether `after` holds a committed cell `before` did not: one just taken from the slice. */
    newlyHeld: (before: ReadonlyArray<Edit>, after: ReadonlyArray<Edit>): boolean =>
      after.some(
        edit => !before.some(kept => sameCell(kept, edit) && Equal.equals(kept.at, edit.at)),
      ),

    /**
     * The held edits a read of their rows has reached, let go; of those,
     * `replica`'s own that the row shows another value for, as replaced: the
     * table applies in order, so a row at or past an edit that holds another
     * value took a later one, whose author the journal has absorbed. With
     * nothing reached, `held` comes back as it was given.
     */
    settled: (
      held: ReadonlyArray<Edit>,
      rowOf: (id: IdOf<E>) => Option.Option<Row>,
      replica: string,
    ): { readonly held: ReadonlyArray<Edit>; readonly replaced: ReadonlyArray<Replaced<Edit>> } => {
      const replaced: Array<Replaced<Edit>> = []
      const kept = held.filter(edit =>
        Option.match(rowOf(edit.id), {
          onNone: () => true,
          onSome: row => {
            if (!reached(edit, row.revision)) return true
            if (mine(edit, replica) && !Equal.equals(row[edit.member], edit.value)) {
              replaced.push({ edit, by: Option.none() })
            }
            return false
          },
        }),
      )
      return { held: kept.length === held.length ? held : kept, replaced }
    },

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
