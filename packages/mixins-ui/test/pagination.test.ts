// @vitest-environment jsdom
/**
 * Pagination: the window as a pure function, the landmark with its stops and
 * ends, choosing a stop on the real runtime, and a recipe reading
 * `aria-current` off the DOM.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { PaginationSlots, itemsOf, view } from '../src/pagination.js'
import { Recipes } from '../src/index.js'

const h = SlotView.inertBuilder<Message>()

const Model = Schema.Struct({ page: Schema.Number })
type Model = typeof Model.Type
const Message = defineMessageUnion({ Go: { page: Schema.Number } })
type Message = typeof Message.Type

const update = (model: Model, message: Message): { readonly model: Model } => {
  switch (message._tag) {
    case 'Go':
      return message.page === model.page ? { model } : { model: { ...model, page: message.page } }
  }
}

const draw = (model: Model) => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  const container = document.createElement('div')
  container.id = 'pagination-harness'
  document.body.appendChild(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model }),
      update,
      view: (state: Model, live: HtmlBuilder<Message>) =>
        live.div(
          [],
          [
            view(
              {
                page: state.page,
                pageCount: 10,
                onPage: page => Message.Go({ page }),
                style: Style.forSlots(PaginationSlots)(Recipes.Pagination({})),
              },
              live,
            ),
            live.p([], [`on ${state.page}`]),
          ],
        ),
    }),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('itemsOf', () => {
  it('lists every stop while they fit', () => {
    expect(itemsOf(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('collapses runs around the edges and the current stop', () => {
    expect(itemsOf(1, 20)).toEqual([1, 2, 'ellipsis', 20])
    expect(itemsOf(10, 20)).toEqual([1, 'ellipsis', 9, 10, 11, 'ellipsis', 20])
    expect(itemsOf(20, 20)).toEqual([1, 'ellipsis', 19, 20])
  })

  it('clamps a page outside the run', () => {
    expect(itemsOf(0, 20)[0]).toBe(1)
    expect(itemsOf(99, 20).at(-1)).toBe(20)
  })
})

describe('Pagination view', () => {
  const drawn = (page: number, pageCount: number) =>
    view({ page, pageCount, onPage: page => ({ _tag: 'Go', page }) }, h)

  it('lands in a named landmark with its stops', () => {
    const nav = drawn(5, 10)
    expect(Inert.byTag(nav, 'nav')).toHaveLength(1)
    expect(Inert.value(Inert.byTag(nav, 'nav')[0], 'aria-label')).toBe('Pagination')
    expect(Inert.byTag(nav, 'button').map(button => Inert.text(button))).toEqual([
      'Previous',
      '1',
      '4',
      '5',
      '6',
      '10',
      'Next',
    ])
    expect(Inert.byTag(nav, 'span').map(ellipsis => Inert.text(ellipsis))).toEqual(['…', '…'])
  })

  it('marks the current stop and ends the run at its edges', () => {
    const nav = drawn(1, 3)
    const buttons = Inert.byTag(nav, 'button')
    expect(buttons.map(button => Inert.text(button))).toEqual(['Previous', '1', '2', '3', 'Next'])
    expect(Inert.value(buttons[1], 'aria-current')).toBe('page')
    expect(Inert.value(buttons[0], 'disabled')).toBe(true)
    expect(Inert.value(buttons[4], 'disabled')).toBe(false)
  })

  it('draws nothing for a single page or none', () => {
    expect(drawn(1, 1)).toBe(h.empty)
    expect(drawn(1, 0)).toBe(h.empty)
  })
})

describe('Pagination recipe', () => {
  it('tints the current stop from the DOM alone', () => {
    const sheet = Style.forSlots(PaginationSlots)(Recipes.Pagination({})).css
    expect(sheet).toMatch(/\[aria-current="page"\]\{[^}]*background:var\(--fk-accent-subtle\)/)
    expect(sheet).toContain('display:inline-flex')
  })
})

describe('Pagination on the runtime', () => {
  it('choosing a stop moves the page', async () => {
    draw({ page: 5 })
    await vi.waitFor(() => expect(document.body.textContent).toContain('on 5'))
    const six = [...document.querySelectorAll('button')].find(button => button.textContent === '6')
    if (six === undefined) throw new Error('no stop 6')
    six.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await vi.waitFor(() => expect(document.body.textContent).toContain('on 6'))
  })
})
