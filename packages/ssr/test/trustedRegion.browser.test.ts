/**
 * Probe 1 (Phase 6 bout 6.2): whether a region Foldkit holds as trusted
 * `InnerHTML` (including `SSR.static`) keeps an external script's DOM changes
 * across later renders, and what happens when the trusted HTML string changes.
 */
import { Effect, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { Projection, Surface } from 'foldkit-surface'
import { SSR } from 'foldkit-ssr'
import { SSR as Client } from 'foldkit-ssr/client'
import { afterEach, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'

const Model = Schema.Struct({
  count: Schema.Number,
  markup: Schema.String,
})
type Model = typeof Model.Type

const Message = defineMessageUnion({
  Incremented: {},
  ReplacedMarkup: { markup: Schema.String },
})
type Message = typeof Message.Type

const initialMarkup = '<p id="trusted-copy" data-origin="view">original</p>'

const containers: Array<HTMLElement> = []

afterEach(() => {
  for (const container of containers.splice(0)) container.remove()
})

const mountElementApp = async () => {
  const host = document.createElement('div')
  const container = document.createElement('div')
  container.id = 'trusted-region-app'
  host.append(container)
  document.body.append(host)
  containers.push(host)

  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { count: 0, markup: initialMarkup } }),
      update: (model: Model, message: Message) =>
        Message.match(message, {
          Incremented: () => ({ model: { ...model, count: model.count + 1 } }),
          ReplacedMarkup: ({ markup }) => ({ model: { ...model, markup } }),
        }),
      view: (model: Model, h: HtmlBuilder<Message>) =>
        h.main(
          [],
          [
            h.button([h.Id('inc'), h.OnClick(Message.Incremented())], [String(model.count)]),
            h.button(
              [
                h.Id('replace'),
                h.OnClick(
                  Message.ReplacedMarkup({
                    markup: '<p id="trusted-copy" data-origin="view">updated</p>',
                  }),
                ),
              ],
              ['Replace'],
            ),
            h.div([h.Id('trusted'), h.InnerHTML(model.markup)], []),
          ],
        ),
    }),
  )

  await vi.waitFor(() => expect(host.querySelector('#trusted-copy')).not.toBeNull())
  return { container: host, handle }
}

it('keeps external DOM mutations inside a trusted InnerHTML region while the HTML string is unchanged, and overwrites them when it changes', async () => {
  const { container, handle } = await mountElementApp()
  try {
    const trusted = container.querySelector<HTMLElement>('#trusted')!
    const inc = container.querySelector<HTMLButtonElement>('#inc')!
    const replace = container.querySelector<HTMLButtonElement>('#replace')!
    const child = container.querySelector<HTMLElement>('#trusted-copy')!

    // External script mutates an existing child and appends a sibling inside the trusted region.
    child.textContent = 'mutated-by-script'
    child.setAttribute('data-script-edit', 'kept')
    const injected = document.createElement('span')
    injected.id = 'script-injected'
    injected.textContent = 'extra'
    trusted.append(injected)

    // Re-render via an unrelated reactive counter outside the trusted region.
    await userEvent.click(inc)
    await vi.waitFor(() => expect(inc.textContent).toBe('1'))
    await userEvent.click(inc)
    await vi.waitFor(() => expect(inc.textContent).toBe('2'))

    // When the InnerHTML prop string is unchanged, Foldkit keeps the node and the external edits.
    expect(container.querySelector('#trusted')).toBe(trusted)
    expect(container.querySelector('#trusted-copy')).toBe(child)
    expect(child.textContent).toBe('mutated-by-script')
    expect(child.getAttribute('data-script-edit')).toBe('kept')
    expect(container.querySelector('#script-injected')).toBe(injected)
    expect(injected.textContent).toBe('extra')

    // When the InnerHTML prop string changes, Foldkit assigns innerHTML and replaces the subtree.
    await userEvent.click(replace)
    await vi.waitFor(() =>
      expect(container.querySelector('#trusted-copy')?.textContent).toBe('updated'),
    )
    expect(container.querySelector('#trusted')).toBe(trusted)
    expect(container.querySelector('#trusted-copy')).not.toBe(child)
    expect(container.querySelector('#trusted-copy')?.getAttribute('data-script-edit')).toBeNull()
    expect(container.querySelector('#script-injected')).toBeNull()
  } finally {
    handle.dispose()
  }
})

