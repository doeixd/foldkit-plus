// @vitest-environment jsdom
/**
 * Phase B: a served page answers events from its markers before any runtime
 * boots. Each binding dispatches the Message its handler would, in the order
 * Foldkit chains them, with a hole filled from the event and OnClick's options
 * honoured; a handler the page could not name stops the walk and is reported;
 * and a page whose markers or entries do not add up is refused whole.
 */
import { Effect } from 'effect'
import { FOLDKIT_APP_ATTRIBUTE } from 'foldkit/experimental/server'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { Result } from 'effect'
import { describe, expect, it } from 'vitest'
import { Resume, SSR } from 'foldkit-ssr'
import { Message, config, load, plan, template, type Model } from './bindingsFixture.js'

/** The element the server rendered with this id. */
const byId = (id: string): HTMLElement => {
  const element = document.getElementById(id)
  if (element === null) throw new Error(`the page has no #${id}`)
  return element
}

/** Serves a page, loads it, and listens at its root, collecting what is dispatched. */
const served = async (
  view: (model: Model, h: HtmlBuilder<Message>) => Html = (model, h) => config.view(model, h).body,
) => {
  const page = {
    ...config,
    view: (model: Model, h: HtmlBuilder<Message>) => ({ title: 'Post', body: view(model, h) }),
  }
  load(SSR.page(template, await Effect.runPromise(SSR.render(page, plan, { buildId: 'b' }))))
  const root = document.querySelector(`[${FOLDKIT_APP_ATTRIBUTE}]`)
  if (root === null) throw new Error('the page has no application root')
  const model = Result.getOrThrow(SSR.resume(plan, document))
  const bindings = Result.getOrThrow(Resume.bindings(plan, document, root, model))
  const messages: Array<unknown> = []
  const unnamed: Array<Element> = []
  const stop = Resume.listen(root, {
    bindings,
    onAnswer: answer => {
      messages.push(...answer.messages)
      if (answer.unnamed !== undefined) unnamed.push(answer.unnamed)
    },
  })
  return { root, bindings, messages, unnamed, stop }
}

describe('Resume.listen answers from the markers', () => {
  it('dispatches a click as the Message its binding names', async () => {
    const { messages } = await served()
    byId('like').click()
    expect(messages).toEqual([Message.Liked({ id: 'p1' })])
  })

  it('fills a hole from the event, as the closure would have', async () => {
    const { messages } = await served()
    const search = byId('search')
    if (!(search instanceof HTMLInputElement)) throw new Error('#search is not an input')
    search.value = 'atlas'
    search.dispatchEvent(new Event('input', { bubbles: true }))
    const title = byId('title')
    if (!(title instanceof HTMLInputElement)) throw new Error('#title is not an input')
    title.value = 'Renamed'
    title.dispatchEvent(new Event('change', { bubbles: true }))
    byId('keys').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }),
    )
    expect(messages).toEqual([
      Message.ChangedSearch({ value: 'atlas' }),
      Message.Renamed({ id: 'p1', title: 'Renamed' }),
      Message.Pressed({
        key: 'Enter',
        modifiers: { shiftKey: true, ctrlKey: false, altKey: false, metaKey: false },
      }),
    ])
  })

  it('reports a handler the page could not name, and dispatches nothing for it', async () => {
    const { messages, unnamed } = await served()
    const closure = byId('closure')
    closure.dispatchEvent(new Event('input', { bubbles: true }))
    expect(messages).toEqual([])
    expect(unnamed).toEqual([closure])
  })

  it('dispatches every binding of an event in order, and stops where OnClick says', async () => {
    const { messages } = await served((model, h) => {
      const rh = Resume.builder(h)
      return rh.div(
        [rh.Id('outer'), rh.OnClick(Message.Counted({ count: 3 }))],
        [
          rh.button(
            [
              rh.Id('inner'),
              rh.OnClick(Message.Liked({ id: model.id }), { propagation: 'Stop' }),
              rh.OnClick(Message.Counted({ count: 1 })),
            ],
            [],
          ),
        ],
      )
    })
    byId('inner').click()
    // Foldkit runs both of the button's handlers; Stop keeps the click from the div.
    expect(messages).toEqual([Message.Liked({ id: 'p1' }), Message.Counted({ count: 1 })])
  })

  it('prevents the default of a submit, as OnSubmit does', async () => {
    const { messages } = await served((model, h) => {
      const rh = Resume.builder(h)
      return rh.form([rh.Id('form'), rh.OnSubmit(Message.Liked({ id: model.id }))], [])
    })
    const event = new Event('submit', { bubbles: true, cancelable: true })
    byId('form').dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(messages).toEqual([Message.Liked({ id: 'p1' })])
  })

  it('stops at a handler it could not name, so a parent is not answered alone', async () => {
    const { messages, unnamed } = await served((_model, h) => {
      const rh = Resume.builder(h)
      return rh.div(
        [rh.Id('outer'), rh.OnInput(Message.ChangedSearch)],
        [rh.input([rh.Id('inner'), rh.OnInput(value => Message.ChangedSearch({ value }))])],
      )
    })
    const inner = byId('inner')
    inner.dispatchEvent(new Event('input', { bubbles: true }))
    expect(unnamed).toEqual([inner])
    expect(messages).toEqual([])
  })

  it('catches an event that does not bubble', async () => {
    const { messages } = await served((model, h) => {
      const rh = Resume.builder(h)
      return rh.input([rh.Id('field'), rh.OnFocus(Message.Liked({ id: model.id }))])
    })
    byId('field').dispatchEvent(new FocusEvent('focus'))
    expect(messages).toEqual([Message.Liked({ id: 'p1' })])
  })

  it('answers an event that does not bubble at its target alone, as Foldkit does', async () => {
    const { messages } = await served((model, h) => {
      const rh = Resume.builder(h)
      return rh.div(
        [rh.Id('panel'), rh.Tabindex(0), rh.OnFocus(Message.Liked({ id: 'panel' }))],
        [rh.input([rh.Id('field'), rh.OnFocus(Message.Liked({ id: model.id }))])],
      )
    })
    byId('field').dispatchEvent(new FocusEvent('focus'))
    expect(messages).toEqual([Message.Liked({ id: 'p1' })])
  })

  it("fills a hole from any target's string value, as Foldkit reads one", async () => {
    const { messages } = await served((_model, h) => {
      const rh = Resume.builder(h)
      return rh.div([rh.Id('box'), rh.OnInput(Message.ChangedSearch)], ['shown text'])
    })
    const box = byId('box')
    Object.defineProperty(box, 'value', { value: 'held value' })
    box.dispatchEvent(new Event('input', { bubbles: true }))
    expect(messages).toEqual([Message.ChangedSearch({ value: 'held value' })])
  })

  it('stops listening when told to', async () => {
    const { messages, stop } = await served()
    stop()
    byId('like').click()
    expect(messages).toEqual([])
  })
})

