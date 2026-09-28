// @vitest-environment jsdom
/**
 * Phase G2, rule 6: a closure's event among named ones, all dispatched in the
 * task that boots the page, reaches the Model the eager page reaches. Only the
 * first is answered from the markers; the rest reach the live page while it
 * is starting, and must still land after the first.
 */
import { expect, it } from 'vitest'
import { Action, equivalence } from './equivalence.js'
import { config, plan } from './equivalenceFixture.js'
import { template } from './support.js'

it('reaches the eager Model for a closure between named events in one burst', async () => {
  const { eager, resumed } = await equivalence({
    config,
    plan: plan(),
    template,
    pace: 'burst',
    actions: [
      Action.focus('text'),
      Action.type('text', 'hi'),
      Action.pointerdown('point'),
      Action.click('inner'),
      Action.blur('text'),
    ],
  })
  expect(eager).toMatchObject({
    log: ['focus text', 'type h', 'type hi', 'point', 'click inner', 'blur text'],
  })
  expect(resumed).toEqual(eager)
})
