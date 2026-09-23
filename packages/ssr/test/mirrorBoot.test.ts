// @vitest-environment jsdom
/**
 * Phase 2: an application assembled with `foldkit-bundle` whose `Mirror.kv`
 * restores what the user saved. The restore is a startup Command, so the plan
 * names the assembly's startup Commands in `boot`, and the browser restores
 * after taking the page over.
 */
import { Effect, Schema } from 'effect'
import { KeyValueStore } from 'effect/unstable/persistence'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { Mirror } from 'foldkit-mirror'
import { Projection, Surface } from 'foldkit-surface'
import { expect, it, vi } from 'vitest'
import { SSR } from 'foldkit-ssr'
import { load, template } from './handoverFixture.js'

const Model = Schema.Struct({ draft: Schema.String })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Mirror.messages })
type Message = typeof Message.Type
const initial: Model = { draft: '' }
const App = Surface.application({ Model, Message, initial, update: model => ({ model }) })
const Prefs = Mirror.kv(App, { key: 'prefs', fields: [App.model.draft] })
const assembly = Bundle.parent({ Model, Message }).assemble(Prefs.wiring())

// Node's own `localStorage` shadows jsdom's, so the store is a Map behind Storage.
const saved = new Map<string, string>()
const storage = {
  get length() {
    return saved.size
  },
  key: (index: number) => [...saved.keys()][index] ?? null,
  getItem: (key: string) => saved.get(key) ?? null,
  setItem: (key: string, value: string) => void saved.set(key, value),
  removeItem: (key: string) => void saved.delete(key),
  clear: () => saved.clear(),
} satisfies Storage

const config = {
  Model,
  init: () => assembly.initial(initial),
  update: assembly.update(),
  subscriptions: assembly.subscriptions(),
  resources: KeyValueStore.layerStorage(() => storage),
  view: (model: Model, h: HtmlBuilder<Message>) => ({
    title: 'Draft',
    body: h.p([h.Id('draft')], [model.draft]),
  }),
  container: null,
}

it('refuses to render until the plan names the restore', async () => {
  const unbooted = SSR.plan(App, { id: 'draft', state: Projection.pick(App.model.draft) })
  const refused = await Effect.runPromise(
    Effect.flip(SSR.render(config, unbooted, { buildId: 'b' })),
  )
  expect(refused.message).toContain(Prefs.restore.name)
})

it('restores what was saved through boot', async () => {
  const plan = SSR.plan(App, {
    id: 'draft',
    state: Projection.pick(App.model.draft),
    boot: model => assembly.init(model).commands ?? [],
  })
  load(SSR.page(template, await Effect.runPromise(SSR.render(config, plan, { buildId: 'b' }))))
  saved.set('prefs', JSON.stringify({ version: 1, keys: { draft: 'Saved' } }))
  const draft = document.getElementById('draft')
  expect(draft?.textContent).toBe('')

  SSR.hydrate(config, plan, { buildId: 'b' })
  // The restore runs once the storage layer is built, after the first settle.
  await vi.waitFor(() => expect(draft?.textContent).toBe('Saved'))
  expect(document.getElementById('draft')).toBe(draft)
})
