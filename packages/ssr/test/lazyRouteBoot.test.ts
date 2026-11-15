// @vitest-environment jsdom
/**
 * `lazy` as a function of the Model, in the browser (#438): asked with the
 * resumed Model, so the page boots once what it draws has loaded, and another
 * route's code is never fetched for it.
 */
import { Effect } from 'effect'
import { FOLDKIT_APP_ATTRIBUTE } from 'foldkit/experimental/server'
import { expect, it, vi } from 'vitest'
import { SSR } from 'foldkit-ssr'
import { body, byId, deferred, load, make, settle, template, type Model } from './lazyFixture.js'

const booted = () => document.querySelector(`[${FOLDKIT_APP_ATTRIBUTE}]`) === null

it("loads the served page's bundle before boot, and no other route's", async () => {
  const served = make(() => Promise.resolve(body))
  load(
    SSR.page(
      template,
      await Effect.runPromise(SSR.render(served.config, served.plan(), { buildId: 'b' })),
    ),
  )

  const { load: loadBodies, release, calls } = deferred()
  const browser = make(loadBodies)
  let otherLoads = 0
  const other = {
    name: 'Other',
    load: async () => {
      otherLoads++
    },
    isLoaded: () => false,
  }
  const asked: Array<string> = []
  const lazy = (model: Model) => {
    asked.push(model.title)
    return model.title === 'Lazy' ? [browser.Clicker] : [other]
  }
  SSR.hydrate({ ...browser.config, lazy }, browser.plan(), { buildId: 'b' })
  await settle()
  expect(asked).toEqual(['Lazy'])
  expect(calls()).toBe(1)
  expect(otherLoads).toBe(0)
  // Starting now, but the drawn page's code is on its way.
  expect(booted()).toBe(false)

  release()
  await vi.waitFor(() => expect(booted()).toBe(true))
  byId('count').click()
  await vi.waitFor(() => expect(byId('count').textContent).toBe('1'))
  expect(otherLoads).toBe(0)
})
