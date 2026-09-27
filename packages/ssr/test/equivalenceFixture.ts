/**
 * The application Phase G2 runs twice. Every Message appends to `log`, so two
 * runs reach the same Model only if the same Messages arrived in the same
 * order, once each: a Message answered twice, lost, or reordered shows.
 */
import { Option, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Projection, Surface } from 'foldkit-surface'
import { Resume, SSR, type Start } from 'foldkit-ssr'

export const Model = Schema.Struct({ log: Schema.Array(Schema.String), text: Schema.String })
export type Model = typeof Model.Type

const Modifiers = Schema.Struct({
  shiftKey: Schema.Boolean,
  ctrlKey: Schema.Boolean,
  altKey: Schema.Boolean,
  metaKey: Schema.Boolean,
})

export const Message = defineMessageUnion({
  Clicked: { id: Schema.String },
  Typed: { value: Schema.String },
  Pressed: { key: Schema.String, modifiers: Modifiers },
  Submitted: { title: Schema.String },
  Focused: { id: Schema.String },
  Blurred: { id: Schema.String },
  Pointed: {},
})
export type Message = typeof Message.Type

export const initial: Model = { log: [], text: '' }
export const App = Surface.application({ Model, Message, initial, update: model => ({ model }) })

const Page = App.surface('Page', {
  model: ({ model }) => ({ log: model.log, text: model.text }),
  messages: [
    Message.Clicked,
    Message.Typed,
    Message.Pressed,
    Message.Submitted,
    Message.Focused,
    Message.Blurred,
    Message.Pointed,
  ],
})

const logged = (model: Model, entry: string, change: Partial<Model> = {}) => ({
  model: { ...model, ...change, log: [...model.log, entry] },
})

const flags = ({ shiftKey, ctrlKey, altKey, metaKey }: typeof Modifiers.Type) =>
  [shiftKey && 'shift', ctrlKey && 'ctrl', altKey && 'alt', metaKey && 'meta']
    .filter(Boolean)
    .join('+')

export const config = {
  Model,
  init: () => ({ model: initial }),
  update: (model: Model, message: Message) =>
    Message.match(message, {
      Clicked: ({ id }) => logged(model, `click ${id}`),
      Typed: ({ value }) => logged(model, `type ${value}`, { text: value }),
      Pressed: ({ key, modifiers }) => logged(model, `key ${key} ${flags(modifiers)}`),
      Submitted: ({ title }) => logged(model, `submit ${title}`),
      Focused: ({ id }) => logged(model, `focus ${id}`),
      Blurred: ({ id }) => logged(model, `blur ${id}`),
      Pointed: () => logged(model, 'point'),
    }),
  view: (model: Model, h: HtmlBuilder<Message>) => {
    const rh = Resume.builder(h)
    return {
      title: 'Equivalence',
      body: rh.main(
        [],
        [
          rh.div(
            [rh.Id('outer'), rh.OnClick(Message.Clicked({ id: 'outer' }))],
            [
              // Bubbles to #outer: one click, two Messages, in that order.
              rh.button([rh.Id('bubble'), rh.OnClick(Message.Clicked({ id: 'bubble' }))], []),
              // Stops at itself: #outer never hears it.
              rh.button(
                [
                  rh.Id('inner'),
                  rh.OnClick(Message.Clicked({ id: 'inner' }), { propagation: 'Stop' }),
                ],
                [],
              ),
            ],
          ),
          rh.input([
            rh.Id('text'),
            rh.Value(model.text),
            rh.OnInput(Message.Typed),
            rh.OnFocus(Message.Focused({ id: 'text' })),
            rh.OnBlur(Message.Blurred({ id: 'text' })),
          ]),
          rh.div([rh.Id('keys'), rh.Tabindex(0), rh.OnKeyDown(Message.Pressed)], []),
          rh.form(
            [rh.Id('form'), rh.OnSubmit(Message.Submitted({ title: model.text }))],
            [rh.input([rh.Name('title'), rh.Value(model.text)])],
          ),
          // A function: the page cannot name it, so only the live page answers.
          rh.button([rh.Id('point'), rh.OnPointerDown(() => Option.some(Message.Pointed()))], []),
        ],
      ),
    }
  },
  container: null,
}

export const plan = (start: Start = 'on-interaction') =>
  SSR.plan(App, {
    id: 'equivalence',
    state: Projection.pick(App.model.log, App.model.text),
    surfaces: [Surface.at(Page, undefined)],
    start,
  })
