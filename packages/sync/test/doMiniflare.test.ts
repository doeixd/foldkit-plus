// @vitest-environment node
/**
 * The document host in a real worker: miniflare runs the bundled worker
 * with a Durable Object journaled on D1. An upgrade exchanges against the
 * object's journal, a second socket reads what the first committed, and the
 * operations persist in D1 — the deployment shape, not a double of it.
 */
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { Miniflare } from 'miniflare'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pendingOf } from './fixtures/todos.js'

const here = (file: string) => fileURLToPath(new URL(file, import.meta.url))

let mf: Miniflare

beforeAll(async () => {
  const bundled = await build({
    entryPoints: [here('./fixtures/documentWorker.ts')],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    conditions: ['foldkit-plus:source'],
    external: ['cloudflare:workers'],
    write: false,
    logLevel: 'silent',
  })
  const script = bundled.outputFiles[0]!.text
  mf = new Miniflare({
    modules: true,
    script,
    durableObjects: { SYNC_HOST: 'SyncHost' },
    d1Databases: ['DB'],
  })
  await mf.ready
}, 120_000)

afterAll(async () => {
  await mf.dispose()
}, 120_000)

interface ClientSocket {
  addEventListener(type: string, listener: (event: { data?: unknown }) => void): void
  removeEventListener(type: string, listener: (event: { data?: unknown }) => void): void
  send(data: string): void
  /** Miniflare's client end requires accept() before sending; browsers do not. */
  accept(): void
}

const upgrade = async (actor: string): Promise<ClientSocket> => {
  const response = await mf.dispatchFetch('http://localhost/sync', {
    headers: { Upgrade: 'websocket', 'x-actor': actor },
  })
  expect(response.status).toBe(101)
  const socket = response.webSocket as unknown as ClientSocket | null
  expect(socket).not.toBeNull()
  socket!.accept()
  return socket!
}

const roundTrip = (
  socket: ClientSocket,
  frame: { readonly id: string; readonly cursor: number; readonly pending: ReadonlyArray<unknown> },
): Promise<{ result?: unknown; error?: string }> =>
  new Promise(resolve => {
    const listener = (event: { data?: unknown }): void => {
      if (typeof event.data !== 'string') return
      const parsed = JSON.parse(event.data) as { id?: unknown; result?: unknown; error?: string }
      if (parsed.id !== frame.id) return
      socket.removeEventListener('message', listener)
      resolve(parsed)
    }
    socket.addEventListener('message', listener)
    socket.send(JSON.stringify(frame))
  })

describe('document host in a worker', () => {
  it('exchanges against the object journal and persists it in D1', async () => {
    const first = await upgrade('ada')
    const pending = await pendingOf('a', ['Milk'])
    const sent = await roundTrip(first, { id: '1', cursor: 0, pending })
    expect(sent.error).toBeUndefined()
    const result = sent.result as {
      operations: ReadonlyArray<unknown>
      rejected: ReadonlyArray<string>
      acknowledged: ReadonlyArray<string>
    }
    expect(result.rejected).toEqual([])
    expect(result.acknowledged).toHaveLength(1)
    expect(result.operations).toHaveLength(1)

    const second = await upgrade('grace')
    const caughtUp = await roundTrip(second, { id: '1', cursor: 0, pending: [] })
    expect(caughtUp.error).toBeUndefined()
    expect((caughtUp.result as { operations: ReadonlyArray<unknown> }).operations).toHaveLength(1)

    const db = await mf.getD1Database('DB')
    const rows = await db.prepare('SELECT op_id, sequence FROM operations ORDER BY sequence').all()
    expect(rows.results).toHaveLength(1)
    expect(rows.results?.[0]).toMatchObject({ sequence: 1 })
  }, 120_000)

  it('answers a non-upgrade without opening anything', async () => {
    const response = await mf.dispatchFetch('http://localhost/sync')
    expect(response.status).toBe(404)
  }, 120_000)
})
