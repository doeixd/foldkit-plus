// @vitest-environment jsdom
/**
 * Phase 4: a static region renders once, on the server, and the browser adopts
 * its nodes without running its render. What it reads is never sent.
 */
import { Effect } from 'effect'
import { expect, it, vi } from 'vitest'
import { SSR } from 'foldkit-ssr'
import { calls, config, load, plan, template } from './staticFixture.js'

it('renders a static region once on the server and never in the browser', async () => {
  const served = SSR.page(
    template,
    await Effect.runPromise(SSR.render(config, plan, { buildId: 'b' })),
  )
  // Once, though the server renders the view twice to check it.
  expect(calls.copy).toBe(1)
  expect(served).toContain('A long server-only body')
  expect(served).toContain('data-foldkit-plus-static="post-copy"')
  const envelope = served.slice(served.indexOf('data-foldkit-plus-resume'))
  expect(envelope).not.toContain('A long server-only body')

  load(served)
  const title = document.getElementById('title')
  const body = document.getElementById('body')
  calls.copy = 0

  SSR.hydrate(config, plan, { buildId: 'b' })
  const like = document.getElementById('like')
  like!.click()
  await vi.waitFor(() => expect(like?.textContent).toBe('1'))

  expect(calls.copy).toBe(0)
  expect(document.body.inert).not.toBe(true)
  expect(document.getElementById('title')).toBe(title)
  expect(document.getElementById('body')).toBe(body)
  expect(body?.textContent).toBe('A long server-only body')
})
