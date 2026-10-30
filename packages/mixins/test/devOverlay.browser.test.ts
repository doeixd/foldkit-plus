/**
 * The development overlay on a real runtime: a diagnostic reported through
 * the application's resources and a composed Mount's failure, which Foldkit
 * runs outside those resources (#237), both listed; Clear empties the panel.
 */
import { Effect, Schema, Stream } from 'effect'
import { Diagnostics, type Diagnostic } from 'foldkit-surface'
import * as Command from 'foldkit/command'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import type { MountAction } from 'foldkit/mount'
import * as Runtime from 'foldkit/runtime'
import { afterEach, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { DevOverlay, Resolver } from '../src/index.js'

const Message = defineMessageUnion({
  ClickedBreak: {},
  CompletedReport: {},
})
type Message = typeof Message.Type
const Model = Schema.Struct({ broken: Schema.Boolean })
type Model = typeof Model.Type

const probe: Diagnostic = {
  _tag: 'Probe',
  source: 'foldkit-test',
  level: 'warning',
  message: 'reported through the resources',
}

// A Command runs with the resources, and builds them, so the overlay's claim
// on Mount failures is in place before anything breaks.
const Report = Command.define('Test.Report', {
  messages: [Message.CompletedReport],
  execute: Effect.as(Diagnostics.report(probe), Message.CompletedReport()),
})

const reportProbe: Command.Command<Message> = Report()

const failing: MountAction<Message, Error> = {
  name: 'Failing',
  f: () => Stream.fail(new Error('the chart would not draw')),
}
const idle: MountAction<Message> = { name: 'Idle', f: () => Stream.never }
/** Two Mounts on one slot, so the resolver composes them and reports the one that fails. */
const broken = Resolver.resolve<Message>([], [{ mounts: [failing] }, { mounts: [idle] }], {
  slot: 'chart',
})

let dispose = () => {}
afterEach(() => {
  dispose()
  document.body.replaceChildren()
})

const start = () => {
  const overlay = DevOverlay.make({ next: forwarded.report })
  const container = document.createElement('div')
  container.id = 'app'
  document.body.append(container)
  dispose = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      resources: Diagnostics.layer(overlay.report),
      init: () => ({ model: { broken: false }, commands: [reportProbe] }),
      update: (model: Model, message: Message) =>
        Message.match(message, {
          ClickedBreak: () => ({ model: { broken: true } }),
          CompletedReport: () => ({ model }),
        }),
      view: (model: Model, h: HtmlBuilder<Message>) =>
        h.main(
          [],
          [
            h.div([h.Id('overlay'), h.OnMount(overlay.mount)], []),
            h.button([h.Type('button'), h.OnClick(Message.ClickedBreak())], ['Break']),
            ...(model.broken ? [h.div(broken, [])] : []),
          ],
        ),
    }),
  ).dispose
}

let forwarded = Diagnostics.collect()

const shadow = () => document.getElementById('overlay')?.shadowRoot
const section = () => shadow()?.querySelector('section')
const items = () =>
  Array.from(shadow()?.querySelectorAll('li strong') ?? []).map(item => item.textContent)

it('lists what the resources reported and a failing Mount, and passes each on', async () => {
  forwarded = Diagnostics.collect()
  start()
  await vi.waitFor(() => expect(items()).toEqual(['warning Probe [foldkit-test]']))
  expect(shadow()?.querySelector('summary')?.textContent).toBe('1 diagnostic')

  await userEvent.click(document.querySelector('button')!)
  await vi.waitFor(() =>
    expect(items()).toEqual(['warning Probe [foldkit-test]', 'error MountFailed [foldkit-mixins]']),
  )
  expect(shadow()?.querySelectorAll('pre')[1]?.textContent).toContain('the chart would not draw')
  expect(forwarded.reported.map(diagnostic => diagnostic._tag)).toEqual(['Probe', 'MountFailed'])

  // A fixed panel in the bottom corner, above the page.
  const box = section()!.getBoundingClientRect()
  expect(window.innerWidth - box.right).toBeCloseTo(16, 0)
  expect(window.innerHeight - box.bottom).toBeCloseTo(16, 0)
})

it('draws nothing once cleared, and keeps what it passed on', async () => {
  forwarded = Diagnostics.collect()
  start()
  await vi.waitFor(() => expect(items()).toHaveLength(1))
  await userEvent.click(shadow()!.querySelector('button')!)
  expect(items()).toEqual([])
  expect(section()!.getBoundingClientRect().height).toBe(0)
  expect(forwarded.reported).toHaveLength(1)
})
