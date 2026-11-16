/**
 * A mutation's answer carries only what its caller may read of the rows its
 * handler patched (#578): the handler's values, cut by the source's `authorize`
 * and `filter`, while the live hub is told the whole outcome.
 */
import { Effect, Schema } from 'effect'
import { Diagnostics, Entity, Mutation, Remote, type RelationRequirement } from 'foldkit-remote'
import { describe, expect, it } from 'vitest'
import { RemoteServer, RemoteServerError, type LiveHub } from '../src/index.js'

const Fields = { id: Schema.String, title: Schema.String, secret: Schema.String }
const Doc = Entity.make('Doc', Schema.Struct(Fields))
const Open = Entity.make('Open', Schema.Struct(Fields))
const Flaky = Entity.make('Flaky', Schema.Struct(Fields))
const Absent = Entity.make('Absent', Schema.Struct(Fields))
const Sealed = Entity.make('Sealed', Schema.Struct(Fields))

const Touch = Mutation.make('Touch', { Input: {}, Output: Schema.Struct({ note: Schema.String }) })

const stored = (id: string) => ({ id, title: `title ${id}`, secret: `secret ${id}` })

const reads = new Map<string, number>()
const counted = (entity: string) => reads.set(entity, (reads.get(entity) ?? 0) + 1)

const rowsOf = (ids: ReadonlyArray<string>, fields: ReadonlyArray<string>) =>
  ids.map(id => {
    const row: Record<string, unknown> = stored(id)
    return { id, values: Object.fromEntries(fields.map(field => [field, row[field]])) }
  })

const server = RemoteServer.make({
  entities: [
    RemoteServer.entity<string>(Doc, {
      // The reader may not read a secret, and the row `hidden` not at all.
      authorize: (_, fields) => fields.filter(field => field !== 'secret'),
      filter: () =>
        Effect.succeed({
          fields: ['id', 'title'],
          apply: record => (record.id === 'hidden' ? { ...record, values: {} } : record),
        }),
      read: ({ ids, fields }) => Effect.sync(() => (counted('Doc'), rowsOf(ids, fields))),
    }),
    // No reader rule: the answer is the handler's, with no read to check it.
    RemoteServer.entity<string>(Open, {
      read: ({ ids, fields }) => Effect.sync(() => (counted('Open'), rowsOf(ids, fields))),
    }),
    RemoteServer.entity<string>(Flaky, {
      authorize: (_, fields) => fields,
      read: () =>
        Effect.fail(new RemoteServerError({ message: 'the replica is away', told: true })),
    }),
    // Row visibility is the source's own (a Drizzle binding's `visible`): the read applies it.
    {
      ...RemoteServer.entity<string>(Sealed, {
        read: ({ ids, fields }) =>
          Effect.sync(
            () => (counted('Sealed'), rowsOf(ids, fields).filter(row => row.id !== 's2')),
          ),
      }),
      visible: 'rows of the principal',
    },
    // A row the read does not return at all: it is gone, or not the reader's.
    RemoteServer.entity<string>(Absent, {
      authorize: (_, fields) => fields,
      read: () => Effect.succeed([]),
    }),
  ],
  mutations: [
    RemoteServer.mutation(Touch, () =>
      Effect.succeed({
        output: { note: 'saved' },
        entities: [
          Remote.patch(Doc, 'p1', { title: 'New', secret: 'Hush' }),
          Remote.patch(Doc, 'hidden', { title: 'Hidden', secret: 'Hush' }),
          Remote.patch(Doc, 'p2', { secret: 'Only' }),
          Remote.patch(Open, 'o1', { title: 'Open', secret: 'Said' }),
          Remote.patch(Flaky, 'f1', { title: 'Flaky' }),
          Remote.patch(Absent, 'a1', { title: 'Gone' }),
          Remote.patch(Sealed, 's1', { title: 'Seen' }),
          Remote.patch(Sealed, 's2', { title: 'Unseen' }),
        ],
      }),
    ),
  ],
})

