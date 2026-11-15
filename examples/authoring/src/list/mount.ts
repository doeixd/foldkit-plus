import * as Runtime from 'foldkit/runtime'
import type { HtmlBuilder } from 'foldkit/html'
import { Motion } from 'foldkit-primitives/motion'
import { Message, Model, initial, placements, update, type Item } from './app.js'
import { EditableList } from './view.js'

export const mountList = (
  container: HTMLElement,
  options: { readonly id?: string; readonly items?: ReadonlyArray<Item> } = {},
) =>
  Runtime.embed(
    Runtime.makeElement(
      placements.complete({
        Model,
        container,
        init: () => initial(options),
        update,
        view: (model: Model, h: HtmlBuilder<Message>) => EditableList(model, h),
        subscriptions: placements.subscriptions(),
        // Without the service a Presence exits over its full duration whatever the person asked for.
        resources: Motion.live,
      }),
    ),
  )
