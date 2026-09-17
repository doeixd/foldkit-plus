// @vitest-environment jsdom
/**
 * Foldkit DevTools time travel with a React island: jumping to a past Model
 * re-renders the same React root with past props, island events while paused
 * do not reach the live Model, and resuming restores the live props.
 */
import { Effect, Schema } from 'effect'
import { __setDevToolsOverlay } from 'foldkit/devtools-host'
import { defineMessageUnion } from 'foldkit/message'
import { createElement, useEffect, useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { ReactComponent } from '../src/index.js'
import { click, mount, settle, text } from './foldkit.js'

afterEach(() => __setDevToolsOverlay(undefined))

// The recording store the overlay receives; Foldkit does not export its type publicly.
type DevToolsStore = Parameters<NonNullable<Parameters<typeof __setDevToolsOverlay>[0]>>[0]

const Model = Schema.Struct({ label: Schema.String, picks: Schema.Number })
type Model = typeof Model.Type
const Message = defineMessageUnion({ Relabeled: {}, Picked: {} })
type Message = typeof Message.Type

let mounts = 0

const Picker = ({ label, onPick }: { readonly label: string; readonly onPick?: () => void }) => {
  const [local, setLocal] = useState(0)
  useEffect(() => {
    mounts++
  }, [])
  return createElement(
    'div',
    null,
    createElement('span', { className: 'label' }, label),
    createElement(
      'button',
      { className: 'local', onClick: () => setLocal(n => n + 1) },
      String(local),
    ),
    createElement('button', { className: 'pick', onClick: () => onPick?.() }, 'pick'),
  )
}
const ReactPicker = ReactComponent.define(Picker, { events: ['onPick'] })

it('replays past props into the same React root and drops island events while paused', async () => {
  let store: DevToolsStore | undefined
  __setDevToolsOverlay(captured => Effect.sync(() => void (store = captured)))

  const handle = mount<Model, Message>({
    Model,
    init: { label: 'v0', picks: 0 },
    update: (model, message) =>
      message._tag === 'Relabeled'
        ? { ...model, label: `v${Number(model.label.slice(1)) + 1}` }
        : { ...model, picks: model.picks + 1 },
    view: (model, h) =>
      h.div(
        [],
        [
          h.button([h.Class('relabel'), h.OnClick(Message.Relabeled())], []),
          h.p([h.Class('picks')], [String(model.picks)]),
          ReactPicker.view(
            { props: { label: model.label }, messages: { onPick: () => Message.Picked() } },
            h,
          ),
        ],
      ),
    devTools: { show: 'Always', mode: 'TimeTravel' },
  })
  try {
    await vi.waitFor(() => expect(text('.label')).toBe('v0'))
    expect(store).toBeDefined()
    click('.local')
    click('.relabel')
    await vi.waitFor(() => expect(text('.label')).toBe('v1'))
    click('.relabel')
    await vi.waitFor(() => expect(text('.label')).toBe('v2'))

    // Entry 0 is the Model after the first Relabeled.
    await Effect.runPromise(store!.jumpTo(0))
    await vi.waitFor(() => expect(text('.label')).toBe('v1'))
    expect(text('.local')).toBe('1')
    expect(mounts).toBe(1)

    click('.pick')
    await settle()
    expect(text('.picks')).toBe('0')

    await Effect.runPromise(store!.resume)
    await vi.waitFor(() => expect(text('.label')).toBe('v2'))
    expect(text('.local')).toBe('1')
    expect(mounts).toBe(1)
    expect(text('.picks')).toBe('0')

    click('.pick')
    await vi.waitFor(() => expect(text('.picks')).toBe('1'))
  } finally {
    handle.dispose()
  }
})
