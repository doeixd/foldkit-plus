// @vitest-environment jsdom
/**
 * #470: a Model path the browser reads again is left out of the envelope and
 * filled before the first render. A Surface reading it is covered by the
 * plan's `restored`, and the server's coverage check sees the value the
 * browser's own restore would give.
 */
import { Effect, Result } from 'effect'
import { Projection } from 'foldkit-surface'
import { expect, it, vi } from 'vitest'
import { SSR } from 'foldkit-ssr'
import { App, activatedPlan, config, load, plan, template } from './restoredFixture.js'

it('leaves a restored field out of the envelope and fills it before the first render', async () => {
  const rendered = await Effect.runPromise(SSR.render(config, plan, { buildId: 'b' }))
  load(SSR.page(template, rendered))

  const carried = SSR.resume(plan, document)
  if (Result.isFailure(carried)) throw new Error(carried.failure.message)
  // The envelope carries no `query`: the baseline value is what a page
  // without the browser's restore would see.
  expect(carried.success.query).toBe('')
  expect(document.getElementById('query')?.textContent).toBe('server')

  SSR.hydrate(config, plan, { buildId: 'b' })
  await vi.waitFor(() => expect(document.getElementById('query')?.textContent).toBe('browser'))
})

it('counts a restored path as the browser getting its own value', () => {
  const inspection = SSR.inspect(plan, { path: '/', query: 'server', count: 0 })
  expect(inspection.restored).toEqual(['query'])
  expect(inspection.surfaces[0]?.reads).toEqual([{ path: 'query', cover: 'restored' }])
  expect(inspection.surfaces[0]?.sameInBrowser).toBe(true)
})

it('judges the browser Model with the values its restore gives', async () => {
  await expect(
    Effect.runPromise(SSR.render(config, activatedPlan, { buildId: 'b' })),
  ).resolves.toBeDefined()
  expect(
    SSR.inspect(activatedPlan, { path: '/', query: 'server', count: 0 }).surfaces[0]?.sameInBrowser,
  ).toBe(true)
})

it('refuses a state that still sends a restored path', () => {
  expect(() =>
    SSR.plan(App, {
      id: 'sent',
      state: Projection.pick(App.model.query),
      restored: [App.model.query],
    }),
  ).toThrow(/restored by the browser/)
})
