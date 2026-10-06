// @vitest-environment jsdom
/**
 * S5: a page the browser declines, or whose data is older than it knows, never
 * adopts. `otherwise: 'render'` draws afresh on the served root; anything
 * else contains the served page the way a resume failure does.
 */
import { Effect } from 'effect'
import { Projection } from 'foldkit-surface'
import { beforeEach, expect, it, vi } from 'vitest'
import { SSR, UNTIL_LIMIT_MS } from 'foldkit-ssr/client'
import { SSR as Server } from 'foldkit-ssr'
import { App, calls, config, load, plan, template } from './handoverFixture.js'

beforeEach(() => {
  calls.init = 0
})

/** The fixture's page, served and loaded as the document. */
const serve = async () => {
  load(
    Server.page(template, await Effect.runPromise(Server.render(config, plan, { buildId: 'b' }))),
  )
  expect(calls.init).toBe(1)
}

it('draws a declined page afresh on its served root', async () => {
  await serve()
  const served = document.getElementById('count')
  let asked = 0
  SSR.hydrate(config, plan, {
    buildId: 'b',
    when: () => {
      asked++
      return false
    },
    otherwise: 'render',
  })
  await vi.waitFor(() => expect(calls.init).toBe(2))
  expect(asked).toBe(1)
  // The fresh draw replaces the served markup in place: the served button is
  // gone, the page was never empty, and the fresh page works.
  expect(served?.isConnected).toBe(false)
  expect(document.body.inert).toBeFalsy()
  const count = document.getElementById('count')
  expect(count?.textContent).toBe('41')
  count?.click()
  await vi.waitFor(() => expect(document.getElementById('count')?.textContent).toBe('42'))
})

it('contains a declined page without otherwise', async () => {
  await serve()
  let asked = 0
  SSR.hydrate(config, plan, {
    buildId: 'b',
    when: () => {
      asked++
      return false
    },
  })
  await vi.waitFor(() => expect(document.body.inert).toBe(true))
  expect(asked).toBe(1)
  expect(calls.init).toBe(1)
  expect(document.getElementById('count')?.textContent).toBe('41')
})

it('redraws a page older than the data', async () => {
  const aged = Server.plan(App, {
    id: 'counter',
    state: Projection.pick(App.model.count),
    version: 'v1',
  })
  load(
    Server.page(template, await Effect.runPromise(Server.render(config, aged, { buildId: 'b' }))),
  )
  const seen: Array<unknown> = []
  SSR.hydrate(config, aged, {
    buildId: 'b',
    fresh: version => {
      seen.push(version)
      return version === 'v2'
    },
    otherwise: 'render',
  })
  await vi.waitFor(() => expect(calls.init).toBe(2))
  expect(seen).toEqual(['v1'])
  const count = document.getElementById('count')
  expect(count?.textContent).toBe('41')
  count?.click()
  await vi.waitFor(() => expect(document.getElementById('count')?.textContent).toBe('42'))
})

it('adopts a page the checks pass', async () => {
  await serve()
  const button = document.getElementById('count')
  let whenAsked = 0
  let freshAsked = 0
  SSR.hydrate(config, plan, {
    buildId: 'b',
    when: () => {
      whenAsked++
      return true
    },
    fresh: () => {
      freshAsked++
      return true
    },
  })
  await vi.waitFor(() => expect(document.getElementById('count')).toBe(button))
  expect(whenAsked).toBe(1)
  expect(freshAsked).toBe(1)
  expect(calls.init).toBe(1)
  button?.click()
  await vi.waitFor(() => expect(button?.textContent).toBe('42'))
})

it('keeps a declined page in view until the fresh one is ready, then swaps them at once', async () => {
  await serve()
  const served = document.getElementById('count')
  const servedRoot = document.querySelector<HTMLElement>('[data-foldkit-app]')
  const id = servedRoot?.id
  // What the fresh page shows at the moment the served one goes.
  const atSwap: Array<string | null> = []
  new MutationObserver(() => {
    if (served?.isConnected === false && atSwap.length === 0)
      atSwap.push(document.querySelector('#count')?.textContent ?? null)
  }).observe(document.body, { childList: true, subtree: true })
  SSR.hydrate(config, plan, {
    buildId: 'b',
    when: () => false,
    otherwise: 'render',
    until: model => model.count >= 42,
  })
  await vi.waitFor(() => expect(calls.init).toBe(2))
  const fresh = () => document.querySelector<HTMLElement>('[hidden] #count')
  await vi.waitFor(() => expect(fresh()?.textContent).toBe('41'))
  // Not ready: the served page is what shows, and the fresh one is out of view.
  expect(served?.isConnected).toBe(true)
  fresh()?.click()
  await vi.waitFor(() => expect(served?.isConnected).toBe(false))
  // Swapped with the drawing that was ready, never the one before it.
  expect(atSwap).toEqual(['42'])
  expect(document.querySelector('[hidden]')).toBeNull()
  expect(document.querySelectorAll('#count')).toHaveLength(1)
  expect(document.querySelector('#count')?.closest(`#${id}`)).not.toBeNull()
})

it('swaps a declined page for the fresh one after the limit, ready or not', async () => {
  await serve()
  const served = document.getElementById('count')
  SSR.hydrate(config, plan, {
    buildId: 'b',
    when: () => false,
    otherwise: 'render',
    until: () => false,
  })
  await vi.waitFor(() => expect(document.querySelector('[hidden] #count')).not.toBeNull())
  expect(served?.isConnected).toBe(true)
  await vi.waitFor(() => expect(served?.isConnected).toBe(false), {
    timeout: UNTIL_LIMIT_MS + 1000,
  })
  expect(document.querySelector('#count')?.textContent).toBe('41')
})
