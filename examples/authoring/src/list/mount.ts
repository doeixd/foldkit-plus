import * as Runtime from 'foldkit/runtime'
import type { HtmlBuilder } from 'foldkit/html'
import { Message, Model, initial, placements, update } from './app.js'
import { EditableList } from './view.js'

export const mountList = (container: HTMLElement) =>
  Runtime.embed(
    Runtime.makeElement(
      placements.complete({
        Model,
        container,
        init: initial,
        update,
        view: (model: Model, h: HtmlBuilder<Message>) => EditableList(model, h),
        subscriptions: placements.subscriptions(),
      }),
    ),
  )
