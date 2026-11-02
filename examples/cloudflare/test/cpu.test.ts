// @vitest-environment node
/**
 * The Worker's main routes within a CPU budget, read from the stack's
 * workerd: a page of 100 todos, a read of one, a write, and `/me` for a
 * visitor. Miniflare neither limits nor reports CPU, and a deployed Worker
 * past its plan's limit fails with error 1102, so a route that grew costly
 * fails here first. The stack is this file's alone: another test's requests
 * would be counted with these.
 */
import { REMOTE_PROTOCOL_VERSION } from 'foldkit-remote'
import { Cpu } from 'foldkit-plus/testing/workers'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { TODO_PAGE_SIZE } from '../src/operations.js'
import { PAGE_ORIGIN, startStack, type CloudflareStack } from '../src/stack.js'

/**
 * Milliseconds per request. On Linux each route takes 2 to 6 ms warm, D1's
 * SQLite included, which a deployed Worker's CPU time leaves out; `/me`
 * takes 35 to 50 ms cold, building Auth for the isolate. The budget leaves
 * a slower CI runner room, and catches a route that grew several times over.
 */
const BUDGET = { warm: 20, cold: 150 }

let stack: CloudflareStack

beforeAll(async () => {
  stack = await startStack()
  const env = await stack.env()
  await env.DB.batch(
    Array.from({ length: TODO_PAGE_SIZE }, (_, index) =>
      env.DB.prepare('INSERT INTO todos (id, title, done) VALUES (?, ?, 0)').bind(
        `t-${String(index).padStart(3, '0')}`,
        `Todo ${index}`,
      ),
    ),
  )
}, 120_000)

afterAll(() => stack?.stop(), 120_000)

let requests = 0

const remote = (operation: string, payload: unknown) => () =>
  new Request(`${stack.origin}/remote`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-actor': 'ada' },
    body: JSON.stringify({ operation, payload }),
  })

it('answers its main routes within the CPU budget', async () => {
  const readings = await Cpu.budget(stack.cpu, {
    ...BUDGET,
    routes: {
      'a page of todos': remote('query', {
        query: 'AllTodos',
        input: {},
        window: { first: TODO_PAGE_SIZE },
      }),
      'a read of one todo': remote('read', {
        version: REMOTE_PROTOCOL_VERSION,
        requests: [{ entity: 'Todo', id: 't-001', fields: ['title', 'done'] }],
      }),
      'a write': () =>
        remote('mutate', {
          requestId: `cpu-${(requests += 1)}`,
          mutation: 'ToggleTodo',
          input: { id: 't-002', done: requests % 2 },
        })(),
      '/me for a visitor': () =>
        new Request(`${stack.origin}/me`, {
          method: 'POST',
          headers: { origin: PAGE_ORIGIN, 'x-effect-auth-csrf': '1' },
          body: '{}',
        }),
    },
  })
  expect(readings.map(reading => [reading.route, reading.status])).toEqual([
    ['a page of todos', 200],
    ['a read of one todo', 200],
    ['a write', 200],
    ['/me for a visitor', 200],
  ])
  // Each write landed: the last left the todo as it said.
  const env = await stack.env()
  const toggled = await env.DB.prepare("SELECT done FROM todos WHERE id = 't-002'").first('done')
  expect(toggled).toBe(requests % 2)
}, 120_000)
