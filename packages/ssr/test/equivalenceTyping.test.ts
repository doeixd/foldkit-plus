// @vitest-environment jsdom
/**
 * Phase G2, rule 6: typing and then a click reach the Model the eager page
 * reaches. The first character boots the page; the rest reach the live page.
 */
import { expect, it } from 'vitest'
import { Action, equivalence } from './equivalence.js'
import { config, plan } from './equivalenceFixture.js'
import { template } from './support.js'

it('reaches the eager Model for typing then a click', async () => {
  const { eager, resumed } = await equivalence({
    config,
    plan: plan(),
    template,
    actions: [Action.type('text', 'atlas'), Action.click('bubble')],
  })
  expect(eager).toMatchObject({ text: 'atlas' })
  expect(resumed).toEqual(eager)
})
