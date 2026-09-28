import { Calendar } from 'foldkit'
import type { Html } from 'foldkit/html'
import { type SceneStep, given, scene, tap } from 'foldkit/scene'
import { Slots, SlotView } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'

import { type AppRoute, type Message, type Model, update, view } from '../src/main.js'
import { uiInit } from '../src/ui/init.js'

export const today = Calendar.make(2026, 4, 16)

export const uiModel = uiInit(today).model

export const modelForRoute = (route: AppRoute): Model => ({ route, uiModel })

/**
 * The whole page, drawn by Scene inside `Inert.draw`. `Inert.draw` alone
 * cannot draw `h.submodel`, which needs a runtime frame, and every component
 * page is one; Scene supplies the frame, and drawing it inside `Inert.draw`
 * keeps the Slot marks `Inert.unslotted` reads.
 */
type Drawing = Readonly<{
  model: Model
  steps: ReadonlyArray<SceneStep<Model, Message, undefined>>
}>

const ThroughScene = SlotView.forMessages<Message>().define(
  Slots.define({}),
  ({ model, steps }: Drawing) => {
    let html: Html = null
    scene(
      { update, view },
      given(model),
      ...steps,
      tap(simulation => {
        html = simulation.html
      }),
    )
    return html
  },
)

export const drawn = (model: Model, ...steps: Drawing['steps']): Html =>
  Inert.draw(ThroughScene, { model, steps })
