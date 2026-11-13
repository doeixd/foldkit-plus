/**
 * The same save outcomes as the headless run, plus a click that reaches update.
 */
import { Effect } from 'effect'
import * as Runtime from 'foldkit/runtime'
import { afterEach, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Agent } from '../src/index.js'
import { Model, definition, makeDraftApp, partCatalog } from './draftApp.js'
import {
  exerciseOperations,
  expectSearchIdentity,
  expectStages,
  type OperationDriver,
} from './draftOutcome.js'
import { view } from './draftView.js'

let dispose = () => {}
afterEach(() => {
  dispose()
  document.body.replaceChildren()
})

const boot = () => {
  const draft = makeDraftApp()
  const container = document.createElement('div')
  container.id = 'draft-host'
  document.body.append(container)
  let editor = true
  const hosted = Agent.host({
    Model,
    init: draft.init,
    update: draft.update,
    view,
    container,
  })
  dispose = Runtime.embed(Runtime.makeElement({ ...hosted.config, slow: false })).dispose
  const runtime = Agent.bind({
    definition,
    host: { ...hosted.host, principal: () => ({ id: 'ada', editor }) },
  })
  const driver: OperationDriver = {
    events: draft.events,
    model: () => hosted.host.model(),
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
  return { draft, host: hosted.host, runtime, driver }
}

it('saves from the button and from the agent with the same outcomes', async () => {
  const { draft, runtime, driver } = boot()
  await vi.waitFor(() => expect(document.getElementById('save')).not.toBeNull())
  expect(document.querySelectorAll('[aria-label="Search"]')).toHaveLength(2)

  const mounted = [
    { part: 'search', id: 'first' },
    { part: 'search', id: 'second' },
  ]
  const byLabel = await Effect.runPromise(
    Agent.Ui.discover(runtime, partCatalog, { label: 'Search', mounted }),
  )
  const oneRow = await Effect.runPromise(
    Agent.Ui.discover(runtime, partCatalog, { id: 'search', occurrence: 'first', mounted }),
  )
  expectSearchIdentity(byLabel, oneRow)

  await userEvent.click(document.getElementById('save')!)
  await driver.untilPending('user-1')
  expectStages(draft.events, 'user-1', ['Requested', 'Accepted', 'Pending'])
  draft.settle('user-1', { ok: true, title: 'draft-secret' })
  await vi.waitFor(() =>
    expectStages(draft.events, 'user-1', ['Requested', 'Accepted', 'Pending', 'Succeeded']),
  )
  expect(draft.messages.filter(tag => tag === 'RequestedSave').length).toBe(1)

  await userEvent.click(document.getElementById('toggle')!)
  await vi.waitFor(() =>
    expect(draft.messages.filter(tag => tag === 'Toggled')).toEqual(['Toggled']),
  )
  const toggled = await Effect.runPromise(
    Effect.result(Agent.Ui.invoke(runtime, partCatalog, 'toggle', {})),
  )
  expect(toggled._tag).toBe('Failure')
  if (toggled._tag === 'Failure') expect(toggled.failure._tag).toBe('AgentUnknownPartError')
  expect(draft.messages.filter(tag => tag === 'Toggled')).toEqual(['Toggled'])

  await exerciseOperations(driver)
  expect(draft.messages.filter(tag => tag === 'RequestedSave').length).toBeGreaterThan(1)
})
