import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Message, Model, initial, update } from './app.js'
import { MovableBox } from './view.js'

export const mountBox = (container: HTMLElement) =>
  Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: initial,
      update,
      view: (model: Model, h: HtmlBuilder<Message>) => MovableBox(model, h),
    }),
  )
