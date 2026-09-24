/**
 * Phase D, on the server: a page's bindings may only dispatch Messages an
 * active Surface lists, a page with bindings needs Surfaces to say so, and a
 * handler inside a static region is refused.
 */
import { Effect, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { Projection, Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Resume, SSR } from 'foldkit-ssr'
import { App, Message, config, plan, type Model } from './bindingsFixture.js'

const refusal = <Fields extends Parameters<typeof SSR.render<Model, any>>[1]>(
  used: typeof config,
  resume: Fields,
) => Effect.runPromise(Effect.flip(SSR.render(used, resume, { buildId: 'b' })))

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

describe('bindings against the Surfaces', () => {
  it('refuses a plan that declares no surfaces for a page with bindings', async () => {
    const bare = SSR.plan(App, { id: 'post', state: plan.state })
    const refused = await refusal(config, bare)
    expect(refused).toMatchObject({ _tag: 'ResumeUnsafe', reason: 'UndeclaredSurfaces' })
    expect(refused.message).toContain('the page has 6 bindings and the plan declares no surfaces')
  })

  it('refuses a binding whose Message no active Surface lists, naming it', async () => {
    const partial = SSR.plan(App, {
      id: 'post',
      state: plan.state,
      surfaces: [Surface.at(Reader, undefined)],
    })
    const refused = await refusal(config, partial)
    expect(refused).toMatchObject({ _tag: 'ResumeUnsafe', reason: 'Uncovered' })
    expect(refused.message).toContain(
      'the keydown binding on div#keys dispatches Pressed, which no active Surface lists in its messages',
    )
    expect(refused.message).not.toContain('Liked')
  })

  it('counts only the Surfaces active for the served Model', async () => {
    // With params, the Surface is inactive while the Model gives none.
    const Keys = App.surface('Keys', {
      params: { focus: Schema.String },
      model: ({ model }) => ({ pressed: model.pressed }),
      messages: [Message.Pressed],
    })
    const asleep = SSR.plan(App, {
      id: 'post',
      state: plan.state,
      surfaces: [Surface.at(Reader, undefined), Surface.at(Keys, () => undefined)],
    })
    const refused = await refusal(config, asleep)
    expect(refused.message).toContain('dispatches Pressed')
    const awake = SSR.plan(App, {
      id: 'post',
      state: plan.state,
      surfaces: [Surface.at(Reader, undefined), Surface.at(Keys, { focus: 'keys' })],
    })
    const result = await Effect.runPromise(SSR.render(config, awake, { buildId: 'b' }))
    expect(result.envelope).toContain('"plan":"post"')
  })

  it('refuses a handler inside a static region, naming the region and element', async () => {
    const page = {
      ...config,
      view: (model: Model, h: HtmlBuilder<Message>) => {
        const rh = Resume.builder(h)
        return {
          title: 'Post',
          body: rh.main(
            [],
            [
              SSR.static('promo', ih => [
                ih.p([], ['Buy now']),
                rh.button([rh.Id('buy'), rh.OnClick(Message.Liked({ id: model.id }))], ['Buy']),
              ]),
            ],
          ),
        }
      },
    }
    const refused = await refusal(page, plan)
    expect(refused).toMatchObject({ _tag: 'ResumeUnsafe', reason: 'BindingInStaticRegion' })
    expect(refused.message).toContain('a click handler on button#buy in "promo"')
  })

  it('does not take a handler after a static region for one inside it', async () => {
    const page = {
      ...config,
      view: (model: Model, h: HtmlBuilder<Message>) => {
        const rh = Resume.builder(h)
        return {
          title: 'Post',
          body: rh.main(
            [],
            [
              SSR.static('promo', ih => [ih.p([], ['Buy now'])]),
              rh.button([rh.Id('like'), rh.OnClick(Message.Liked({ id: model.id }))], ['Like']),
            ],
          ),
        }
      },
    }
    const result = await Effect.runPromise(SSR.render(page, plan, { buildId: 'b' }))
    expect(result.envelope).toContain('"_tag":"Liked"')
  })
})
