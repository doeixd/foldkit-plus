// @vitest-environment jsdom
/**
 * Phase G2: the first render of a resumed page is the served markup, however
 * the event that booted it changed the Model, so Foldkit adopts every node.
 * The Messages the page answered reach the runtime after that render. Were
 * they folded into the Model it starts from, a label whose text they change
 * would not match, and Foldkit would rebuild its children, the input beside
 * the text included.
 */
import { Effect } from 'effect'
import { expect, it, vi } from 'vitest'
import { SSR } from 'foldkit-ssr'
import { config, plan } from './equivalenceFixture.js'
import { template } from './support.js'

it('adopts the nodes beside text the booting event changes', async () => {
  const planned = plan()
  const page = SSR.page(
    template,
    await Effect.runPromise(SSR.render(config, planned, { buildId: 'b' })),
  )
  document.documentElement.innerHTML = new DOMParser().parseFromString(
    page,
    'text/html',
  ).documentElement.innerHTML
  SSR.hydrate(config, planned, { buildId: 'b' })
  const beside = document.getElementById('beside')
  expect(beside).not.toBeNull()

  document.getElementById('bubble')!.click()
  await vi.waitFor(() => expect(document.getElementById('counted')!.textContent).toBe('2 logged '))
  expect(document.getElementById('beside')).toBe(beside)
})
