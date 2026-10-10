/**
 * How text compares when a query orders by it, declared rather than left to
 * the backend. Left unsaid, SQLite compares bytes, Postgres follows the
 * database's locale and a JavaScript sort follows UTF-16 code units, so the
 * same body could order the same rows three ways. A declared collation is one
 * every interpreter that can honour it compiles to the same order, and one
 * that cannot refuses.
 *
 * It is a trait of a field (`Entity.annotateMembers({ title: Collation.of(
 * Collation.binary) })`), so most queries declare nothing; an order term may
 * override it (`Order.asc(field, { collation })`).
 */
import { Option } from 'effect'
import { Metadata } from 'foldkit-metadata'

export type Collation =
  /** By code point: SQLite `BINARY`, Postgres `COLLATE "C"`. */
  | { readonly _tag: 'Binary' }
  /** ASCII letters folded to lower case, then by code point: SQLite `NOCASE`, Postgres `lower(x) COLLATE "C"`. */
  | { readonly _tag: 'AsciiFold' }
  /** The backend's collation by this name: ordered by the server, never by a client. */
  | { readonly _tag: 'Locale'; readonly locale: string }

const key = Metadata.key<Collation>('foldkit-entity/collation', {
  // The last collation attached wins: a later annotation refines an earlier one.
  merge: collations => collations.slice(-1),
  summarize: collation => collation._tag,
})

/** A collation name a backend can be told, and nothing that could be read as SQL. */
const localeName = /^[A-Za-z0-9_.@-]{1,64}$/

export const Collation = {
  binary: Object.freeze({ _tag: 'Binary' }) as Collation,
  asciiFold: Object.freeze({ _tag: 'AsciiFold' }) as Collation,
  locale: (locale: string): Collation => {
    if (!localeName.test(locale)) {
      throw new Error(`[foldkit-entity] Collation.locale: "${locale}" is not a collation name`)
    }
    return Object.freeze({ _tag: 'Locale', locale })
  },

  /** Member metadata: how a text field orders, wherever a query orders by it. */
  of: (collation: Collation): Metadata => key.of(collation),

  /** The collation a member's metadata declares, if any. */
  declared: (metadata: Metadata): Option.Option<Collation> =>
    Option.fromUndefinedOr(key.get(metadata)[0]),
}
