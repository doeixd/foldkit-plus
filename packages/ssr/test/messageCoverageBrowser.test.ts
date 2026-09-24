// @vitest-environment jsdom
/**
 * Phase D, in the browser: the page's bindings are decoded against what the
 * active Surfaces may send, so an entry outside that set refuses the page even
 * when it is one of the application's Messages.
 */
import { Effect, Result } from 'effect'
import { FOLDKIT_APP_ATTRIBUTE } from 'foldkit/experimental/server'
import { Surface } from 'foldkit-surface'
import { expect, it } from 'vitest'
import { Resume, SSR } from 'foldkit-ssr'
import { App, Message, config, load, plan, template } from './bindingsFixture.js'

/** A Surface that lists every bound Message but Pressed. */
const Reader = App.surface('Reader', {
  model: ({ model }) => ({
    id: model.id,
    likes: model.likes,
    search: model.search,
    pressed: model.pressed,
  }),
  messages: [Message.Liked, Message.ChangedSearch, Message.Renamed, Message.Counted],
})

it('refuses an entry no active Surface lists, and a plan with no surfaces', async () => {
  load(SSR.page(template, await Effect.runPromise(SSR.render(config, plan, { buildId: 'b' }))))
  const root = document.querySelector(`[${FOLDKIT_APP_ATTRIBUTE}]`)
  if (root === null) throw new Error('the page has no application root')
  const model = Result.getOrThrow(SSR.resume(plan, document))
  expect(Result.isSuccess(Resume.bindings(plan, document, root, model))).toBe(true)

  const partial = SSR.plan(App, {
    id: 'post',
    state: plan.state,
    surfaces: [Surface.at(Reader, undefined)],
  })
  const refused = Resume.bindings(partial, document, root, model)
  if (!Result.isFailure(refused)) throw new Error('the page was not refused')
  expect(refused.failure).toMatchObject({
    reason: 'Invalid',
    message: 'binding 3 dispatches Pressed, which no active Surface lists in its messages',
  })

  const bare = SSR.plan(App, { id: 'post', state: plan.state })
  const undeclared = Resume.bindings(bare, document, root, model)
  if (!Result.isFailure(undeclared)) throw new Error('the page was not refused')
  expect(undeclared.failure.message).toBe(
    'the page has bindings and the plan declares no surfaces to allow them',
  )
})
