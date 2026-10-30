/**
 * The rows a declared write's answer names because its row points at them:
 * only where the link can change a derived member of the row, only for a write
 * that wrote, read as its writer may see the row, and read back only where the
 * answer's own read returns them.
 */
import { Effect, Option, Schema } from 'effect'
import { Derived, Entity, Relation, Write } from 'foldkit-entity'
import { Mutation } from 'foldkit-remote'
import { describe, expect, it } from 'vitest'
import { RemoteServer, type EntitySource, type EntityWriter } from '../src/index.js'

const ProjectFields = Entity.define(
  'Project',
  Schema.Struct({ id: Schema.String, name: Schema.String }),
)
const UserFields = Entity.define('User', Schema.Struct({ id: Schema.String }))
const Related = Entity.relate(
  {
    Project: ProjectFields,
    User: UserFields,
    Note: Entity.define('Note', Schema.Struct({ id: Schema.String })),
    Comment: Entity.define('Comment', Schema.Struct({ id: Schema.String })),
  },
  {
    Comment: { editor: Relation.one(UserFields) },
    Note: {
      project: Relation.one(ProjectFields),
      former: Relation.one(ProjectFields),
      editor: Relation.one(UserFields),
      reviewer: Relation.one(UserFields),
    },
  },
)
// Declared after `relate`, as Chirp's like count is: the Note's links reach them all the same.
// A supplied score may read anything, so every link to a project can change it.
Related.Project.pipe(
  Entity.derived({
    noteCount: Derived.count(Related.Note.relations.project),
    score: Derived.make(Schema.Number),
  }),
)
// A user's members read a Note's `reviewer` and a Comment's `editor`, so a Note's
// `editor` changes nothing of its user.
Related.User.pipe(
  Entity.derived({
    commentsEdited: Derived.count(Related.Comment.relations.editor),
    reviewed: Derived.count(Related.Note.relations.reviewer),
    reviewedBy: Derived.exists(Related.Note.relations.reviewer, {
      viewer: Related.Note.relations.editor,
    }),
  }),
)
const DeleteNote = Mutation.write(
  'DeleteNote',
  Write.delete(Entity.input(Related.Note, Schema.Struct({ id: Schema.String })), { id: 'id' }),
)

/** Projects as stored; `p-closed` is read by no one. */
const projects: EntitySource<string> = {
  entity: 'Project',
  fields: new Set(['id', 'name']),
  read: ({ ids }) =>
    Effect.succeed(
      ids.flatMap(id => (id === 'p-closed' ? [] : [{ id, values: { id, name: `Open ${id}` } }])),
    ),
}

/** Users as stored: each is read. */
const users: EntitySource<string> = {
  entity: 'User',
  fields: new Set(['id']),
  read: ({ ids }) => Effect.succeed(ids.map(id => ({ id, values: { id } }))),
}

/** A writer over note `n1`, in project `project` and formerly in `former`, whose delete answers `outcome`. */
const notes = (
  project: string,
  outcome: 'deleted' | 'absent',
  seen: (principal: string) => boolean,
  former = project,
): EntityWriter<string> => {
  const links = {
    project: `Project:${project}`,
    former: `Project:${former}`,
    editor: 'User:u-editor',
    reviewer: 'User:u-reviewer',
  }
  return {
    entity: 'Note',
    update: () => Effect.die('no updates'),
    insert: () => Effect.die('no inserts'),
    delete: () => Effect.succeed(outcome),
    linked: () => Effect.succeed(Option.some(links)),
    read: ({ principal }) =>
      Effect.succeed(seen(principal) ? Option.some({ id: 'n1', ...links }) : Option.none()),
  }
}

const remove = (
  writer: EntityWriter<string>,
  principal: string,
  fields: Array<string>,
  shownUsers: Array<string> = [],
) =>
  Effect.runPromise(
    RemoteServer.handlers(
      RemoteServer.make<string>({
        entities: [projects, users],
        mutations: [RemoteServer.write(DeleteNote, writer)],
      }),
      principal,
    ).FoldkitRemoteMutate({
      requestId: 'r',
      mutation: 'DeleteNote',
      input: { id: 'n1' },
      shown: [
        { entity: 'Project', fields },
        { entity: 'User', fields: shownUsers },
      ],
    }),
  )

const everyone = () => true

describe('a declared delete’s answer', () => {
  it('reads the row its deleted row pointed at', async () => {
    const answer = await remove(notes('p1', 'deleted', everyone), 'ada', ['name'])
    expect(answer.read?.result.entities).toEqual([
      { entity: 'Project', id: 'p1', values: { name: 'Open p1' } },
    ])
  })

  it('reads no row whose derived members the link cannot change', async () => {
    const answer = await remove(notes('p1', 'deleted', everyone, 'p2'), 'ada', ['name'], ['id'])
    expect(answer.read?.result.entities).toEqual([
      { entity: 'Project', id: 'p1', values: { name: 'Open p1' } },
      { entity: 'Project', id: 'p2', values: { name: 'Open p2' } },
      { entity: 'User', id: 'u-reviewer', values: { id: 'u-reviewer' } },
    ])
  })

  it('names nothing for a delete that deleted nothing', async () => {
    const answer = await remove(notes('p1', 'absent', everyone), 'ada', ['name'])
    expect(answer.read).toBeUndefined()
  })

  it('names nothing its writer may not see of the row, whatever is stored', async () => {
    const answer = await remove(
      notes('p1', 'deleted', principal => principal === 'ada'),
      'bo',
      ['name'],
    )
    expect(answer.read).toBeUndefined()
  })

  it('reads back no row its own read does not return, nor settles one', async () => {
    for (const fields of [['name'], ['bogus']]) {
      const answer = await remove(notes('p-closed', 'deleted', everyone), 'ada', fields)
      expect(answer.read).toBeUndefined()
    }
  })

  it('settles a field of a row it reached that the row does not have, and only of it', async () => {
    const answer = await remove(notes('p1', 'deleted', everyone, 'p-closed'), 'ada', [
      'name',
      'bogus',
    ])
    expect(answer.read?.result.settled).toEqual([
      { entity: 'Project', id: 'p1', fields: ['bogus'] },
    ])
  })
})
