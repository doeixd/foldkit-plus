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

const count = async (table: string): Promise<number> => {
  const db = (await stack.env()).DB
  const exists = await db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .bind(table)
    .first()
  if (exists === null) return 0
  return Number(await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first('n'))
}

it('runs a reaction cut off by eviction from the alarm set before the reply, landing its call once', async () => {
  const writer = await upgradeSync(stack.dispatch, 'ada')
  expect(writer.status).toBe(101)
  const sent = await exchange(writer.socket!, {
    id: '1',
    cursor: 0,
    pending: [
      {
        protocolVersion: 1,
        schemaVersion: 1,
        documentId: 'notes',
        replicaId: 'tab',
        localSequence: 1,
        opId: 'tab:1',
        baseCursor: 0,
        message: { _tag: 'Wrote', id: 'n1' },
      },
    ],
  })
  expect((sent.result as { acknowledged: ReadonlyArray<string> }).acknowledged).toEqual(['tab:1'])
  // The run after the reply has started its call; the object is reset under it.
  await expect.poll(() => count('reaction_calls'), { timeout: 10_000 }).toBe(1)
  writer.socket!.close()
  await stack.dispatch('http://localhost/evict').catch(() => undefined)
  // The alarm, set before the reply, runs it again on a new instance.
  await expect.poll(() => count('notices'), { timeout: 20_000, interval: 250 }).toBe(1)
  expect(await count('reaction_calls')).toBe(2)
  const db = (await stack.env()).DB
  await expect
    .poll(
      async () =>
        (
          await db
            .prepare("SELECT op_id FROM operations WHERE key = 'notes' ORDER BY sequence")
            .all<{ op_id: string }>()
        ).results.map(row => row.op_id),
      { timeout: 10_000 },
    )
    .toEqual(['tab:1', 'server/r/notice/0:1'])
  // Nothing runs it a third time.
  await new Promise(resolve => setTimeout(resolve, 3_000))
  expect(await count('notices')).toBe(1)
  expect(await count('reaction_calls')).toBe(2)
}, 60_000)
