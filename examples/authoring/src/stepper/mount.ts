import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Message, Model, assembly, initial, update } from './app.js'
import { NumberStepper } from './view.js'

export const mountStepper = (container: HTMLElement) =>
  Runtime.embed(
    Runtime.makeElement(
      assembly.complete({
        Model,
        container,
        init: initial,
        update,
        view: (model: Model, h: HtmlBuilder<Message>) => NumberStepper(model, h),
        subscriptions: assembly.subscriptions(),
      }),
    ),
  )
