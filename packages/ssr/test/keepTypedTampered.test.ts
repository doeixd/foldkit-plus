// @vitest-environment jsdom
/**
 * #356: a kept field's marker naming a binding that is not its typing (here
 * the clear button's click) was not written by the server, so the page is
 * contained and the refusal reported, as for any binding that does not add up.
 */
import { Effect } from 'effect'
import { expect, it, vi } from 'vitest'
import { Diagnostics, KEEP_ATTRIBUTE, SSR } from 'foldkit-ssr'
import { config, field, load, plan, seen, template } from './keepTypedFixture.js'

it('contains a page whose kept field names a click binding', async () => {
  load(SSR.page(template, await Effect.runPromise(SSR.render(config, plan(), { buildId: 'b' }))))
  const query = field('query', HTMLInputElement)
  expect(document.getElementById('clear')?.getAttribute('data-foldkit-plus-on-click')).toBe('1')
  query.setAttribute(KEEP_ATTRIBUTE, '1')
  const collected = Diagnostics.collect()

  SSR.hydrate(config, plan(), { buildId: 'b', diagnostics: collected.report })

  await vi.waitFor(() => expect(document.body.inert).toBe(true))
  expect(collected.reported).toEqual([
    expect.objectContaining({
      _tag: 'PageContained',
      reason: 'Invalid',
      message: expect.stringContaining(`${KEEP_ATTRIBUTE}="1" names no input or change binding`),
    }),
  ])
  expect(seen).toEqual([])
})
