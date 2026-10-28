/**
 * Phase G1: a handler the page cannot name is named on the server. The render
 * lists each element and event marked `*`, and the entry and generator report
 * each once per process when the page waits to boot, so whoever serves it
 * learns which handler keeps it from answering before the runtime starts.
 */
import { Effect, Option } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { Projection, Surface } from 'foldkit-surface'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Diagnostics, Resume, SSR } from 'foldkit-ssr'
import { App, Post, config, plan, template, type Message, type Model } from './bindingsFixture.js'

const deferred = (id: string) =>
  SSR.plan(App, {
    id,
    state: Projection.pick(App.model.id, App.model.likes, App.model.search, App.model.pressed),
    surfaces: [Surface.at(Post, undefined)],
    start: 'on-interaction',
  })

const get = () => new Request('https://example.test/', { headers: { accept: 'text/html' } })

afterEach(() => {
  vi.restoreAllMocks()
})

describe('handlers the page cannot name', () => {
  it('are listed by the render, each element and event once', async () => {
    const { unnamed } = await Effect.runPromise(SSR.render(config, plan, { buildId: 'b' }))
    expect(unnamed).toEqual([
      { element: 'input#closure', event: 'input' },
      { element: 'button#point', event: 'pointerdown' },
    ])
  })

  it('are listed once for an element that chains two for one event', async () => {
    const twice = {
      ...config,
      view: (_: Model, h: HtmlBuilder<Message>) => {
        const rh = Resume.builder(h)
        return {
          title: 'Twice',
          body: rh.button(
            [
              rh.Id('twice'),
              rh.OnPointerDown(() => Option.none()),
              rh.OnPointerDown(() => Option.none()),
            ],
            [],
          ),
        }
      },
    }
    const { unnamed } = await Effect.runPromise(SSR.render(twice, plan, { buildId: 'b' }))
    expect(unnamed).toEqual([{ element: 'button#twice', event: 'pointerdown' }])
  })

  it('are reported once per process by the entry, however many requests it serves', async () => {
    const collected = Diagnostics.collect()
    const entry = SSR.entry(config, deferred('entry-warn'), {
      buildId: 'b',
      diagnostics: collected.report,
    })
    await entry.renderPage(get())
    await entry.renderPage(get())
    expect(collected.reported).toEqual([
      expect.objectContaining({
        _tag: 'HandlerUnnamed',
        source: 'foldkit-ssr',
        level: 'warning',
        plan: 'entry-warn',
        element: 'input#closure',
        event: 'input',
      }),
      expect.objectContaining({
        _tag: 'HandlerUnnamed',
        plan: 'entry-warn',
        element: 'button#point',
        event: 'pointerdown',
      }),
    ])
  })

  it('are reported once per process by the generator, across its paths, to the reporter in context', async () => {
    const collected = Diagnostics.collect()
    await Effect.runPromise(
      SSR.generate(config, deferred('generate-warn'), {
        buildId: 'b',
        template,
        origin: 'https://example.test',
        paths: ['/', '/other'],
      }).pipe(Effect.provideService(Diagnostics.Reporter, collected.report)),
    )
    expect(collected.reported.map(diagnostic => diagnostic._tag)).toEqual([
      'HandlerUnnamed',
      'HandlerUnnamed',
    ])
  })

  it('are not reported for a page that boots at once', async () => {
    const collected = Diagnostics.collect()
    await SSR.entry(config, plan, { buildId: 'b', diagnostics: collected.report }).renderPage(get())
    expect(collected.reported).toEqual([])
  })
})