describe('Resume.bindings refuses a page that does not add up', () => {
  /** Replaces the page's bindings with what `edit` makes of them, then reads the page. */
  const refusal = (
    edit: (bindings: ReadonlyArray<Readonly<Record<string, unknown>>>) => unknown,
  ) => {
    const script = document.querySelector('script[data-foldkit-plus-resume]')
    if (script === null) throw new Error('no envelope')
    const body = JSON.parse(script.textContent ?? '')
    body.bindings = edit(body.bindings)
    script.textContent = JSON.stringify(body)
    const root = document.querySelector(`[${FOLDKIT_APP_ATTRIBUTE}]`)
    if (root === null) throw new Error('no root')
    const model = Result.getOrThrow(SSR.resume(plan, document))
    const refused = Resume.bindings(plan, document, root, model)
    if (!Result.isFailure(refused)) throw new Error('the page was not refused')
    return refused.failure
  }

  it('when a marker names a binding the page does not carry', async () => {
    await served()
    byId('like').setAttribute('data-foldkit-plus-on-click', '99')
    expect(refusal(bindings => bindings)).toMatchObject({
      reason: 'Invalid',
      message: 'the marker data-foldkit-plus-on-click="99" names no binding the page carries',
    })
  })

  it("when an entry is not one of the application's Messages", async () => {
    await served()
    const elsewhere = refusal(([first, ...rest]) => [
      { ...first, message: { _tag: 'Elsewhere' } },
      ...rest,
    ])
    expect(elsewhere.message).toContain('binding 0 does not decode as a Message')
  })

  it('when an entry names no event attribute', async () => {
    await served()
    const nothing = refusal(([first, ...rest]) => [{ ...first, attribute: 'OnNothing' }, ...rest])
    expect(nothing.message).toBe('binding 0 is for "OnNothing", which is no event attribute')
  })

  // A tampered list is refused like any other page, never thrown on.
  it.each([
    ['not a list', () => 'bindings'],
    ['an entry that is not a binding', () => [null]],
    [
      'a depth that is not a count',
      (bindings: ReadonlyArray<Readonly<Record<string, unknown>>>) =>
        bindings.map(binding => ({ ...binding, depth: -1 })),
    ],
  ])('when the list is malformed: %s', async (_name, edit) => {
    await served()
    expect(refusal(edit)).toMatchObject({ reason: 'Invalid' })
    expect(refusal(edit).message).toContain("the page's bindings are malformed")
  })
})
