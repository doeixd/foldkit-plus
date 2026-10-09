// @vitest-environment node
/**
 * The example worker, end to end on miniflare over real HTTP: Remote reads
 * an empty list, a Sync exchange commits through the object, `settle`
 * applies it where Remote reads it back, and a live stream carries the next
 * commit. D1 holds the operations underneath it all.
 */
import { Effect, Fiber } from 'effect'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  exchange,
  firstChange,
  pause,
  queryTodos,
  readTodo,
  remoteClient,
  syncOp,
  upgradeSync,
  type ClientSocket,
} from '../src/client.js'
import { startStack, type CloudflareStack } from '../src/stack.js'

let stack: CloudflareStack
const sockets: Array<ClientSocket> = []

beforeAll(async () => {
  stack = await startStack()
}, 120_000)

afterAll(async () => {
  for (const socket of sockets) socket.close()
  await stack.stop()
}, 120_000)

describe('cloudflare example', () => {
  it('writes through Sync, reads through Remote, and pushes live', async () => {
    const remote = remoteClient(`${stack.origin}/remote`, 'ada', fetch)

    expect(await queryTodos(remote, { first: 10 })).toEqual([])

    const writer = await upgradeSync(stack.mf, 'ada')
    expect(writer.status).toBe(101)
    expect(writer.socket).not.toBeNull()
    sockets.push(writer.socket!)
    const sent = await exchange(writer.socket!, {
      id: '1',
      cursor: 0,
      pending: [syncOp('demo', 1, { _tag: 'CreatedTodo', id: 't1', title: 'Milk' })],
    })
    expect(sent.error).toBeUndefined()
    expect((sent.result as { acknowledged: ReadonlyArray<string> }).acknowledged).toEqual([
      'demo:1',
    ])

    const rows = await stack.db.prepare('SELECT id, title, done FROM todos').all()
    expect(rows.results).toEqual([{ id: 't1', title: 'Milk', done: 0 }])

    const read = await readTodo(remote, 't1', ['id', 'title', 'done'])
    expect(read.entities).toEqual([
      { entity: 'Todo', id: 't1', values: { id: 't1', title: 'Milk', done: 0 } },
    ])

    const live = Effect.runFork(
      firstChange(remote, [{ entity: 'Todo', id: 't1', fields: ['done'] }]),
    )
    await pause(300)
    const toggled = await exchange(writer.socket!, {
      id: '2',
      cursor: 1,
      pending: [syncOp('demo', 2, { _tag: 'ToggledTodo', id: 't1' })],
    })
    expect(toggled.error).toBeUndefined()
    const [change] = await Effect.runPromise(Fiber.join(live))
    expect(change).toMatchObject({ _tag: 'EntityPatched', entity: 'Todo', id: 't1' })

    const flipped = await readTodo(remote, 't1', ['done'])
    expect(flipped.entities).toEqual([{ entity: 'Todo', id: 't1', values: { done: 1 } }])

    const reader = await upgradeSync(stack.mf, 'grace')
    expect(reader.status).toBe(101)
    expect(reader.socket).not.toBeNull()
    sockets.push(reader.socket!)
    const caughtUp = await exchange(reader.socket!, { id: '1', cursor: 0, pending: [] })
    expect(caughtUp.error).toBeUndefined()
    expect((caughtUp.result as { operations: ReadonlyArray<unknown> }).operations).toHaveLength(2)
  }, 120_000)

  it('answers a non-upgrade without opening anything', async () => {
    const response = await fetch(`${stack.origin}/sync`)
    expect(response.status).toBe(404)
  }, 120_000)
})
