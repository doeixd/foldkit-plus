/**
 * The application G4's benchmarks render, and the timing both run on a loaded
 * page: a keyed list whose rows each carry three bindings (a click, an input
 * with a hole, a focus). Shared by `manifest.ts` (jsdom) and
 * `manifestBrowser.ts` (Chromium), so both measure the same page the same way.
 */
import { Result, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Projection, Surface } from 'foldkit-surface'
import { Resume, SSR } from 'foldkit-ssr'

const Row = Schema.Struct({ id: Schema.String, title: Schema.String, done: Schema.Boolean })
const Model = Schema.Struct({ rows: Schema.Array(Row) })
type Model = typeof Model.Type

const Message = defineMessageUnion({
  Toggled: { id: Schema.String },
  Renamed: { id: Schema.String, title: Schema.String },
  Focused: { id: Schema.String },
})
type Message = typeof Message.Type

const initial: Model = { rows: [] }
const App = Surface.application({ Model, Message, initial, update: model => ({ model }) })
const List = App.surface('List', {
  model: ({ model }) => ({ rows: model.rows }),
  messages: [Message.Toggled, Message.Renamed, Message.Focused],
})

export const configFor = (count: number) => ({
  Model,
  init: () => ({
    model: {
      rows: Array.from({ length: count }, (_, index) => ({
        id: `row-${index}`,
        title: `Row ${index}`,
        done: index % 3 === 0,
      })),
    },
  }),
  update: (model: Model) => ({ model }),
  view: (model: Model, h: HtmlBuilder<Message>) => {
    const rh = Resume.builder(h)
    return {
      title: 'Manifest',
      body: rh.ul(
        [rh.Id('rows')],
        model.rows.map(row =>
          rh.keyed('li')(
            row.id,
            [rh.OnClick(Message.Toggled({ id: row.id }))],
            [
              rh.input([
                rh.Value(row.title),
                rh.OnInput(Message.Renamed, { id: row.id }),
                rh.OnFocus(Message.Focused({ id: row.id })),
              ]),
              row.done ? 'done' : 'open',
            ],
          ),
        ),
      ),
    }
  },
  container: null,
})

export const plan = SSR.plan(App, {
  id: 'manifest',
  state: Projection.pick(App.model.rows),
  surfaces: [Surface.at(List, undefined)],
  start: 'on-interaction',
})

export const template =
  '<!doctype html><html><head><title></title></head><body><div id="root"></div></body></html>'

/**
 * The time `Resume.bindings` and `Resume.listen` take on the page loaded in
 * `document`, as `SSR.hydrate` calls them: the envelope lists the events, so
 * `listen` scans nothing for them.
 */
export const timeOnPage = (
  document: Document,
): { readonly decode: number; readonly listen: number } => {
  const root = document.querySelector('[data-foldkit-app]')!
  const model = SSR.resume(plan, document)
  if (Result.isFailure(model)) throw new Error(model.failure.message)
  const events = (
    JSON.parse(document.querySelector('script[data-foldkit-plus-resume]')!.textContent!) as {
      readonly events: ReadonlyArray<string>
    }
  ).events
  const started = performance.now()
  const bindings = Resume.bindings(plan, document, root, model.success)
  const decoded = performance.now()
  if (Result.isFailure(bindings)) throw new Error(bindings.failure.message)
  const stop = Resume.listen(root, { bindings: bindings.success, events, onAnswer: () => {} })
  const listened = performance.now()
  stop()
  return { decode: decoded - started, listen: listened - decoded }
}

/** The median, of the runs after the first two, which warm the JIT. */
export const median = (values: ReadonlyArray<number>): number => {
  const sorted = values.slice(2).sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]!
}
