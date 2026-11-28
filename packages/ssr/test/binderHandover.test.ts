// @vitest-environment jsdom
/**
 * Phase 6, Bout 6.7: Binder -> `SSR.hydrate` hand-over.
 *
 * Proves that when the binder answers a declared press before the runtime loads,
 * then wakes the runtime on an unanswerable press, `SSR.hydrate` starts from
 * the binder's updated Model (not the stale envelope), replays the queued
 * Message exactly once, and keeps the served DOM intact.
 */
import { Effect, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Projection, Surface } from 'foldkit-surface'
import { Path, Transition } from '@doeixd/metakit'
import { describe, expect, it, vi } from 'vitest'
import { SSR } from 'foldkit-ssr'
import { ANCHOR_ATTRIBUTE, Binder, Binding } from '../src/binder.js'
import { load, settle, template } from './handoverFixture.js'

const Model = Schema.Struct({ count: Schema.Int, serverNote: Schema.String })
type Model = typeof Model.Type

const Message = defineMessageUnion({
  Increment: { by: Schema.Int },
  SaveNote: { note: Schema.String },
})
type Message = typeof Message.Type

const Increment = Transition.make({
  state: Model,
  input: Schema.Struct({ by: Schema.Int }),
  when: () => true,
  apply: ({ state, input }) => [Transition.add(state.count, input.by)],
})

const SaveNote = Transition.make({
  state: Model,
  input: Schema.Struct({ note: Schema.String }),
  when: () => true,
  apply: ({ state, input }) => [Transition.set(state.serverNote, input.note)],
})

const bindings = Binding.define<Model>({
  count: Binding.text(Path.from(Model).count),
})

const App = Surface.application({
  Model,
  Message,
  initial: { count: 0, serverNote: '' },
  update: (model: Model) => ({ model }),
})

describe('Binder -> SSR.hydrate hand-over (Phase 6, Bout 6.7)', () => {
  it('starts SSR.hydrate from the binder Model and replays queued Messages once', async () => {
    let initCalls = 0
    const saveCalls: Array<string> = []

    const config = {
      Model,
      init: () => {
        initCalls += 1
        return { model: { count: 10, serverNote: '' } }
      },
      update: (model: Model, msg: Message) =>
        Message.match(msg, {
          Increment: ({ by }) => ({ model: { ...model, count: model.count + by } }),
          SaveNote: ({ note }) => {
            saveCalls.push(note)
            return { model: { ...model, serverNote: note } }
          },
        }),
      view: (model: Model, h: HtmlBuilder<Message>) => ({
        title: 'Binder Handover',
        body: h.div(
          [],
          [
            h.span([h.Id('count'), bindings.attr(h, 'count')], [String(model.count)]),
            h.span([h.Id('note')], [model.serverNote]),
            h.button(
              [
                h.Id('inc'),
                h.DataAttribute('fk-msg', 'Increment'),
                h.DataAttribute('fk-payload', '{"by":3}'),
                h.OnClick(Message.Increment({ by: 3 })),
              ],
              ['+3'],
            ),
            h.button(
              [
                h.Id('save'),
                h.DataAttribute('fk-msg', 'SaveNote'),
                h.DataAttribute('fk-payload', '{"note":"hello"}'),
                h.OnClick(Message.SaveNote({ note: 'hello' })),
              ],
              ['Save'],
            ),
          ],
        ),
      }),
      container: null,
    }

    const plan = SSR.plan(App, {
      id: 'binder-handover',
      state: Projection.pick(App.model.count, App.model.serverNote),
    })

    const served = SSR.page(
      template,
      await Effect.runPromise(SSR.render(config, plan, { buildId: 'b67' })),
    )
    expect(initCalls).toBe(1)
    load(served)

    let hydrated = false
    const wake = vi.fn(async () => {
      hydrated = true
      SSR.hydrate(config, plan, { buildId: 'b67' })
    })

    const handle = Binder.start({
      manifest: {
        bindings,
        transitions: {
          Increment: {
            tag: 'Increment',
            schema: Schema.Struct({ by: Schema.Int }),
            transition: Increment,
          },
          SaveNote: {
            tag: 'SaveNote',
            schema: Schema.Struct({ note: Schema.String }),
            transition: SaveNote,
          },
        },
      },
      envelope: { model: { count: 10, serverNote: '' } },
      wake,
    })

    // 1. Local press before runtime loads: count becomes 13, anchor updates, wake not called.
    document.getElementById('inc')!.click()
    expect(handle.model().count).toBe(13)
    expect(document.querySelector(`[${ANCHOR_ATTRIBUTE}="count"]`)!.textContent).toBe('13')
    expect(wake).not.toHaveBeenCalled()

    // 2. Unanswerable press (serverNote is unbound): wakes runtime and queues SaveNote once.
    document.getElementById('save')!.click()
    expect(wake).toHaveBeenCalledTimes(1)
    expect(hydrated).toBe(true)

    await settle()
    await vi.waitFor(() => expect(document.getElementById('note')!.textContent).toBe('hello'))

    // Runtime started from binder's count=13 (NOT stale 10!), init never re-ran, SaveNote ran once.
    expect(initCalls).toBe(1)
    expect(document.getElementById('count')!.textContent).toBe('13')
    expect(saveCalls).toEqual(['hello'])

    // 3. Subsequent live press after hand-over runs through Foldkit normally: 13 -> 16.
    document.getElementById('inc')!.click()
    await vi.waitFor(() => expect(document.getElementById('count')!.textContent).toBe('16'))
    expect(saveCalls).toEqual(['hello'])
  })
})
