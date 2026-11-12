// @vitest-environment node
/**
 * The dist lock the bundle report takes (#527): a live holder is waited for, a holder that died
 * is replaced at once instead of after the age limit.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, expect, test } from 'vitest'
import { lockDist } from '../bundle-report.mjs'

const scratch = mkdtempSync(join(tmpdir(), 'bundle-lock-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

// A pid no process has: Linux's pid_max is at most 2^22.
const DEAD_PID = 4_194_304 + 7

test('a lock held by a dead process is taken at once', async () => {
  const lock = join(scratch, 'dead')
  mkdirSync(lock)
  writeFileSync(join(lock, 'pid'), String(DEAD_PID))
  const release = await lockDist(lock)
  release()
})

test('a lock held by a live process is waited for until it is released', async () => {
  const lock = join(scratch, 'live')
  const release = await lockDist(lock)
  let taken = false
  const second = lockDist(lock).then(done => {
    taken = true
    done()
  })
  await new Promise(done => setTimeout(done, 600))
  expect(taken).toBe(false)
  release()
  await second
  expect(taken).toBe(true)
})
