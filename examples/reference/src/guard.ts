/**
 * Who may do what, beside the domain. A member reads every note and every
 * member; a note is written (created, edited, deleted) by its author alone.
 * `isMember`'s body is the server's (`server.ts`).
 */
import { Schema } from 'effect'
import { Expr } from 'foldkit-plus/entity'
import { Guards } from 'foldkit-plus/guard'
import { AuthoredNote, CountedMember, Notebook } from './domain.js'

/** Who is asking: a member, by their account's id. */
export const Principal = Schema.Struct({ id: Schema.String })
export type Principal = typeof Principal.Type

export const G = Guards.declare(
  'Notebook',
  Principal,
  guard => ({
    isMember: guard.principal(),
    isAuthor: guard.row(Notebook.Note, p => Expr.eq(Notebook.Note.fields.authorId, p.id)),
  }),
  { key: principal => principal.id, unguarded: 'deny' },
)

export const Member = CountedMember.pipe(Guards.attach(G, { row: { Read: [G.isMember] } }))

/**
 * A note, written by its author alone. `may` tells the page which notes it
 * may edit: a hint for drawing the editor, never the check.
 */
export const Note = AuthoredNote.pipe(
  Guards.attach(G, { row: { Read: [G.isMember], Write: [G.isAuthor] } }),
  Guards.may,
)

/** Who the page is signed in as, as the server answered: one row, read like any other. */
export const Me = Guards.me(G, { interactions: {} })
