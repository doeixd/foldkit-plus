// @vitest-environment jsdom
/**
 * Phase 2: a page whose envelope cannot resume is refused and contained, the
 * way Foldkit contains a page it refuses. It is never rendered again, and the
 * application's `init` does not run.
 */
import { Effect } from 'effect'
import { expect, it, vi } from 'vitest'
import { SSR } from 'foldkit-ssr'
import { calls, config, load, plan, template } from './handoverFixture.js'

it('refuses a page whose envelope is for another plan, and says why', async () => {
  const served = SSR.page(
    template,
    await Effect.runPromise(SSR.render(config, plan, { buildId: 'b' })),
  )
  load(served.replace('"plan":"counter"', '"plan":"elsewhere"'))
  const button = document.getElementById('count')
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
  calls.init = 0

  SSR.hydrate(config, plan, { buildId: 'b' })
  await vi.waitFor(() => expect(document.body.inert).toBe(true))
  expect(calls.init).toBe(0)
  expect(document.getElementById('count')).toBe(button)
  expect(logged.mock.calls.flat().join(' ')).toContain('"elsewhere"')
})
