import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Message, Model, assembly, initial, update } from './app.js'
import { SortableListbox } from './view.js'

export const mountSortable = (container: HTMLElement) =>
  Runtime.embed(
    Runtime.makeElement(
      assembly.complete({
        Model,
        container,
        init: initial,
        update,
        view: (model: Model, h: HtmlBuilder<Message>) => SortableListbox(model, h),
        subscriptions: assembly.subscriptions(),
      }),
    ),
  )
