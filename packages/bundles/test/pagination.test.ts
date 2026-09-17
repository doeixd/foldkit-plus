/**
 * Pagination: clamping at the edges, totals arriving late, per-page changes,
 * derived pageCount/offset, and placement through a real assembly.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { describe, expect, it } from 'vitest'
import { offset, pageCount, Pagination, PaginationMessage } from '../src/state/index.js'

const Pages = Bundle.declare(Pagination, 'pages')
const Model = Schema.Struct({ ...Pages.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Pages.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })

const at = (model: Model, message: Parameters<typeof Pages.wrapper.make>[0]) => {
  const placed = Page.at(Pages, { args: { perPage: 10 } })
  return Option.getOrThrow(placed.update(model, Pages.wrapper.make(message))).model.pages
}

const loaded: Model = { pages: { page: 1, perPage: 10, total: 95 } }

describe('Pagination placement', () => {
  it('rejects a non-positive or non-finite page size', () => {
    expect(() => Page.at(Pages, { args: { perPage: 0 } })).toThrow(/args do not match/)
    expect(() => Page.at(Pages, { args: { perPage: Number.POSITIVE_INFINITY } })).toThrow(
      /args do not match/,
    )
  })
})

describe('Pagination transitions', () => {
  it('starts on page one with the given size', () => {
    const placed = Page.at(Pages, { args: { perPage: 10 } })
    expect(placed.init({ pages: { page: 4, perPage: 25, total: 100 } }).model.pages).toEqual({
      page: 1,
      perPage: 10,
      total: null,
    })
  })

  it('moves within range and clamps past the ends', () => {
    expect(at(loaded, PaginationMessage.NextPage()).page).toBe(2)
    expect(at(loaded, PaginationMessage.PrevPage()).page).toBe(1)
    expect(at(loaded, PaginationMessage.GoToPage({ page: 10 })).page).toBe(10)
    expect(at(loaded, PaginationMessage.GoToPage({ page: 11 })).page).toBe(10)
    expect(at(loaded, PaginationMessage.GoToPage({ page: 0 })).page).toBe(1)
    const last: Model = { pages: { page: 10, perPage: 10, total: 95 } }
    expect(at(last, PaginationMessage.NextPage()).page).toBe(10)
  })

  it('moves freely while the total is unknown', () => {
    const unknown: Model = { pages: { page: 1, perPage: 10, total: null } }
    expect(at(unknown, PaginationMessage.GoToPage({ page: 40 })).page).toBe(40)
  })

  it('treats a fractional page as page one', () => {
    expect(at(loaded, PaginationMessage.GoToPage({ page: 2.5 })).page).toBe(1)
  })

  it('a smaller total pulls the page back; a new size keeps the page when it fits', () => {
    expect(at(loaded, PaginationMessage.SetTotal({ total: 5 }))).toEqual({
      page: 1,
      perPage: 10,
      total: 5,
    })
    expect(at(loaded, PaginationMessage.SetPerPage({ perPage: 25 }))).toEqual({
      page: 1,
      perPage: 25,
      total: 95,
    })
    expect(at(loaded, PaginationMessage.SetPerPage({ perPage: 0 }))).toEqual(loaded.pages)
    const far: Model = { pages: { page: 9, perPage: 10, total: 95 } }
    expect(at(far, PaginationMessage.SetPerPage({ perPage: 100 })).page).toBe(1)
  })

  it('derives pageCount and offset', () => {
    expect(pageCount(loaded.pages)).toBe(10)
    expect(pageCount({ page: 1, perPage: 10, total: null })).toBeNull()
    expect(pageCount({ page: 1, perPage: 10, total: 0 })).toBe(1)
    expect(offset({ page: 3, perPage: 10, total: 95 })).toBe(20)
  })

  it('ignores a negative total', () => {
    expect(at(loaded, PaginationMessage.SetTotal({ total: -5 }))).toEqual(loaded.pages)
  })
})

describe('Pagination in an assembly', () => {
  it('routes its Messages and carries init', () => {
    const assembly = Page.assemble(Page.at(Pages, { args: { perPage: 10 } }))
    const update = assembly.update(model => ({ model }))
    const moved = update(
      { pages: { page: 1, perPage: 10, total: 95 } },
      Pages.wrapper.make(PaginationMessage.NextPage()),
    )
    expect(moved.model.pages.page).toBe(2)
    expect(Object.keys(assembly.subscriptions())).toEqual([])
  })
})
