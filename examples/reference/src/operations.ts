/**
 * What the page reads and asks of the server: the rows each screen shows,
 * the notebook's one list, and three declared writes. A declared write is
 * data, so Remote shows it before the server answers and the server's
 * writer lands it with no handler.
 */
import { Schema } from 'effect'
import { Entity, Order, Write, type Selected } from 'foldkit-plus/entity'
import { Mutation, Query } from 'foldkit-plus/remote'
import { Notebook } from './domain.js'
import { Me, Member, Note } from './guard.js'

/** A note's author as a list shows them. */
const Author = Entity.select(Member, { name: true })

/** A note as the list draws it. */
export const NoteRow = Entity.select(Note, {
  id: true,
  title: true,
  createdAt: true,
  author: Author,
})
export type NoteRow = Selected<typeof NoteRow>

/** A note on its own page: everything, and whether the reader may edit it. */
export const NoteDetail = Entity.select(Note, {
  id: true,
  title: true,
  body: true,
  createdAt: true,
  may: true,
  author: Author,
})

/** Who a member is, and how much they have written. */
export const MemberCard = Entity.select(Member, { name: true, noteCount: true })

/** Every note, the newest first: the body D1 is asked for, and the order the page places by. */
export const Notes = Query.define('Notes', {}, () =>
  Query.from(Note).pipe(
    Query.orderBy(Order.desc(Note.fields.createdAt), Order.asc(Note.fields.id)),
  ),
)

const { title, body } = Notebook.Note.fields

/** What the add form asks for. */
export const NoteDraft = Schema.Struct({ title: title.schema, body: body.schema })

/**
 * A new note. The page sends its author and its time as well as what was
 * typed: Remote predicts only what the input says, so a note the server
 * stamped would show with no author and no place in the list until it
 * answered. The guard refuses a note in anyone else's name.
 */
export const NewNote = Schema.Struct({
  ...Entity.fields(Notebook.Note, 'id', 'createdAt'),
  ...NoteDraft.fields,
  authorId: Schema.String,
  author: Schema.String,
})

export const AddNote = Mutation.write(
  'AddNote',
  Write.insert(Entity.input(Note, NewNote, { author: 'author' }), { id: 'id' }),
)

export const NoteEdit = Schema.Struct({
  ...Entity.fields(Notebook.Note, 'id'),
  ...NoteDraft.fields,
})

export const EditNote = Mutation.write(
  'EditNote',
  Write.update(Entity.input(Note, NoteEdit), { id: 'id' }),
)

export const DeleteNote = Mutation.write(
  'DeleteNote',
  Write.delete(Entity.input(Note, Schema.Struct({ id: Schema.String })), { id: 'id' }),
)

/** How many notes the page reads, and the live list watches. */
export const NOTES_PAGE = 50

/**
 * The id a live stream subscribes to in order to watch the list
 * (`server.ts`'s `pollLive`). It names no note.
 */
export const NOTES_WATCH = 'notes-watch'

/** What Remote serves, named once for the page's `Remote.make` and the server's checks. */
export const served = {
  entities: [Member, Note, Me],
  queries: [Notes],
  mutations: [AddNote, EditNote, DeleteNote],
} as const
