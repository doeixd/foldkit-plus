import * as Runtime from 'foldkit/runtime'
import { Model, Message, initialOf, update } from './app.js'
import { SearchField } from './view.js'

/** One search field in `container`, whose elements' ids all start with `id`. */
export const mountSearch = (
  container: HTMLElement,
  id: string,
  view: typeof SearchField = SearchField,
) =>
  Runtime.embed(
    Runtime.makeElement({
      Model,
      init: () => initialOf(id),
      update,
      view: (model, h) => view(model, h),
      container,
    }),
  )

export { Message }
