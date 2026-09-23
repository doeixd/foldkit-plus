// @vitest-environment jsdom
/**
 * Phase 2: a page with no server render, no stamped root, starts on the client
 * as any Foldkit application does, running its own `init`.
 */
import { expect, it, vi } from 'vitest'
import { SSR } from 'foldkit-ssr'
import { calls, config, load, plan, template } from './handoverFixture.js'

it('renders on the client when the page has no server render', async () => {
  load(template)
  calls.init = 0

  SSR.hydrate({ ...config, container: document.getElementById('root') }, plan, { buildId: 'b' })
  await vi.waitFor(() => expect(document.getElementById('count')?.textContent).toBe('41'))
  expect(calls.init).toBe(1)
})
