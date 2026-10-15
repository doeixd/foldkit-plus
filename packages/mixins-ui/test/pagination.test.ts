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
import { PaginationSlots, itemsOf, summaryOf, view } from '../src/pagination.js'
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

  it('draws a run of one page rather than an ellipsis in its place', () => {
    expect(itemsOf(4, 20)).toEqual([1, 2, 3, 4, 5, 'ellipsis', 20])
    expect(itemsOf(17, 20)).toEqual([1, 'ellipsis', 16, 17, 18, 19, 20])
  })

  it('widens the window by siblings and boundaries', () => {
    expect(itemsOf(10, 20, { siblings: 2 })).toEqual([
      1,
      'ellipsis',
      8,
      9,
      10,
      11,
      12,
      'ellipsis',
      20,
    ])
    expect(itemsOf(10, 20, { boundaries: 2 })).toEqual([
      1,
      2,
      'ellipsis',
      9,
      10,
      11,
      'ellipsis',
      19,
      20,
    ])
    expect(itemsOf(10, 20, { siblings: 0 })).toEqual([1, 'ellipsis', 10, 'ellipsis', 20])
  })

  it('lists every stop while they fit the wider window', () => {
    expect(itemsOf(5, 9, { siblings: 2 })).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(itemsOf(5, 10, { siblings: 2 })).toEqual([1, 2, 3, 4, 5, 6, 7, 'ellipsis', 10])
  })
})

describe('summaryOf', () => {
  it('says the rows a page shows, the last page short', () => {
    expect(summaryOf(1, { total: 97, perPage: 10 })).toBe('1–10 of 97')
    expect(summaryOf(10, { total: 97, perPage: 10 })).toBe('91–97 of 97')
  })

  it('takes the words from the application', () => {
    expect(
      summaryOf(2, {
        total: 97,
        perPage: 10,
        text: (from, to, total) => `${from} to ${to} of ${total} orders`,
      }),
    ).toBe('11 to 20 of 97 orders')
  })
})

describe('Pagination view', () => {
  const drawn = (page: number, pageCount: number) =>
    view<Message>({ page, pageCount, onPage: page => Message.Go({ page }) }, h)

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

  const labelsOf = (nav: ReturnType<typeof drawn>) =>
    Inert.byTag(nav, 'button').map(
      button => Inert.value(button, 'aria-label') ?? Inert.text(button),
    )

  it('simple, draws previous and next alone', () => {
    const nav = view<Message>(
      { page: 5, pageCount: 10, onPage: page => Message.Go({ page }), numbered: false },
      h,
    )
    expect(labelsOf(nav)).toEqual(['Previous page', 'Next page'])
    expect(Inert.byTag(nav, 'span')).toEqual([])
  })

  it('draws first and last around the rest, each disabled at its own end', () => {
    const asked: Array<number> = []
    const nav = view<Message>(
      {
        page: 1,
        pageCount: 3,
        onPage: page => {
          asked.push(page)
          return Message.Go({ page })
        },
        ends: true,
      },
      h,
    )
    const buttons = Inert.byTag(nav, 'button')
    expect(labelsOf(nav)).toEqual([
      'First page',
      'Previous page',
      '1',
      '2',
      '3',
      'Next page',
      'Last page',
    ])
    expect(Inert.value(buttons[0], 'disabled')).toBe(true)
    expect(Inert.value(buttons.at(-1), 'disabled')).toBe(false)
    expect(asked.at(-1)).toBe(3)
  })

  it('says the rows shown before the stops', () => {
    const nav = view<Message>(
      {
        page: 2,
        pageCount: 10,
        onPage: page => Message.Go({ page }),
        range: { total: 97, perPage: 10 },
      },
      h,
    )
    const [summary] = Inert.children(Inert.byTag(nav, 'nav')[0])
    expect(Inert.text(summary)).toBe('11–20 of 97')
  })

  it('passes the window on to the stops', () => {
    const nav = view<Message>(
      { page: 10, pageCount: 20, onPage: page => Message.Go({ page }), siblings: 2 },
      h,
    )
    expect(Inert.byTag(nav, 'button').map(button => Inert.text(button))).toContain('12')
  })
})

describe('Pagination recipe', () => {
  const css = (selection: Parameters<typeof Recipes.Pagination>[0]) =>
    Style.forSlots(PaginationSlots)(Recipes.Pagination(selection)).css

  it('tints the current stop from the DOM alone', () => {
    const sheet = css({})
    expect(sheet).toMatch(/\[aria-current="page"\]\{[^}]*background:var\(--fk-accent-subtle\)/)
    expect(sheet).toContain('display:inline-flex')
  })

  it('compacts to the current stop on a narrow window by default, or always, or never', () => {
    const narrowOnly =
      /@media \(max-width: 30rem\)\{[^{}]*:not\(\[aria-current="page"\]\)\{display:none/
    expect(css({})).toMatch(narrowOnly)
    expect(css({ compact: 'never' })).not.toContain('display:none')
    const always = css({ compact: 'always' })
    expect(always).not.toContain('@media (max-width: 30rem)')
    expect(always).toMatch(/:not\(\[aria-current="page"\]\)\{display:none/)
  })
})

describe('Pagination on the runtime', () => {
  it('choosing a stop moves the page', async () => {
    draw({ page: 5 })
    await vi.waitFor(() => expect(document.body.textContent).toContain('on 5'))
    const six = Array.from(document.querySelectorAll('button')).find(
      button => button.textContent === '6',
    )
    if (six === undefined) throw new Error('no stop 6')
    six.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await vi.waitFor(() => expect(document.body.textContent).toContain('on 6'))
  })
})
