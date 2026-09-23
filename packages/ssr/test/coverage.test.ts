/**
 * Phase 3: a plan covers what the browser's Surfaces read. Every field an
 * active Surface reads, and every field that decides whether it is active, is
 * sent or named `local`; a read no Model path names is reported by its
 * metadata; and a Surface the browser's Model activates differently is
 * reported. `SSR.render` refuses a plan that falls short, naming each gap.
 */
import { Effect, Optic, Schema } from 'effect'
import { ModelRef, Projection, Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { SSR, type ResumePlan } from 'foldkit-ssr'
import {
  App,
  AppRoute,
  author,
  config,
  likedBadge,
  menu,
  postActions,
  postAuthor,
  served,
  type Model,
} from './coverageFixture.js'

const refusal = <Fields extends Schema.Struct.Fields>(plan: ResumePlan<Model, Fields>) =>
  Effect.runPromise(Effect.flip(SSR.render(config, plan, { buildId: 'b' })))

describe('SSR.inspect', () => {
  it('says where each read comes from in the browser', () => {
    const plan = SSR.plan(App, {
      id: 'post',
      state: Projection.pick(App.model.route, App.model.post.id, App.model.post.liked),
      local: [App.model.menuOpen],
      surfaces: [postActions, menu],
    })
    expect(SSR.inspect(plan, served)).toEqual({
      id: 'post',
      state: ['route', 'post.id', 'post.liked'],
      local: ['menuOpen'],
      parts: [],
      surfaces: [
        {
          name: 'PostActions',
          active: true,
          activation: { path: 'route', cover: 'state' },
          reads: [
            { path: 'post.id', cover: 'state' },
            { path: 'post.liked', cover: 'state' },
          ],
          unresumed: [],
          sameInBrowser: true,
        },
        {
          name: 'Menu',
          active: true,
          reads: [{ path: 'menuOpen', cover: 'local' }],
          unresumed: [],
          sameInBrowser: true,
        },
      ],
    })
  })

  it('counts a field as covered when a sent field contains it', () => {
    const plan = SSR.plan(App, {
      id: 'post',
      state: Projection.pick(App.model.route, App.model.post),
      surfaces: [postActions],
    })
    expect(SSR.inspect(plan, served).surfaces[0]?.reads.map(read => read.cover)).toEqual([
      'state',
      'state',
    ])
  })
})

describe('SSR.render refuses a plan that does not cover its Surfaces', () => {
  it('renders when everything is covered', async () => {
    const plan = SSR.plan(App, {
      id: 'post',
      state: Projection.pick(App.model.route, App.model.post.id, App.model.post.liked),
      local: [App.model.menuOpen],
      surfaces: [postActions, menu],
    })
    const result = await Effect.runPromise(SSR.render(config, plan, { buildId: 'b' }))
    expect(result.envelope).toContain('"liked":true')
  })

  it('names a Surface reading a field in neither the state nor local', async () => {
    const plan = SSR.plan(App, {
      id: 'post',
      state: Projection.pick(App.model.route, App.model.post.id),
      surfaces: [postActions],
    })
    const refused = await refusal(plan)
    expect(refused).toMatchObject({ _tag: 'ResumeUnsafe', reason: 'Uncovered' })
    expect(refused.message).toContain('Surface "PostActions" reads post.liked')
  })

  it('names a field that decides activation, left out', async () => {
    const plan = SSR.plan(App, {
      id: 'post',
      state: Projection.pick(App.model.post.id, App.model.post.liked),
      surfaces: [postActions],
    })
    const refused = await refusal(plan)
    expect(refused.message).toContain('Surface "PostActions" is activated by route')
  })

  it('names a Surface the browser would activate differently', async () => {
    const plan = SSR.plan(App, {
      id: 'post',
      state: Projection.pick(App.model.post.id),
      surfaces: [likedBadge],
    })
    expect(SSR.inspect(plan, served).surfaces[0]?.reads).toEqual([
      { path: 'post.id', cover: 'state' },
    ])
    const refused = await refusal(plan)
    expect(refused.message).toContain(
      'Surface "LikedBadge" is active on the server and activates differently',
    )
  })

  it('names a Remote read by its metadata, which no part of the plan resumes', async () => {
    const plan = SSR.plan(App, {
      id: 'post',
      state: Projection.pick(App.model.route),
      surfaces: [author],
    })
    expect(SSR.inspect(plan, served).surfaces[0]?.unresumed).toEqual([
      { name: 'remote', entries: ['User:u1'] },
    ])
    const refused = await refusal(plan)
    expect(refused.message).toContain('Surface "Author" reads remote data (User:u1)')
  })

  it('compares what a Surface reads by its metadata too, not only its paths', () => {
    const plan = SSR.plan(App, {
      id: 'post',
      state: Projection.pick(App.model.route),
      surfaces: [postAuthor],
    })
    // The browser's `post.id` is the baseline's, so it would read another user.
    expect(SSR.inspect(plan, served).surfaces[0]).toMatchObject({
      reads: [],
      unresumed: [{ name: 'remote', entries: ['User:p1'] }],
      sameInBrowser: false,
    })
  })

  it('does not cover anything with a local place that has no path', async () => {
    const pathless = ModelRef.fromOptic(App.Model, Optic.id<typeof served>())
    const plan = SSR.plan(App, {
      id: 'post',
      state: Projection.pick(App.model.route, App.model.post.id),
      local: [pathless],
      surfaces: [postActions],
    })
    expect(SSR.inspect(plan, served).surfaces[0]?.reads).toContainEqual({
      path: 'post.liked',
      cover: 'missing',
    })
  })

  it('does not check an inactive Surface’s reads', async () => {
    const plan = SSR.plan(App, {
      id: 'post',
      state: Projection.pick(App.model.route),
      surfaces: [author],
    })
    const home = { ...served, route: AppRoute.Home() }
    expect(SSR.inspect(plan, home).surfaces[0]).toMatchObject({
      active: false,
      reads: [],
      unresumed: [],
      sameInBrowser: true,
    })
  })
})

it('refuses a Surface from another application', () => {
  const Other = Surface.application({
    Model: App.Model,
    Message: App.Message,
    initial: served,
    update: model => ({ model }),
  })
  expect(() =>
    SSR.plan(Other, { id: 'post', state: Projection.pick(Other.model.route), surfaces: [menu] }),
  ).toThrow('the Surface "Menu" belongs to another application than plan "post"')
})
