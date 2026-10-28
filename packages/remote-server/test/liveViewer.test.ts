/**
 * A live hub whose `key` shares re-reads between readers (a role) still reads
 * a member answered per viewer once per viewer: one reader's `liked` never
 * reaches another who shares their key.
 */
import { Effect, Fiber, Option, Schema, Stream } from 'effect'
import { Entity } from 'foldkit-remote'
import { describe, expect, it } from 'vitest'
import { RemoteServer, type EntitySource } from '../src/index.js'

const Post = Entity.make(
  'Post',
  Schema.Struct({ id: Schema.String, title: Schema.String, liked: Schema.String }),
)

interface Reader {
  readonly id: string
  readonly role: string
}

/** Each read, by the viewer it was made for. */
const reads: Array<string> = []

/** `liked` names who reads it; `title` is everyone's alike. */
const source = (perViewer: ReadonlyArray<string>): EntitySource<Reader> => ({
  ...RemoteServer.entity<Reader>(Post, {
    read: ({ ids, fields, viewer }) =>
      Effect.sync(() => {
        const who = Option.match(viewer ?? Option.none(), {
          onNone: () => 'nobody',
          onSome: ref => ref.id,
        })
        reads.push(who)
        return ids.map(id => ({
          id,
          values: Object.fromEntries(
            fields.map(field => [field, field === 'liked' ? `by ${who}` : 'Hello']),
          ),
        }))
      }),
  }),
  perViewer,
})

/** What each reader is sent after `p1` changes, its re-reads shared by role. */
const sent = (perViewer: ReadonlyArray<string>, readers: ReadonlyArray<Reader>) => {
  reads.length = 0
  return Effect.runPromise(
    Effect.gen(function* () {
      const hub = yield* RemoteServer.liveHub([source(perViewer)], {
        key: reader => reader.role,
      })
      const fibers = yield* Effect.forEach(readers, reader =>
        Effect.forkChild(
          hub
            .subscribe({
              requirements: [{ entity: 'Post', id: 'p1', fields: ['title', 'liked'] }],
              after: 0,
              principal: reader,
              viewer: Option.some({ entity: 'User', id: reader.id }),
            })
            .pipe(Stream.take(1), Stream.runCollect),
        ),
      )
      for (let turn = 0; turn < 100; turn++) yield* Effect.yieldNow
      yield* hub.changed({ entity: 'Post', id: 'p1' }, ['title', 'liked'])
      return yield* Effect.forEach(fibers, Fiber.join)
    }),
  )
}

const ada = { id: 'ada', role: 'member' }
const bob = { id: 'bob', role: 'member' }

describe('a live hub keyed coarser than its readers', () => {
  it('reads a member answered per viewer once for each viewer', async () => {
    expect(await sent(['liked'], [ada, bob])).toMatchObject([
      [{ _tag: 'EntityPatched', values: { liked: 'by ada' } }],
      [{ _tag: 'EntityPatched', values: { liked: 'by bob' } }],
    ])
    expect(reads).toEqual(['ada', 'bob'])
  })

  it('still shares one read where no member is per viewer', async () => {
    await sent([], [ada, bob])
    expect(reads).toEqual(['ada'])
  })
})
