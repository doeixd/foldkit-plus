// @vitest-environment node
/**
 * `CacheStore.kv` on workerd, over a real KV binding (#468): an answer is
 * written on its second ask, served from KV, deleted by a purge naming its
 * tag, and what KV refuses or fails serves the response and keeps nothing.
 */
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { workerMutation } from '../../../scripts/mutation-plugin.mjs'
import { Stack, type Stack as WorkersStack } from '../src/testing/workers.js'
import type { Env } from './kvCache/worker.js'

const here = (file: string) => fileURLToPath(new URL(file, import.meta.url))

let stack: WorkersStack<Env>

const ask = async (path: string, params: Record<string, string | ReadonlyArray<string>> = {}) => {
  const search = new URLSearchParams()
  for (const [name, value] of Object.entries(params))
    for (const one of typeof value === 'string' ? [value] : value) search.append(name, one)
  const response = await fetch(`${stack.origin}${path}?${search}`)
  return { status: response.status, text: await response.text() }
}

/** What KV itself holds for `key`, read from Node. */
const held = async (key: string) =>
  (await stack.env()).CACHE.get(`${stack.origin}/__foldkit/cache/test/${key}`)

afterAll(() => stack?.stop())

describe('a store over Workers KV, on workerd', () => {
  // Started in a test, not `beforeAll`: a stack that fails to start fails here.
  it('starts', async () => {
    stack = await Stack.start<Env>({
      wrangler: here('./kvCache/wrangler.jsonc'),
      entry: here('./kvCache/worker.ts'),
      plugins: [workerMutation()],
      console: 'quiet',
    })
    expect(stack.origin).toMatch(/^http/)
  }, 60_000)

  it('writes an answer on its second ask, under a TTL KV takes, and serves it', async () => {
    const put = { key: 'a', body: 'answer', maxAge: '10', tag: 'row:A:1' }
    expect(await ask('/put', put)).toEqual({ status: 200, text: 'served' })
    expect(await held('a')).toBeNull()
    expect(await ask('/get', { key: 'a' })).toEqual({ status: 404, text: 'miss' })
    // Ten seconds is under KV's sixty: the store asks for sixty, or KV refuses the write.
    await ask('/put', put)
    expect(await held('a')).toMatch(/^\d+ answer$/)
    expect(await ask('/get', { key: 'a' })).toEqual({ status: 200, text: 'answer' })
  })

  it('deletes from KV what a purged tag names, and no other', async () => {
    for (const _ of [1, 2]) {
      await ask('/put', { key: 'p', body: 'p', tag: ['row:P:1', 'list:P'] })
      await ask('/put', { key: 'q', body: 'q', tag: 'row:Q:1' })
    }
    expect(await ask('/purge', { tag: 'list:P' })).toEqual({ status: 200, text: 'purged' })
    expect(await held('p')).toBeNull()
    expect(await ask('/get', { key: 'p' })).toEqual({ status: 404, text: 'miss' })
    expect(await ask('/get', { key: 'q' })).toEqual({ status: 200, text: 'q' })
  })

  it('serves what KV refuses to keep, and keeps nothing', async () => {
    const long = 'x'.repeat(600)
    for (const _ of [1, 2]) {
      expect(await ask('/put', { key: long, body: 'answer' })).toEqual({
        status: 200,
        text: 'served',
      })
    }
    expect(await ask('/get', { key: long })).toEqual({ status: 404, text: 'miss' })
  })

  it('serves while KV fails: a read is a miss, a write and a purge keep nothing', async () => {
    for (const _ of [1, 2]) {
      expect(await ask('/down/put', { key: 'd', body: 'answer', tag: 'row:D:1' })).toEqual({
        status: 200,
        text: 'served',
      })
    }
    expect(await ask('/down/get', { key: 'd' })).toEqual({ status: 404, text: 'miss' })
    expect(await ask('/down/purge', { tag: 'row:D:1' })).toEqual({ status: 200, text: 'purged' })
  })
})
