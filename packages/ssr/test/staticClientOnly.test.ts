// @vitest-environment jsdom
/** Phase 4: with no server render, a static region renders like any view. */
import { expect, it, vi } from 'vitest'
import { SSR } from 'foldkit-ssr'
import { calls, config, load, plan, template } from './staticFixture.js'

it('renders a static region in the browser when nothing was served', async () => {
  load(template)

  SSR.hydrate({ ...config, container: document.getElementById('root') }, plan, { buildId: 'b' })

  await vi.waitFor(() => expect(document.getElementById('title')?.textContent).toBe('Hello'))
  expect(calls.copy).toBeGreaterThan(0)
})
