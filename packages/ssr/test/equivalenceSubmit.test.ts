// @vitest-environment jsdom
/**
 * Phase G2, rule 6: a submit that boots the page, then typing and a second
 * submit, reach the Model the eager page reaches. The first submit's Message
 * is the one the server rendered; the second carries what was typed.
 */
import { expect, it } from 'vitest'
import { Action, equivalence } from './equivalence.js'
import { config, plan } from './equivalenceFixture.js'
import { template } from './support.js'

it('reaches the eager Model for a submit, typing, and a submit', async () => {
  const { eager, resumed } = await equivalence({
    config,
    plan: plan(),
    template,
    actions: [Action.submit('form'), Action.type('text', 'draft'), Action.submit('form')],
  })
  expect(eager).toMatchObject({ text: 'draft' })
  expect(resumed).toEqual(eager)
})
