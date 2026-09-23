// @vitest-environment jsdom
/**
 * Phase 4: a static region the browser asks for that is not in the server's
 * page is reported, and rendered in the browser rather than left empty.
 */
import { Effect } from 'effect'
import { expect, it, vi } from 'vitest'
import { SSR } from 'foldkit-ssr'
import { calls, config, load, plan, template } from './staticFixture.js'

it('reports a region the server did not render, and renders it', async () => {
  load(SSR.page(template, await Effect.runPromise(SSR.render(config, plan, { buildId: 'b' }))))
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

  SSR.hydrate(config, plan, { buildId: 'b' })
  document.getElementById('more')!.click()

  await vi.waitFor(() =>
    expect(document.getElementById('extra')?.textContent).toBe('rendered in the browser'),
  )
  expect(calls.extra).toBeGreaterThan(0)
  expect(logged.mock.calls.flat().join(' ')).toContain(
    'the static region "extra" is not in the server\'s page',
  )
})
