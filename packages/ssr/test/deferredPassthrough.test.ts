// @vitest-environment jsdom
/**
 * The event that boots a deferred page is stopped only when the markers
 * answered it with Messages to replay. One that no binding names, a click on
 * a plain link say, boots the page and goes on, so the document and the
 * browser see it as they would have.
 */
import { Effect } from 'effect'
import { expect, it } from 'vitest'
import { SSR } from 'foldkit-ssr'
import { booted, byId, config, load, planned, settle, template } from './deferredFixture.js'

it('lets an event no binding answers reach the document, and boots on it', async () => {
  const plan = planned('on-interaction')
  load(SSR.page(template, await Effect.runPromise(SSR.render(config, plan, { buildId: 'b' }))))
  SSR.hydrate(config, plan, { buildId: 'b' })
  await settle()
  const reached: Array<string> = []
  document.addEventListener('click', event => {
    if (event.target instanceof Element) reached.push(event.target.id)
  })

  byId('echo').click()
  expect(reached).toEqual(['echo'])
  expect(booted()).toBe(true)
})
