// @vitest-environment node
/**
 * The server's main calls within a CPU budget: the timeline, a read of what
 * it shows, a profile's posts and a chirp posted, each over
 * `serveFetch` as a Worker would answer it, read by this thread's CPU time.
 * A Chirp deployed to Workers failed one request in six with error 1102
 * (#339) while every test passed, since Miniflare neither limits nor reports
 * CPU. Node's SQLite runs on this thread too, so the reading counts what D1
 * would do apart.
 */
import { Effect, Schema } from 'effect'
import { REMOTE_PROTOCOL_VERSION, Selection, relationOf } from 'foldkit-remote'
import { serveFetch } from 'foldkit-remote-server/fetch'
import { Cpu } from 'foldkit-plus/testing/workers'
import { expect, it } from 'vitest'
import { cpuBudget } from '../../../scripts/perf-report.mjs'
import { TimelinePost } from '../src/operations.js'
import { openServer, principalOf } from '../src/server/server.js'
import { memorySqlite } from '../src/server/sqlite-node.js'

/**
 * Milliseconds per request. On Linux the calls take 1 to 3 ms warm, and
 * the timeline 30 to 40 ms cold, its first query compiled and its code not
 * yet optimized; the budget is the free plan's limit warm, and leaves a
 * slower CI runner room cold.
 */
const BUDGET = { warm: 10, cold: 100 }

const ORIGIN = 'https://chirp.test'

const { server, database } = openServer(memorySqlite())

const answer = serveFetch({
  server,
  resolvePrincipal: request => Effect.succeed(principalOf(request.headers.get('x-as') ?? 'you')),
  layer: () => database,
})

const meter = Cpu.inThread(request => answer(request, undefined), ORIGIN)

let posted = 0

const remote = (operation: string, payload: () => unknown) => () =>
  new Request(`${ORIGIN}/remote`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-as': 'ada' },
    body: JSON.stringify({ operation, payload: payload() }),
  })

it('answers its main calls within the CPU budget', async () => {
  const readings = await cpuBudget('chirp', Cpu.budget, meter, {
    ...BUDGET,
    routes: {
      'the timeline': remote('query', () => ({
        query: 'Timeline',
        input: {},
        window: { first: 25 },
      })),
      'a read of what it shows': remote('read', () => ({
        version: REMOTE_PROTOCOL_VERSION,
        requests: ['p1', 'p2', 'p3'].map(id => ({
          ...relationOf(Selection.from(TimelinePost)),
          id,
        })),
      })),
      "a profile's posts": remote('query', () => ({
        query: 'ByAuthor',
        input: { authorId: 'grace' },
        window: { first: 25 },
      })),
      'a chirp posted': remote('mutate', () => ({
        requestId: `post-${(posted += 1)}`,
        mutation: 'PostChirp',
        input: { id: `cpu-${posted}`, body: 'Measured.' },
      })),
    },
  })
  expect(readings.map(reading => [reading.route, reading.status])).toEqual([
    ['the timeline', 200],
    ['a read of what it shows', 200],
    ["a profile's posts", 200],
    ['a chirp posted', 200],
  ])
  // Each chirp was written, not refused.
  const ada = await answer(
    remote('query', () => ({
      query: 'ByAuthor',
      input: { authorId: 'ada' },
      window: { first: 50 },
    }))(),
    undefined,
  )
  const { result } = Schema.decodeUnknownSync(
    Schema.Struct({
      result: Schema.Struct({ edges: Schema.Array(Schema.Struct({ id: Schema.String })) }),
    }),
  )(await ada.json())
  const ids = result.edges.map(edge => edge.id)
  expect(ids.filter(id => id.startsWith('cpu-'))).toHaveLength(posted)
}, 60_000)
