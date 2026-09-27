/**
 * Phase G4: the manifest's size and cost before anything is done about it.
 *
 * A keyed list of 10, 100 and 1,000 rows, three bindings each (a click, an
 * input with a hole, a focus), rendered against a plan. For each size it
 * prints the page's bytes, the envelope's, and the bindings' alone, raw and
 * gzipped, and the time `Resume.bindings` and `Resume.listen` take on the page
 * under jsdom (median of several runs, after a warm-up).
 *
 * The resumable design asks for action only if, at a thousand rows, the
 * gzipped bindings exceed a tenth of the gzipped page, or decoding and
 * listening together take more than one frame (16 ms).
 *
 * Run: pnpm bench:manifest
 */
import { gzipSync } from 'node:zlib'
import { Effect, Result, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { JSDOM } from 'jsdom'
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

const configFor = (count: number) => ({
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

const plan = SSR.plan(App, {
  id: 'manifest',
  state: Projection.pick(App.model.rows),
  surfaces: [Surface.at(List, undefined)],
  start: 'on-interaction',
})

const template =
  '<!doctype html><html><head><title></title></head><body><div id="root"></div></body></html>'

const bytes = (text: string) => Buffer.byteLength(text, 'utf8')
const gzipped = (text: string) => gzipSync(text).byteLength

const median = (values: ReadonlyArray<number>): number => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]!
}

/** The page loaded into a fresh jsdom, with the globals `Resume.listen` reads. */
const loaded = (page: string) => {
  const dom = new JSDOM(page)
  const globals = globalThis as unknown as Record<string, unknown>
  for (const name of ['document', 'Element', 'HTMLElement', 'Event', 'KeyboardEvent']) {
    globals[name] = dom.window[name as keyof typeof dom.window]
  }
  return dom
}

const measure = async (count: number) => {
  const result = await Effect.runPromise(SSR.render(configFor(count), plan, { buildId: 'bench' }))
  const page = SSR.page(template, result)
  const manifest = JSON.stringify(
    JSON.parse(result.envelope.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '')).bindings,
  )

  const decode: Array<number> = []
  const listen: Array<number> = []
  for (let run = 0; run < 12; run++) {
    const dom = loaded(page)
    const document = dom.window.document
    const root = document.querySelector('[data-foldkit-app]')!
    const model = SSR.resume(plan, document)
    if (Result.isFailure(model)) throw new Error(model.failure.message)
    const startDecode = performance.now()
    const bindings = Resume.bindings(plan, document, root, model.success)
    const decoded = performance.now()
    if (Result.isFailure(bindings)) throw new Error(bindings.failure.message)
    const stop = Resume.listen(root, { bindings: bindings.success, onAnswer: () => {} })
    const listened = performance.now()
    stop()
    dom.window.close()
    // The first two runs warm the JIT and are not counted.
    if (run < 2) continue
    decode.push(decoded - startDecode)
    listen.push(listened - decoded)
  }

  return {
    rows: count,
    bindings: count * 3,
    page: bytes(page),
    pageGz: gzipped(page),
    envelope: bytes(result.envelope),
    envelopeGz: gzipped(result.envelope),
    manifest: bytes(manifest),
    manifestGz: gzipped(manifest),
    decodeMs: median(decode),
    listenMs: median(listen),
  }
}

const kb = (value: number) => `${(value / 1024).toFixed(1)} KB`

const main = async () => {
  const rows: Array<Awaited<ReturnType<typeof measure>>> = []
  for (const count of [10, 100, 1_000]) rows.push(await measure(count))
  console.log(
    '| rows | bindings | page (gz) | envelope (gz) | bindings (gz) | bindings / page, gz | decode | listen |',
  )
  console.log('| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |')
  for (const row of rows) {
    console.log(
      `| ${row.rows} | ${row.bindings} | ${kb(row.page)} (${kb(row.pageGz)}) | ${kb(row.envelope)} (${kb(row.envelopeGz)}) | ${kb(row.manifest)} (${kb(row.manifestGz)}) | ${((row.manifestGz / row.pageGz) * 100).toFixed(1)}% | ${row.decodeMs.toFixed(2)} ms | ${row.listenMs.toFixed(2)} ms |`,
    )
  }
}

void main()
