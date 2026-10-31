// @vitest-environment jsdom
/**
 * While the server renders a page, `globalThis` says so under a registered
 * symbol, which a view's memoized drawings read (`foldkit-mixins`' SlotView
 * draws afresh then): each of the server's passes, and a posted form's
 * render, is drawn whole. Outside them, the browser's own renders included,
 * it is not set.
 */
import { Effect } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { expect, it } from 'vitest'
import { SSR } from 'foldkit-ssr'
import { FALLBACK_FIELD } from 'foldkit-ssr'
import { config, plan, template, type Message, type Model } from './fallbackFixture.js'

const SERVER_RENDER = Symbol.for('foldkit-plus.serverRender')
const flag = () => (globalThis as Record<symbol, unknown>)[SERVER_RENDER]

const seen: Array<unknown> = []
const recording = {
  ...config,
  view: (model: Model, h: HtmlBuilder<Message>) => {
    seen.push(flag())
    return config.view(model, h)
  },
}

it("is set through each of the server's renders and unset after", async () => {
  seen.length = 0
  await Effect.runPromise(SSR.render(recording, plan, { buildId: 'b' }))
  expect(seen).toEqual([true, true])
  expect(flag()).not.toBe(true)

  seen.length = 0
  const posted = new Request('https://todos.test/', {
    method: 'POST',
    body: new URLSearchParams({
      title: 'milk',
      [FALLBACK_FIELD]: JSON.stringify({ _tag: 'Added', title: '' }),
    }),
  })
  await Effect.runPromise(SSR.handle(posted, recording, plan, { buildId: 'b' }))
  // Only the two passes of the answer: rebuilding the Model draws no view.
  expect(seen).toEqual([true, true])
  expect(flag()).not.toBe(true)
})

it('is not set while the browser draws the page it resumed', async () => {
  const served = SSR.page(
    template,
    await Effect.runPromise(SSR.render(config, plan, { buildId: 'b' })),
  )
  document.documentElement.innerHTML = new DOMParser().parseFromString(
    served,
    'text/html',
  ).documentElement.innerHTML
  seen.length = 0
  SSR.hydrate(recording, plan, { buildId: 'b' })
  await new Promise(resolve => setTimeout(resolve, 20))
  expect(seen.length).toBeGreaterThan(0)
  expect(seen.every(value => value !== true)).toBe(true)
})
