/**
 * The domain, declared once: what a member and a note are, how they relate,
 * and the rules every stored note holds. The page and the Worker both read
 * it; `server.ts` compiles the rules into the table's CHECKs.
 */
import { Schema } from 'effect'
import { Collation, Derived, Entity, Relation, Stamp } from 'foldkit-plus/entity'

const MemberFields = Entity.define(
  'Member',
  Schema.Struct({ id: Schema.String, name: Schema.String }),
)

/**
 * Characters as people count them (code points), which is what SQL counts:
 * each rule here is one SQL holds exactly, so the table refuses what the
 * form does.
 */
const NoteFields = Entity.define(
  'Note',
  Schema.Struct({
    id: Schema.String,
    authorId: Schema.String,
    title: Schema.String.check(Schema.isMinLength(1), Schema.isMaxCodePoints(120)).annotate({
      title: 'Title',
    }),
    body: Schema.String.check(Schema.isMaxCodePoints(2000)).annotate({ title: 'Note' }),
    createdAt: Schema.Number,
    /** Moved on by every write the server lands, so a write lands only on the note its rules judged. */
    revision: Schema.Number,
  }),
).pipe(
  // D1 compares text as BINARY over UTF-8, said so the page can place a new
  // note where the list's order (newest first, then by id) puts it.
  Entity.annotateMembers({ id: Collation.of(Collation.binary) }),
)

export const Notebook = Entity.relate(
  { Member: MemberFields, Note: NoteFields },
  {
    Member: { notes: Relation.many(NoteFields) },
    Note: { author: Relation.one(MemberFields) },
  },
)

/**
 * A note is whoever wrote it, made when the server lands it: its author (the
 * field the guards read, and the link the count follows, one column) and its
 * time. No input sets them; the server stamps them, and the page predicts them.
 */
export const AuthoredNote = Notebook.Note.pipe(
  Entity.stamps({ authorId: Stamp.viewer, author: Stamp.viewer, createdAt: Stamp.clock }),
)

/** A member, with how many notes name them as author: the server counts, the page predicts. */
export const CountedMember = Notebook.Member.pipe(
  Entity.derived({ noteCount: Derived.count(Notebook.Note.relations.author) }),
)
