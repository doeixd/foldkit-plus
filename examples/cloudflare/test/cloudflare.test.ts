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

/**
 * The first live change a fiber collects, or `null` if none arrives in time.
 * A stream that delivers nothing must fail the assertion, not hang the test.
 */
const firstWithin = (
  fiber: Fiber.Fiber<ReadonlyArray<unknown>, unknown>,
  ms = 5000,
): Promise<unknown> =>
  Promise.race([
    Effect.runPromise(Fiber.join(fiber)).then(changes => changes[0]),
    new Promise<null>(resolve => setTimeout(() => resolve(null), ms)),
  ])

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
    const change = await firstWithin(live)
    // The change is the toggle, not the row's opening values: a stream that
    // read no baseline emits its first tick's whole row instead.
    expect(change).toEqual({
      _tag: 'EntityPatched',
      cursor: 1,
      entity: 'Todo',
      id: 't1',
      values: { done: 1 },
      changed: ['done'],
    })

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

  it('carries a row that appears after the stream opened', async () => {
    // A subscription opened before the row existed reads no baseline for it,
    // and a tick that only reported settled values would never mention it.
    const remote = remoteClient(`${stack.origin}/remote`, 'ada', fetch)
    const waiting = Effect.runFork(
      firstChange(remote, [{ entity: 'Todo', id: 't9', fields: ['title', 'done'] }]),
    )
    await pause(300)
    const writer = await upgradeSync(stack.mf, 'ada')
    expect(writer.status).toBe(101)
    sockets.push(writer.socket!)
    await exchange(writer.socket!, {
      id: '1',
      cursor: 0,
      pending: [syncOp('appeared', 1, { _tag: 'CreatedTodo', id: 't9', title: 'Bread' })],
    })
    const appeared = await firstWithin(waiting)
    expect(appeared).toEqual({
      _tag: 'EntityPatched',
      cursor: 1,
      entity: 'Todo',
      id: 't9',
      values: { title: 'Bread', done: 0 },
      changed: ['title', 'done'],
    })
  }, 120_000)

  it('renames and deletes a row, and live drops it', async () => {
    const remote = remoteClient(`${stack.origin}/remote`, 'ada', fetch)
    const writer = await upgradeSync(stack.mf, 'ada')
    expect(writer.status).toBe(101)
    expect(writer.socket).not.toBeNull()
    sockets.push(writer.socket!)

    const created = await exchange(writer.socket!, {
      id: '1',
      cursor: 0,
      pending: [syncOp('crud', 1, { _tag: 'CreatedTodo', id: 't-crud', title: 'Eggs' })],
    })
    expect(created.error).toBeUndefined()
    const renamed = await exchange(writer.socket!, {
      id: '2',
      cursor: 0,
      pending: [syncOp('crud', 2, { _tag: 'RenamedTodo', id: 't-crud', title: 'Rolls' })],
    })
    expect(renamed.error).toBeUndefined()

    const read = await readTodo(remote, 't-crud', ['title', 'done'])
    expect(read.entities).toEqual([
      { entity: 'Todo', id: 't-crud', values: { title: 'Rolls', done: 0 } },
    ])
    const rows = await stack.db
      .prepare('SELECT title, done FROM todos WHERE id = ?')
      .bind('t-crud')
      .all()
    expect(rows.results).toEqual([{ title: 'Rolls', done: 0 }])

    const waiting = Effect.runFork(
      firstChange(remote, [{ entity: 'Todo', id: 't-crud', fields: ['title', 'done'] }]),
    )
    await pause(300)
    const deleted = await exchange(writer.socket!, {
      id: '3',
      cursor: 0,
      pending: [syncOp('crud', 3, { _tag: 'DeletedTodo', id: 't-crud' })],
    })
    expect(deleted.error).toBeUndefined()
    const gone = await firstWithin(waiting)
    expect(gone).toEqual({
      _tag: 'EntityDeleted',
      cursor: 1,
      entity: 'Todo',
      id: 't-crud',
    })

    const after = await readTodo(remote, 't-crud', ['title'])
    expect(after.entities).toEqual([])
    expect(await queryTodos(remote, { first: 50 })).not.toContain('t-crud')
    const left = await stack.db.prepare('SELECT id FROM todos WHERE id = ?').bind('t-crud').all()
    expect(left.results).toEqual([])
  }, 120_000)

  it('answers a non-upgrade without opening anything', async () => {
    const response = await fetch(`${stack.origin}/sync`)
    expect(response.status).toBe(404)
  }, 120_000)

  it('accepts a header-less read and answers a preflight', async () => {
    const response = await fetch(`${stack.origin}/remote?actor=ada`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        operation: 'query',
        payload: { query: 'AllTodos', input: {}, window: { first: 1 } },
      }),
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    const body = (await response.json()) as { result?: { edges: unknown }; error?: string }
    expect(body.error).toBeUndefined()
    expect(Array.isArray(body.result?.edges)).toBe(true)

    const preflight = await fetch(`${stack.origin}/remote`, {
      method: 'OPTIONS',
      headers: { 'access-control-request-headers': 'content-type, x-actor' },
    })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-headers')).toBe('content-type, x-actor')
  }, 120_000)
})
