// @vitest-environment jsdom
/**
 * Phase 2: the server refuses a plan the browser could not honour. A startup
 * Command nobody declared would run nowhere, and a view that reads a field the
 * plan leaves out would be rebuilt in the browser.
 */
import { Effect, Exit } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { Projection } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { SSR } from 'foldkit-ssr'
import { App, config, plan, type Message, type Model } from './handoverFixture.js'

const refusal = async (effect: Effect.Effect<unknown, unknown>) => {
  const exit = await Effect.runPromiseExit(effect)
  return Exit.isFailure(exit) ? JSON.stringify(exit.cause) : 'rendered'
}

describe('SSR.render', () => {
  const Startup = { name: 'LoadPreferences', effect: Effect.never }
  const starting = {
    ...config,
    init: () => ({ model: config.init().model, commands: [Startup] }),
  }

  it('refuses a startup Command the plan does not declare, naming it', async () => {
    const reason = await refusal(SSR.render(starting as never, plan, { buildId: 'b' }))

    expect(reason).toContain('UndeclaredStartup')
    expect(reason).toContain('LoadPreferences')
  })

  it('renders once the plan declares what runs on load', async () => {
    const booting = SSR.plan(App, {
      id: 'counter',
      state: plan.state,
      boot: () => [Startup],
    })

    expect(await refusal(SSR.render(starting as never, booting, { buildId: 'b' }))).toBe('rendered')
  })

  it('refuses a view that reads a field the plan leaves out', async () => {
    const reading = {
      ...config,
      view: (model: Model, h: HtmlBuilder<Message>) => ({
        title: 'Counter',
        body: h.p([], [`${model.count} ${model.report}`]),
      }),
    }

    expect(await refusal(SSR.render(reading, plan, { buildId: 'b' }))).toContain(
      'ViewDependsOnUnsentState',
    )
    // The same view renders once the plan sends what it reads.
    const both = SSR.plan(App, {
      id: 'counter',
      state: Projection.pick(App.model.count, App.model.report),
    })
    expect(await refusal(SSR.render(reading, both, { buildId: 'b' }))).toBe('rendered')
  })
})