const fakeHub = () => {
  const changed: Array<{ entity: string; id: string; fields: ReadonlyArray<string> }> = []
  const hub: LiveHub<string> = {
    changed: (ref, fields) => Effect.sync(() => void changed.push({ ...ref, fields })),
    deleted: () => Effect.void,
    subscribe: () => {
      throw new Error('unused')
    },
    size: Effect.succeed(0),
  }
  return { hub, changed }
}

const touch = async (shown: ReadonlyArray<RelationRequirement> = []) => {
  reads.clear()
  const collected = Diagnostics.collect()
  const { hub, changed } = fakeHub()
  const answer = await Effect.runPromise(
    RemoteServer.handlers(server, 'reader', { live: hub })
      .FoldkitRemoteMutate({ requestId: 'r1', mutation: 'Touch', input: {}, shown })
      .pipe(Effect.provideService(Diagnostics.Reporter, collected.report)),
  )
  return { answer, changed, reported: collected.reported }
}

describe('what a mutation answers of the rows its handler patched', () => {
  it('cuts each patch to what the caller may read of its row, with the handler values', async () => {
    const { answer } = await touch()
    expect(answer.entities).toEqual([
      // A field `authorize` withholds is cut, the others stay the handler's.
      { entity: 'Doc', id: 'p1', values: { title: 'New' } },
      // A patch of only a withheld field says nothing, and so is not sent.
      // `filter` left the row `hidden` no member to read: not sent either.
      { entity: 'Open', id: 'o1', values: { title: 'Open', secret: 'Said' } },
      // A source whose rows are hidden by `visible` alone is read too: `s2` is not the caller's.
      { entity: 'Sealed', id: 's1', values: { title: 'Seen' } },
    ])
  })

  it('sends no patch for a row the read does not return, or one whose read failed', async () => {
    const { answer } = await touch()
    const entities = answer.entities.map(patch => patch.entity)
    expect(entities).not.toContain('Absent')
    expect(entities).not.toContain('Flaky')
  })

  it('still succeeds when the read fails, and reports it', async () => {
    const { answer, reported } = await touch()
    expect(answer.output).toEqual({ note: 'saved' })
    expect(reported).toMatchObject([
      { _tag: 'AnswerUnread', mutation: 'Touch', reason: expect.stringContaining('away') },
    ])
  })

  it('reads an entity with no reader rule not at all, and each ruled one once', async () => {
    await touch()
    expect(reads.get('Open')).toBeUndefined()
    expect(reads.get('Doc')).toBe(1)
  })

  it('tells the live hub every patch, whatever the caller may read of it', async () => {
    const { changed } = await touch()
    expect(changed).toEqual([
      { entity: 'Doc', id: 'p1', fields: ['title', 'secret'] },
      { entity: 'Doc', id: 'hidden', fields: ['title', 'secret'] },
      { entity: 'Doc', id: 'p2', fields: ['secret'] },
      { entity: 'Open', id: 'o1', fields: ['title', 'secret'] },
      { entity: 'Flaky', id: 'f1', fields: ['title'] },
      { entity: 'Absent', id: 'a1', fields: ['title'] },
      { entity: 'Sealed', id: 's1', fields: ['title'] },
      { entity: 'Sealed', id: 's2', fields: ['title'] },
    ])
  })

  it('reads again a key it cut from a patch, and every key of a row it did not send', async () => {
    const { answer } = await touch([{ entity: 'Doc', fields: ['title', 'secret'] }])
    expect(answer.read?.requests).toEqual([
      { entity: 'Doc', id: 'p1', fields: ['secret'] },
      { entity: 'Doc', id: 'hidden', fields: ['title', 'secret'] },
      { entity: 'Doc', id: 'p2', fields: ['title', 'secret'] },
    ])
  })
})
