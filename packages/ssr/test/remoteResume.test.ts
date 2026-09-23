// @vitest-environment jsdom
/**
 * Phase R: a page rendered with Remote data hydrates with the data present and
 * asks the server for none of it, and the page carries only what the active
 * Surfaces read.
 */
import { Effect } from 'effect'
import { expect, it } from 'vitest'
import { SSR } from 'foldkit-ssr'
import { load, settle, template } from './handoverFixture.js'
import { config, plan, requests } from './remoteFixture.js'

it('resumes Remote data without a request, and without what no Surface reads', async () => {
  const served = SSR.page(
    template,
    await Effect.runPromise(SSR.render(config, plan, { buildId: 'b' })),
  )
  expect(served).toContain('Ada')
  // The email is in the server's store; no Surface reads it, so it stays there.
  expect(served).not.toContain('ada@example.test')

  load(served)
  const author = document.getElementById('author')
  expect(author?.textContent).toBe('Ada')

  SSR.hydrate(config, plan, { buildId: 'b' })
  await settle()
  await settle()

  expect(document.body.inert).not.toBe(true)
  expect(document.getElementById('author')).toBe(author)
  expect(author?.textContent).toBe('Ada')
  expect(requests).toEqual([])
})
