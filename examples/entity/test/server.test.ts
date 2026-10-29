// @vitest-environment node
/**
 * The handlers that write more than one row do it in one transaction: a
 * second statement that fails takes the first back with it.
 */
import { Effect, Exit, Layer, Option } from 'effect'
import { Remote, RemoteClient } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { afterEach, describe, expect, it } from 'vitest'
import { openServer } from '../src/server.js'

const opened: Array<ReturnType<typeof openServer>> = []
afterEach(() => {
  for (const backend of opened.splice(0)) backend.close()
})

const mutate = (
  backend: ReturnType<typeof openServer>,
  mutation: string,
  input: Readonly<Record<string, unknown>>,
) =>
  Effect.runPromise(
    RemoteClient.use(client => client.mutate({ requestId: 'r1', mutation, input })).pipe(
      Effect.exit,
      Effect.provide(
        Remote.clientLayer(RemoteServer.handlers(backend.server, Option.none())).pipe(
          Layer.provide(backend.layer),
        ),
      ),
    ),
  )

const open = () => {
  const backend = openServer()
  opened.push(backend)
  return backend
}

describe('a handler that writes several rows', () => {
  it('writes a post and its author together, or neither', async () => {
    const backend = open()
    // The next post's id is taken, so the post fails after its author is in.
    backend.exec(`insert into posts values ('p3', 'Taken', 0, 'a1', null)`)
    const failed = await mutate(backend, 'WritePost', {
      title: 'Lost',
      author: { name: 'Lovelace' },
    })
    expect(Exit.isFailure(failed)).toBe(true)
    expect(backend.count('authors')).toBe(2)

    // Nothing in the way: both are written.
    const written = await mutate(backend, 'WritePost', {
      title: 'Found',
      author: { name: 'Hopper' },
    })
    expect(Exit.isSuccess(written)).toBe(true)
    expect(backend.count('authors')).toBe(3)
  })

  it('deletes a post and its comments together, or neither', async () => {
    const backend = open()
    backend.exec(
      `create trigger kept before delete on posts begin select raise(abort, 'kept'); end`,
    )
    const failed = await mutate(backend, 'DeletePost', { id: 'p1' })
    expect(Exit.isFailure(failed)).toBe(true)
    expect(backend.count('comments')).toBe(2)
  })
})
