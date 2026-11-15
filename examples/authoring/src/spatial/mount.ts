import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Message, Model, assembly, initial, update } from './app.js'
import { SelectableBoard } from './view.js'

export const mountSpatial = (container: HTMLElement) =>
  Runtime.embed(
    Runtime.makeElement(
      assembly.complete({
        Model,
        container,
        init: initial,
        update,
        view: (model: Model, h: HtmlBuilder<Message>) => SelectableBoard(model, h),
        subscriptions: assembly.subscriptions(),
      }),
    ),
  )
