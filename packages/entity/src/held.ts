/**
 * What a holder of rows has: the world `Judge` reads an `Expr` over.
 *
 * A server's database holds every row, so whatever an expression asks has an
 * answer there. A client holds what it was sent: some rows, some fields of
 * them, and none it may not see. `HeldRow` is how a holder says which, so an
 * interpreter can tell "this field is null" from "I do not have this field",
 * which a plain record cannot: both read as a missing key.
 */
import { Option } from 'effect'
import { Query, type AnyQuery, type OneRelation } from './expr.js'
import type { AnyEntity, EntityIdentity } from './index.js'

/** A value a holder has, or why it does not have it. */
export type Held<A> =
  | { readonly _tag: 'Held'; readonly value: A }
  | { readonly _tag: 'Unheld'; readonly reason: string }

/** The rows pointing at one row through a relation, as far as a holder has them. */
export interface Pointing {
  readonly rows: ReadonlyArray<HeldRow>
  /** Why a row pointing here may be missing from `rows`; none when it holds every one. */
  readonly missing: Option.Option<string>
}

/**
 * One row as a holder has it. Values are **encoded**, as a store keeps them
 * and as `evaluate` reads a row.
 */
export interface HeldRow {
  /** A field's value; unheld when the holder lacks it or may not see it. */
  readonly field: (key: string) => Held<unknown>
  /**
   * The row a `one` relation of this row points at: none for a null link, or
   * a row the reader may not see when the holder knows it holds every row it may.
   */
  readonly follow: (relation: OneRelation) => Held<Option.Option<HeldRow>>
  /** The rows pointing at this one through `relation`, a `one` relation of another Entity. */
  readonly pointing: (relation: OneRelation) => Pointing
}

/** One Entity's rows, as `Held.rows` takes them. */
export interface HeldTable {
  readonly entity: AnyEntity
  /**
   * Each row's values by key, encoded; a `one` relation's under its own key,
   * as the id of the row it points at or null. A key a row lacks is unheld.
   */
  readonly rows: ReadonlyArray<Readonly<Record<string, unknown>>>
  /**
   * Whether these are every row of the Entity the reader may see, so a row
   * not among them is known absent. True when not given.
   */
  readonly complete?: boolean | undefined
  /** Keys the reader may not see on any of these rows. */
  readonly hidden?: ReadonlyArray<string> | undefined
}

/** The rows `Held.rows` holds, by Entity. */
export interface HeldRows {
  /** The row of `entity` with this id, when it is held. */
  readonly row: (entity: AnyEntity, id: unknown) => Option.Option<HeldRow>
  /** Every held row of `entity`. */
  readonly rows: (entity: AnyEntity) => ReadonlyArray<HeldRow>
}

const held = <A>(value: A): Held<A> => ({ _tag: 'Held', value })
const unheld = <A = never>(reason: string): Held<A> => ({ _tag: 'Unheld', reason })

/**
 * Rows held as plain records: each table complete or not, with keys hidden.
 * What a test, a conformance check or a server that has the rows in hand
 * judges over.
 */
