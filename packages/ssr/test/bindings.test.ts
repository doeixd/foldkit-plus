/**
 * Phase A: the server's markup names each binding. Every element with a
 * Message-valued handler, or a Message with a hole, carries an ordinal, and
 * the envelope carries the encoded Message under it; a closure carries none.
 * A binding whose Message the browser's Model would build differently is
 * refused, like a view that reads a field the plan does not send.
 */
import { Effect, Option, Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { Projection, Surface } from 'foldkit-surface'
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
    expect(tag('plain')).toContain(`${BINDING_ATTRIBUTE}click="4"`)
    // A keyed element is marked like any other.
    expect(tag('item')).toContain(`${BINDING_ATTRIBUTE}click="5"`)
    // A closure is not data: the page marks that it does something it cannot name.
    expect(tag('closure')).toContain(`${BINDING_ATTRIBUTE}input="*"`)
  })

  it('writes each binding into the envelope, as the Message Schema encodes it', async () => {
    const { envelope } = await rendered()
    expect(bindingsOf(envelope)).toEqual([
      {
        attribute: 'OnClick',
        message: { _tag: 'Liked', id: 'p1' },
        options: { propagation: 'Stop' },
      },
      { attribute: 'OnInput', message: { _tag: 'ChangedSearch', value: '' }, hole: ['value'] },
      {
        attribute: 'OnChange',
        message: { _tag: 'Renamed', id: 'p1', title: '' },
        hole: ['title'],
      },
      {
        attribute: 'OnKeyDown',
        message: {
          _tag: 'Pressed',
          key: '',
          modifiers: { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false },
        },
        hole: ['key', 'modifiers'],
      },
      { attribute: 'OnClick', message: { _tag: 'Liked', id: 'p1' } },
      { attribute: 'OnClick', message: { _tag: 'Liked', id: 'p1' } },
    ])
    for (const binding of bindingsOf(envelope)) {
      expect(() => Schema.decodeUnknownSync(Message)(binding.message)).not.toThrow()
    }
  })

  it('refuses a binding whose Message reads a field the plan does not send', async () => {
    // A Surface that reads no `id`, so the plan covers it and only the binding is at fault.
    const Blind = App.surface('Blind', {
      model: ({ model }) => ({ likes: model.likes }),
      messages: [Message.Liked, Message.ChangedSearch, Message.Renamed, Message.Pressed],
    })
    const unsent = SSR.plan(App, {
      id: 'post',
      state: Projection.pick(App.model.likes, App.model.search, App.model.pressed),
      surfaces: [Surface.at(Blind, undefined)],
    })
    const refused = await Effect.runPromise(
      Effect.flip(SSR.render(config, unsent, { buildId: 'b' })),
    )
    expect(refused).toMatchObject({ _tag: 'ResumeUnsafe', reason: 'ViewDependsOnUnsentState' })
    expect(refused.message).toContain(
      'the view differs in its click binding on button#like, change binding on input#title, click binding on button#plain, click binding on button#item when rendered',
    )
  })

  it('refuses bindings a plan without the Message Schema cannot encode', async () => {
    const schemaless = SSR.plan(
      { initial },
      {
        id: 'post',
        state: plan.state,
        surfaces: plan.surfaces,
      },
    )
    const refused = await Effect.runPromise(
      Effect.flip(SSR.render(config, schemaless, { buildId: 'b' })),
    )
    expect(refused).toMatchObject({ _tag: 'ResumeUnsafe', reason: 'UnencodableBinding' })
  })
})

describe('several handlers of one event', () => {
  const renderBody = (body: (model: Model, h: HtmlBuilder<Message>) => Html) =>
    Effect.runPromise(
      SSR.render(
        {
          ...config,
          view: (model: Model, h: HtmlBuilder<Message>) => ({
            title: 'Post',
            body: body(model, h),
          }),
        },
        plan,
        { buildId: 'b' },
      ),
    )

  it('marks every binding of the event, in the order Foldkit chains them', async () => {
    const { rendered: page, envelope } = await renderBody((model, h) => {
      const rh = Resume.builder(h)
      return rh.button(
        [rh.OnClick(Message.Liked({ id: model.id })), rh.OnClick(Message.Counted({ count: 1 }))],
        [],
      )
    })
    expect(page.html).toContain(`${BINDING_ATTRIBUTE}click="0 1"`)
    expect(
      bindingsOf(envelope).map((binding: { message: { _tag: string } }) => binding.message._tag),
    ).toEqual(['Liked', 'Counted'])
  })

  it("records each binding's Foldkit attribute, which says what its handler does beside dispatching", async () => {
    const { envelope } = await renderBody((model, h) => {
      const rh = Resume.builder(h)
      // OnSubmit also prevents the default action; OnBlur ignores devtools focus.
      return rh.form(
        [rh.OnSubmit(Message.Liked({ id: model.id }))],
        [rh.input([rh.OnBlur(Message.Counted({ count: 0 }))])],
      )
    })
    // A child's element is built before its parent's, so the input comes first.
    expect(bindingsOf(envelope).map((binding: { attribute: string }) => binding.attribute)).toEqual(
      ['OnBlur', 'OnSubmit'],
    )
  })

  it('marks a handler it cannot name beside those it can, so nothing does less before boot', async () => {
    const { rendered: page } = await renderBody((_model, h) => {
      const rh = Resume.builder(h)
      return rh.div(
        [rh.OnKeyDown(Message.Pressed), rh.OnKeyDownPreventDefault(() => Option.none())],
        [],
      )
    })
    expect(page.html).toContain(`${BINDING_ATTRIBUTE}keydown="0 *"`)
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
