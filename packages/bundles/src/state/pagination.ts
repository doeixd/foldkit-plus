/**
 * Pagination as a bundle: the page, page size, and total live in the Model,
 * so page changes replay and every transition clamps into range. Pure logic,
 * no streams: data loading stays the application's job.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'

export const PaginationModel = Schema.Struct({
  page: Schema.Number,
  perPage: Schema.Number,
  total: Schema.NullOr(Schema.Number),
})
export type PaginationModel = typeof PaginationModel.Type

export const PaginationMessage = defineMessageUnion({
  GoToPage: { page: Schema.Number },
  NextPage: {},
  PrevPage: {},
  SetPerPage: { perPage: Schema.Number },
  SetTotal: { total: Schema.NullOr(Schema.Number) },
})
export type PaginationMessage = typeof PaginationMessage.Type

const clampPage = (page: number, perPage: number, total: number | null): number => {
  if (!Number.isInteger(page)) return 1
  if (page < 1) return 1
  if (total === null) return page
  return Math.min(page, Math.max(1, Math.ceil(total / perPage)))
}

/** The number of pages, or null while the total is unknown. */
export const pageCount = (model: PaginationModel): number | null =>
  model.total === null ? null : Math.max(1, Math.ceil(model.total / model.perPage))

/** The offset of the first item on the page, for a slice or a query. */
export const offset = (model: PaginationModel): number => (model.page - 1) * model.perPage

export const Pagination = Bundle.make('Pagination', {
  Model: PaginationModel,
  Message: PaginationMessage,
  args: Schema.Struct({
    perPage: Schema.Number.pipe(Schema.check(Schema.isGreaterThan(0))),
    total: Schema.optional(Schema.NullOr(Schema.Number)),
  }),
  init: args => ({
    model: { page: 1, perPage: args.perPage, total: args.total ?? null },
  }),
  update: (model, message) =>
    PaginationMessage.match(message, {
      GoToPage: ({ page }) => ({
        model: { ...model, page: clampPage(page, model.perPage, model.total) },
      }),
      NextPage: () => ({
        model: { ...model, page: clampPage(model.page + 1, model.perPage, model.total) },
      }),
      PrevPage: () => ({
        model: { ...model, page: clampPage(model.page - 1, model.perPage, model.total) },
      }),
      SetPerPage: ({ perPage }) =>
        perPage > 0
          ? { model: { ...model, perPage, page: clampPage(model.page, perPage, model.total) } }
          : { model },
      SetTotal: ({ total }) => ({
        model: { ...model, total, page: clampPage(model.page, model.perPage, total) },
      }),
    }),
})
