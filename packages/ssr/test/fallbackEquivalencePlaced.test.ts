// @vitest-environment jsdom
/**
 * Phase G3, inside a placement: a placed form posted with scripts off returns
 * the page a browser submit would have produced. It posts the parent's
 * Message, and the field it names sits one wrapper down.
 */
import { expect, it } from 'vitest'
import { FALLBACK_FIELD } from 'foldkit-ssr'
import { Action, equivalence, posted } from './equivalence.js'
import { body, make, template } from './lazyFixture.js'

it("answers a placed form's post with the Model a browser submit reaches", async () => {
  const { config, plan } = make(async () => body)
  const posting = plan('now', 'server')
  const { resumed } = await equivalence({
    config,
    plan: posting,
    template,
    actions: [Action.type('text', 'renamed'), Action.submit('rename')],
  })
  expect(posting.state.get(resumed as never)).toMatchObject({ clicker: { text: 'renamed' } })

  const server = await posted(config, posting, {
    value: 'renamed',
    [FALLBACK_FIELD]: JSON.stringify({
      _tag: 'GotClickerMessage',
      message: { _tag: 'Typed', value: '' },
    }),
    'foldkit-plus-depth': '1',
  })
  expect(posting.state.get(server as never)).toEqual(posting.state.get(resumed as never))
})
