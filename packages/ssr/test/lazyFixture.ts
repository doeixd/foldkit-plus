/**
 * A page with a lazy bundle placed in it: Phase F's application. A factory,
 * because a lazy bundle loads once, and a test needs one instance the server
 * has loaded and one the browser has not.
 */
import { Option, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Submodel from 'foldkit/submodel'
import { Bundle, Link } from 'foldkit-bundle'
import { Projection, Surface } from 'foldkit-surface'
import { Resume, SSR, type Start } from 'foldkit-ssr'

export const ClickerModel = Schema.Struct({
  count: Schema.Number,
  pressed: Schema.Number,
  text: Schema.String,
})
export type ClickerModel = typeof ClickerModel.Type
const Modifiers = Schema.Struct({
  shiftKey: Schema.Boolean,
  ctrlKey: Schema.Boolean,
  altKey: Schema.Boolean,
  metaKey: Schema.Boolean,
})
export const ClickerMessage = defineMessageUnion({
  Clicked: {},
  Pressed: { by: Schema.Number },
  Typed: { value: Schema.String },
  Keyed: { key: Schema.String, modifiers: Modifiers },
})
export type ClickerMessage = typeof ClickerMessage.Type

/** The bodies, as a chunk would export them; the view marks its bindings. */
export const body: Bundle.Body<ClickerModel, ClickerMessage, void, never, never, void> = {
  update: (model, message) =>
    ClickerMessage.match(message, {
      Clicked: () => ({ model: { ...model, count: model.count + 1 } }),
      Pressed: ({ by }) => ({ model: { ...model, pressed: model.pressed + by } }),
      Typed: ({ value }) => ({ model: { ...model, text: value } }),
      Keyed: ({ key }) => ({ model: { ...model, count: model.count + key.length } }),
    }),
  view: Submodel.defineView<ClickerModel, ClickerMessage>((model, h) => {
    const rh = Resume.builder(h)
    return rh.div(
      [rh.Id('clicker')],
      [
        rh.button([rh.Id('count'), rh.OnClick(ClickerMessage.Clicked())], [String(model.count)]),
        // A closure: only the live page can answer it.
        rh.button(
          [rh.Id('press'), rh.OnPointerDown(() => Option.some(ClickerMessage.Pressed({ by: 2 })))],
          [String(model.pressed)],
        ),
        // A named key press inside a handler no marker can name: the live page
        // answers both, so the event must come back to the inner input.
        rh.div(
          [
            rh.Id('panel'),
            rh.OnKeyDownPreventDefault(() => Option.some(ClickerMessage.Pressed({ by: 5 }))),
          ],
          [rh.input([rh.Id('keys'), rh.OnKeyDown(ClickerMessage.Keyed)])],
        ),
        // A hole, filled from the event inside the placement's wrapper.
        rh.input([rh.Id('text'), rh.Value(model.text), rh.OnInput(ClickerMessage.Typed)]),
        rh.p([rh.Id('echo')], [model.text]),
        // Inside the placement: with a fallback, it posts the parent's Message.
        rh.form(
          [rh.Id('rename'), rh.OnSubmit(ClickerMessage.Typed({ value: model.text }))],
          [rh.input([rh.Name('value'), rh.Value(model.text)])],
        ),
      ],
    )
  }),
}

const GotClickerMessage = Link.wrapper('GotClickerMessage', ClickerMessage)
export const Model = Schema.Struct({ title: Schema.String, clicker: ClickerModel })
export type Model = typeof Model.Type
export const Message = defineMessageUnion({ ...GotClickerMessage.cases, Titled: {} })
export type Message = typeof Message.Type

/** A load the test releases, so what happens before it resolves is observable. */
export const deferred = () => {
  let release: () => void = () => {}
  let calls = 0
  const load = () =>
    new Promise<typeof body>(resolve => {
      calls++
      release = () => resolve(body)
    })
  return { load, release: () => release(), calls: () => calls }
}

export const make = (load: () => Promise<typeof body>) => {
  const Clicker = Bundle.lazy(
    {
      name: 'Clicker',
      Model: ClickerModel,
      Message: ClickerMessage,
      init: () => ({ model: { count: 0, pressed: 0, text: '' } }),
    },
    load,
  )
  const Placed = Clicker.at(Link.field<Model>()('clicker', GotClickerMessage))
  const placements = Bundle.assemble<Model, Message>()([Placed])
  const clicker: ClickerModel = { count: 0, pressed: 0, text: '' }
  const initial: Model = { title: '', clicker }
  const App = Surface.application({ Model, Message, initial, update: model => ({ model }) })
  const Page = App.surface('Page', {
    model: ({ model }) => ({ title: model.title, clicker: model.clicker }),
    messages: [Message.GotClickerMessage, Message.Titled],
  })
  const config = {
    Model,
    init: () => placements.init({ title: 'Lazy', clicker }),
    update: placements.update((model: Model, message: Message) =>
      message._tag === 'Titled' ? { model: { ...model, title: 'Titled' } } : { model },
    ),
    view: (model: Model, h: HtmlBuilder<Message>) => {
      const rh = Resume.builder(h)
      return {
        title: model.title,
        body: rh.main(
          [],
          [
            Placed.view(model, rh),
            // After the placement: its binding is the application's own Message again.
            rh.button([rh.Id('title'), rh.OnClick(Message.Titled())], [model.title]),
          ],
        ),
      }
    },
    container: null,
    subscriptions: placements.subscriptions(),
    lazy: [Clicker],
  }
  const plan = (start: Start = 'now', fallback?: 'server') =>
    SSR.plan(App, {
      id: 'lazy',
      state: Projection.pick(App.model.title, App.model.clicker),
      surfaces: [Surface.at(Page, undefined)],
      start,
      ...(fallback === undefined ? {} : { fallback }),
    })
  return { Clicker, config, plan }
}

export const template =
  '<!doctype html><html><head><title></title></head><body><div id="root"></div></body></html>'

export const load = (page: string) => {
  const parsed = new DOMParser().parseFromString(page, 'text/html')
  document.documentElement.innerHTML = parsed.documentElement.innerHTML
}

export const byId = (id: string): HTMLElement => {
  const element = document.getElementById(id)
  if (element === null) throw new Error(`the page has no #${id}`)
  return element
}

export const settle = (ms = 20) => new Promise(resolve => setTimeout(resolve, ms))
