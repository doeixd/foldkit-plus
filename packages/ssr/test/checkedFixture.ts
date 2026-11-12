/**
 * A page of things a person ticks or presses before the runtime runs: a kept
 * checkbox and a kept pair of radios, a button, a form, and a paragraph no
 * binding marks. `update` records every Message, so a test can count them.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Projection, Surface } from 'foldkit-surface'
import { Resume, SSR, type Start } from 'foldkit-ssr'

export const Model = Schema.Struct({
  agreed: Schema.Boolean,
  size: Schema.String,
  presses: Schema.Number,
  sent: Schema.Number,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  Toggled: {},
  Picked: { value: Schema.String },
  Pressed: {},
  Sent: {},
})
export type Message = typeof Message.Type

export const initial: Model = { agreed: false, size: 's', presses: 0, sent: 0 }
export const App = Surface.application({ Model, Message, initial, update: model => ({ model }) })

const Page = App.surface('Page', {
  model: ({ model }) => model,
  messages: [Message.Toggled, Message.Picked, Message.Pressed, Message.Sent],
})

/** Every Message `update` was given, in order. */
export const seen: Array<Message> = []

export const config = {
  Model,
  init: () => ({ model: initial }),
  update: (model: Model, message: Message) => {
    seen.push(message)
    return Message.match(message, {
      Toggled: () => ({ model: { ...model, agreed: !model.agreed } }),
      Picked: ({ value }) => ({ model: { ...model, size: value } }),
      Pressed: () => ({ model: { ...model, presses: model.presses + 1 } }),
      Sent: () => ({ model: { ...model, sent: model.sent + 1 } }),
    })
  },
  view: (model: Model, h: HtmlBuilder<Message>) => {
    const rh = Resume.builder(h)
    const radio = (value: string) =>
      rh.input([
        rh.Id(`size-${value}`),
        rh.Type('radio'),
        rh.Name('size'),
        rh.Value(value),
        rh.Checked(model.size === value),
        rh.OnChange(Message.Picked),
        rh.KeepTyped(),
      ])
    return {
      title: 'Ticks',
      body: rh.main(
        [],
        [
          rh.input([
            rh.Id('agree'),
            rh.Type('checkbox'),
            rh.Checked(model.agreed),
            rh.OnClick(Message.Toggled()),
            rh.KeepTyped(),
          ]),
          radio('s'),
          radio('l'),
          rh.button([rh.Id('press'), rh.OnClick(Message.Pressed())], [String(model.presses)]),
          rh.form(
            [rh.Id('send'), rh.OnSubmit(Message.Sent())],
            [rh.button([rh.Id('submit'), rh.Type('submit')], [String(model.sent)])],
          ),
          rh.p([rh.Id('plain')], [`${model.agreed}/${model.size}`]),
        ],
      ),
    }
  },
  container: null,
}

export const plan = (start: Start = 'now') =>
  SSR.plan(App, {
    id: 'ticks',
    state: Projection.pick(App.model.agreed, App.model.size, App.model.presses, App.model.sent),
    surfaces: [Surface.at(Page, undefined)],
    start,
  })

export const template =
  '<!doctype html><html><head><title></title></head><body><div id="root"></div></body></html>'

export const load = (page: string) => {
  const parsed = new DOMParser().parseFromString(page, 'text/html')
  document.documentElement.innerHTML = parsed.documentElement.innerHTML
}

export const field = <T extends HTMLElement>(id: string, kind: new () => T): T => {
  const element = document.getElementById(id)
  if (!(element instanceof kind)) throw new Error(`#${id} is not a ${kind.name}`)
  return element
}
