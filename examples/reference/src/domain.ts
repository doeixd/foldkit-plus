/**
 * The domain, declared once: what a member and a note are, how they relate,
 * and the rules every stored note holds. The page and the Worker both read
 * it; `server.ts` compiles the rules into the table's CHECKs.
 */
import { Schema } from 'effect'
import { Derived, Entity, Relation } from 'foldkit-plus/entity'

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
)

export const Notebook = Entity.relate(
  { Member: MemberFields, Note: NoteFields },
  {
    Member: { notes: Relation.many(NoteFields) },
    Note: { author: Relation.one(MemberFields) },
  },
)

/** A member, with how many notes name them as author: the server counts, the page predicts. */
export const CountedMember = Notebook.Member.pipe(
  Entity.derived({ noteCount: Derived.count(Notebook.Note.relations.author) }),
)
