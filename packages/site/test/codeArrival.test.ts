// @vitest-environment jsdom
/**
 * A lazy page reached by its route draws once its bodies arrive, though its
 * arrival changes nothing in the Model (#438, the #501 probe through the
 * Site): on the real Foldkit runtime, which redraws only for a new Model.
 */
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Bundle } from 'foldkit-bundle'
import { afterEach, expect, it, vi } from 'vitest'
import { AppRoute, Message, Model, home, make, urlOf } from './codeFixture.js'

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

const text = (id: string) => document.getElementById(id)?.textContent

/** The fixture's pages and routing on the real runtime, started on `start`'s route. */
const mount = (start: Model) => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  const parts = make()
  const { AccountPage, NotesPage, SettingsPage } = parts
  const Routing = parts.routing()
  const assembly = Bundle.assemble<Model, Message>()([
    AccountPage.placed,
    SettingsPage.placed,
    NotesPage.placed,
    Routing,
  ])
  const container = document.createElement('div')
  container.id = 'code-arrival'
  document.body.appendChild(container)
  const handle = Runtime.embed(
    Runtime.makeElement(
      assembly.complete({
        Model,
        container,
        init: () => Routing.boot(start),
        update: assembly.update(model => ({ model })),
        view: (model: Model, h: HtmlBuilder<Message>) =>
          h.main(
            [],
            [
              // A URL change, as the runtime's routing would send one.
              h.button(
                [h.Id('go'), h.OnClick(Message.ChangedUrl({ url: urlOf('/account') }))],
                ['Account'],
              ),
              ...AppRoute.match(model.route, {
                Home: () => [h.p([h.Id('page')], ['Home'])],
                Account: () => [AccountPage.placed.view(model, h)],
                Settings: () => [SettingsPage.placed.view(model, h)],
                Notes: () => [],
                NotFound: () => [],
              }),
            ],
          ),
        subscriptions: assembly.subscriptions(),
      }),
    ),
  )
  return { ...parts, handle }
}

it('draws the placeholder on arrival, then the bodies once they load, with no Model change', async () => {
  const { accountLoad, handle } = mount(home)
  try {
    await vi.waitFor(() => expect(text('page')).toBe('Home'))
    document.getElementById('go')!.click()
    // The route arrived and told the page, whose bodies are on their way.
    await vi.waitFor(() => expect(text('page')).toBe('Account loading'))
    expect(accountLoad.calls()).toBe(1)
    accountLoad.release()
    await vi.waitFor(() => expect(text('page')).toBe('Account body'))
  } finally {
    handle.dispose()
  }
})

it('draws the bodies of a lazy page the application starts on, with no server render', async () => {
  // Opened at /account directly: no route change ever arrives, so `boot` tells it.
  const { accountLoad, handle } = mount({ ...home, route: AppRoute.Account() })
  try {
    await vi.waitFor(() => expect(text('page')).toBe('Account loading'))
    // The boot Commands run after the first render, which drew the placeholder.
    await vi.waitFor(() => expect(accountLoad.calls()).toBe(1))
    accountLoad.release()
    await vi.waitFor(() => expect(text('page')).toBe('Account body'))
  } finally {
    handle.dispose()
  }
})
