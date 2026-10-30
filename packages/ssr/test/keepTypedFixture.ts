/**
 * A search page whose fields keep what is typed before the runtime starts:
 * a search box beside a clear button that only a non-empty query draws, a
 * textarea, a select, and one field that does not opt in. `update` records
 * every Message it is given, so a test can count them.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Projection, Surface } from 'foldkit-surface'
import { Resume, SSR, type Start } from 'foldkit-ssr'

export const Model = Schema.Struct({
  query: Schema.String,
  note: Schema.String,
  size: Schema.String,
  title: Schema.String,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ChangedQuery: { value: Schema.String },
  ChangedNote: { value: Schema.String },
  ChangedSize: { value: Schema.String },
  ChangedTitle: { value: Schema.String },
  Cleared: {},
})
export type Message = typeof Message.Type

export const initial: Model = { query: '', note: '', size: 'm', title: '' }
export const App = Surface.application({ Model, Message, initial, update: model => ({ model }) })

const Search = App.surface('Search', {
  model: ({ model }) => model,
  messages: [
    Message.ChangedQuery,
    Message.ChangedNote,
    Message.ChangedSize,
    Message.ChangedTitle,
    Message.Cleared,
  ],
})

/** Every Message `update` was given, in order. */
export const seen: Array<Message> = []

export const config = {
  Model,
  init: () => ({ model: { query: 'at', note: 'first', size: 'm', title: 'Draft' } }),
  update: (model: Model, message: Message) => {
    seen.push(message)
    return Message.match(message, {
      ChangedQuery: ({ value }) => ({ model: { ...model, query: value } }),
      ChangedNote: ({ value }) => ({ model: { ...model, note: value } }),
      ChangedSize: ({ value }) => ({ model: { ...model, size: value } }),
      ChangedTitle: ({ value }) => ({ model: { ...model, title: value } }),
      Cleared: () => ({ model: { ...model, query: '' } }),
    })
  },
  view: (model: Model, h: HtmlBuilder<Message>) => {
    const rh = Resume.builder(h)
    return {
      title: 'Search',
      body: rh.main(
        [],
        [
          rh.div(
            [],
            [
              rh.input([
                rh.Id('query'),
                rh.Value(model.query),
                rh.OnInput(Message.ChangedQuery),
                rh.KeepTyped(),
              ]),
              // Drawn only for a query: a page whose first render followed the
              // typed value would differ from the served one here.
              ...(model.query === ''
                ? []
                : [rh.button([rh.Id('clear'), rh.OnClick(Message.Cleared())], ['Clear'])]),
            ],
          ),
          rh.p([rh.Id('echo')], [model.query]),
          rh.textarea([
            rh.Id('note'),
            rh.Value(model.note),
            rh.OnInput(Message.ChangedNote),
            rh.KeepTyped(),
          ]),
          rh.select(
            [rh.Id('size'), rh.Value(model.size), rh.OnChange(Message.ChangedSize), rh.KeepTyped()],
            [
              rh.option([rh.Value('s')], ['Small']),
              rh.option([rh.Value('m')], ['Medium']),
              rh.option([rh.Value('l')], ['Large']),
            ],
          ),
          rh.p([rh.Id('summary')], [`${model.note}/${model.size}`]),
          // Not kept: hydration re-asserts what the server rendered.
          rh.input([rh.Id('title'), rh.Value(model.title), rh.OnInput(Message.ChangedTitle)]),
        ],
      ),
    }
  },
  container: null,
}

export const plan = (start: Start = 'now') =>
  SSR.plan(App, {
    id: 'search',
    state: Projection.pick(App.model.query, App.model.note, App.model.size, App.model.title),
    surfaces: [Surface.at(Search, undefined)],
    start,
  })

export const template =
  '<!doctype html><html><head><title></title></head><body><div id="root"></div></body></html>'

export const load = (page: string) => {
  const parsed = new DOMParser().parseFromString(page, 'text/html')
  document.documentElement.innerHTML = parsed.documentElement.innerHTML
}

export const field = <E extends HTMLElement>(id: string, kind: new () => E): E => {
  const element = document.getElementById(id)
  if (!(element instanceof kind)) throw new Error(`#${id} is not a ${kind.name}`)
  return element
}

/** Types into a field as the browser does with no script listening: the value and the caret. */
export const typeInto = (
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
  caret: number = value.length,
) => {
  element.focus()
  element.value = value
  element.setSelectionRange(caret, caret)
}

export const settle = (ms = 20) => new Promise(resolve => setTimeout(resolve, ms))
