/// <reference types="@vitest/browser-playwright" />
/**
 * The save fixture on a real page, for a person and for an agent hosted by the
 * same runtime: the assertions are `outcomes`, the drivers differ. Then what a
 * part says it is is found on the page.
 */
import { Effect, Option } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Agent } from 'foldkit-agent'
import { page, userEvent } from 'vitest/browser'
import { Style } from 'foldkit-mixins'
import { Parts, AppAgent, bindAgent } from '../src/save/agent.js'
import { Message, stateOf, type Model } from '../src/save/app.js'
import { mountEditor } from '../src/save/mount.js'
import { makeServer } from '../src/save/server.js'
import { pageStylesheet } from '../src/style.js'
import { outcomes, type Driver } from './outcomes.js'
import { agentDriver } from './drivers.js'

const mount = () => {
  Style.install(pageStylesheet)
  const container = document.createElement('div')
  container.id = 'save-host'
  document.body.appendChild(container)
  const server = makeServer()
  return { server, mounted: mountEditor(container, server.layer) }
}

afterEach(() => document.body.replaceChildren())

const titleField = () => document.getElementById('save:title') as HTMLInputElement

outcomes('by a person, clicking', async () => {
  const { server, mounted } = mount()
  await vi.waitFor(() => expect(titleField()).not.toBeNull())
  const state = () => stateOf(mounted.host.model())
  const driver: Driver = {
    edit: text => userEvent.fill(titleField(), text),
    save: async () => {
      const index = state().saves.length
      await userEvent.click(page.getByRole('button', { name: 'Save' }))
      await vi.waitFor(() => expect(state().saves[index]?.status).not.toBe('Pending'))
      return state().saves[index]?.status === 'Applied' ? 'completed' : 'failed'
    },
    state,
  }
  return { driver, server, dispose: mounted.dispose }
})

outcomes('by the agent, in the same page', async () => {
  const { server, mounted } = mount()
  await vi.waitFor(() => expect(titleField()).not.toBeNull())
  return { driver: agentDriver(mounted.host), server, dispose: mounted.dispose }
})

describe('the page and the agent are one editor', () => {
  it('shows the agent what the person typed, and the person what the agent saved', async () => {
    const { server, mounted } = mount()
    await vi.waitFor(() => expect(titleField()).not.toBeNull())
    await userEvent.fill(titleField(), 'Typed by a person')
    const agent = bindAgent({ definition: AppAgent, host: mounted.host, parts: Parts })
    const title = await Effect.runPromise(agent.parts.find({ label: 'Title' }))
    expect(
      Option.isSome(
        Effect.runSync(
          Effect.succeed(title._tag === 'One' ? Option.some(title.part.value) : Option.none()),
        ),
      ),
    ).toBe(true)
    await Effect.runPromise(
      agent.messages.dispatch(Message.ChangedDraft, { text: 'Set by the agent' }),
    )
    await vi.waitFor(() => expect(titleField().value).toBe('Set by the agent'))
    const saved = Effect.runPromise(agent.messages.dispatch(Message.RequestedSave, {}))
    await vi.waitFor(() => expect(server.waiting()).toBe(0))
    expect((await saved).completion?.status).toBe('completed')
    await vi.waitFor(() =>
      expect(document.querySelector('[role="status"]')!.textContent).toBe('Saved.'),
    )
    mounted.dispose()
  })

  it('marks each control with the part it is, and the listing names the same parts', async () => {
    const { mounted } = mount()
    await vi.waitFor(() => expect(titleField()).not.toBeNull())
    const agent = bindAgent({ definition: AppAgent, host: mounted.host, parts: Parts })
    const listed = await Effect.runPromise(agent.parts.list)
    const marks = Array.from(document.querySelectorAll('[data-fk-part]')).map(element => [
      element.getAttribute('data-fk-part'),
      element.tagName,
    ])
    expect(marks).toEqual([
      ['title', 'INPUT'],
      ['save', 'BUTTON'],
    ])
    expect(listed.map(part => part.id)).toEqual(marks.map(([id]) => id))
    mounted.dispose()
  })
})

export type { Model }
