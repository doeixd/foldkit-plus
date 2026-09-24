/**
 * Phase F, on the server: a lazy bundle's bodies are loaded before the render,
 * so the page carries the real view, and its placement root is stamped.
 */
import { Effect } from 'effect'
import { expect, it } from 'vitest'
import { SLOT_ATTRIBUTE, SSR } from 'foldkit-ssr'
import { deferred, make } from './lazyFixture.js'

it('loads the bodies first, renders the real view, and stamps the placement root', async () => {
  const { load, release, calls } = deferred()
  const { Clicker, config, plan } = make(load)
  expect(Clicker.isLoaded()).toBe(false)
  const rendering = Effect.runPromise(SSR.render(config, plan(), { buildId: 'b' }))
  // The render waits for the bodies; nothing is rendered from the placeholder.
  await new Promise(resolve => setTimeout(resolve, 10))
  release()
  const { rendered, envelope } = await rendering
  expect(calls()).toBe(1)
  expect(Clicker.isLoaded()).toBe(true)
  // The slot names the bundle and the key it is placed at.
  expect(rendered.html).toMatch(
    new RegExp(`<div ${SLOT_ATTRIBUTE}="Clicker@clicker"[^>]*id="clicker"`),
  )
  expect(rendered.html).toContain('id="count"')
  // A binding inside the placement is the parent's Message, its hole one wrapper down.
  expect(envelope).toContain(
    '{"attribute":"OnInput","message":{"_tag":"GotClickerMessage","message":{"_tag":"Typed","value":""}},"hole":["value"],"depth":1}',
  )
  // One after it is the application's own again.
  expect(envelope).toContain('{"attribute":"OnClick","message":{"_tag":"Titled"}}')
  // Rendering again does not load again.
  await Effect.runPromise(SSR.render(config, plan(), { buildId: 'b' }))
  expect(calls()).toBe(1)
})
