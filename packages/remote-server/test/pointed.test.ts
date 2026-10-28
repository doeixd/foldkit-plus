/**
 * The rows a declared write's answer names because its row points at them:
 * only for a write that wrote, read as its writer may see the row, and read
 * back only where the answer's own read returns them.
 */
import { Effect, Option, Schema } from 'effect'
import { Entity, Relation, Write } from 'foldkit-entity'
import { Mutation } from 'foldkit-remote'
import { describe, expect, it } from 'vitest'
import { RemoteServer, type EntitySource, type EntityWriter } from '../src/index.js'

const ProjectFields = Entity.define(
  'Project',
  Schema.Struct({ id: Schema.String, name: Schema.String }),
)
const Related = Entity.relate(
  { Project: ProjectFields, Note: Entity.define('Note', Schema.Struct({ id: Schema.String })) },
  { Note: { project: Relation.one(ProjectFields), former: Relation.one(ProjectFields) } },
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
    Effect.succeed(ids.flatMap(id => (id === 'p1' ? [{ id, values: { id, name: 'Open' } }] : []))),
}

/** A writer over note `n1`, in project `project` and formerly in `former`, whose delete answers `outcome`. */
const notes = (
  project: string,
  outcome: 'deleted' | 'absent',
  seen: (principal: string) => boolean,
  former = project,
): EntityWriter<string> => {
  const links = { project: `Project:${project}`, former: `Project:${former}` }
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

const remove = (writer: EntityWriter<string>, principal: string, fields: Array<string>) =>
  Effect.runPromise(
    RemoteServer.handlers(
      RemoteServer.make<string>({
        entities: [projects],
        mutations: [RemoteServer.write(DeleteNote, writer)],
      }),
      principal,
    ).FoldkitRemoteMutate({
      requestId: 'r',
      mutation: 'DeleteNote',
      input: { id: 'n1' },
      shown: [{ entity: 'Project', fields }],
    }),
  )

const everyone = () => true

describe('a declared delete’s answer', () => {
  it('reads the row its deleted row pointed at', async () => {
    const answer = await remove(notes('p1', 'deleted', everyone), 'ada', ['name'])
    expect(answer.read?.result.entities).toEqual([
      { entity: 'Project', id: 'p1', values: { name: 'Open' } },
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
