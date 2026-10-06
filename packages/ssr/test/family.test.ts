// @vitest-environment jsdom
/**
 * router-DESIGN §31 step 2, SSR half: a resume plan takes `SurfaceSource`s,
 * the envelope carries a family's parent with its instances, and coverage
 * inspects each instance — naming the gap `Member[u1]`, not just `Member`.
 */
import { Effect, Schema } from 'effect'
import { Remote } from 'foldkit-remote'
import { Projection, Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { SSR, type ResumePlan } from 'foldkit-ssr'
import type { Model } from './familyFixture.js'
import { App, Data, Members, config, loaded, offRoute, plan, team } from './familyFixture.js'

const refusal = <Fields extends Schema.Struct.Fields>(plan: ResumePlan<Model, Fields>) =>
  Effect.runPromise(Effect.flip(SSR.render(config, plan, { buildId: 'b' })))

describe('SSR.inspect with a family', () => {
  it('covers the parent once and each instance by key', () => {
    expect(SSR.inspect(plan, loaded)).toEqual({
      id: 'team',
      state: ['route', 'members'],
      local: [],
      parts: ['remote'],
      surfaces: [
        {
          name: 'Team',
          active: true,
          activation: { path: 'route', cover: 'state' },
          reads: [{ path: 'members', cover: 'state' }],
          unresumed: [],
          sameInBrowser: true,
        },
        {
          name: 'Member',
          active: true,
          key: 'u1',
          via: {
            surface: 'Team',
            activation: { path: 'route', cover: 'state' },
          },
          reads: [],
          unresumed: [],
          sameInBrowser: true,
        },
        {
          name: 'Member',
          active: true,
          key: 'u2',
          via: {
            surface: 'Team',
            activation: { path: 'route', cover: 'state' },
          },
          reads: [],
          unresumed: [],
          sameInBrowser: true,
        },
      ],
    })
  })

  it('covers only the parent while the parent is inactive', () => {
    expect(SSR.inspect(plan, offRoute)).toEqual({
      id: 'team',
      state: ['route', 'members'],
      local: [],
      parts: ['remote'],
      surfaces: [
        {
          name: 'Team',
          active: false,
          activation: { path: 'route', cover: 'state' },
          reads: [],
          unresumed: [],
          sameInBrowser: true,
        },
      ],
    })
  })
})

describe('The envelope with a family', () => {
  it('carries what the parent reads with what the instances read', () => {
    const body = JSON.parse(SSR.envelope(plan, loaded))
    expect(Object.keys(body.parts.remote.entities).sort()).toEqual([
      'User:c9',
      'User:u1',
      'User:u2',
    ])
  })
})

describe('SSR.render refuses an uncovered instance by key', () => {
  it('names the instance whose Remote read no part resumes', async () => {
    const uncovered = SSR.plan(App, {
      id: 'team',
      state: Projection.pick(App.model.route, App.model.members),
      surfaces: [Members],
    })
    const refused = await refusal(uncovered)
    expect(refused).toMatchObject({ _tag: 'ResumeUnsafe', reason: 'Uncovered' })
    expect(SSR.inspect(uncovered, loaded).surfaces[0]).toMatchObject({
      name: 'Team',
      unresumed: [{ name: 'remote', entries: ['User:c9'] }],
    })
    expect(refused.message).toContain('Surface "Member[u1]" reads remote data (User:u1)')
    expect(refused.message).toContain('Surface "Member[u2]" reads remote data (User:u2)')
  })

  it('names the instance the browser would activate differently', async () => {
    const stateless = SSR.plan(App, {
      id: 'team',
      state: Projection.pick(App.model.route),
      surfaces: [Members],
      parts: [Remote.resume(Data)],
    })
    const refused = await refusal(stateless)
    expect(refused.message).toContain('Surface "Team" reads members')
    expect(refused.message).toContain(
      'Surface "Member[u1]" is active on the server and activates differently',
    )
  })
})

describe('Plan ownership with a family', () => {
  const Other = Surface.application({
    Model: App.Model,
    Message: App.Message,
    initial: loaded,
    update: (model: Model) => ({ model }),
  })

  it('refuses a family from another application', () => {
    expect(() =>
      SSR.plan(Other, {
        id: 'team',
        state: Projection.pick(Other.model.route),
        surfaces: [team],
      }),
    ).toThrow('the Surface "Team" belongs to another application than plan "team"')
  })

  it('refuses a family whose parent is from another application', () => {
    const Stranger = Other.surface('Stranger', {
      model: ({ model }) => Projection.struct({ members: model.members }),
    })
    const smuggled = Surface.each(Stranger, { from: team, instances: () => [] })
    expect(() =>
      SSR.plan(Other, {
        id: 'team',
        state: Projection.pick(Other.model.route),
        surfaces: [smuggled],
      }),
    ).toThrow('the Surface "Team" belongs to another application than plan "team"')
  })
})
