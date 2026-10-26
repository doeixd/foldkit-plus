/**
 * `Crud.screen`: its Messages are named after it, each is answered through the
 * placement helper it names, every other Message reaches the page's `update`,
 * and the editor's sync runs after all of them.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { describe, expect, it } from 'vitest'
import { Crud } from '../src/index.js'

const PostId = Schema.String.pipe(Schema.brand('PostId'))
const Posts = Crud.screen('Post', { id: PostId })
const Message = defineMessageUnion({ ...Posts.messages, Searched: { text: Schema.String } })
type Message = typeof Message.Type

/** A page Model that records what reached it, in order. */
type Root = { readonly log: ReadonlyArray<string> }
const noted =
  (what: string) =>
  (model: Root): { readonly model: Root } => ({ model: { log: [...model.log, what] } })

const pieces = {
  editor: {
    after:
      <M, R extends { readonly model: Root }>(update: (model: Root, message: M) => R) =>
      (model: Root, message: M): R => {
        const next = update(model, message)
        return { ...next, model: { log: [...next.model.log, 'synced'] } }
      },
  },
  editing: {
    helpers: {
      open: (id: string) => noted(`open ${id}`),
      blank: () => noted('blank'),
      close: () => noted('close'),
    },
  },
  removing: { helpers: { ask: (id: string) => noted(`ask ${id}`) } },
}
const page = (model: Root, message: Message) => noted(`page ${message._tag}`)(model)
const update = Posts.update(pieces, page)
const run = (message: Message) => update({ log: [] }, message).model.log

describe('Crud.screen', () => {
  it('names its Messages after the screen', () => {
    expect(Object.keys(Posts.messages)).toEqual([
      'OpenedPost',
      'CreatedPost',
      'ClosedPost',
      'AskedToRemovePost',
    ])
  })

  // Each Message is made in its test, so a screen that misnames one fails the
  // test rather than the file.
  it.each([
    ['OpenedPost', () => Message.OpenedPost({ id: PostId.make('p1') }), ['open p1', 'synced']],
    ['CreatedPost', () => Message.CreatedPost(), ['blank', 'synced']],
    ['ClosedPost', () => Message.ClosedPost(), ['close', 'synced']],
    [
      'AskedToRemovePost',
      () => Message.AskedToRemovePost({ id: PostId.make('p2') }),
      ['ask p2', 'synced'],
    ],
    ['Searched', () => Message.Searched({ text: 'a' }), ['page Searched', 'synced']],
  ] as const)(
    'answers %s through the helper it names, then syncs the editor',
    (_, message, log) => {
      expect(run(message())).toEqual(log)
    },
  )

  it('hands a delete to the page when it has no remover', () => {
    const { removing: _, ...creating } = pieces
    const withoutRemover = Posts.update(creating, page)
    expect(
      withoutRemover({ log: [] }, Message.AskedToRemovePost({ id: PostId.make('p2') })).model.log,
    ).toEqual(['page AskedToRemovePost', 'synced'])
  })
})
