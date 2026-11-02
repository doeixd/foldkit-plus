/**
 * `SSR.entry`'s `prepare` (#393): the Model a request starts from, made from
 * `init`'s by an Effect that may read the request, for a page and for a post
 * alike, so one entry serves every request.
 */
import { Effect, Option } from 'effect'
import { handleRequest } from 'foldkit/experimental/server'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Diagnostics, FALLBACK_FIELD, SSR } from 'foldkit-ssr'
import {
  config as counter,
  plan as counterPlan,
  template as counterTemplate,
} from './handoverFixture.js'
import { App, Todos, config, plan, template, type Model } from './fallbackFixture.js'

const html = { accept: 'text/html' }
const origins = ['https://example.test']

/** Adds the todo the request's `x-todo` names, as a cookie read into the Model would. */
const fromRequest = (model: Model, request: Request) =>
  Effect.succeed({ ...model, todos: [...model.todos, request.headers.get('x-todo') ?? ''] })

const post = (fields: Record<string, string>) =>
  new Request('https://example.test/todos', {
    method: 'POST',
    headers: { ...html, origin: 'https://example.test', 'x-todo': 'Prepared' },
    body: new URLSearchParams(fields),
  })

const added = JSON.stringify({ _tag: 'Added', title: 'Milk' })

describe('prepare', () => {
  it('renders a page from the Model it made of init’s, and carries that Model', async () => {
    const seen: Array<number> = []
    const entry = SSR.entry(counter, counterPlan, {
      buildId: 'b',
      prepare: (model, request) => {
        seen.push(model.count)
        return Effect.succeed({
          ...model,
          count: Number(new URL(request.url).searchParams.get('n')),
        })
      },
    })
    const response = await handleRequest(
      new Request('https://example.test/?n=7', { headers: html }),
      {
        renderPage: entry.renderPage,
        template: counterTemplate,
      },
    )
    const body = await response.text()
    expect(body).toMatch(/<button id="count"[^>]*>7<\/button>/)
    expect(body).toContain('"count":7')
    // `init`'s Model, once.
    expect(seen).toEqual([41])
  })

  it('starts a post from the Model it made, before update runs', async () => {
    const entry = SSR.entry(config, plan, { buildId: 'b', origins, prepare: fromRequest })
    const response = await handleRequest(post({ [FALLBACK_FIELD]: added }), {
      renderPage: entry.renderPage,
      template,
    })
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('<li>Served</li><li>Prepared</li><li>Milk</li>')
  })

  it('judges a posted Message by the Surfaces active for the Model it made', async () => {
    // The list's controls are active only once the request's todo is in it.
    const gated = SSR.plan(App, {
      id: 'todos',
      state: plan.state,
      surfaces: [
        Surface.at(Todos, (model: Model) =>
          model.todos.includes('Prepared') ? Option.some(undefined) : Option.none(),
        ),
      ],
      boot: plan.boot,
      fallback: 'server',
    })
    const answer = (prepared: boolean) =>
      SSR.entry(config, gated, {
        buildId: 'b',
        origins,
        ...(prepared ? { prepare: fromRequest } : {}),
      }).renderPage(post({ [FALLBACK_FIELD]: added }))
    expect((await answer(true))._tag).toBe('Rendered')
    const unprepared = await answer(false)
    expect(unprepared._tag === 'Responded' && unprepared.response.status).toBe(400)
  })

  it.each([
    ['a page', () => new Request('https://example.test/todos', { headers: html })],
    ['a post', () => post({ [FALLBACK_FIELD]: added })],
  ])('answers %s whose prepare fails 500, reporting it', async (_, request) => {
    const collected = Diagnostics.collect()
    const entry = SSR.entry(config, plan, {
      buildId: 'b',
      origins,
      diagnostics: collected.report,
      prepare: () => Effect.fail(new Error('the store is down')),
    })
    const response = await handleRequest(request(), { renderPage: entry.renderPage, template })
    expect(response.status).toBe(500)
    expect(collected.reported).toEqual([
      expect.objectContaining({
        _tag: 'PageFailed',
        message: expect.stringContaining('the store is down'),
      }),
    ])
  })

  it('still refuses a page whose init returns Commands the plan does not boot', async () => {
    const starting = {
      ...counter,
      init: () => ({
        model: { count: 1, report: '' },
        commands: [{ name: 'Load', effect: Effect.void }],
      }),
    }
    const collected = Diagnostics.collect()
    const entry = SSR.entry(starting, counterPlan, {
      buildId: 'b',
      diagnostics: collected.report,
      prepare: model => Effect.succeed(model),
    })
    const result = await entry.renderPage(new Request('https://example.test/'))
    expect(result._tag === 'Responded' && result.response.status).toBe(500)
    expect(collected.reported).toEqual([
      expect.objectContaining({ message: expect.stringContaining('which no browser would run') }),
    ])
  })
})
