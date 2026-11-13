/**
 * Headless save and search. The browser run calls the same outcome checks.
 */
import { Effect, Option } from 'effect'
import { afterEach, expect, it, vi } from 'vitest'
import { Agent } from '../src/index.js'
import { definition, makeDraftApp, partCatalog } from './draftApp.js'
import {
  exerciseOperations,
  expectSearchIdentity,
  matchOf,
  type OperationDriver,
} from './draftOutcome.js'

const running: Array<{ readonly dispose: () => Promise<void> }> = []
afterEach(async () => {
  await Promise.all(running.splice(0).map(app => app.dispose()))
})

const start = (role: 'viewer' | 'editor' = 'editor') => {
  const draft = makeDraftApp(role)
  const app = Agent.headless({ init: draft.init, update: draft.update })
  running.push(app)
  let editor = true
  const runtime = Agent.bind({
    definition,
    host: { ...app.host, principal: () => ({ id: 'ada', editor }) },
  })
  const driver: OperationDriver = {
    events: draft.events,
    model: () => app.host.model(),
    refuse: () => {
      editor = false
    },
    allow: () => {
      editor = true
    },
    untilPending: requestId =>
      vi.waitFor(() => {
        expect(
          draft.events.some(event => event.requestId === requestId && event.tag === 'Pending'),
        ).toBe(true)
      }),
    settle: draft.settle,
    attempt: (id, input) =>
      Effect.runPromise(Effect.result(Agent.Ui.invoke(runtime, partCatalog, id, input))),
    start: (id, input) => Effect.runPromise(Agent.Ui.invoke(runtime, partCatalog, id, input)),
  }
  return { draft, host: app.host, runtime, driver }
}

it('runs refusal, failure, and overlap on the headless update', async () => {
  const { driver } = start()
  await exerciseOperations(driver)
})

it('clears a search that is not mounted', async () => {
  const { host, runtime } = start()
  const found = await Effect.runPromise(
    Agent.Ui.discover(runtime, partCatalog, Agent.UiQuery.Part({ id: 'search.clear' })),
  )
  expect(matchOf(found).occurrence).toEqual(Option.none())
  await Effect.runPromise(Agent.Ui.invoke(runtime, partCatalog, 'search.clear', {}))
  expect(host.model().query).toBe('')
})

it('reports the same search identity the browser does', async () => {
  const { runtime } = start()
  const mounted = [
    { part: 'search', id: 'first' },
    { part: 'search', id: 'second' },
  ] as const
  const byLabel = await Effect.runPromise(
    Agent.Ui.discover(runtime, partCatalog, Agent.UiQuery.Label({ label: 'Search' }), mounted),
  )
  const oneRow = await Effect.runPromise(
    Agent.Ui.discover(
      runtime,
      partCatalog,
      Agent.UiQuery.Occurrence({ part: 'search', id: 'first' }),
      mounted,
    ),
  )
  expectSearchIdentity(byLabel, oneRow)
})

it('hides a save the viewer cannot be offered', async () => {
  const { runtime, draft, host } = start('viewer')
  const save = await Effect.runPromise(
    Agent.Ui.discover(runtime, partCatalog, Agent.UiQuery.Label({ label: 'Save' })),
  )
  expect(save).toEqual(Agent.UiDiscovery.None())
  expect(JSON.stringify(save)).not.toContain('save_draft')
  const refused = await Effect.runPromise(
    Effect.flip(
      Agent.Ui.invoke(runtime, partCatalog, 'draft.save', { requestId: 'x', title: 'y' }),
    ),
  )
  expect(refused).toBeInstanceOf(Agent.CapabilityUnavailableError)
  expect(draft.messages).toEqual([])
  expect(host.model().operations).toEqual([])
})
