// @vitest-environment node
/**
 * The dev server's own answers, before `RemoteServer.answer` is reached: a body
 * that is not JSON is told so in the server's words, never the parser's, which
 * quote the body and name the engine (#575).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { startHttpServer } from '../src/server/http.js'

const closing: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const close of closing.splice(0)) await close()
})

describe('the CMS dev server', () => {
  it('answers a body that is not JSON with a 400 in its own words', async () => {
    const server = await startHttpServer(0)
    closing.push(server.close)
    const response = await fetch(server.url, {
      method: 'POST',
      headers: { 'x-chair': 'ada' },
      body: '{"operation": SECRET-CANARY',
    })
    expect(response.status).toBe(400)
    const sent = await response.text()
    expect(JSON.parse(sent)).toStrictEqual({ error: 'The body is not JSON' })
    expect(sent).not.toMatch(/SECRET-CANARY|Unexpected|position/)
  })
})
