// @vitest-environment jsdom
/**
 * Phase G3: a form posted with scripts off returns the page a browser submit
 * would have produced. The same form is typed into and submitted in the
 * browser, and posted to `SSR.handle` with the fields a browser without
 * scripts sends; the answer's envelope and the browser's final Model agree
 * through the plan's state.
 */
import { expect, it } from 'vitest'
import { FALLBACK_FIELD } from 'foldkit-ssr'
import { Action, equivalence, posted } from './equivalence.js'
import { config, plan, template } from './fallbackFixture.js'

it('answers a post with the Model a browser submit reaches', async () => {
  const { eager, resumed } = await equivalence({
    config,
    plan,
    template,
    actions: [Action.type('title', 'milk'), Action.submit('add')],
  })
  expect(resumed).toEqual(eager)

  const server = await posted(config, plan, {
    title: 'milk',
    [FALLBACK_FIELD]: JSON.stringify({ _tag: 'Added', title: '' }),
  })
  expect(plan.state.get(resumed as never)).toMatchObject({
    todos: ['Served', 'milk'],
    booted: true,
  })
  expect(plan.state.get(server as never)).toEqual(plan.state.get(resumed as never))
})
