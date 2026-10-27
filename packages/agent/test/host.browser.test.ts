/**
 * `Agent.host` in a real page, on Foldkit's browser scheduler: an agent's
 * Message, a click and a Command's result reach one runtime, and the page
 * draws what the host reads.
 */
import { Effect, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Projection } from 'foldkit-surface'
import { afterEach, expect, it, vi } from 'vitest'
import { Agent } from '../src/index.js'
import { Message, Model, initial, recordingStore, update } from './hostApp.js'

const handles: Array<{ readonly dispose: () => void }> = []
afterEach(() => {
  for (const handle of handles.splice(0)) handle.dispose()
  document.body.innerHTML = ''
})

const view = (model: Model, h: HtmlBuilder<Message>) =>
  h.div(
    [],
    [
      h.button([h.Id('increment'), h.OnClick(Message.Incremented())], ['+']),
      h.output([h.Id('count')], [String(model.count)]),
      h.output([h.Id('saved')], [model.saved.join(',')]),
    ],
  )

it('drives the page’s runtime: an agent call, a click, and a Command’s result', async () => {
  const container = document.createElement('div')
  container.id = 'agent-host-browser'
  document.body.appendChild(container)
  const { config, host } = Agent.host({
    Model,
    init: () => ({ model: initial }),
    update,
    view,
    resources: recordingStore().layer,
    container,
  })
  handles.push(Runtime.embed(Runtime.makeElement(config)))

  const HostAgent = Agent.forModel<Model>()
  const agent = HostAgent.bind({
    definition: HostAgent.make({
      context: Projection.fromReader(Schema.Struct({ count: Schema.Number }), model => ({
        count: model.count,
      })),
      messages: HostAgent.expose(Message, {
        RequestedSave: {
          description: 'Save a title',
          completion: { success: Message.Saved },
        },
      }),
    }),
    host,
  })

  await vi.waitFor(() => host.model())
  document.getElementById('increment')!.click()
  const result = await Effect.runPromise(
    agent.messages.dispatch(Message.RequestedSave, { title: 'milk' }),
  )
  expect(result.completion).toEqual({
    status: 'completed',
    message: Message.Saved({ title: 'MILK' }),
  })
  expect(await Effect.runPromise(agent.context)).toEqual({ count: 1 })
  await vi.waitFor(() => {
    expect(document.getElementById('count')?.textContent).toBe('1')
    expect(document.getElementById('saved')?.textContent).toBe('MILK')
  })
})
