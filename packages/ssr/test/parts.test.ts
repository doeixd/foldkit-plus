// @vitest-environment jsdom
/**
 * Phase R: resume parts carry state the plan's slice cannot, each captured on
 * the server and restored in the browser by the package that owns it. A page
 * is refused whole when a part is missing, unknown, or does not restore.
 */
import { Effect, Result } from 'effect'
import { describe, expect, it } from 'vitest'
import { RESUME_ATTRIBUTE, SSR, type ResumePart } from 'foldkit-ssr'
import { Projection } from 'foldkit-surface'
import { App, config, loaded, plan, type Model } from './remoteFixture.js'

/** A page holding one envelope script with this body. */
const page = (body: unknown): ParentNode => {
  const root = document.createElement('div')
  const script = document.createElement('script')
  script.type = 'application/json'
  script.setAttribute(RESUME_ATTRIBUTE, '')
  script.textContent = JSON.stringify(body)
  root.append(script)
  return root
}

/** The body of the envelope a server writes for `model`. */
const envelopeBody = (model: Model) =>
  JSON.parse(
    SSR.envelope(plan, model)
      .replace(/^<script[^>]*>/, '')
      .replace(/<\/script>$/, ''),
  )

describe('parts in the envelope', () => {
  it('carries each part beside the state, and restores it', () => {
    const body = envelopeBody(loaded)
    expect(Object.keys(body.parts)).toEqual(['remote'])
    const resumed = SSR.resume(plan, page(body))
    expect(Result.isSuccess(resumed)).toBe(true)
  })

  it('refuses a page missing a part the plan names', () => {
    const { parts: _parts, ...body } = envelopeBody(loaded)
    const refused = SSR.resume(plan, page(body))
    expect(Result.isFailure(refused) && refused.failure).toMatchObject({
      reason: 'Invalid',
      message: 'the envelope carries no "remote" part',
    })
  })

  it('refuses a page carrying a part the plan does not name', () => {
    const body = envelopeBody(loaded)
    body.parts.extra = {}
    const refused = SSR.resume(plan, page(body))
    expect(Result.isFailure(refused) && refused.failure.message).toBe(
      'the envelope carries a part "extra" the plan does not name',
    )
  })

  it('refuses a page whose part does not restore, naming the part', () => {
    const body = envelopeBody(loaded)
    body.parts.remote = { entities: 'nope' }
    const refused = SSR.resume(plan, page(body))
    expect(Result.isFailure(refused) && refused.failure.message).toContain(
      'the "remote" part does not restore: ',
    )
  })
})

describe('parts in the plan and the render', () => {
  const broken: ResumePart<Model> = {
    id: 'broken',
    covers: [],
    capture: () => ({}),
    restore: () => Result.fail('it never restores'),
  }

  it('refuses two parts with one id', () => {
    expect(() =>
      SSR.plan(App, {
        id: 'author',
        state: Projection.pick(App.model.theme),
        parts: [broken, broken],
      }),
    ).toThrow('two parts of plan "author" share the id "broken"')
  })

  it('captures each part once per render', async () => {
    let captures = 0
    const counted: ResumePart<Model> = {
      id: 'counted',
      covers: [],
      capture: () => {
        captures++
        return {}
      },
      restore: model => Result.succeed(model),
    }
    const counting = SSR.plan(App, {
      id: 'author',
      state: Projection.pick(App.model.theme),
      surfaces: plan.surfaces,
      parts: [...plan.parts, counted],
    })
    await Effect.runPromise(SSR.render(config, counting, { buildId: 'b' }))
    expect(captures).toBe(1)
  })

  it('refuses to render a part that cannot restore its own capture', async () => {
    const unrestorable = SSR.plan(App, {
      id: 'author',
      state: Projection.pick(App.model.theme),
      parts: [broken],
    })
    const refused = await Effect.runPromise(
      Effect.flip(SSR.render(config, unrestorable, { buildId: 'b' })),
    )
    expect(refused).toMatchObject({
      _tag: 'ResumeUnsafe',
      reason: 'UnrestorablePart',
      message: 'the "broken" part does not restore: it never restores',
    })
  })

  it('counts a Remote read as resumed when a part covers it', () => {
    expect(SSR.inspect(plan, loaded)).toMatchObject({
      parts: ['remote'],
      surfaces: [{ name: 'Author', unresumed: [], reads: [], sameInBrowser: true }],
    })
    const uncovered = SSR.plan(App, {
      id: 'author',
      state: Projection.pick(App.model.theme),
      surfaces: plan.surfaces,
    })
    expect(SSR.inspect(uncovered, loaded).surfaces[0]?.unresumed).toEqual([
      { name: 'remote', entries: ['User:u1'] },
    ])
  })
})
