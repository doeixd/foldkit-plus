// @vitest-environment jsdom
/**
 * Phase G2, rule 6: a click that bubbles through a parent, then one on a child
 * that stops it, reach the Model the eager page reaches. The first click boots
 * the page with two Messages, which must arrive in the order the page chains
 * them.
 */
import { expect, it } from 'vitest'
import { Action, equivalence } from './equivalence.js'
import { config, plan } from './equivalenceFixture.js'
import { template } from './support.js'

it('reaches the eager Model for a bubbling click then a stopped one', async () => {
  const { eager, resumed } = await equivalence({
    config,
    plan: plan(),
    template,
    actions: [Action.click('bubble'), Action.click('inner')],
  })
  expect(eager).toMatchObject({ log: ['click bubble', 'click outer', 'click inner'] })
  expect(resumed).toEqual(eager)
})
