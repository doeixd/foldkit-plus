// @vitest-environment jsdom
/**
 * Phase G2, rule 6: key presses with modifiers reach the Model the eager page
 * reaches. The first fills its hole from the booting event, modifiers included.
 */
import { expect, it } from 'vitest'
import { Action, equivalence } from './equivalence.js'
import { config, plan } from './equivalenceFixture.js'
import { template } from './support.js'

it('reaches the eager Model for key presses with modifiers', async () => {
  const { eager, resumed } = await equivalence({
    config,
    plan: plan(),
    template,
    actions: [
      Action.key('keys', 'k', { ctrlKey: true, shiftKey: true }),
      Action.key('keys', 'Enter', { metaKey: true }),
    ],
  })
  expect(eager).toMatchObject({ log: ['key k shift+ctrl', 'key Enter meta'] })
  expect(resumed).toEqual(eager)
})
