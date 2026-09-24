/**
 * Phase C, on the server: a deferred boot is refused while a Subscription or
 * Managed Resource would start late, unless the plan names it deferrable or
 * a part vouches for its own package's entries, as Remote's does.
 */
import { Effect, Option, Schema, Stream } from 'effect'
import { Projection } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { SSR, type ResumableConfig, type ResumePlan } from 'foldkit-ssr'
import { App, config, plan } from './bindingsFixture.js'
import { App as RemoteApp, config as remoteConfig, plan as remotePlan } from './remoteFixture.js'

/** A Subscription that ticks: a late start would be a behaviour change. */
const ticking = {
  dependenciesSchema: Schema.Null,
  modelToDependencies: () => null,
  dependenciesToStream: () => Stream.empty,
}
const withTicking = { ...config, subscriptions: { tick: ticking } }

const refusal = <Model, Fields extends Schema.Struct.Fields>(
  used: ResumableConfig<Model>,
  resume: ResumePlan<Model, Fields>,
) => Effect.runPromise(Effect.flip(SSR.render(used, resume, { buildId: 'b' })))

describe('EagerStartRequired', () => {
  it('names each entry that would start late', async () => {
    const deferred = SSR.plan(App, {
      id: 'post',
      state: plan.state,
      surfaces: plan.surfaces,
      start: 'on-interaction',
    })
    const refused = await refusal(withTicking, deferred)
    expect(refused).toMatchObject({ _tag: 'ResumeUnsafe', reason: 'EagerStartRequired' })
    expect(refused.message).toContain('these would start late: subscription "tick"')
  })

  it('counts a Managed Resource the Model asks for, and not one it does not', async () => {
    const deferred = SSR.plan(App, {
      id: 'post',
      state: plan.state,
      surfaces: plan.surfaces,
      start: 'idle',
    })
    const socket = (asks: boolean) => ({
      modelToMaybeRequirements: () => (asks ? Option.some({ url: 'wss://x' }) : Option.none()),
    })
    const refused = await refusal(
      { ...config, managedResources: { socket: socket(true) } },
      deferred,
    )
    expect(refused.message).toContain('resource "socket"')
    const idle = await Effect.runPromise(
      SSR.render({ ...config, managedResources: { socket: socket(false) } }, deferred, {
        buildId: 'b',
      }),
    )
    expect(idle.envelope).toContain('"plan":"post"')
  })

  it('is not raised when the plan starts now', async () => {
    const result = await Effect.runPromise(SSR.render(withTicking, plan, { buildId: 'b' }))
    expect(result.envelope).toContain('"plan":"post"')
  })

  it('is not raised for an entry the plan declares deferrable', async () => {
    const declared = SSR.plan(App, {
      id: 'post',
      state: plan.state,
      surfaces: plan.surfaces,
      start: 'idle',
      deferrable: ['tick'],
    })
    const result = await Effect.runPromise(SSR.render(withTicking, declared, { buildId: 'b' }))
    expect(result.envelope).toContain('"plan":"post"')
  })

  it("is not raised for Remote's entries, which its part vouches for", async () => {
    const deferred = SSR.plan(RemoteApp, {
      id: 'author',
      state: Projection.pick(RemoteApp.model.theme),
      surfaces: remotePlan.surfaces,
      parts: remotePlan.parts,
      start: 'on-interaction',
    })
    const result = await Effect.runPromise(SSR.render(remoteConfig, deferred, { buildId: 'b' }))
    expect(result.envelope).toContain('"plan":"author"')

    const unvouched = SSR.plan(RemoteApp, {
      id: 'author',
      state: Projection.pick(RemoteApp.model.theme),
      surfaces: remotePlan.surfaces,
      start: 'on-interaction',
    })
    const refused = await refusal(remoteConfig, unvouched)
    expect(refused.message).toContain('subscription "page.read"')
  })
})
