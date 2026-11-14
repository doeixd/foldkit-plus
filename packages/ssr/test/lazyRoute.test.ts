/**
 * `lazy` as a function of the Model (#438): the server loads only what the
 * page it renders draws, asked with the Model that page is drawn from, and
 * runs `init` once for it.
 */
import { Effect } from 'effect'
import { handleRequest } from 'foldkit/experimental/server'
import { describe, expect, it } from 'vitest'
import { SSR } from 'foldkit-ssr'
import { body, make, template, type Model } from './lazyFixture.js'

/** A lazy bundle no page here draws, which counts its loads. */
const unplaced = () => {
  let calls = 0
  return {
    loadable: {
      name: 'Other',
      load: async () => {
        calls++
      },
      isLoaded: () => false,
    },
    calls: () => calls,
  }
}

/** The fixture's config with `lazy` asked of the Model, recording each Model it is asked with. */
const routed = () => {
  const served = make(() => Promise.resolve(body))
  const other = unplaced()
  const asked: Array<string> = []
  let inits = 0
  const config = {
    ...served.config,
    init: () => {
      inits++
      return served.config.init()
    },
    lazy: (model: Model) => {
      asked.push(model.title)
      return model.title === 'Elsewhere' ? [other.loadable] : [served.Clicker]
    },
  }
  return { ...served, config, other, asked, inits: () => inits }
}

describe('lazy, asked of the Model', () => {
  it("loads the drawn page's bundle and none of another's, from init's Model, running init once", async () => {
    const { Clicker, config, plan, other, asked, inits } = routed()
    const { rendered } = await Effect.runPromise(SSR.render(config, plan(), { buildId: 'b' }))
    expect(asked).toEqual(['Lazy'])
    expect(Clicker.isLoaded()).toBe(true)
    expect(other.calls()).toBe(0)
    // The real view, not the placeholder.
    expect(rendered.html).toContain('id="count"')
    expect(inits()).toBe(1)
  })

  it('is asked with the Model `prepare` made, so another route loads its own code alone', async () => {
    const { Clicker, config, plan, other, asked } = routed()
    const entry = SSR.entry(config, plan(), {
      buildId: 'b',
      prepare: model => Effect.succeed({ ...model, title: 'Elsewhere' }),
    })
    const response = await handleRequest(
      new Request('https://example.test/', { headers: { accept: 'text/html' } }),
      { renderPage: entry.renderPage, template },
    )
    expect(response.status).toBe(200)
    // The entry asks again, with the same Model, whether the page waits to boot.
    expect(new Set(asked)).toEqual(new Set(['Elsewhere']))
    expect(other.calls()).toBe(1)
    expect(Clicker.isLoaded()).toBe(false)
  })
})
