/**
 * Phase G1: a handler the page cannot name is named on the server. The render
 * lists each element and event marked `*`, and the entry and generator warn
 * about each once per process when the page waits to boot, so whoever serves it
 * learns which handler keeps it from answering before the runtime starts.
 */
import { Effect, Option } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { Projection, Surface } from 'foldkit-surface'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Resume, SSR } from 'foldkit-ssr'
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

  it('are warned about once per process by the entry, however many requests it serves', async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const entry = SSR.entry(config, deferred('entry-warn'), { buildId: 'b', template })
    await entry.renderPage(get())
    await entry.renderPage(get())
    const lines = warned.mock.calls.map(([line]) => String(line))
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('input#closure handles input')
    expect(lines[1]).toContain('button#point handles pointerdown')
  })

  it('are warned about once per process by the generator, across its paths', async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await Effect.runPromise(
      SSR.generate(config, deferred('generate-warn'), {
        buildId: 'b',
        template,
        origin: 'https://example.test',
        paths: ['/', '/other'],
      }),
    )
    expect(warned).toHaveBeenCalledTimes(2)
  })

  it('are not warned about for a page that boots at once', async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await SSR.entry(config, plan, { buildId: 'b', template }).renderPage(get())
    expect(warned).not.toHaveBeenCalled()
  })
})
