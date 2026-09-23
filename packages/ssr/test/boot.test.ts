// @vitest-environment jsdom
/**
 * Phase 2: the Commands a plan names in `boot` run when the browser starts,
 * since its `init` does not. Their Messages reach `update` as any would.
 */
import { Effect } from 'effect'
import { expect, it, vi } from 'vitest'
import { SSR } from 'foldkit-ssr'
import { App, Message, config, load, plan, template } from './handoverFixture.js'

const Booted = { name: 'Booted', effect: Effect.succeed(Message.Booted()) }
const booting = SSR.plan(App, { id: 'counter', state: plan.state, boot: () => [Booted] })

it('runs the Commands the plan names in boot', async () => {
  load(SSR.page(template, await Effect.runPromise(SSR.render(config, booting, { buildId: 'b' }))))
  expect(document.getElementById('count')?.textContent).toBe('41')

  SSR.hydrate(config, booting, { buildId: 'b' })

  // The fixture's `update` answers `Booted` by setting the count to -1.
  await vi.waitFor(() => expect(document.getElementById('count')?.textContent).toBe('-1'))
})