const rowsOf = (tables: ReadonlyArray<HeldTable>): HeldRows => {
  interface Table {
    readonly entity: AnyEntity
    readonly complete: boolean
    readonly hidden: ReadonlySet<string>
    readonly byId: ReadonlyMap<unknown, HeldRow>
    readonly views: ReadonlyArray<HeldRow>
  }
  const byToken = new Map<symbol, Table>()
  const tableOf = (identity: EntityIdentity<string>) =>
    Option.fromUndefinedOr(byToken.get(identity.token))

  const view = (table: Table, record: Readonly<Record<string, unknown>>): HeldRow => {
    const read = (key: string): Held<unknown> =>
      table.hidden.has(key)
        ? unheld(`${table.entity.name}.${key} is hidden from this reader`)
        : Object.hasOwn(record, key)
          ? held(record[key])
          : unheld(`${table.entity.name}.${key} is not held`)
    return {
      field: read,
      follow: relation => {
        const link = read(relation.key)
        if (link._tag === 'Unheld') return link
        if (link.value === null || link.value === undefined) return held(Option.none())
        const target = relation.target()
        return Option.match(tableOf(target.identity), {
          onNone: () => unheld(`no ${target.name} is held`),
          onSome: reached =>
            Option.match(Option.fromUndefinedOr(reached.byId.get(link.value)), {
              onSome: row => held(Option.some(row)),
              onNone: () =>
                reached.complete
                  ? held(Option.none<HeldRow>())
                  : unheld(`${target.name} ${String(link.value)} is not held`),
            }),
        })
      },
      pointing: relation =>
        Option.match(tableOf(relation.owner), {
          onNone: () => ({
            rows: [],
            missing: Option.some(`no ${relation.owner.name} is held`),
          }),
          onSome: from => {
            const id = record.id
            const named = `${relation.owner.name}.${relation.key}`
            const rows: Array<HeldRow> = []
            let missing = from.complete
              ? Option.none<string>()
              : Option.some(`not every ${relation.owner.name} is held`)
            for (const each of from.views) {
              const link = each.field(relation.key)
              if (link._tag === 'Unheld') {
                missing = Option.orElse(missing, () => Option.some(link.reason))
              } else if (link.value === id) {
                rows.push(each)
              }
            }
            return { rows, missing: Option.map(missing, reason => `${named}: ${reason}`) }
          },
        }),
    }
  }

  for (const given of tables) {
    const views: Array<HeldRow> = []
    const byId = new Map<unknown, HeldRow>()
    const table: Table = {
      entity: given.entity,
      complete: given.complete ?? true,
      hidden: new Set(given.hidden ?? []),
      byId,
      views,
    }
    for (const record of given.rows) {
      const each = view(table, record)
      views.push(each)
      byId.set(record.id, each)
    }
    byToken.set(given.entity.identity.token, table)
  }

  return {
    row: (entity, id) =>
      Option.flatMap(tableOf(entity.identity), table => Option.fromUndefinedOr(table.byId.get(id))),
    rows: entity =>
      Option.match(tableOf(entity.identity), { onNone: () => [], onSome: table => table.views }),
  }
}

const linksRead = new WeakMap<AnyQuery, ReadonlyArray<string>>()

/** The links a query reads on its own row: each key it reads that is no field of its Entity. */
const linksOf = (query: AnyQuery): ReadonlyArray<string> => {
  const known = linksRead.get(query)
  if (known !== undefined) return known
  const fields: Readonly<Record<string, unknown>> = query.entity.fields
  const links = Query.dependencies(query)
    .fields.filter(
      field =>
        field.owner.token === query.entity.identity.token && !Object.hasOwn(fields, field.key),
    )
    .map(field => field.key)
  linksRead.set(query, links)
  return links
}

/**
 * A row as a Source answers it and a Remote store keeps it, each `one`
 * relation as its ref key (`'User:ada'`), given as an interpreter reads it:
 * each link `query` reads as the id it points at. The row itself when the
 * query reads no link.
 */
const fromRefs = (
  query: AnyQuery,
  row: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> => {
  const links = linksOf(query)
  if (links.length === 0) return row
  const read: Record<string, unknown> = { ...row }
  for (const key of links) {
    const ref = row[key]
    if (ref !== null && ref !== undefined) read[key] = idOfRef(ref, `${query.entity.name}.${key}`)
  }
  return read
}

/** The id a ref key (`'User:ada'`) names, refusing what is none, as `where` holds it. */
export const idOfRef = (ref: unknown, where: string): string => {
  const separator = typeof ref === 'string' ? ref.indexOf(':') : -1
  if (separator === -1) {
    throw new Error(
      `[foldkit-entity] ${where} holds ${JSON.stringify(ref)}, which is no ref key ("Entity:id")`,
    )
  }
  return (ref as string).slice(separator + 1)
}

export const Held = {
  /** A value the holder has. */
  of: held,
  /** A value the holder does not have, and why. */
  unheld,
  match: <A, B>(
    value: Held<A>,
    cases: { readonly onHeld: (value: A) => B; readonly onUnheld: (reason: string) => B },
  ): B => (value._tag === 'Held' ? cases.onHeld(value.value) : cases.onUnheld(value.reason)),
  /** Rows held as plain records; see `HeldTable`. */
  rows: rowsOf,
  fromRefs,
}
