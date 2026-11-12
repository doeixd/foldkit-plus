// @vitest-environment node
/**
 * A Durable Object's reactions on workerd: the alarm the host sets before
 * replying runs a reaction that eviction cut off, on a new instance of the
 * object, and the external call it was making lands once.
 */
import { Stack } from 'foldkit-plus/testing/workers'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { workerMutation } from '../../../scripts/mutation-plugin.mjs'
import { exchange, upgradeSync } from '../src/client.js'
import type { WorkerEnv } from '../src/worker.js'

const here = (file: string) => fileURLToPath(new URL(file, import.meta.url))

let stack: Stack<WorkerEnv>

beforeAll(async () => {
  stack = await Stack.start<WorkerEnv>({
    wrangler: here('../wrangler.toml'),
    entry: here('./fixtures/reactionWorker.ts'),
    plugins: [workerMutation()],
    console: 'quiet',
  })
}, 120_000)

afterAll(async () => {
  await stack?.stop()
}, 120_000)

/** Rows of `table` for one run's key, or all of them; 0 before the reaction made the table. */
const keysIn = async (table: string): Promise<ReadonlyArray<string>> => {
  const db = (await stack.env()).DB
  const exists = await db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .bind(table)
    .first()
  if (exists === null) return []
  return (await db.prepare(`SELECT key FROM ${table}`).all<{ key: string }>()).results.map(
    row => row.key,
  )
}

const wrote = (replica: string, id: string) => ({
  protocolVersion: 1,
  schemaVersion: 1,
  documentId: 'notes',
  replicaId: replica,
  localSequence: 1,
  opId: `${replica}:1`,
  baseCursor: 0,
  message: { _tag: 'Wrote', id },
})

const send = async (replica: string, id: string) => {
  const writer = await upgradeSync(stack.dispatch, 'ada')
  expect(writer.status).toBe(101)
  const sent = await exchange(writer.socket!, { id: '1', cursor: 0, pending: [wrote(replica, id)] })
  expect((sent.result as { acknowledged: ReadonlyArray<string> }).acknowledged).toEqual([
    `${replica}:1`,
  ])
  return writer.socket!
}

/** The keys a run of the reaction wrote, for the one trigger it was asked about. */
const callsOf = async (exclude: ReadonlyArray<string>) =>
  (await keysIn('reaction_calls')).filter(key => !exclude.includes(key))

it('runs a reaction cut off by eviction from the alarm set before the reply, landing its call once', async () => {
  const socket = await send('tab', 'n1')
  // The run after the reply has started its call; the object is reset under it.
  await expect
    .poll(async () => (await keysIn('reaction_calls')).length, { timeout: 10_000 })
    .toBe(1)
  socket.close()
  await stack.dispatch('http://localhost/evict').catch(() => undefined)
  // The alarm, set before the reply, runs it again on a new instance (or, if
  // the reset landed on the alarm itself, the runtime's retry of it does).
  await expect
    .poll(async () => (await keysIn('notices')).length, { timeout: 30_000, interval: 250 })
    .toBe(1)
  const calls = await keysIn('reaction_calls')
  // Run more than once, so the first was cut off, and always as the same run.
  expect(calls.length).toBeGreaterThanOrEqual(2)
  expect(new Set(calls).size).toBe(1)
  expect(await keysIn('notices')).toEqual([calls[0]])
  const db = (await stack.env()).DB
  await expect
    .poll(
      async () =>
        (
          await db
            .prepare("SELECT replica_id FROM operations WHERE key = 'notes' ORDER BY sequence")
            .all<{ replica_id: string }>()
        ).results.map(row => row.replica_id),
      { timeout: 10_000 },
    )
    .toEqual(['tab', expect.stringMatching(/^server\/r\/notice\/[0-9a-f]{64}\/0$/)])
  // Nothing runs it again.
  await new Promise(resolve => setTimeout(resolve, 4_000))
  expect(await keysIn('notices')).toHaveLength(1)
  expect(await keysIn('reaction_calls')).toHaveLength(calls.length)
}, 90_000)

it('re-arms the alarm from inside alarm() after a failing run, until the run succeeds', async () => {
  const before = await keysIn('reaction_calls')
  const socket = await send('flaky-tab', 'flaky-1')
  // Two failures, each followed by the alarm the last pass set, then a success.
  await expect
    .poll(async () => (await keysIn('notices')).length, { timeout: 30_000, interval: 250 })
    .toBe(2)
  socket.close()
  const calls = await callsOf(before)
  expect(calls).toHaveLength(3)
  expect(new Set(calls).size).toBe(1)
}, 60_000)
