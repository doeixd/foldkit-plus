// @vitest-environment node
/**
 * `serveFetch` on workerd answers a refused POST only after its body is
 * dealt with: the refused calls and a normal request that follows share one
 * keep-alive connection, and the normal one must not fail with a lost
 * connection (it did, about one run in four, while a refusal left the body unread).
 */
import { Agent, request } from 'node:http'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { workerMutation } from '../../../scripts/mutation-plugin.mjs'
import { Stack, type Stack as WorkersStack } from '../src/testing/workers.js'

const here = (file: string) => fileURLToPath(new URL(file, import.meta.url))

let stack: WorkersStack<unknown>

const agent = new Agent({ keepAlive: true, maxSockets: 1 })

/** One request over the shared connection: its status and text. */
const send = (path: string, headers: Record<string, string>, body?: string) =>
  new Promise<{ status: number; text: string }>((resolve, reject) => {
    const call = request(
      `${stack.origin}${path}`,
      { method: body === undefined ? 'GET' : 'POST', agent, headers },
      response => {
        const chunks: Buffer[] = []
        response.on('data', chunk => chunks.push(chunk))
        response.on('end', () =>
          resolve({ status: response.statusCode ?? 0, text: Buffer.concat(chunks).toString() }),
        )
        response.on('error', reject)
      },
    )
    call.on('error', reject)
    call.end(body)
  })

afterAll(async () => {
  agent.destroy()
  await stack?.stop()
})

describe('refused calls with bodies, then a normal request, on one connection', () => {
  it('starts', async () => {
    stack = await Stack.start({
      wrangler: here('./refusedBody/wrangler.jsonc'),
      entry: here('./refusedBody/worker.ts'),
      plugins: [workerMutation()],
      console: 'quiet',
    })
  }, 60_000)

  it('never loses the connection the next request is sent on', async () => {
    const body = JSON.stringify({ padding: 'x'.repeat(3000) })
    const failures: Array<string> = []
    for (let round = 0; round < 25; round++) {
      for (let call = 0; call < 4; call++) {
        const answer = await send('/remote', { 'content-type': 'application/json' }, body)
        if (answer.status !== 401) failures.push(`${round}.${call}: ${answer.status}`)
      }
      const next = await send('/ping', {})
      if (next.status !== 200 || next.text !== 'pong') failures.push(`${round}: ${next.status}`)
    }
    expect(failures).toEqual([])
  }, 120_000)
})