it('keeps external DOM mutations inside an SSR.static region across later renders after hydration', async () => {
  const StaticModel = Schema.Struct({
    heading: Schema.String,
    count: Schema.Number,
  })
  type StaticModel = typeof StaticModel.Type

  const StaticMessage = defineMessageUnion({
    Incremented: {},
  })
  type StaticMessage = typeof StaticMessage.Type

  const appConfig = {
    Model: StaticModel,
    init: () => ({ model: { heading: 'server-heading', count: 0 } }),
    update: (model: StaticModel, message: StaticMessage) =>
      StaticMessage.match(message, {
        Incremented: () => ({ model: { ...model, count: model.count + 1 } }),
      }),
    view: (model: StaticModel, h: HtmlBuilder<StaticMessage>) => ({
      title: 'Trusted Static Region',
      body: h.main(
        [],
        [
          h.button(
            [h.Id('static-inc'), h.OnClick(StaticMessage.Incremented())],
            [String(model.count)],
          ),
          SSR.static('probe-region', ih => [
            ih.p([ih.Id('static-copy'), ih.Attribute('data-origin', 'server')], [model.heading]),
          ]),
        ],
      ),
    }),
    container: null,
  }

  const initial: StaticModel = { heading: '', count: 0 }
  const StaticApp = Surface.application({
    Model: StaticModel,
    Message: StaticMessage,
    initial,
    update: model => ({ model }),
  })
  const plan = SSR.plan(StaticApp, {
    id: 'probe-static',
    state: Projection.pick(StaticApp.model.count),
  })

  const template =
    '<!doctype html><html><head><title></title></head><body><div id="root"></div></body></html>'
  const rendered = await Effect.runPromise(SSR.render(appConfig, plan, { buildId: 'b' }))
  const pageHtml = SSR.page(template, rendered)

  const host = document.createElement('div')
  host.innerHTML = new DOMParser().parseFromString(pageHtml, 'text/html').body.innerHTML
  document.body.append(host)
  containers.push(host)

  // Capture nodes and apply an external pre-hydration mutation BEFORE Client.hydrate runs.
  const preRegion = host.querySelector<HTMLElement>('[data-foldkit-plus-static="probe-region"]')!
  const preCopy = host.querySelector<HTMLElement>('#static-copy')!
  preCopy.textContent = 'mutated-before-hydrate'
  preCopy.setAttribute('data-pre-hydrate', 'kept')
  const preInjected = document.createElement('span')
  preInjected.id = 'pre-hydrate-injected'
  preInjected.textContent = 'injected-before'
  preRegion.append(preInjected)

  Client.hydrate(appConfig, plan, { buildId: 'b' })
  await vi.waitFor(() => expect(host.querySelector('[data-foldkit-app]')).toBeNull())

  const region = host.querySelector<HTMLElement>('[data-foldkit-plus-static="probe-region"]')!
  const copy = host.querySelector<HTMLElement>('#static-copy')!
  const inc = host.querySelector<HTMLButtonElement>('#static-inc')!

  // Pre-hydration mutations and node identity survived Client.hydrate itself.
  expect(region).toBe(preRegion)
  expect(copy).toBe(preCopy)
  expect(copy.textContent).toBe('mutated-before-hydrate')
  expect(copy.getAttribute('data-pre-hydrate')).toBe('kept')
  expect(host.querySelector('#pre-hydrate-injected')).toBe(preInjected)

  // External script mutates the adopted SSR.static region after hydration too.
  copy.textContent = 'mutated-after-hydrate'
  copy.setAttribute('data-script-edit', 'kept')

  await userEvent.click(inc)
  await vi.waitFor(() => expect(inc.textContent).toBe('1'))
  await userEvent.click(inc)
  await vi.waitFor(() => expect(inc.textContent).toBe('2'))

  expect(host.querySelector('[data-foldkit-plus-static="probe-region"]')).toBe(preRegion)
  expect(host.querySelector('#static-copy')).toBe(preCopy)
  expect(copy.textContent).toBe('mutated-after-hydrate')
  expect(copy.getAttribute('data-script-edit')).toBe('kept')
  expect(host.querySelector('#pre-hydrate-injected')).toBe(preInjected)
})
