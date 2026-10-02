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

type Drawing = Readonly<{
  model: Model
  steps: ReadonlyArray<SceneStep<Model, Message, undefined>>
}>

const ThroughScene = SlotView.forMessages<Message>().define(
  Slots.define({}),
  ({ model, steps }: Drawing, _slots, h) => {
    if (steps.length === 0) return view(model, h).body
    // Only interaction steps need a second Scene; Inert.draw supplies the render frame.
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
