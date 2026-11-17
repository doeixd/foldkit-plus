import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Message, Model, assembly, initial, update } from './app.js'
import { FileGrid } from './view.js'

export const mountGrid = (container: HTMLElement) =>
  Runtime.embed(
    Runtime.makeElement(
      assembly.complete({
        Model,
        container,
        init: initial,
        update,
        view: (model: Model, h: HtmlBuilder<Message>) => FileGrid(model, h),
        subscriptions: assembly.subscriptions(),
      }),
    ),
  )
