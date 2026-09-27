/**
 * The server behind one HTTP endpoint, as `pnpm dev` runs it: each request
 * answered by `endpoint.ts`, the chair read from the `x-chair` header, and what
 * is due published every few seconds.
 */
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { answer, publishDue } from './endpoint.js'
import { openServer } from './server.js'
import { memorySqlite } from './sqlite-node.js'

export const startHttpServer = async (
  port: number,
): Promise<{ readonly url: string; readonly close: () => Promise<void> }> => {
  const backend = openServer(() => new Date(), memorySqlite())
  await backend.seed()

  const clock = setInterval(() => {
    void publishDue(backend).then(said => said.forEach(line => console.log(line)))
  }, 5000)

  const server: Server = createServer((request, response) => {
    const reply = (status: number, body: unknown) => {
      response.writeHead(status, { 'content-type': 'application/json' })
      response.end(JSON.stringify(body))
    }
    if (request.method !== 'POST' || request.url !== '/remote')
      return reply(404, { error: 'not found' })
    const chair = String(request.headers['x-chair'])
    const chunks: Buffer[] = []
    request.on('data', chunk => chunks.push(chunk as Buffer))
    request.on('end', () => {
      void (async () => {
        let body: unknown
        try {
          body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        } catch (error) {
          return reply(400, { error: error instanceof Error ? error.message : String(error) })
        }
        const answered = await answer(backend, chair, body)
        reply(
          answered.ok ? 200 : 500,
          answered.ok ? { result: answered.result } : { error: answered.error },
        )
      })()
    })
  })

  await new Promise<void>(resolve => server.listen(port, '127.0.0.1', resolve))
  const { port: bound } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${bound}/remote`,
    close: () =>
      new Promise<void>(resolve => {
        clearInterval(clock)
        server.close(() => resolve())
      }),
  }
}
