/**
 * Phase A: the server's markup names each binding. Every element with a
 * Message-valued handler, or a Message with a hole, carries an ordinal, and
 * the envelope carries the encoded Message under it; a closure carries none.
 * A binding whose Message the browser's Model would build differently is
 * refused, like a view that reads a field the plan does not send.
 */
import { Effect, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { Projection } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { BINDING_ATTRIBUTE, Resume, SSR } from 'foldkit-ssr'
import { App, Message, config, initial, plan, type Model } from './bindingsFixture.js'

const rendered = () => Effect.runPromise(SSR.render(config, plan, { buildId: 'b' }))

const bindingsOf = (envelope: string) =>
  JSON.parse(envelope.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '')).bindings

describe('the resumable builder on the server', () => {
  it('marks each binding with its ordinal, in render order', async () => {
    const { rendered: page } = await rendered()
    const tag = (id: string) => page.html.match(new RegExp(`<[a-z]+[^>]*id="${id}"[^>]*>`))?.[0]
    expect(tag('like')).toContain(`${BINDING_ATTRIBUTE}click="0"`)
    expect(tag('search')).toContain(`${BINDING_ATTRIBUTE}input="1"`)
    expect(tag('title')).toContain(`${BINDING_ATTRIBUTE}change="2"`)
    expect(tag('keys')).toContain(`${BINDING_ATTRIBUTE}keydown="3"`)
    // A keyed element is marked like any other.
    expect(tag('item')).toContain(`${BINDING_ATTRIBUTE}click="4"`)
    // A closure is not data: nothing can name what it would do.
    expect(tag('closure')).not.toContain(BINDING_ATTRIBUTE)
  })

  it('writes each binding into the envelope, as the Message Schema encodes it', async () => {
    const { envelope } = await rendered()
    expect(bindingsOf(envelope)).toEqual([
      { event: 'click', message: { _tag: 'Liked', id: 'p1' }, options: { propagation: 'Stop' } },
      { event: 'input', message: { _tag: 'ChangedSearch', value: '' }, hole: ['value'] },
      { event: 'change', message: { _tag: 'Renamed', id: 'p1', title: '' }, hole: ['title'] },
      {
        event: 'keydown',
        message: {
          _tag: 'Pressed',
          key: '',
          modifiers: { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false },
        },
        hole: ['key', 'modifiers'],
      },
      { event: 'click', message: { _tag: 'Liked', id: 'p1' } },
    ])
    for (const binding of bindingsOf(envelope)) {
      expect(() => Schema.decodeUnknownSync(Message)(binding.message)).not.toThrow()
    }
  })

  it('refuses a binding whose Message reads a field the plan does not send', async () => {
    const unsent = SSR.plan(App, {
      id: 'post',
      state: Projection.pick(App.model.likes, App.model.search, App.model.pressed),
    })
    const refused = await Effect.runPromise(
      Effect.flip(SSR.render(config, unsent, { buildId: 'b' })),
    )
    expect(refused).toMatchObject({ _tag: 'ResumeUnsafe', reason: 'ViewDependsOnUnsentState' })
    expect(refused.message).toContain(
      'the view differs in its click binding on button#like, change binding on input#title, click binding on button#item when rendered',
    )
  })

  it('refuses bindings a plan without the Message Schema cannot encode', async () => {
    const schemaless = SSR.plan(
      { initial },
      { id: 'post', state: Projection.pick(App.model.id, App.model.likes) },
    )
    const refused = await Effect.runPromise(
      Effect.flip(SSR.render(config, schemaless, { buildId: 'b' })),
    )
    expect(refused).toMatchObject({ _tag: 'ResumeUnsafe', reason: 'UnencodableBinding' })
  })
})

describe('a member that does not leave what its event fills', () => {
  it('is refused where it is written, and at runtime says why', async () => {
    const miswritten = {
      ...config,
      view: (_model: Model, h: HtmlBuilder<Message>) => {
        const rh = Resume.builder(h)
        return {
          title: 'Post',
          body: rh.input([
            // @ts-expect-error: Renamed leaves id and title, and an input fills one field
            rh.OnInput(Message.Renamed),
          ]),
        }
      },
    }
    await expect(Effect.runPromise(SSR.render(miswritten, plan, { buildId: 'b' }))).rejects.toThrow(
      'OnInput(Renamed) leaves id, title for the event to fill; it must leave one string field',
    )
  })
})
