import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Message, Model, assembly, initialOf, update } from './app.js'
import { ChoicePopup } from './view.js'

/** One popup in `container`, whose elements' ids all start with `id`. */
export const mountPopup = (container: HTMLElement, id: string) =>
  Runtime.embed(
    Runtime.makeElement(
      assembly.complete({
        Model,
        container,
        init: () => initialOf(id),
        update,
        view: (model: Model, h: HtmlBuilder<Message>) => ChoicePopup(model, h),
        subscriptions: assembly.subscriptions(),
      }),
    ),
  )
